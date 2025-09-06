import AWS from 'aws-sdk';
import { google } from 'googleapis';
import sharp from 'sharp';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Initialize AWS clients
const s3 = new AWS.S3({
  region: process.env.VITE_AWS_REGION,
  accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
});

const rekognition = new AWS.Rekognition({
  region: process.env.VITE_AWS_REGION,
  accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
});

const BUCKET = process.env.VITE_S3_BUCKET_NAME;

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({
  region: process.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
  }
});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Google Service Account credentials
const GOOGLE_SERVICE_ACCOUNT_KEY = {
  "type": "service_account",
  "project_id": "chitralai-471306",
  "private_key_id": "your_private_key_id",
  "private_key": `-----BEGIN PRIVATE KEY-----\n${process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')}\n-----END PRIVATE KEY-----`,
  "client_email": "chitralai@chitralai-471306.iam.gserviceaccount.com",
  "client_id": "your_client_id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/chitralai%40chitralai-471306.iam.gserviceaccount.com"
};

// Initialize Google Drive API
let drive;

async function initializeDriveAPI() {
  if (drive) return drive;
  
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: GOOGLE_SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    drive = google.drive({ version: 'v3', auth });
    return drive;
  } catch (error) {
    console.error('Error initializing Google Drive API:', error);
    throw error;
  }
}

// Helper function to sanitize filenames
const sanitizeFilename = (filename) => {
  const hasNumberInParentheses = filename.match(/\(\d+\)$/);
  const numberInParentheses = hasNumberInParentheses ? hasNumberInParentheses[0] : '';
  const filenameWithoutNumber = filename.replace(/\(\d+\)$/, '');
  const sanitized = filenameWithoutNumber
    .replace(/[^a-zA-Z0-9_.\-:]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized + numberInParentheses;
};

// Helper function to get branding information for an event
async function getBrandingInfo(eventId) {
  try {
    const eventResult = await docClient.send(new GetCommand({
      TableName: 'Events',
      Key: { eventId: eventId }
    }));
    
    if (!eventResult.Item) {
      console.log('Event not found:', eventId);
      return { branding: false, logoUrl: null };
    }
    
    const event = eventResult.Item;
    const userEmail = event.organizerEmail || event.userEmail;
    
    if (!userEmail) {
      console.log('No user email found for event');
      return { branding: false, logoUrl: null };
    }
    
    const userResult = await docClient.send(new GetCommand({
      TableName: 'Users',
      Key: { email: userEmail }
    }));
    
    if (!userResult.Item) {
      console.log('User not found:', userEmail);
      return { branding: false, logoUrl: null };
    }
    
    const user = userResult.Item;
    let branding = user.branding || false;
    let logoUrl = user.organizationLogo || null;
    
    // Special case for event 910245 - force branding and use specific logo
    if (String(eventId) === "910245") {
      branding = true;
      logoUrl = "/taf and child logo.png";
      console.log('Event 910245: Forcing branding ON with specific logo');
    }
    
    console.log('User branding info:', { 
      email: userEmail, 
      branding, 
      hasLogo: !!logoUrl,
      logoUrl: logoUrl ? logoUrl.substring(0, 50) + '...' : null
    });
    
    return { branding, logoUrl };
  } catch (error) {
    console.error('Error getting branding info:', error);
    return { branding: false, logoUrl: null };
  }
}

// Helper function to download and process logo
async function downloadLogo(logoUrl) {
  try {
    if (!logoUrl) return null;
    
    let fetchUrl = logoUrl;
    
    // Special case for event 910245 - use public folder logo
    if (logoUrl === "/taf and child logo.png") {
      fetchUrl = `https://chitradup.netlify.app${logoUrl}`;
      console.log('Using public folder logo:', fetchUrl);
    } else if (logoUrl && logoUrl.startsWith('https://chitral-ai.s3.amazonaws.com/')) {
      // Convert S3 URL to proxy URL
      fetchUrl = `https://chitradup.netlify.app/api/proxy-image?url=${encodeURIComponent(logoUrl)}`;
    } else if (logoUrl) {
      fetchUrl = logoUrl;
    }
    
    console.log('Downloading logo from:', fetchUrl);
    
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.error('Failed to download logo:', response.status, response.statusText);
      return null;
    }
    
    const logoBuffer = await response.buffer();
    console.log('Logo downloaded successfully, size:', logoBuffer.length, 'bytes');
    return logoBuffer;
  } catch (error) {
    console.error('Error downloading logo:', error);
    return null;
  }
}

