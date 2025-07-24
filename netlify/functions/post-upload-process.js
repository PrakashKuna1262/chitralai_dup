import AWS from 'aws-sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

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

// Helper functions for size conversion
const bytesToMB = (bytes) => Number((bytes / (1024 * 1024)).toFixed(2));
const bytesToGB = (bytes) => Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
const convertToAppropriateUnit = (bytes) => {
  const mb = bytesToMB(bytes);
  if (mb >= 1024) {
    return { size: bytesToGB(bytes), unit: 'GB' };
  }
  return { size: mb, unit: 'MB' };
};

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { eventId } = JSON.parse(event.body);
    if (!eventId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing eventId' })
      };
    }

    // 1. List all images in S3 for this event
    const listResp = await s3.listObjectsV2({
      Bucket: BUCKET,
      Prefix: `events/shared/${eventId}/images/`
    }).promise();

    const imageObjs = (listResp.Contents || []).filter(obj => obj.Key && !obj.Key.endsWith('/'));
    const photoCount = imageObjs.length;
    const totalImageSizeBytes = imageObjs.reduce((sum, obj) => sum + (obj.Size || 0), 0);
    const totalCompressedSizeBytes = totalImageSizeBytes; // Using same size as we don't track compressed separately

    // Convert sizes to appropriate units
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

    // 3. Rekognition indexing
    await rekognition.createCollection({ CollectionId: `event-${eventId}` }).promise().catch(e => {
      if (e.code !== 'ResourceAlreadyExistsException') throw e;
    });

    for (const obj of imageObjs) {
      const key = obj.Key;
      try {
        await rekognition.indexFaces({
          CollectionId: `event-${eventId}`,
          Image: { S3Object: { Bucket: BUCKET, Name: key } },
          ExternalImageId: key.split('/').pop(),
          DetectionAttributes: ['ALL'],
          MaxFaces: 10,
          QualityFilter: 'AUTO',
        }).promise();
      } catch (err) {
        console.error(`[Drive Upload] Failed to index face for: ${key}`, err);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        photoCount,
        totalImageSize,
        totalImageSizeUnit,
        totalCompressedSize,
        totalCompressedSizeUnit,
        updateResult
      })
    };
  } catch (err) {
    console.error('Error in post-upload process:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed post-upload process', details: err.message })
    };
  }
}; 