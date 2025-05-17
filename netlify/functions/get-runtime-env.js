exports.handler = async function(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Validate required environment variables
  const requiredEnvVars = [
    'VITE_AWS_REGION',
    'VITE_S3_BUCKET_NAME',
    'VITE_GOOGLE_CLIENT_ID',
    'VITE_AWS_ACCESS_KEY_ID',
    'VITE_AWS_SECRET_ACCESS_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify({ 
        error: 'Server configuration error',
        missingVariables: missingVars
      })
    };
  }

  const runtimeVariables = {
    VITE_AWS_REGION: process.env.VITE_AWS_REGION,
    VITE_S3_BUCKET_NAME: process.env.VITE_S3_BUCKET_NAME,
    VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID,
    VITE_AWS_ACCESS_KEY_ID: process.env.VITE_AWS_ACCESS_KEY_ID,
    VITE_AWS_SECRET_ACCESS_KEY: process.env.VITE_AWS_SECRET_ACCESS_KEY
  };

  

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET'
    },
    body: JSON.stringify(runtimeVariables)
  };
}; 