// Helper function to process and upload image with branding
async function processAndUploadImage(fileId, fileName, eventId, branding, logoUrl) {
  try {
    console.log(`Processing file: ${fileName} (ID: ${fileId})`);
    
    // Download from Google Drive using service account
    const driveAPI = await initializeDriveAPI();
    const fileResponse = await driveAPI.files.get({
      fileId: fileId,
      alt: 'media'
    }, {
      responseType: 'stream'
    });
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of fileResponse.data) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    console.log('Downloaded file size:', buffer.length, 'bytes');
    
    let processedBuffer;
    
    if (branding && logoUrl) {
      // Download logo
      const logoBuffer = await downloadLogo(logoUrl);
      
      if (logoBuffer) {
        console.log('Logo downloaded, applying watermark');
        
        // Get image dimensions BEFORE resizing
        const image = sharp(buffer);
        const { width: originalWidth, height: originalHeight } = await image.metadata();
        
        // Calculate proportional watermark size based on image dimensions
        const minDimension = Math.min(originalWidth, originalHeight);
        const maxDimension = Math.max(originalWidth, originalHeight);
        
        // Define size ranges for different image sizes
        let logoSize;
        if (minDimension < 800) {
          logoSize = Math.max(160, Math.floor(minDimension * 0.20));
        } else if (minDimension < 1600) {
          logoSize = Math.max(200, Math.floor(minDimension * 0.18));
        } else if (minDimension < 3000) {
          logoSize = Math.max(300, Math.floor(minDimension * 0.16));
        } else {
          logoSize = Math.max(400, Math.floor(minDimension * 0.14));
        }
        
        // Ensure logo doesn't exceed reasonable bounds
        logoSize = Math.min(logoSize, Math.floor(maxDimension * 0.35));
        
        // Calculate proportional padding based on image size
        let padding;
        if (minDimension < 800) {
          padding = Math.max(30, Math.floor(minDimension * 0.05));
        } else if (minDimension < 1600) {
          padding = Math.max(40, Math.floor(minDimension * 0.055));
        } else if (minDimension < 3000) {
          padding = Math.max(50, Math.floor(minDimension * 0.06));
        } else {
          padding = Math.max(60, Math.floor(minDimension * 0.065));
        }
        
        // Get logo dimensions to maintain aspect ratio
        const logoImage = sharp(logoBuffer);
        const { width: logoWidth, height: logoHeight } = await logoImage.metadata();
        const logoAspectRatio = logoWidth / logoHeight;
        
        let finalLogoWidth, finalLogoHeight;
        if (logoAspectRatio > 1) {
          finalLogoWidth = logoSize;
          finalLogoHeight = logoSize / logoAspectRatio;
        } else {
          finalLogoHeight = logoSize;
          finalLogoWidth = logoSize * logoAspectRatio;
        }
        
        // Position logo in bottom-left corner with padding
        const logoX = padding;
        const logoY = originalHeight - finalLogoHeight - padding;
        
        console.log('Watermark details:', {
          logoSize,
          position: { x: logoX, y: logoY },
          imageSize: { width: originalWidth, height: originalHeight }
        });
        
        // Resize logo to calculated dimensions
        const resizedLogo = await logoImage
          .resize(Math.floor(finalLogoWidth), Math.floor(finalLogoHeight), { 
            fit: 'fill',
            withoutEnlargement: true 
          })
          .png()
          .toBuffer();
        
        // Apply watermark with shadow effect
        processedBuffer = await image
          .resize({ width: 1024, withoutEnlargement: true })
          .composite([{
            input: resizedLogo,
            left: Math.floor(logoX * (1024 / originalWidth)),
            top: Math.floor(logoY * (1024 / originalHeight)),
            blend: 'over'
          }])
          .jpeg({ quality: 90 })
          .toBuffer();
        
        console.log('Applied watermark successfully');
      } else {
        console.log('Failed to download logo, processing without watermark');
        processedBuffer = await sharp(buffer)
          .resize({ width: 1024, withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
      }
    } else {
      // No branding, just process normally
      processedBuffer = await sharp(buffer)
        .resize({ width: 1024, withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
    }
    
    console.log('Processed image size:', processedBuffer.length, 'bytes');
    
    // Generate S3 key
    const timestamp = Date.now();
    const sanitizedFileName = sanitizeFilename(fileName);
    const s3Key = `events/shared/${eventId}/images/${sanitizedFileName}`;
    
    // Upload to S3
    await s3.putObject({
      Bucket: BUCKET,
      Key: s3Key,
      Body: processedBuffer,
      ACL: 'public-read',
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=31536000'
    }).promise();
    
    console.log('Uploaded to S3:', s3Key);
    
    // Index face for recognition
    try {
      await rekognition.createCollection({ CollectionId: `event-${eventId}` }).promise().catch(e => {
        if (e.code !== 'ResourceAlreadyExistsException') throw e;
      });
      
      await rekognition.indexFaces({
        CollectionId: `event-${eventId}`,
        Image: { S3Object: { Bucket: BUCKET, Name: s3Key } },
        ExternalImageId: sanitizedFileName,
        DetectionAttributes: ['ALL'],
        MaxFaces: 10,
        QualityFilter: 'AUTO',
      }).promise();
      
      console.log('Indexed face for:', s3Key);
    } catch (faceErr) {
      console.error('Face indexing failed for:', s3Key, faceErr);
    }
    
    return {
      success: true,
      s3Key: s3Key,
      s3Url: `https://${BUCKET}.s3.amazonaws.com/${s3Key}`,
      originalSize: buffer.length,
      processedSize: processedBuffer.length,
      fileName: sanitizedFileName
    };
    
  } catch (error) {
    console.error('Error processing file:', fileId, error);
    return {
      success: false,
      error: error.message,
      fileId: fileId,
      fileName: fileName
    };
  }
}

// Helper function to get files from Google Drive folder
async function getFilesFromFolder(folderId) {
  try {
    const driveAPI = await initializeDriveAPI();
    
    const response = await driveAPI.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/'`,
      fields: 'files(id, name, mimeType, size)',
      pageSize: 1000
    });
    
    return response.data.files || [];
  } catch (error) {
    console.error('Error listing files from folder:', error);
    throw error;
  }
}

// Helper function to get single file info
async function getFileInfo(fileId) {
  try {
    const driveAPI = await initializeDriveAPI();
    
    const response = await driveAPI.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size'
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting file info:', error);
    throw error;
  }
}

exports.handler = async function(event, context) {
  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { driveLink, eventId } = body;
    
    if (!driveLink) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing driveLink' })
      };
    }
    
    if (!eventId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing eventId' })
      };
    }

    console.log('Processing drive upload for event:', eventId);

    // Extract file or folder ID from the link
    const fileMatch = driveLink.match(/file\/d\/([\w-]+)/);
    const folderMatch = driveLink.match(/folders\/([\w-]+)/);

    let files = [];

    if (fileMatch) {
      // Single file
      const fileId = fileMatch[1];
      const fileInfo = await getFileInfo(fileId);
      files = [fileInfo];
    } else if (folderMatch) {
      // Folder
      const folderId = folderMatch[1];
      files = await getFilesFromFolder(folderId);
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid Google Drive link' })
      };
    }

    if (files.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'No image files found',
          results: []
        })
      };
    }

    // Get branding information
    const { branding, logoUrl } = await getBrandingInfo(eventId);
    console.log('Using branding info:', { branding, logoUrl });

    // Process files in batches to avoid memory issues
    const BATCH_SIZE = 3;
    const results = [];
    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)}`);
      
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          const result = await processAndUploadImage(file.id, file.name, eventId, branding, logoUrl);
          if (result.success) {
            totalOriginalBytes += result.originalSize;
            totalCompressedBytes += result.processedSize;
          }
          return result;
        })
      );
      
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log('Processing complete:', successful.length, 'successful,', failed.length, 'failed');

    // Update event statistics
    if (successful.length > 0) {
      try {
        const bytesToMB = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));
        const bytesToGB = (bytes) => Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
        const convertToAppropriateUnit = (bytes) => {
          const mb = bytesToMB(bytes);
          if (mb >= 1024) {
            return { size: bytesToGB(bytes), unit: 'GB' };
          }
          return { size: mb, unit: 'MB' };
        };

        const { size: totalImageSize, unit: totalImageSizeUnit } = convertToAppropriateUnit(totalOriginalBytes);
        const { size: totalCompressedSize, unit: totalCompressedSizeUnit } = convertToAppropriateUnit(totalCompressedBytes);

        await docClient.send(new UpdateCommand({
          TableName: 'Events',
          Key: { eventId },
          UpdateExpression: 'ADD photoCount :pc SET totalImageSize = :tis, totalImageSizeUnit = :tisUnit, totalCompressedSize = :tcs, totalCompressedSizeUnit = :tcsUnit',
          ExpressionAttributeValues: {
            ':pc': successful.length,
            ':tis': totalImageSize,
            ':tisUnit': totalImageSizeUnit,
            ':tcs': totalCompressedSize,
            ':tcsUnit': totalCompressedSizeUnit
          }
        }));

        console.log('Updated event statistics');
      } catch (updateError) {
        console.error('Error updating event statistics:', updateError);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        totalFiles: files.length,
        successful: successful.length,
        failed: failed.length,
        results: results,
        successfulFiles: successful,
        failedFiles: failed,
        totalOriginalBytes,
        totalCompressedBytes
      })
    };

  } catch (err) {
    console.error('Error in drive-upload function:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: err.message 
      })
    };
  }
};
