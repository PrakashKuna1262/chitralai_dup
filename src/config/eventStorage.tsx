import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  QueryCommand, 
  DeleteCommand,
  ScanCommand,
  GetCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { docClientPromise } from './dynamodb';
import { s3ClientPromise, validateEnvVariables } from './aws';
import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Table name for storing events
export const EVENTS_TABLE = 'Events';

// Interface for event data
export interface EventData {
  id: string;         // Used in application code
  eventId?: string;   // Used by DynamoDB as primary key
  name: string;
  date: string;
  description?: string;
  photoCount: number;
  videoCount: number;
  guestCount: number;
  userEmail: string;
  organizerId?: string; // The user who created the event (mapped from userEmail)
  userId?: string;      // The user ID of the creator
  createdAt: string;
  updatedAt: string;
  coverImage?: string;
  eventUrl?: string;    // URL for uploading selfies and getting matching images
  emailAccess?: string[]; // List of email addresses that can access the event
  organizationCode?: string; // Organization code of the event creator
  anyoneCanUpload?: boolean; // Whether anyone can upload photos to this event
  totalImageSize?: number; // Total original size in MB or GB
  totalImageSizeUnit?: 'MB' | 'GB'; // Unit of measurement for totalImageSize
  totalCompressedSize?: number; // Total compressed size in MB or GB
  totalCompressedSizeUnit?: 'MB' | 'GB'; // Unit of measurement for totalCompressedSize
}

// Helper function to convert bytes to MB
export const bytesToMB = (bytes: number): number => {
  return Number((bytes / (1024 * 1024)).toFixed(2));
};

// Helper function to convert bytes to GB
export const bytesToGB = (bytes: number): number => {
  return Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
};

// Helper function to determine appropriate unit and convert size
export const convertToAppropriateUnit = (bytes: number): { size: number; unit: 'MB' | 'GB' } => {
  const mb = bytesToMB(bytes);
  if (mb >= 1024) {
    return { size: bytesToGB(bytes), unit: 'GB' };
  }
  return { size: mb, unit: 'MB' };
};

// Helper function to format size for display
export const formatSize = (size: number, unit: 'MB' | 'GB'): string => {
  return `${size} ${unit}`;
};

// Helper function to convert between units
export const convertBetweenUnits = (size: number, fromUnit: 'MB' | 'GB', toUnit: 'MB' | 'GB'): number => {
  if (fromUnit === toUnit) return size;
  if (fromUnit === 'MB' && toUnit === 'GB') return Number((size / 1024).toFixed(2));
  if (fromUnit === 'GB' && toUnit === 'MB') return Number((size * 1024).toFixed(2));
  return size;
};

// Helper function to add sizes with different units
export const addSizes = (size1: number, unit1: 'MB' | 'GB', size2: number, unit2: 'MB' | 'GB'): { size: number; unit: 'MB' | 'GB' } => {
  // Convert both to MB for addition
  const size1InMB = unit1 === 'GB' ? size1 * 1024 : size1;
  const size2InMB = unit2 === 'GB' ? size2 * 1024 : size2;
  const totalMB = size1InMB + size2InMB;
  
  // Convert back to appropriate unit
  return convertToAppropriateUnit(totalMB * 1024 * 1024);
};

// Helper function to subtract sizes with different units
export const subtractSizes = (size1: number, unit1: 'MB' | 'GB', size2: number, unit2: 'MB' | 'GB'): { size: number; unit: 'MB' | 'GB' } => {
  // Convert both to MB for subtraction
  const size1InMB = unit1 === 'GB' ? size1 * 1024 : size1;
  const size2InMB = unit2 === 'GB' ? size2 * 1024 : size2;
  const totalMB = Math.max(0, size1InMB - size2InMB);
  
  // Convert back to appropriate unit
  return convertToAppropriateUnit(totalMB * 1024 * 1024);
};

