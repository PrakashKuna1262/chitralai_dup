import 'dotenv/config';
import express from 'express';
import AWS from 'aws-sdk';
import cors from 'cors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import mime from 'mime-types'; // Add this import at the top
import sharp from 'sharp'; // Add this import for sharp

const app = express();

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Configure CORS
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://chitra.netlify.app',
    'https://chitralai.in', // Added production domain
    'http://localhost:3001', // If frontend runs on 3001 locally
  ],
  credentials: true
}));

app.use(express.json());

// Environment variables with fallbacks for local development
const AWS_REGION = process.env.VITE_AWS_REGION || 'ap-south-1';
const S3_BUCKET = process.env.VITE_S3_BUCKET_NAME || 'chitral-ai';
const AWS_ACCESS_KEY = process.env.VITE_AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.VITE_AWS_SECRET_ACCESS_KEY;
const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;

// Log environment variables (without sensitive data)
console.log('Environment variables loaded:');
console.log('- AWS_REGION:', AWS_REGION);
console.log('- S3_BUCKET:', S3_BUCKET);
console.log('- AWS_ACCESS_KEY:', AWS_ACCESS_KEY ? 'Set' : 'Not set');
console.log('- AWS_SECRET_KEY:', AWS_SECRET_KEY ? 'Set' : 'Not set');
console.log('- GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID ? 'Set' : 'Not set');

// Validate required environment variables
const requiredEnvVars = {
  VITE_AWS_REGION: AWS_REGION,
  VITE_S3_BUCKET_NAME: S3_BUCKET,
  VITE_AWS_ACCESS_KEY_ID: AWS_ACCESS_KEY,
  VITE_AWS_SECRET_ACCESS_KEY: AWS_SECRET_KEY,
  VITE_GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID
};

const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const s3 = new AWS.S3({
  region: AWS_REGION,
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY
});

const dynamoDBClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY,
  },
});
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const USERS_TABLE = 'Users';

