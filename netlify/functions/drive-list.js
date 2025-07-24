import AWS from 'aws-sdk';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import mime from 'mime-types';

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
    const { driveLink, eventId, onlyList } = JSON.parse(event.body);
    if (!driveLink) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing driveLink' })
      };
    }

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
      } catch (err) {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Failed to scrape folder' })
        };
      }
    } else {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid Google Drive link' })
      };
    }

    fileIds = [...new Set(fileIds)];
    if (!fileIds.length) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([])
      };
    }

    // If onlyList is true, just return the list of direct image links
    if (onlyList) {
      const files = fileIds.map(fileId => ({
        name: `${fileId}.jpg`,
        url: `https://drive.google.com/uc?export=download&id=${fileId}`
      }));
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(files)
      };
    }

    // For actual processing, return error as it should be handled by separate endpoints
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Full processing not supported in this endpoint' })
    };
  } catch (err) {
    console.error('Error in drive-list function:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}; 