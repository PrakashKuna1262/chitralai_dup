const AWS = require('aws-sdk');
const fetch = require('node-fetch');

// Initialize AWS clients
const s3 = new AWS.S3({
  region: process.env.VITE_AWS_REGION,
  accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
});

const BUCKET = process.env.VITE_S3_BUCKET_NAME;

// Helper function to extract file ID from Google Drive URL
function extractFileId(url) {
  const fileMatch = url.match(/file\/d\/([\w-]+)/);
  const folderMatch = url.match(/folders\/([\w-]+)/);
  
  if (fileMatch) return { type: 'file', id: fileMatch[1] };
  if (folderMatch) return { type: 'folder', id: folderMatch[1] };
  return null;
}

// Helper function to get files from Google Drive using public API
async function getFilesFromDrive(driveLink) {
  try {
    const fileInfo = extractFileId(driveLink);
    if (!fileInfo) {
      throw new Error('Invalid Google Drive link');
    }

    if (fileInfo.type === 'file') {
      // Single file - return as array
      return [{
        id: fileInfo.id,
        name: `file-${fileInfo.id}.jpg`,
        mimeType: 'image/jpeg'
      }];
    } else {
      // Folder - try to scrape files (this is a simplified approach)
      // For now, return empty array and let the user know
      return [];
    }
  } catch (error) {
    console.error('Error getting files from Drive:', error);
    throw error;
  }
}

// Helper function to download file using public Google Drive URLs
async function downloadFileFromDrive(fileId) {
  try {
    // Try different Google Drive public URLs
    const urls = [
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/uc?id=${fileId}`,
      `https://docs.google.com/uc?export=download&id=${fileId}`
    ];

    for (const url of urls) {
      try {
        console.log('Trying URL:', url);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.ok) {
          const buffer = await response.buffer();
          // Check if it's actually an image (not an HTML error page)
          if (buffer.length > 100 && !buffer.slice(0, 100).toString().includes('<html')) {
            console.log('Successfully downloaded file, size:', buffer.length);
            return buffer;
          }
        }
      } catch (urlError) {
        console.log('URL failed:', url, urlError.message);
        continue;
      }
    }

    throw new Error('All download URLs failed');
  } catch (error) {
    console.error('Error downloading file:', error);
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
    console.log('Drive upload fixed function called');
    
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

    // Validate AWS environment variables
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

    // Get files from Drive
    const files = await getFilesFromDrive(driveLink);
    console.log('Found files:', files.length);

    if (files.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'No files found or folder access not supported. Please use individual file links.',
          results: []
        })
      };
    }

    // Process first file as a test
    const testFile = files[0];
    console.log('Processing test file:', testFile.name);

    try {
      // Download file
      const fileBuffer = await downloadFileFromDrive(testFile.id);
      console.log('Downloaded file, size:', fileBuffer.length);

      // Generate S3 key
      const timestamp = Date.now();
      const sanitizedFileName = `drive-${testFile.id}-${timestamp}.jpg`;
      const s3Key = `events/shared/${eventId}/images/${sanitizedFileName}`;

      // Upload to S3
      await s3.putObject({
        Bucket: BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ACL: 'public-read',
        ContentType: 'image/jpeg',
        CacheControl: 'max-age=31536000'
      }).promise();

      console.log('Uploaded to S3:', s3Key);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Test upload successful',
          testFile: {
            name: testFile.name,
            s3Key: s3Key,
            s3Url: `https://${BUCKET}.s3.amazonaws.com/${s3Key}`,
            size: fileBuffer.length
          },
          totalFiles: files.length
        })
      };

    } catch (processError) {
      console.error('Error processing file:', processError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Error processing file', 
          details: processError.message
        })
      };
    }

  } catch (error) {
    console.error('Error in drive-upload-fixed function:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message
      })
    };
  }
};
