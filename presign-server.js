import 'dotenv/config';
import express from 'express';
import AWS from 'aws-sdk';
import cors from 'cors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

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
    'https://chitra.netlify.app'
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