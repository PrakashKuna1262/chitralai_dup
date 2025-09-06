const AWS = require('aws-sdk');
const { google } = require('googleapis');

// Initialize AWS clients
const s3 = new AWS.S3({
  region: process.env.VITE_AWS_REGION,
  accessKeyId: process.env.VITE_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.VITE_AWS_SECRET_ACCESS_KEY
});

const BUCKET = process.env.VITE_S3_BUCKET_NAME;

// Helper function to get Google service account credentials
function getGoogleCredentials() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('GOOGLE_PRIVATE_KEY environment variable is not set');
  }

  return {
    type: "service_account",
    project_id: "chitralai-471306",
    private_key_id: "3c1c89d7d926705d71bb5103feacb91c501dfe9c",
    private_key: privateKey.replace(/\\n/g, '\n'),
    client_email: "chitralai@chitralai-471306.iam.gserviceaccount.com",
    client_id: "109516327096676132866",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/chitralai%40chitralai-471306.iam.gserviceaccount.com",
    universe_domain: "googleapis.com"
  };
}

// Initialize Google Drive API
async function initializeDriveAPI() {
  try {
    const credentials = getGoogleCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });
    
    return google.drive({ version: 'v3', auth });
  } catch (error) {
    console.error('Error initializing Google Drive API:', error);
    throw error;
  }
}

// Helper function to get files from Google Drive folder
async function getFilesFromFolder(folderId, driveAPI) {
  try {
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
async function getFileInfo(fileId, driveAPI) {
  try {
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

// Helper function to download file from Google Drive
async function downloadFile(fileId, driveAPI) {
  try {
    const response = await driveAPI.files.get({
      fileId: fileId,
      alt: 'media'
    }, {
      responseType: 'stream'
    });
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.data) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
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
    console.log('Drive upload function called');
    
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
      'GOOGLE_PRIVATE_KEY',
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

    // Initialize Google Drive API
    const driveAPI = await initializeDriveAPI();
    console.log('Google Drive API initialized');

    // Extract file or folder ID from the link
    const fileMatch = driveLink.match(/file\/d\/([\w-]+)/);
    const folderMatch = driveLink.match(/folders\/([\w-]+)/);

    let files = [];

    if (fileMatch) {
      // Single file
      const fileId = fileMatch[1];
      console.log('Processing single file:', fileId);
      const fileInfo = await getFileInfo(fileId, driveAPI);
      files = [fileInfo];
    } else if (folderMatch) {
      // Folder
      const folderId = folderMatch[1];
      console.log('Processing folder:', folderId);
      files = await getFilesFromFolder(folderId, driveAPI);
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid Google Drive link' })
      };
    }

    console.log('Found files:', files.length);

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

    // Process first file as a test
    const testFile = files[0];
    console.log('Processing test file:', testFile.name);

    try {
      // Download file
      const fileBuffer = await downloadFile(testFile.id, driveAPI);
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
    console.error('Error in drive-upload-simple function:', error);
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
