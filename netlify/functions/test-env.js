exports.handler = async function(event, context) {
  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  try {
    // Check environment variables
    const envCheck = {
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 'Set' : 'Not set',
      VITE_AWS_REGION: process.env.VITE_AWS_REGION || 'Not set',
      VITE_S3_BUCKET_NAME: process.env.VITE_S3_BUCKET_NAME || 'Not set',
      VITE_AWS_ACCESS_KEY_ID: process.env.VITE_AWS_ACCESS_KEY_ID ? 'Set' : 'Not set',
      VITE_AWS_SECRET_ACCESS_KEY: process.env.VITE_AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set',
      VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID || 'Not set'
    };

    // Check if Google private key is properly formatted
    let privateKeyStatus = 'Not set';
    if (process.env.GOOGLE_PRIVATE_KEY) {
      const key = process.env.GOOGLE_PRIVATE_KEY;
      if (key.includes('-----BEGIN PRIVATE KEY-----') && key.includes('-----END PRIVATE KEY-----')) {
        privateKeyStatus = 'Properly formatted';
      } else {
        privateKeyStatus = 'Set but improperly formatted';
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        environment: envCheck,
        privateKeyStatus: privateKeyStatus,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error in test-env function:', error);
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