// Store event data in DynamoDB
export const storeEventData = async (eventData: Omit<EventData, 'createdAt' | 'updatedAt'>): Promise<boolean> => {
  try {
    const timestamp = new Date().toISOString();
    
    // Ensure we have the required keys for DynamoDB
    if (!eventData.id) {
      console.error("Error: 'id' is required for DynamoDB events table");
      return false;
    }

    // Get user data to fetch organization code
    const { getUserByEmail } = await import('./dynamodb');
    const userData = await getUserByEmail(eventData.userEmail);
    const organizationCode = userData?.organizationCode;

    console.log('User data fetched:', { userData, organizationCode });

    // Create a sanitized copy of the event data with proper structure
    const sanitizedData = {
      eventId: eventData.id, // Map id to eventId for DynamoDB
      id: eventData.id,  // Keep the id field for backward compatibility
      name: eventData.name || 'Untitled Event',
      date: eventData.date || timestamp,
      description: eventData.description || '',
      photoCount: eventData.photoCount || 0,
      videoCount: eventData.videoCount || 0,
      guestCount: eventData.guestCount || 0,
      userEmail: eventData.userEmail,
      organizerId: eventData.organizerId || eventData.userEmail, // Set organizerId to the user's email (userEmail)
      userId: eventData.userEmail, // Set userId to the user's email
      createdAt: timestamp,
      updatedAt: timestamp,
      coverImage: eventData.coverImage || '',
      eventUrl: eventData.eventUrl || '',
      emailAccess: eventData.emailAccess || [],
      organizationCode: organizationCode || null, // Add organization code
      anyoneCanUpload: eventData.anyoneCanUpload || false, // Add anyoneCanUpload
      totalImageSize: eventData.totalImageSize || 0, // Add totalImageSize
      totalImageSizeUnit: eventData.totalImageSizeUnit || 'MB', // Add totalImageSizeUnit
      totalCompressedSize: eventData.totalCompressedSize || 0, // Add totalCompressedSize
      totalCompressedSizeUnit: eventData.totalCompressedSizeUnit || 'MB' // Add totalCompressedSizeUnit
    };

    // Log the item being stored (helpful for debugging)
    console.log('Storing event in DynamoDB:', {
      eventId: sanitizedData.eventId,
      name: sanitizedData.name,
      userEmail: sanitizedData.userEmail,
      organizerId: sanitizedData.organizerId,
      userId: sanitizedData.userId,
      organizationCode: sanitizedData.organizationCode,
      tableUsed: EVENTS_TABLE
    });

    const command = new PutCommand({
      TableName: EVENTS_TABLE,
      Item: sanitizedData
    });

    await (await docClientPromise).send(command);
    console.log("Event data stored successfully in DynamoDB");
    return true;
  } catch (error) {
    console.error("Error storing event data in DynamoDB:", error);
    return false;
  }
};

// Get all events for a specific user
export const getUserEvents = async (userEmail: string): Promise<EventData[]> => {
  try {
    // Use ScanCommand instead of QueryCommand since the table's key schema requires eventId
    const command = new ScanCommand({
      TableName: EVENTS_TABLE,
      FilterExpression: 'userEmail = :userEmail',
      ExpressionAttributeValues: {
        ':userEmail': userEmail
      }
    });

    const response = await (await docClientPromise).send(command);
    
    // Map the DynamoDB items to our EventData interface, ensuring id is available
    const events = (response.Items || []).map(item => ({
      ...item,
      id: item.eventId || item.id, // Use eventId as id if id doesn't exist
      organizerId: item.organizerId || item.userEmail, // Ensure organizerId is set
      userId: item.userId || item.userEmail  // Ensure userId is set
    }));
    
    return events as EventData[];
  } catch (error) {
    console.error("Error getting user events from DynamoDB:", error);
    return [];
  }
};

