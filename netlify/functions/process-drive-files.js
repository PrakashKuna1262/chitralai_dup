const AWS = require('aws-sdk');
const sharp = require('sharp');
const fetch = require('node-fetch');

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

// Helper function to get branding information for an event
async function getBrandingInfo(eventId) {
  try {
    // Get event details from DynamoDB
    const dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.VITE_AWS_REGION,
      accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
    });
    
    const eventResult = await dynamodb.get({
      TableName: 'Events',
      Key: { eventId: eventId }
    }).promise();
    
    if (!eventResult.Item) {
      console.log('Event not found:', eventId);
      return { branding: false, logoUrl: null };
    }
    
    const event = eventResult.Item;
    console.log('Event found:', { eventId, organizerEmail: event.organizerEmail || event.userEmail });
    
    // Get user profile for branding and logo
    const userEmail = event.organizerEmail || event.userEmail;
    if (!userEmail) {
      console.log('No user email found for event');
      return { branding: false, logoUrl: null };
    }
    
    const userResult = await dynamodb.get({
      TableName: 'Users',
      Key: { email: userEmail }
    }).promise();
    
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
    
    // Handle different logo URL formats
    let fetchUrl = logoUrl;
    
    // Special case for event 910245 - use public folder logo
    if (logoUrl === "/taf and child logo.png") {
      fetchUrl = `https://chitradup.netlify.app${logoUrl}`;
      console.log('Using public folder logo:', fetchUrl);
    } else if (logoUrl && logoUrl.startsWith('https://chitral-ai.s3.amazonaws.com/')) {
      // Convert S3 URL to proxy URL
      fetchUrl = `https://chitradup.netlify.app/api/proxy-image?url=${encodeURIComponent(logoUrl)}`;
    } else if (logoUrl) {
      // Use logoUrl as-is if it's already a full URL
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

// Helper function to extract file ID from Google Drive URL
function extractFileId(url) {
  if (url.includes('uc?export=download')) {
    const match = url.match(/id=([^&]+)/);
    return match ? match[1] : null;
  } else if (url.includes('/file/d/')) {
    const match = url.match(/\/file\/d\/([^\/]+)/);
    return match ? match[1] : null;
  } else if (url.includes('uc?id=')) {
    const match = url.match(/id=([^&]+)/);
    return match ? match[1] : null;
  }
  return null;
}

// Helper function to download file from Google Drive
async function downloadFromDrive(fileId) {
  const urlsToTry = [
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.google.com/uc?id=${fileId}`,
    `https://drive.google.com/file/d/${fileId}/view`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000-h1000`,
    `https://lh3.googleusercontent.com/d/${fileId}`,
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
          
          // Convert response to buffer directly
          const buffer = await response.buffer();
          console.log(`URL ${i + 1} downloaded successfully, buffer size:`, buffer.length);
          return {
            buffer: buffer,
            contentType: contentType,
            contentLength: contentLength
          };
        } else {
          console.log(`URL ${i + 1} returned non-image content:`, contentType);
          // Try to read the response body to see what we got
          try {
            const text = await response.text();
            console.log(`URL ${i + 1} response body preview:`, text.substring(0, 200));
          } catch (e) {
            console.log(`URL ${i + 1} could not read response body`);
          }
        }
      } else {
        console.log(`URL ${i + 1} failed with status:`, response.status, response.statusText);
        // Try to read error response
        try {
          const errorText = await response.text();
          console.log(`URL ${i + 1} error response:`, errorText.substring(0, 200));
        } catch (e) {
          console.log(`URL ${i + 1} could not read error response`);
        }
      }
    } catch (err) {
      console.log(`URL ${i + 1} error:`, err.message);
    }
  }
  
  throw new Error(`All Google Drive URL attempts failed for file ID: ${fileId}. Please ensure the file is publicly accessible or shared with 'Anyone with the link can view' permission.`);
}

// Helper function to process and upload image
async function processAndUploadImage(fileId, eventId, originalUrl, branding, logoUrl) {
  try {
    // Download from Google Drive
    const { buffer, contentType } = await downloadFromDrive(fileId);
    
    console.log('Downloaded file size:', buffer.length, 'bytes');
    
    // Use branding information passed from frontend (same as manual uploads)
    console.log('Using branding info from frontend:', { branding, logoUrl });
    
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
          // Wider than tall (landscape)
          finalLogoWidth = logoSize;
          finalLogoHeight = logoSize / logoAspectRatio;
        } else {
          // Taller than wide (portrait) or square
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
            left: Math.floor(logoX * (1024 / originalWidth)), // Scale position for resized image
            top: Math.floor(logoY * (1024 / originalHeight)), // Scale position for resized image
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
      // Don't fail the whole process for face indexing errors
    }
    
    return {
      success: true,
      s3Key: s3Key,
      s3Url: `https://${BUCKET}.s3.amazonaws.com/${s3Key}`,
      originalSize: totalLength,
      processedSize: processedBuffer.length,
      fileName: sanitizedFileName
    };
    
  } catch (error) {
    console.error('Error processing file:', fileId, error);
    return {
      success: false,
      error: error.message,
      fileId: fileId,
      originalUrl: originalUrl
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
    const body = JSON.parse(event.body || '{}');
    const { fileUrls, eventId, logoUrl, branding } = body;
    
    console.log('Received branding info from frontend:', { branding, logoUrl });
    
    if (!fileUrls || !Array.isArray(fileUrls) || fileUrls.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing or invalid fileUrls array' })
      };
    }
    
    if (!eventId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing eventId' })
      };
    }

    console.log('Processing', fileUrls.length, 'files for event:', eventId);

    // Process all files in parallel
    const results = await Promise.all(
      fileUrls.map(async (url) => {
        const fileId = extractFileId(url);
        if (!fileId) {
          return {
            success: false,
            error: 'Could not extract file ID from URL',
            originalUrl: url
          };
        }
        return await processAndUploadImage(fileId, eventId, url, branding, logoUrl);
      })
    );

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log('Processing complete:', successful.length, 'successful,', failed.length, 'failed');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        totalFiles: fileUrls.length,
        successful: successful.length,
        failed: failed.length,
        results: results,
        successfulFiles: successful,
        failedFiles: failed
      })
    };

  } catch (err) {
    console.error('Error in process-drive-files function:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', details: err.message })
    };
  }
};
