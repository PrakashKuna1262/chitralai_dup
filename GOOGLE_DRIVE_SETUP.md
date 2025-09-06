# Google Drive API Setup for Chitralai

## Overview
This document explains how to set up Google Drive API access for the improved drive upload functionality that handles large files and proper branding.

## Service Account Setup

### 1. Create Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project: `chitralai-471306`
3. Navigate to "IAM & Admin" > "Service Accounts"
4. Click "Create Service Account"
5. Name: `chitralai-drive-api`
6. Description: `Service account for Google Drive API access in Chitralai`

### 2. Generate Private Key
1. Click on the created service account
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" format
5. Download the key file

### 3. Enable Google Drive API
1. Go to "APIs & Services" > "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

### 4. Set Environment Variables

#### For Netlify (Production)
1. Go to your Netlify site dashboard
2. Navigate to "Site settings" > "Environment variables"
3. Add the following variable:
   - **Name**: `GOOGLE_PRIVATE_KEY`
   - **Value**: The private key from the JSON file (replace `\n` with actual newlines)

#### For Local Development
1. Create a `.env` file in your project root
2. Add the following line:
   ```
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCJIFh/USpDVHcF\nj1iZT/zQjPKthvwxQL0YFqccr6orHV1yRkeIw0hdqvhsPXpn0s7CTD8pK+poYyN5\nAwX2srL4KpRg+2dcqJbpbvQDGwULmhl7lol95hW2Zh/5iF+P6QLVbOJ03eOB6YA2\nio39GtD/eE3IE+X+6jRWKbdRgTcsGuYFJ+OPBNdZrwCPd9RiNN/YApVBWf4jkBpP\n4MlSm+WBTgZIuz/dPT/lLXKCJq9LZK0XJLpTE2FnawQMvhTx1CEySe3UPmk68x5j\nP+9lwMm1FB+DRdTa0oifkSAK+N4HdbKrwDX0CJTFSwVlqbEi3Qt0/rdAMQvOLqyJ\nPlWtQlbPAgMBAAECggEAKu191umtXeOg2RQ9i81PG2ishidmZvLZ36Mj0KarkpDA\nUshul4Fu86fU2mnKmpsTkB73fOebG+/BSJ5qLQdXYLpPtiat/oNmrxBFgn1gcHfe\n92Iyi7/OV0oUQ3VuWSp8cR0DrctS8DYNpcVtWumcuQVL8FFOZKWkGb84fOMDRyJ1\nNMN19mQsZ5Yi4Zn8p3UCwwzF4fwYAugxSqvO7P6I7OJzh9pLFyWHrtlPlrAqRiIW\njdcgV2HnAYM+4eRdxKMac8E79ef55KuByMNpSOzbiuJsrZaHUEH2aGC8vibK2YhW\nV1I+es01EypD1jeUBumW0ELypd30DJI79PBfXdeegQKBgQDBwYOWlE1jC7OC6bk0\najNH6sUgjfvuF8eDVOkFtxFv1Ue3UOZlqs3rR3hMtLRSWxafgRJZNcREm/NpStFx\n22yaif3dOaVtOHbdIfP3sXGh6TNs3KqAkKhNo8IezSCiyErKDN8DqBjV8/hUVGRc\nj0NQiEzELJIimDfVFxserw4RgQKBgQC1LZ3Q0KPRHgE/7FhvX/TWpTr/oyciuA+8\nSMi9jVXd7LeWWxaHnRsTmihjBlE0MFetZWM22inEly6nk6KPkn9R6moaNcP91GM0\n1IAuIM0zMRqebJhV+HtqNsU9T5gFVrkpuKuOm0YmMPeRCYq6iFAbypPhFgV94HTy\nnsj9lILwTwKBgAg1AjXmokCHxlrNO6MUvIdXUnJGkV1MdI8DkbtEPeDWz+rb6mZ0\nDbThmh7lqJ20bgjjlrtgo6ekU3MqUCTafoctQSuVvYQa2C4VuhfL1FxfXGZIEpDP\nj9F6FkbnuXIrub9FPE0TWbn2U5Z+3KFvEBLhMx88JBSDDhpgmC18jMQBAoGAOsBk\nIMbHmJRmS1hVBSjUuJY0H5nEoxmU4LWpgu5GHgUZM4SuNaPYl+6xkgsGYiobBHuQ\nRMVSLhHoaycQ3AXhi6q8ZWtx9unckdEnD85LPIJ740vLynUdcD/6jfs1jOWmfcUI\nvOHVSaUvYrT5a6uwbpKuiZsehMc4pUSgYLq8CzkCgYBiOL9cKCtTqA3eteOD6MAz\n1u7ojQnHvjePHhfOmRLb6HvcBWV2nD9H8HZElbxtrN3efk4xrFHdn25df8nyTj3m\nuVE2RAHHjf4EQsNbEIAprmcvwq1mQzbvM/mseBAujkxTTVjQ0AwFa+aK8aftafAC\ndeAg626elVVp72s+xQXKvQ==\n-----END PRIVATE KEY-----"
   ```

## Features of the New Drive Upload System

### ✅ Fixed Issues
1. **CORS Issues**: No more CORS problems with large files (>5MB)
2. **Proper Branding**: Logo watermarking now works correctly for drive uploads
3. **Service Account Authentication**: Uses Google service account instead of scraping
4. **Better Error Handling**: More robust error handling and user feedback
5. **Memory Optimization**: Processes files in batches to avoid memory issues

### 🔧 Technical Improvements
1. **Server-Side Processing**: All image processing happens on the server
2. **Direct API Access**: Uses Google Drive API v3 instead of web scraping
3. **Batch Processing**: Handles large folders efficiently
4. **Automatic Statistics**: Updates event statistics automatically
5. **Face Recognition**: Indexes faces for AI recognition

### 📊 Performance Benefits
- Handles files up to 100MB+ without CORS issues
- Processes multiple files in parallel batches
- Automatic image compression and optimization
- Proper logo watermarking with proportional sizing
- Real-time progress tracking

## Usage

The new system is automatically used when users upload from Google Drive. No changes needed in the frontend - it will use the new `/api/drive-upload` endpoint automatically.

## Troubleshooting

### Common Issues
1. **"Google Drive API not enabled"**: Make sure Google Drive API is enabled in Google Cloud Console
2. **"Invalid credentials"**: Check that the private key is correctly formatted with proper newlines
3. **"Access denied"**: Ensure the service account has proper permissions
4. **"No images found"**: Make sure the Google Drive folder/file is shared publicly or with the service account

### Testing
1. Test with a small folder first (2-3 images)
2. Check the browser console for any error messages
3. Verify the environment variables are set correctly
4. Check Netlify function logs for detailed error information