// Get a specific event by ID
export const getEventById = async (eventId: string): Promise<EventData | null> => {
  try {
    console.log(`Searching for event with ID: ${eventId}`);
    
    // First, try a direct lookup using GetCommand which is more efficient
    const getCommand = new GetCommand({
      TableName: EVENTS_TABLE,
      Key: {
        eventId: eventId
      }
    });
    
    try {
      const getResponse = await (await docClientPromise).send(getCommand);
      if (getResponse.Item) {
        console.log('Event found directly via GetCommand:', getResponse.Item);
        
        // Ensure the item has all required properties
        const item = getResponse.Item;
        return {
          ...item,
          id: item.id || item.eventId,
          eventId: item.eventId || item.id,
          organizerId: item.organizerId || item.userEmail,
          userId: item.userId || item.userEmail
        } as EventData;
      }
    } catch (getError) {
      console.warn('Error with direct GetCommand lookup:', getError);
      // Continue to the scan approach
    }
    
    // If direct lookup failed, try a more flexible scan
    const scanCommand = new ScanCommand({
      TableName: EVENTS_TABLE,
      FilterExpression: 'eventId = :eventId OR id = :id',
      ExpressionAttributeValues: {
        ':eventId': eventId,
        ':id': eventId
      }
    });

    console.log('Performing scan search for event:', eventId);
    const response = await (await docClientPromise).send(scanCommand);
    console.log('Scan response:', JSON.stringify(response.Items));
    
    if (!response.Items || response.Items.length === 0) {
      console.log('No items found in scan');
      return null;
    }
    
    // Ensure the item has both id and eventId properties
    const item = response.Items[0];
    console.log('Event found via scan:', item);
    
    // Make sure organizerId exists (default to userEmail if not)
    if (!item.organizerId && item.userEmail) {
      item.organizerId = item.userEmail;
    }
    
    // Make sure userId exists (default to userEmail if not)
    if (!item.userId && item.userEmail) {
      item.userId = item.userEmail;
    }
    
    return {
      ...item,
      id: item.id || eventId, // Ensure id is set
      eventId: item.eventId || eventId // Ensure eventId is set
    } as EventData;
  } catch (error) {
    console.error("Error getting event by ID from DynamoDB:", error);
    return null;
  }
};

// Update event data
export const updateEventData = async (
  eventId: string, 
  userEmail: string, 
  updates: Partial<Omit<EventData, 'id' | 'userEmail' | 'createdAt'>>
): Promise<boolean> => {
  try {
    // First, check if the event exists
    const existingEvent = await getEventById(eventId);
    
    if (!existingEvent) {
      console.error(`Event with ID ${eventId} not found`);
      return false;
    }
    
    // Build update expression and attribute values
    let updateExpression = "set updatedAt = :updatedAt";
    const expressionAttributeValues: Record<string, any> = {
      ":updatedAt": new Date().toISOString()
    };

    // Add each update field to the expression
    Object.entries(updates).forEach(([key, value]) => {
      updateExpression += `, ${key} = :${key}`;
      expressionAttributeValues[`:${key}`] = value;
    });

    // Also ensure userEmail is updated if needed
    if (!existingEvent.userEmail || existingEvent.userEmail !== userEmail) {
      updateExpression += ", userEmail = :userEmail";
      expressionAttributeValues[":userEmail"] = userEmail;
    }
    
    // Make sure organizerId is preserved if it doesn't exist
    if (!existingEvent.organizerId) {
      updateExpression += ", organizerId = :organizerId";
      expressionAttributeValues[":organizerId"] = existingEvent.userEmail || userEmail;
    }
    
    // Make sure userId is preserved if it doesn't exist
    if (!existingEvent.userId) {
      updateExpression += ", userId = :userId";
      expressionAttributeValues[":userId"] = existingEvent.userEmail || userEmail;
    }

    const command = new UpdateCommand({
      TableName: EVENTS_TABLE,
      Key: {
        eventId: eventId
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW"
    });

    await (await docClientPromise).send(command);
    console.log(`Successfully updated event ${eventId}`);
    return true;
  } catch (error) {
    console.error("Error updating event in DynamoDB:", error);
    return false;
  }
};

// Delete an event
export const deleteEvent = async (eventId: string, userEmail: string): Promise<boolean> => {
  try {
    // First delete from DynamoDB
    const command = new DeleteCommand({
      TableName: EVENTS_TABLE,
      Key: {
        eventId: eventId
      }
    });

    await (await docClientPromise).send(command);

    // Then delete all associated files from S3
    const { bucketName } = await validateEnvVariables();
    const s3Client = await s3ClientPromise;
    
    // List all objects in the event's directory
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `events/shared/${eventId}/`
    });

    const listedObjects = await s3Client.send(listCommand);
    
    if (listedObjects.Contents && listedObjects.Contents.length > 0) {
      // Delete all objects in parallel
      const deletePromises = listedObjects.Contents.map(({ Key }) => {
        if (!Key) return Promise.resolve();
        return s3Client.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key
        }));
      });

      await Promise.all(deletePromises);
    }

    return true;
  } catch (error) {
    console.error("Error deleting event:", error);
    return false;
  }
};

