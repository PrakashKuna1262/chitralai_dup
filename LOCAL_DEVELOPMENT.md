# Local Development Setup

## For Drive Upload Testing

The new Google Drive upload functionality requires the Netlify environment to work properly. Here are your options for local development:

### Option 1: Use Netlify Dev Server (Recommended)

1. Install Netlify CLI if you haven't already:
   ```bash
   npm install -g netlify-cli
   ```

2. Run the Netlify dev server:
   ```bash
   npm run dev:netlify
   ```

3. This will start both the frontend and backend functions locally with proper environment variables.

### Option 2: Use Production Environment

1. Deploy your changes to Netlify
2. Test the drive upload functionality on the production site
3. The drive upload will work properly with the service account credentials

### Option 3: Use Presign Server (Limited)

1. Run the presign server:
   ```bash
   npm run dev:presign
   ```

2. Run the frontend:
   ```bash
   npm run dev
   ```

3. Note: Drive upload will show an error message in local development, but other features will work.

## Environment Variables

Make sure you have the following environment variables set in Netlify:

- `GOOGLE_PRIVATE_KEY` - The complete private key from your service account JSON
- `VITE_AWS_REGION` - Your AWS region
- `VITE_S3_BUCKET_NAME` - Your S3 bucket name
- `VITE_AWS_ACCESS_KEY_ID` - Your AWS access key
- `VITE_AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `VITE_GOOGLE_CLIENT_ID` - Your Google OAuth client ID

## Testing Drive Upload

1. Use Option 1 (Netlify dev server) for the best local testing experience
2. Or deploy to production and test there
3. The drive upload will handle large files (>5MB) without CORS issues
4. Logo branding will work correctly
5. All processing happens server-side for better performance

## Troubleshooting

- If you see "Drive upload not available in local development", use Option 1 or 2
- Make sure the Google Drive API is enabled in your Google Cloud Console
- Verify the service account has proper permissions
- Check that the private key is correctly formatted with proper newlines
