import { RekognitionClient, IndexFacesCommand, SearchFacesByImageCommand, DeleteFacesCommand, CreateCollectionCommand } from '@aws-sdk/client-rekognition';
import { s3ClientPromise, validateEnvVariables } from '../config/aws';
import { getRuntimeEnv } from './runtimeEnv';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

let rekognitionClientInstance: RekognitionClient | null = null;
let rekognitionClientInitializationPromise: Promise<RekognitionClient> | null = null;

async function initializeRekognitionClient(): Promise<RekognitionClient> {
  if (rekognitionClientInstance) return rekognitionClientInstance;
  if (rekognitionClientInitializationPromise) return rekognitionClientInitializationPromise;

  rekognitionClientInitializationPromise = (async () => {
    const env = await getRuntimeEnv();
    if (!env.VITE_AWS_REGION || !env.VITE_AWS_ACCESS_KEY_ID || !env.VITE_AWS_SECRET_ACCESS_KEY) {
      console.error('[faceRecognition.ts] Missing required environment variables for Rekognition: AWS Region, Access Key ID, Secret Access Key');
      throw new Error('Missing required environment variables for Rekognition');
    }

    console.log('[DEBUG] faceRecognition.ts: Initializing Rekognition Client with:');
    console.log('[DEBUG] faceRecognition.ts: Region:', env.VITE_AWS_REGION);
    console.log('[DEBUG] faceRecognition.ts: Access Key ID (first 5 chars):', env.VITE_AWS_ACCESS_KEY_ID.substring(0, 5));
    console.log('[DEBUG] faceRecognition.ts: Secret Access Key provided:', env.VITE_AWS_SECRET_ACCESS_KEY ? 'Yes' : 'No');

    rekognitionClientInstance = new RekognitionClient({
      region: env.VITE_AWS_REGION,
      credentials: {
        accessKeyId: env.VITE_AWS_ACCESS_KEY_ID,
        secretAccessKey: env.VITE_AWS_SECRET_ACCESS_KEY
      }
    });
    return rekognitionClientInstance;
  })();
  return rekognitionClientInitializationPromise;
}

// Create a collection for an event if it doesn't exist
export const createCollection = async (eventId: string): Promise<void> => {
  try {
    const rekognitionClient = await initializeRekognitionClient();
    const command = new CreateCollectionCommand({
      CollectionId: `event-${eventId}`,
    });
    await rekognitionClient.send(command);
    console.log(`[DEBUG] faceRecognition.ts: Successfully created collection for event ${eventId}`);
  } catch (error: any) {
    // If collection already exists, ignore the error
    if (error.name === 'ResourceAlreadyExistsException') {
      console.log(`[DEBUG] faceRecognition.ts: Collection already exists for event ${eventId}`);
      return;
    }
    console.error('[ERROR] faceRecognition.ts: Failed to create collection:', error);
    throw error;
  }
};

// Add a utility function for consistent filename sanitization
const sanitizeFilename = (filename: string): string => {
  // First, handle special cases like (1), (2), etc.
  const hasNumberInParentheses = filename.match(/\(\d+\)$/);
  const numberInParentheses = hasNumberInParentheses ? hasNumberInParentheses[0] : '';
  
  // Remove the number in parentheses from the filename for sanitization
  const filenameWithoutNumber = filename.replace(/\(\d+\)$/, '');
  
  // Sanitize the main filename
  const sanitized = filenameWithoutNumber
    .replace(/[^a-zA-Z0-9_.\-:]/g, '_') // Replace invalid chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single underscore
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  
  // Add back the number in parentheses if it existed
  return sanitized + numberInParentheses;
};

// Utility function for exponential backoff delay
const getRetryDelay = (retryCount: number): number => {
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
};