// Get event statistics for a user
export const getEventStatistics = async (userEmail: string) => {
  try {
    // Get events where user is listed as userEmail
    const events = await getUserEvents(userEmail);
    
    // Get events where user is the organizer
    const organizerEvents = await getEventsByOrganizerId(userEmail);
    
    // Get events where user is the userId
    const userIdEvents = await getEventsByUserId(userEmail);
    
    // Combine events and remove duplicates (based on eventId)
    const allEvents = [...events];
    
    // Add organizer events that aren't already in the list
    organizerEvents.forEach(orgEvent => {
      if (!allEvents.some(event => event.id === orgEvent.id)) {
        allEvents.push(orgEvent);
      }
    });
    
    // Add userId events that aren't already in the list
    userIdEvents.forEach(userIdEvent => {
      if (!allEvents.some(event => event.id === userIdEvent.id)) {
        allEvents.push(userIdEvent);
      }
    });
    
    const totalImageSize = allEvents.reduce((sum, event) => sum + (event.totalImageSize || 0), 0);
    
    return {
      eventCount: allEvents.length,
      photoCount: allEvents.reduce((sum, event) => sum + (event.photoCount || 0), 0),
      videoCount: allEvents.reduce((sum, event) => sum + (event.videoCount || 0), 0),
      guestCount: allEvents.reduce((sum, event) => sum + (event.guestCount || 0), 0),
      totalImageSize: totalImageSize,
      formattedTotalSize: formatSize(totalImageSize, allEvents[0].totalImageSizeUnit || 'MB')
    };
  } catch (error) {
    console.error("Error getting event statistics from DynamoDB:", error);
    return {
      eventCount: 0,
      photoCount: 0,
      videoCount: 0,
      guestCount: 0,
      totalImageSize: 0,
      formattedTotalSize: '0 MB'
    };
  }
};

// Utility function to migrate localStorage data to DynamoDB
export const migrateLocalStorageToDb = async (userEmail: string): Promise<boolean> => {
  try {
    // Check if we have any local events stored
    const localStorageKey = 'local_events';
    const localEventsJson = localStorage.getItem(localStorageKey);
    
    if (!localEventsJson) {
      console.log('No local events to migrate');
      return true;
    }
    
    // Parse local events
    const localEvents = JSON.parse(localEventsJson);
    if (!Array.isArray(localEvents) || localEvents.length === 0) {
      console.log('No local events to migrate or invalid format');
      return true;
    }
    
    console.log(`Found ${localEvents.length} local events to migrate to DynamoDB`);
    
    // Filter for this user's events
    const userEvents = localEvents.filter(event => event.userEmail === userEmail);
    
    // Store each event in DynamoDB
    let successCount = 0;
    for (const event of userEvents) {
      const success = await storeEventData(event);
      if (success) {
        successCount++;
      }
    }
    
    console.log(`Successfully migrated ${successCount} of ${userEvents.length} events to DynamoDB`);
    
    // Clear local storage if all migrated successfully
    if (successCount === userEvents.length) {
      localStorage.removeItem(localStorageKey);
      console.log('Local events data cleared after successful migration');
    }
    
    return true;
  } catch (error) {
    console.error('Error migrating local events to DynamoDB:', error);
    return false;
  }
};

