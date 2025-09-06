const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const sharp = require('sharp');
const cheerio = require('cheerio');

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
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({
  region: process.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
  }
});
const docClient = DynamoDBDocumentClient.from(ddbClient);

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

// Helper function to scrape Google Drive folder for file IDs
async function scrapeDriveFolder(folderId) {
  try {
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    console.log('Scraping folder URL:', folderUrl);
    
    const response = await fetch(folderUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch folder: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const fileIds = [];
    
    // Try multiple selectors to find file IDs
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
    
    // Remove duplicates
    const uniqueFileIds = [...new Set(fileIds)];
    console.log('Found file IDs:', uniqueFileIds.length);
    
    return uniqueFileIds;
  } catch (error) {
    console.error('Error scraping Drive folder:', error);
    throw error;
  }
}

// Helper function to download file from Google Drive
async function downloadFileFromDrive(fileId) {
  const urlsToTry = [
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.google.com/uc?id=${fileId}`,
    `https://docs.google.com/uc?export=download&id=${fileId}`
  ];

  for (let i = 0; i < urlsToTry.length; i++) {
    try {
      console.log(`Trying Google Drive URL ${i + 1}:`, urlsToTry[i]);
      
      const response = await fetch(urlsToTry[i], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://drive.google.com/',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow',
        timeout: 60000 // 60 second timeout for large files
      });

      console.log(`URL ${i + 1} response status:`, response.status, response.statusText);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        console.log(`URL ${i + 1} content type:`, contentType, 'length:', contentLength);
        
        if (contentType && contentType.startsWith('image/')) {
          console.log(`Successfully downloaded file with URL ${i + 1}, content-type:`, contentType);
          
          const buffer = await response.buffer();
          console.log(`URL ${i + 1} downloaded successfully, buffer size:`, buffer.length);
          return {
            buffer: buffer,
            contentType: contentType,
            contentLength: contentLength
          };
        } else {
          console.log(`URL ${i + 1} returned non-image content:`, contentType);
        }
      } else {
        console.log(`URL ${i + 1} failed with status:`, response.status, response.statusText);
      }
    } catch (err) {
      console.log(`URL ${i + 1} error:`, err.message);
    }
  }
  
  throw new Error(`All Google Drive URL attempts failed for file ID: ${fileId}. Please ensure the file is publicly accessible.`);
}

// Helper function to process and upload image with branding (like manual upload)
async function processAndUploadImage(fileId, eventId, branding, logoUrl) {
  try {
    console.log(`Processing file ID: ${fileId}`);
    
    // Download from Google Drive
    const { buffer, contentType } = await downloadFileFromDrive(fileId);
    
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
        
        // Calculate proportional watermark size based on image dimensions (matching manual upload logic)
        const minDimension = Math.min(originalWidth, originalHeight);
        const maxDimension = Math.max(originalWidth, originalHeight);
        
        // Define size ranges for different image sizes (matching manual upload logic)
        let logoSize;
        if (minDimension < 800) {
          // Small images: 20% of min dimension
          logoSize = Math.max(160, Math.floor(minDimension * 0.20));
        } else if (minDimension < 1600) {
          // Medium images: 18% of min dimension
          logoSize = Math.max(200, Math.floor(minDimension * 0.18));
        } else if (minDimension < 3000) {
          // Large images: 16% of min dimension
          logoSize = Math.max(300, Math.floor(minDimension * 0.16));
        } else {
          // Very large images: 14% of min dimension
          logoSize = Math.max(400, Math.floor(minDimension * 0.14));
        }
        
        // Ensure logo doesn't exceed reasonable bounds
        logoSize = Math.min(logoSize, Math.floor(maxDimension * 0.35));
        
        // Calculate proportional padding based on image size (matching manual upload logic)
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
        
        // Position logo in bottom-left corner with padding (matching manual upload logic)
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
        
        // Apply watermark with shadow effect (matching manual upload logic)
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
    const sanitizedFileName = `drive-${fileId}-${timestamp}.jpg`;
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
      fileId: fileId
    };
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
    console.log('Drive upload complete function called');
    
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { driveLink, eventId } = body;
    
    console.log('Request body:', { driveLink, eventId });
    
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

    // Validate environment variables
    const requiredEnvVars = [
      'VITE_AWS_REGION',
      'VITE_S3_BUCKET_NAME',
      'VITE_AWS_ACCESS_KEY_ID',
      'VITE_AWS_SECRET_ACCESS_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      console.error('Missing environment variables:', missingVars);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing environment variables', 
          missing: missingVars 
        })
      };
    }

    console.log('Environment variables validated');

    // Extract file or folder ID from the link
    const fileMatch = driveLink.match(/file\/d\/([\w-]+)/);
    const folderMatch = driveLink.match(/folders\/([\w-]+)/);

    let fileIds = [];

    if (fileMatch) {
      // Single file
      fileIds = [fileMatch[1]];
      console.log('Processing single file:', fileIds[0]);
    } else if (folderMatch) {
      // Folder - scrape for file IDs
      const folderId = folderMatch[1];
      console.log('Processing folder:', folderId);
      fileIds = await scrapeDriveFolder(folderId);
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid Google Drive link' })
      };
    }

    if (fileIds.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'No image files found in the provided Drive folder',
          results: []
        })
      };
    }

    console.log('Found files to process:', fileIds.length);

    // Get branding information
    const { branding, logoUrl } = await getBrandingInfo(eventId);
    console.log('Using branding info:', { branding, logoUrl });

    // Process files in batches (like manual upload)
    const BATCH_SIZE = 3;
    const results = [];
    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;

    for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
      const batch = fileIds.slice(i, i + BATCH_SIZE);
      
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(fileIds.length / BATCH_SIZE)}`);
      
      const batchResults = await Promise.all(
        batch.map(async (fileId) => {
          const result = await processAndUploadImage(fileId, eventId, branding, logoUrl);
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

    // Update event statistics (like manual upload)
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
        totalFiles: fileIds.length,
        successful: successful.length,
        failed: failed.length,
        results: results,
        successfulFiles: successful,
        failedFiles: failed,
        totalOriginalBytes,
        totalCompressedBytes
      })
    };

  } catch (error) {
    console.error('Error in drive-upload-complete function:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        stack: error.stack
      })
    };
  }
};