// Add a health check endpoint
app.get('/health', (req, res) => {
  console.log('[DEBUG] Health check endpoint called');
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Add a root endpoint for testing
app.get('/', (req, res) => {
  console.log('[DEBUG] Root endpoint called');
  res.json({ 
    message: 'Presign server is running',
    endpoints: [
      '/health',
      '/runtime-env',
      '/google-client-id'
    ]
  });
});

// Update the runtime-env endpoint
app.get('/runtime-env', (req, res) => {
  console.log('[DEBUG] Runtime env endpoint called');
  const runtimeVariables = {
    VITE_AWS_REGION: AWS_REGION,
    VITE_S3_BUCKET_NAME: S3_BUCKET,
    VITE_AWS_ACCESS_KEY_ID: AWS_ACCESS_KEY,
    VITE_AWS_SECRET_ACCESS_KEY: AWS_SECRET_KEY,
    VITE_GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID
  };
  
  console.log('[DEBUG] Runtime env variables:', {
    region: runtimeVariables.VITE_AWS_REGION,
    bucket: runtimeVariables.VITE_S3_BUCKET_NAME,
    hasAccessKey: !!runtimeVariables.VITE_AWS_ACCESS_KEY_ID,
    hasSecretKey: !!runtimeVariables.VITE_AWS_SECRET_ACCESS_KEY,
    hasGoogleClientId: !!runtimeVariables.VITE_GOOGLE_CLIENT_ID
  });

  res.json(runtimeVariables);
});

app.post('/api/users', async (req, res) => {
  const userData = req.body;
  if (!userData || !userData.userId) {
    return res.status(400).json({ error: 'Missing user data or userId' });
  }
  try {
    const params = {
      TableName: USERS_TABLE,
      Item: userData,
    };
    await docClient.send(new PutCommand(params));
    res.status(201).json({ message: 'User data stored successfully', userId: userData.userId });
  } catch (err) {
    console.error('Error storing user data in DynamoDB:', err);
    res.status(500).json({ error: 'Failed to store user data', details: err.message });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }
  try {
    const params = {
      TableName: USERS_TABLE,
      Key: { userId: userId },
    };
    const { Item } = await docClient.send(new GetCommand(params));
    if (Item) {
      res.json(Item);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    console.error('Error retrieving user data from DynamoDB:', err);
    res.status(500).json({ error: 'Failed to retrieve user data', details: err.message });
  }
});

app.get('/api/users/search/by-email', async (req, res) => {
  const { email } = req.query;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email query parameter is required and must be a string' });
  }

  try {
    const params = {
      TableName: USERS_TABLE,
      KeyConditionExpression: 'email = :emailVal',
      ExpressionAttributeValues: {
        ':emailVal': email,
      },
      Limit: 1
    };

    const { Items } = await docClient.send(new QueryCommand(params));

    if (Items && Items.length > 0) {
      res.json(Items[0]);
    } else {
      res.status(404).json({ message: 'User not found with that email' });
    }
  } catch (err) {
    console.error('Error querying user by email in DynamoDB:', err);
    if (err.name === 'ValidationException') {
        return res.status(400).json({ error: 'Invalid query parameters or table/index configuration.', details: err.message });
    }
    res.status(500).json({ error: 'Failed to query user data', details: err.message });
  }
});

app.post('/api/presign', async (req, res) => {
  const { key, contentType } = req.body;
  if (!key || !contentType) {
    return res.status(400).json({ error: 'Missing key or contentType' });
  }
  try {
    const url = await s3.getSignedUrlPromise('putObject', {
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      Expires: 600
    });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to get organization details by code (from Users table - consider optimizing)
app.get('/api/organizations/by-code/:organizationCode', async (req, res) => {
  const { organizationCode } = req.params;

  if (!organizationCode) {
    return res.status(400).json({ error: 'Organization code is required' });
  }

  console.log(`[Backend] Querying organization by code: ${organizationCode}`);

  try {
    // WARNING: This uses a Scan operation, which is inefficient for large tables.
    // Consider a GSI on 'organizationCode' in the Users table or a separate 'Organizations' table.
    const params = {
      TableName: USERS_TABLE,
      FilterExpression: 'organizationCode = :orgCode',
      ExpressionAttributeValues: {
        ':orgCode': organizationCode,
      },
      // ProjectionExpression: 'organizationCode, organizationName, organizationLogo' // Optional: only fetch needed attributes
    };

    const { Items } = await docClient.send(new ScanCommand(params));

    if (Items && Items.length > 0) {
      const orgUser = Items[0]; // Taking the first user found with this org code
      console.log(`[Backend] Found user for org code ${organizationCode}:`, orgUser);
      res.json({
        organizationCode: orgUser.organizationCode,
        organizationName: orgUser.organizationName,
        organizationLogo: orgUser.organizationLogo,
      });
    } else {
      console.log(`[Backend] No user found for org code ${organizationCode}`);
      res.status(404).json({ message: 'Organization details not found for this code via Users table' });
    }
  } catch (err) {
    console.error('[Backend] Error scanning for organization by code:', err);
    res.status(500).json({ error: 'Failed to retrieve organization details', details: err.message });
  }
});

// === DRIVE BACKEND ===
// Utility function for consistent filename sanitization (copied from faceRecognition.ts)
function sanitizeFilename(filename) {
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
}

const rekognition = new AWS.Rekognition({
  region: AWS_REGION,
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
});

app.post('/drive-list', async (req, res) => {
  const { driveLink, eventId, onlyList } = req.body;
  if (!driveLink) return res.status(400).json({ error: 'Missing driveLink' });

  // Check if it's a file or folder link
  const fileMatch = driveLink.match(/file\/d\/([\w-]+)/);
  const folderMatch = driveLink.match(/folders\/([\w-]+)/);

  let fileIds = [];

  if (fileMatch) {
    // Single file link
    fileIds = [fileMatch[1]];
  } else if (folderMatch) {
    // Folder link: scrape for file IDs
    const folderId = folderMatch[1];
    try {
      const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
      const html = await (await fetch(folderUrl)).text();
      const $ = cheerio.load(html);
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const match = href && href.match(/\/file\/d\/([\w-]+)/);
        if (match) fileIds.push(match[1]);
      });
      // Try additional selectors if no fileIds found
      if (fileIds.length === 0) {
        $('[data-id]').each((i, el) => {
          const id = $(el).attr('data-id');
          if (id && /^[\w-]{25,}$/.test(id)) fileIds.push(id);
        });
      }
      if (fileIds.length === 0) {
        $('script').each((i, el) => {
          const scriptText = $(el).html();
          if (scriptText && scriptText.includes('window.viewerData')) {
            const matches = scriptText.match(/fileId":"([\w-]{25,})"/g);
            if (matches) {
              matches.forEach(m => {
                const idMatch = m.match(/fileId":"([\w-]{25,})"/);
                if (idMatch) fileIds.push(idMatch[1]);
              });
            }
          }
        });
      }
      if (fileIds.length === 0) {
        console.error('No file links found in Google Drive folder HTML.');
        return res.status(400).json({ error: 'No image files found in the provided Google Drive folder. The folder may be empty, not public, or Google has changed their UI.' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Failed to scrape folder' });
    }
  } else {
    return res.status(400).json({ error: 'Invalid Google Drive link' });
  }

  fileIds = [...new Set(fileIds)];
  if (!fileIds.length) return res.json([]);

  // If onlyList is true, just return the list of direct image links for the frontend
  if (onlyList) {
    const files = fileIds.map(fileId => ({
      name: `${fileId}.jpg`, // You can improve this by scraping the name if needed
      url: `https://drive.google.com/uc?export=download&id=${fileId}`
    }));
    res.json(files);
    return;
  }

  // List existing images in S3 for this event to check for duplicates
  let existingImageNames = new Set();
  try {
    const listResp = await s3.listObjectsV2({
      Bucket: S3_BUCKET,
      Prefix: `events/shared/${eventId}/images/`
    }).promise();
    if (listResp.Contents) {
      for (const obj of listResp.Contents) {
        if (obj.Key) {
          const name = obj.Key.split('/').pop();
          if (name) existingImageNames.add(sanitizeFilename(name));
        }
      }
    }
  } catch (err) {
    console.error('Error listing S3 objects for duplicate check:', err);
  }

  // === Batch download, compress, upload, and index ===
  const BATCH_SIZE = 5;
  const uploadResults = [];
  let totalOriginalBytes = 0;
  let totalCompressedBytes = 0;
  let allS3Keys = [];
  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE);
    // Download and compress all images in the batch in parallel
    const processedBatch = await Promise.all(batch.map(async (fileId) => {
      const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const fileRes = await fetch(url);
      const arrayBuffer = await fileRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Check for HTML error page (Google sometimes returns HTML if not public)
      const isHtml = buffer.slice(0, 100).toString().includes('<html');
      if (isHtml) {
        console.error(`File ID ${fileId} returned HTML instead of an image. Skipping.`);
        return null;
      }
      // Try to get file name from headers or fallback
      let fileName = `${fileId}.jpg`;
      let contentType = 'image/jpeg';
      const disposition = fileRes.headers.get('content-disposition');
      if (disposition) {
        const match = disposition.match(/filename=\"(.+?)\"/);
        if (match) fileName = match[1];
      }
      // Guess content type from file extension
      const ext = fileName.split('.').pop();
      if (ext) {
        const guessedType = mime.lookup(ext);
        if (guessedType) contentType = guessedType;
      }
      // Fallback to response header
      const headerType = fileRes.headers.get('content-type');
      if (headerType && headerType.startsWith('image/')) contentType = headerType;
      // Only upload if it's a valid image type
      if (!contentType.startsWith('image/')) {
        console.error(`File ${fileName} is not a valid image type (${contentType}). Skipping.`);
        return null;
      }
      // Sanitize the file name for S3 and duplicate check
      let sanitizedFileName = sanitizeFilename(fileName);
      sanitizedFileName = sanitizedFileName.replace(/\.[^/.]+$/, '.jpg');
      if (existingImageNames.has(sanitizedFileName)) {
        console.log(`Duplicate detected, skipping upload: ${sanitizedFileName}`);
        return null;
      }
      // Compress image with sharp
      let compressedBuffer;
      let compressedContentType = 'image/jpeg';
      try {
        compressedBuffer = await sharp(buffer)
          .resize({ width: 1024, withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
      } catch (err) {
        console.error(`Compression failed for ${sanitizedFileName}, skipping upload.`, err);
        return null;
      }
      totalOriginalBytes += buffer.length;
      totalCompressedBytes += compressedBuffer.length;
      const s3Key = `events/shared/${eventId}/images/${sanitizedFileName}`;
      await s3.putObject({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: compressedBuffer,
        ACL: 'public-read',
        ContentType: compressedContentType,
      }).promise();
      return {
        name: sanitizedFileName,
        s3Url: `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}`,
        s3Key: s3Key,
        originalSize: buffer.length,
        compressedSize: compressedBuffer.length
      };
    }));
    // Filter out skipped/nulls
    const batchResults = processedBatch.filter(Boolean);
    uploadResults.push(...batchResults);
    allS3Keys.push(...batchResults.map(r => r.s3Key));
    // Index faces for this batch
    if (batchResults.length > 0) {
      try {
        // Use the already imported AWS SDK instance for Rekognition
        await rekognition.createCollection({ CollectionId: `event-${eventId}` }).promise().catch(e => {
          if (e.code !== 'ResourceAlreadyExistsException') throw e;
        });
        for (const r of batchResults) {
          try {
            await rekognition.indexFaces({
              CollectionId: `event-${eventId}`,
              Image: { S3Object: { Bucket: S3_BUCKET, Name: r.s3Key } },
              ExternalImageId: r.name,
              DetectionAttributes: ['ALL'],
              MaxFaces: 10,
              QualityFilter: 'AUTO',
            }).promise();
          } catch (err) {
            console.error(`[Drive Upload] Failed to index face for: ${r.s3Key}`, err);
          }
        }
      } catch (err) {
        console.error('[Drive Upload] Error during face indexing:', err);
      }
    }
  }
  // === Update DynamoDB event metadata after upload ===
  if (uploadResults.length > 0) {
    try {
      // Fetch the event
      const getResp = await docClient.send(new GetCommand({
        TableName: 'Events',
        Key: { eventId: eventId } // <-- Use eventId as the key
      }));
      const event = getResp.Item || {};
      // Helper to convert size/unit to bytes
      const toBytes = (size, unit) => {
        if (!size || !unit) return 0;
        if (unit === 'GB') return size * 1024 * 1024 * 1024;
        return size * 1024 * 1024;
      };
      // Get previous totals from DB and convert to bytes
      const prevOriginalBytes = toBytes(event.totalImageSize, event.totalImageSizeUnit);
      const prevCompressedBytes = toBytes(event.totalCompressedSize, event.totalCompressedSizeUnit);
      // Add new batch
      const newTotalOriginalBytes = prevOriginalBytes + totalOriginalBytes;
      const newTotalCompressedBytes = prevCompressedBytes + totalCompressedBytes;
      // Convert to MB/GB for display
      const bytesToMB = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));
      const bytesToGB = (bytes) => Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
      const convertToAppropriateUnit = (bytes) => {
        const mb = bytesToMB(bytes);
        if (mb >= 1024) {
          return { size: bytesToGB(bytes), unit: 'GB' };
        }
        return { size: mb, unit: 'MB' };
      };
      // Use accumulated values for total and compressed size
      const { size: totalImageSize, unit: totalImageSizeUnit } = convertToAppropriateUnit(newTotalOriginalBytes);
      const { size: totalCompressedSize, unit: totalCompressedSizeUnit } = convertToAppropriateUnit(newTotalCompressedBytes);
      const newPhotoCount = (event.photoCount || 0) + uploadResults.length;
      await docClient.send(new UpdateCommand({
        TableName: 'Events',
        Key: { eventId: eventId }, // <-- Use eventId as the key
        UpdateExpression: 'SET photoCount = :pc, totalImageSize = :tis, totalImageSizeUnit = :tisUnit, totalCompressedSize = :tcs, totalCompressedSizeUnit = :tcsUnit',
        ExpressionAttributeValues: {
          ':pc': newPhotoCount,
          ':tis': totalImageSize,
          ':tisUnit': totalImageSizeUnit,
          ':tcs': totalCompressedSize,
          ':tcsUnit': totalCompressedSizeUnit
        }
      }));
    } catch (err) {
      console.error('Error updating DynamoDB event after Drive upload:', err);
    }
  }
  res.json(uploadResults);
});

// Add this endpoint to handle image size updates (even if it's a no-op)
app.post('/events/update-image-sizes', async (req, res) => {
  const { eventId, photoCount } = req.body;
  if (!eventId) return res.status(400).json({ error: 'Missing eventId' });

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: 'Events',
      Key: { eventId }, // <-- Use eventId as the key
      UpdateExpression: 'SET photoCount = :pc',
      ExpressionAttributeValues: {
        ':pc': photoCount
      }
    }));
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error updating event in DynamoDB:', err);
    res.status(500).json({ error: 'Failed to update event', details: err.message });
  }
});

// New endpoint to update event image sizes with provided data
app.post('/events/update-image-sizes-accurate', async (req, res) => {
  const { eventId, images } = req.body;
  if (!eventId || !Array.isArray(images)) {
    return res.status(400).json({ error: 'Missing eventId or images array' });
  }

  try {
    // Sum up original and compressed sizes from the provided images array
    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;
    for (const img of images) {
      totalOriginalBytes += Number(img.originalSize) || 0;
      totalCompressedBytes += Number(img.compressedSize) || 0;
    }
    // Convert to MB/GB for display
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
    // Update the event in DynamoDB
    await docClient.send(new UpdateCommand({
      TableName: 'Events',
      Key: { eventId },
      UpdateExpression: 'SET totalImageSize = :tis, totalImageSizeUnit = :tisUnit, totalCompressedSize = :tcs, totalCompressedSizeUnit = :tcsUnit',
      ExpressionAttributeValues: {
        ':tis': totalImageSize,
        ':tisUnit': totalImageSizeUnit,
        ':tcs': totalCompressedSize,
        ':tcsUnit': totalCompressedSizeUnit
      }
    }));
    res.status(200).json({
      success: true,
      totalImageSize,
      totalImageSizeUnit,
      totalCompressedSize,
      totalCompressedSizeUnit
    });
  } catch (err) {
    console.error('Error updating event image sizes:', err);
    res.status(500).json({ error: 'Failed to update event image sizes', details: err.message });
  }
});

// Update the google-client-id endpoint
app.get('/google-client-id', (req, res) => {
  console.log('[DEBUG] Google client ID endpoint called');
  console.log('[DEBUG] Google client ID available:', !!GOOGLE_CLIENT_ID);
  
  if (!GOOGLE_CLIENT_ID) {
    console.error('[DEBUG] Google client ID is not set');
    return res.status(500).json({ error: 'Google Client ID not configured' });
  }
  
  res.json({ clientId: GOOGLE_CLIENT_ID });
});

app.get('/proxy-drive-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');
  try {
    const driveRes = await fetch(url);
    if (!driveRes.ok) return res.status(400).send('Failed to fetch image');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', driveRes.headers.get('content-type') || 'image/jpeg');
    driveRes.body.pipe(res);
  } catch (err) {
    res.status(500).send('Proxy error');
  }
});

app.post('/events/post-upload-process', async (req, res) => {
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ error: 'Missing eventId' });

  try {
    // 1. List all images in S3 for this event
    const listResp = await s3.listObjectsV2({
      Bucket: S3_BUCKET,
      Prefix: `events/shared/${eventId}/images/`
    }).promise();

    const imageObjs = (listResp.Contents || []).filter(obj => obj.Key && !obj.Key.endsWith('/'));
    const photoCount = imageObjs.length;
    const totalImageSizeBytes = imageObjs.reduce((sum, obj) => sum + (obj.Size || 0), 0);

    // If you want to estimate compressed size, you can use the same as totalImageSizeBytes,
    // or if you have a way to distinguish, calculate separately.
    const totalCompressedSizeBytes = totalImageSizeBytes;

    // Convert to MB/GB for display
    const bytesToMB = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));
    const bytesToGB = (bytes) => Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
    const convertToAppropriateUnit = (bytes) => {
      const mb = bytesToMB(bytes);
      if (mb >= 1024) {
        return { size: bytesToGB(bytes), unit: 'GB' };
      }
      return { size: mb, unit: 'MB' };
    };

    const { size: totalImageSize, unit: totalImageSizeUnit } = convertToAppropriateUnit(totalImageSizeBytes);
    const { size: totalCompressedSize, unit: totalCompressedSizeUnit } = convertToAppropriateUnit(totalCompressedSizeBytes);

    // 2. Update DynamoDB with all fields
    const updateResult = await docClient.send(new UpdateCommand({
      TableName: 'Events',
      Key: { eventId },
      UpdateExpression: 'SET photoCount = :pc, totalImageSize = :tis, totalImageSizeUnit = :tisUnit, totalCompressedSize = :tcs, totalCompressedSizeUnit = :tcsUnit',
      ExpressionAttributeValues: {
        ':pc': photoCount,
        ':tis': totalImageSize,
        ':tisUnit': totalImageSizeUnit,
        ':tcs': totalCompressedSize,
        ':tcsUnit': totalCompressedSizeUnit
      }
    }));

    // 3. (Optional) Rekognition indexing as before
    await rekognition.createCollection({ CollectionId: `event-${eventId}` }).promise().catch(e => {
      if (e.code !== 'ResourceAlreadyExistsException') throw e;
    });
    for (const obj of imageObjs) {
      const key = obj.Key;
      try {
        await rekognition.indexFaces({
          CollectionId: `event-${eventId}`,
          Image: { S3Object: { Bucket: S3_BUCKET, Name: key } },
          ExternalImageId: key.split('/').pop(),
          DetectionAttributes: ['ALL'],
          MaxFaces: 10,
          QualityFilter: 'AUTO',
        }).promise();
      } catch (err) {
        console.error(`[Drive Upload] Failed to index face for: ${key}`, err);
      }
    }

    res.status(200).json({
      success: true,
      photoCount,
      totalImageSize,
      totalImageSizeUnit,
      totalCompressedSize,
      totalCompressedSizeUnit,
      updateResult
    });
  } catch (err) {
    console.error('Error in post-upload process:', err);
    res.status(500).json({ error: 'Failed post-upload process', details: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req, res) => {
  console.log('[DEBUG] 404 Not Found:', req.method, req.url);
  res.status(404).json({ error: 'Not Found', path: req.url });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Presign backend running on http://localhost:${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Available endpoints:');
  console.log('  - GET /health');
  console.log('  - GET /runtime-env');
  console.log('  - GET /google-client-id');
});