// Get all events created by a specific organizer
export const getEventsByOrganizerId = async (organizerId: string): Promise<EventData[]> => {
  try {
    // Use ScanCommand with a filter on organizerId
    const command = new ScanCommand({
      TableName: EVENTS_TABLE,
      FilterExpression: 'organizerId = :organizerId',
      ExpressionAttributeValues: {
        ':organizerId': organizerId
      }
    });

    const response = await (await docClientPromise).send(command);
    
    // Map the DynamoDB items to our EventData interface
    const events = (response.Items || []).map(item => ({
      ...item,
      id: item.eventId || item.id, // Use eventId as id if id doesn't exist
      organizerId: item.organizerId || item.userEmail, // Ensure organizerId is set
      userId: item.userId || item.userEmail  // Ensure userId is set
    }));
    
    return events as EventData[];
  } catch (error) {
    console.error("Error getting events by organizerId from DynamoDB:", error);
    return [];
  }
};

// Get all events created by a specific user ID
export const getEventsByUserId = async (userId: string): Promise<EventData[]> => {
  try {
    // Use ScanCommand with a filter on userId
    const command = new ScanCommand({
      TableName: EVENTS_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });

    const response = await (await docClientPromise).send(command);
    
    // Map the DynamoDB items to our EventData interface
    const events = (response.Items || []).map(item => ({
      ...item,
      id: item.eventId || item.id, // Use eventId as id if id doesn't exist
      organizerId: item.organizerId || item.userEmail, // Ensure organizerId is set
      userId: item.userId || item.userEmail  // Ensure userId is set
    }));
    
    return events as EventData[];
  } catch (error) {
    console.error("Error getting events by userId from DynamoDB:", error);
    return [];
  }
};

// Function to update organization code for existing events
export const updateEventsWithOrganizationCode = async (userEmail: string, organizationCode: string): Promise<boolean> => {
  try {
    console.log(`Updating events for user ${userEmail} with organization code ${organizationCode}`);
    
    // Get all events for this user
    const userEvents = await getUserEvents(userEmail);
    
    if (userEvents.length === 0) {
      console.log('No events found for user');
      return true;
    }
    
    const ddbDocClient = await docClientPromise;
    
    // Update each event with the organization code
    for (const event of userEvents) {
      const updateCommand = new UpdateCommand({
        TableName: EVENTS_TABLE,
        Key: {
          eventId: event.id
        },
        UpdateExpression: 'SET organizationCode = :organizationCode, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':organizationCode': organizationCode,
          ':updatedAt': new Date().toISOString()
        }
      });
      
      await ddbDocClient.send(updateCommand);
      console.log(`Updated event ${event.id} with organization code ${organizationCode}`);
    }
    
    console.log(`Successfully updated ${userEvents.length} events with organization code`);
    return true;
  } catch (error) {
    console.error('Error updating events with organization code:', error);
    return false;
  }
};

// Update organization name across all events for a specific organization code
export const updateOrganizationNameAcrossEvents = async (organizationCode: string, newOrganizationName: string): Promise<boolean> => {
  try {
    console.log(`Updating organization name to "${newOrganizationName}" for organization code ${organizationCode}`);
    
    // Get all events for this organization code
    const command = new ScanCommand({
      TableName: EVENTS_TABLE,
      FilterExpression: 'organizationCode = :organizationCode',
      ExpressionAttributeValues: {
        ':organizationCode': organizationCode
      }
    });

    const response = await (await docClientPromise).send(command);
    const events = response.Items || [];
    
    if (events.length === 0) {
      console.log('No events found for organization code');
      return true;
    }
    
    const ddbDocClient = await docClientPromise;
    
    // Update each event with the new organization name
    for (const event of events) {
      const updateCommand = new UpdateCommand({
        TableName: EVENTS_TABLE,
        Key: {
          eventId: event.eventId || event.id
        },
        UpdateExpression: 'SET organizationName = :organizationName, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':organizationName': newOrganizationName,
          ':updatedAt': new Date().toISOString()
        }
      });
      
      await ddbDocClient.send(updateCommand);
      console.log(`Updated event ${event.eventId || event.id} with organization name "${newOrganizationName}"`);
    }
    
    console.log(`Successfully updated ${events.length} events with organization name "${newOrganizationName}"`);
    return true;
  } catch (error) {
    console.error('Error updating organization name across events:', error);
    return false;
  }
};