// Sleep utility function
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Optimized batch indexing function with rate limiting and retry logic
export const indexFacesBatch = async (
  eventId: string, 
  imageKeys: string[], 
  onProgress?: (completed: number, total: number, currentImage?: string) => void
): Promise<{
  successful: string[];
  failed: Array<{ imageKey: string; error: string }>;
}> => {
  const batchSize = 10; // Process 10 images at a time
  const delayBetweenBatches = 1000; // 1 second delay between batches
  const maxRetries = 3;
  
  const successful: string[] = [];
  const failed: Array<{ imageKey: string; error: string }> = [];
  
  console.log(`[DEBUG] faceRecognition.ts: Starting batch indexing for ${imageKeys.length} images in event ${eventId}`);
  
  // Process images in batches
  for (let i = 0; i < imageKeys.length; i += batchSize) {
    const batch = imageKeys.slice(i, i + batchSize);
    
    // Process each image in the current batch
    const batchPromises = batch.map(async (imageKey) => {
      let retryCount = 0;
      
      while (retryCount <= maxRetries) {
        try {
          if (onProgress) {
            onProgress(successful.length + failed.length, imageKeys.length, imageKey);
          }
          
          const faceIds = await indexFaces(eventId, imageKey);
          successful.push(imageKey);
          console.log(`[DEBUG] faceRecognition.ts: Successfully indexed ${faceIds.length} faces for ${imageKey}`);
          return;
          
        } catch (error: any) {
          retryCount++;
          
          // Check if it's a rate limit error
          if (error.name === 'ProvisionedThroughputExceededException' || 
              error.code === 'ProvisionedThroughputExceededException' ||
              error.message?.includes('Provisioned rate exceeded')) {
            
            if (retryCount <= maxRetries) {
              const delay = getRetryDelay(retryCount - 1);
              console.log(`[DEBUG] faceRecognition.ts: Rate limit hit for ${imageKey}, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
              await sleep(delay);
              continue;
            }
          }
          
          // For other errors or max retries exceeded
          const errorMessage = error.message || error.toString();
          console.error(`[ERROR] faceRecognition.ts: Failed to index ${imageKey} after ${retryCount} attempts:`, errorMessage);
          failed.push({ imageKey, error: errorMessage });
          return;
        }
      }
    });
    
    // Wait for the current batch to complete
    await Promise.allSettled(batchPromises);
    
    // Add delay between batches (except for the last batch)
    if (i + batchSize < imageKeys.length) {
      console.log(`[DEBUG] faceRecognition.ts: Batch completed, waiting ${delayBetweenBatches}ms before next batch...`);
      await sleep(delayBetweenBatches);
    }
  }
  
  console.log(`[DEBUG] faceRecognition.ts: Batch indexing completed. Successful: ${successful.length}, Failed: ${failed.length}`);
  
  return { successful, failed };
};

// Index faces from an image in S3
export const indexFaces = async (eventId: string, imageKey: string): Promise<string[]> => {
  try {
    const rekognitionClient = await initializeRekognitionClient();
    const { bucketName } = await validateEnvVariables();

    console.log(`[DEBUG] faceRecognition.ts: Indexing faces for image ${imageKey} in bucket ${bucketName}`);

    // Get the filename from the full path
    const filename = imageKey.split('/').pop() || '';
    // Sanitize the filename for Rekognition's ExternalImageId
    const sanitizedFilename = sanitizeFilename(filename);

    console.log(`[DEBUG] faceRecognition.ts: Original filename: ${filename}`);
    console.log(`[DEBUG] faceRecognition.ts: Sanitized filename: ${sanitizedFilename}`);

    // First verify if the file exists in S3 using the original key
    try {
      const s3Client = await s3ClientPromise;
      await s3Client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: imageKey
      }));
    } catch (error: any) {
      console.error('[ERROR] faceRecognition.ts: S3 object not found:', {
        error: error.message,
        bucket: bucketName,
        key: imageKey
      });
      throw new Error(`Image not found in S3: ${imageKey}`);
    }

    const command = new IndexFacesCommand({
      CollectionId: `event-${eventId}`,
      Image: {
        S3Object: {
          Bucket: bucketName,
          Name: imageKey
        }
      },
      MaxFaces: 100,
      QualityFilter: 'AUTO',
      DetectionAttributes: ['ALL'],
      ExternalImageId: sanitizedFilename
    });

    const response = await rekognitionClient.send(command);
    const faceIds = response.FaceRecords?.map(record => record.Face?.FaceId || '') || [];
    
    console.log(`[DEBUG] faceRecognition.ts: Successfully indexed ${faceIds.length} faces for image ${imageKey}`);
    if (faceIds.length > 0) {
      console.log(`[DEBUG] faceRecognition.ts: Face IDs:`, faceIds);
    }
    
    // Log any faces that were detected but not indexed
    if (response.UnindexedFaces && response.UnindexedFaces.length > 0) {
      console.log(`[DEBUG] faceRecognition.ts: ${response.UnindexedFaces.length} faces were detected but not indexed due to quality issues:`, 
        response.UnindexedFaces.map(face => ({
          reason: face.Reasons,
          confidence: face.FaceDetail?.Confidence
        }))
      );
    }
    
    return faceIds;
  } catch (error: any) {
    console.error('[ERROR] faceRecognition.ts: Failed to index faces:', {
      error: error.message,
      code: error.code,
      requestId: error.$metadata?.requestId,
      imageKey,
      eventId
    });
    throw error;
  }
};

// Search for faces in a collection using a selfie image
export const searchFacesByImage = async (eventId: string, selfieImageKey: string): Promise<{
  imageKey: string;
  similarity: number;
}[]> => {
  try {
    const rekognitionClient = await initializeRekognitionClient();
    const { bucketName } = await validateEnvVariables();

    console.log(`[DEBUG] faceRecognition.ts: Searching faces for selfie ${selfieImageKey} in bucket ${bucketName}`);

    const command = new SearchFacesByImageCommand({
      CollectionId: `event-${eventId}`,
      Image: {
        S3Object: {
          Bucket: bucketName,
          Name: selfieImageKey
        }
      },
      MaxFaces: 50,
      FaceMatchThreshold: 60
    });

    const response = await rekognitionClient.send(command);
    const matches = response.FaceMatches?.map(match => {
      // Get the sanitized filename from ExternalImageId
      const sanitizedFilename = match.Face?.ExternalImageId || '';
      
      // Convert back to original filename format but replace spaces with underscores
      // First, replace underscores with spaces
      let originalFilename = sanitizedFilename.replace(/_/g, ' ');
      
      // Handle special cases like (1), (2), etc.
      // If the filename contains a number in parentheses at the end, ensure it's properly formatted
      originalFilename = originalFilename.replace(/_(\d+)_$/, ' ($1)');
      
      // Replace spaces with underscores
      originalFilename = originalFilename.replace(/\s+/g, '_');
      
      // Construct the full path including the event structure
      const fullImageKey = `events/shared/${eventId}/images/${originalFilename}`;
      
      console.log(`[DEBUG] faceRecognition.ts: Converting filename:`, {
        sanitized: sanitizedFilename,
        original: originalFilename,
        fullKey: fullImageKey
      });
      
      return {
        imageKey: fullImageKey,
        similarity: match.Similarity || 0
      };
    }) || [];

    // Enhanced logging for matches
    console.log(`[DEBUG] faceRecognition.ts: Found ${matches.length} face matches for selfie ${selfieImageKey}`);
    matches.forEach((match, index) => {
      console.log(`[DEBUG] faceRecognition.ts: Match ${index + 1}:`);
      console.log(`[DEBUG] faceRecognition.ts: - Image: ${match.imageKey || 'No image key found'}`);
      console.log(`[DEBUG] faceRecognition.ts: - Similarity: ${match.similarity.toFixed(2)}%`);
      if (!match.imageKey) {
        console.log(`[DEBUG] faceRecognition.ts: - Face ID: ${response.FaceMatches?.[index]?.Face?.FaceId || 'No face ID'}`);
      }
    });

    return matches;
  } catch (error: any) {
    console.error('[ERROR] faceRecognition.ts: Failed to search faces:', {
      error: error.message,
      code: error.code,
      requestId: error.$metadata?.requestId,
      selfieImageKey,
      eventId
    });
    throw error;
  }
};

// Delete faces from a collection
export const deleteFaces = async (eventId: string, faceIds: string[]): Promise<void> => {
  try {
    const rekognitionClient = await initializeRekognitionClient();
    console.log(`[DEBUG] faceRecognition.ts: Deleting ${faceIds.length} faces from event ${eventId}`);

    const command = new DeleteFacesCommand({
      CollectionId: `event-${eventId}`,
      FaceIds: faceIds
    });

    await rekognitionClient.send(command);
    console.log(`[DEBUG] faceRecognition.ts: Successfully deleted faces from event ${eventId}`);
  } catch (error: any) {
    console.error('[ERROR] faceRecognition.ts: Failed to delete faces:', {
      error: error.message,
      code: error.code,
      requestId: error.$metadata?.requestId,
      eventId,
      faceIds
    });
    throw error;
  }
};

// Function to index all existing images in an event
export const indexAllEventImages = async (
  eventId: string,
  onProgress?: (completed: number, total: number, currentImage?: string) => void
): Promise<{
  successful: string[];
  failed: Array<{ imageKey: string; error: string }>;
  totalImages: number;
}> => {
  try {
    const { bucketName } = await validateEnvVariables();
    const s3Client = await s3ClientPromise;
    
    console.log(`[DEBUG] faceRecognition.ts: Finding all images in event ${eventId}`);
    
    // List all images in the event folder
    const imageKeys: string[] = [];
    let continuationToken: string | undefined;
    
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `events/shared/${eventId}/images/`,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      });
      
      const listResponse = await s3Client.send(listCommand);
      
      if (listResponse.Contents) {
        const validImageKeys = listResponse.Contents
          .filter(item => item.Key && /\.(jpg|jpeg|png)$/i.test(item.Key))
          .map(item => item.Key!);
        imageKeys.push(...validImageKeys);
      }
      
      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
    
    console.log(`[DEBUG] faceRecognition.ts: Found ${imageKeys.length} images to index in event ${eventId}`);
    
    if (imageKeys.length === 0) {
      return { successful: [], failed: [], totalImages: 0 };
    }
    
    // Ensure collection exists
    await createCollection(eventId);
    
    // Index all images using the batch function
    const result = await indexFacesBatch(eventId, imageKeys, onProgress);
    
    return {
      ...result,
      totalImages: imageKeys.length
    };
    
  } catch (error: any) {
    console.error('[ERROR] faceRecognition.ts: Failed to index event images:', error);
    throw error;
  }
}; 