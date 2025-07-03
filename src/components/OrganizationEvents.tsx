import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ImageIcon, ArrowLeft, Camera, X, AlertCircle } from 'lucide-react';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3ClientPromise, validateEnvVariables } from '../config/aws';
import { getEventsViaUserByOrgCode, storeAttendeeImageData, getAttendeeSelfieURL, getMatchedImages } from '../config/dynamodb';
import { searchFacesByImage } from '../services/faceRecognition';
import { UserContext } from '../App';
import { Upload } from '@aws-sdk/lib-storage';

interface Event {
  id: string;
  name: string;
  date: string;
  coverImage: string;
  thumbnailUrl: string;
}

interface OrganizationEventsProps {
  organizationCode: string;
  organizationName: string;
  onBack: () => void;
}

const OrganizationEvents: React.FC<OrganizationEventsProps> = ({
  organizationCode,
  organizationName,
  onBack
}) => {
  const { userEmail } = useContext(UserContext);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingEventId, setProcessingEventId] = useState<string | null>(null);
  const navigate = useNavigate();

  // Camera modal state and refs
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);

  // Popup message state
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');

  // Function to show popup message
  const showPopupMessage = (message: string) => {
    setPopupMessage(message);
    setShowPopup(true);
    // Auto hide after 5 seconds
    setTimeout(() => {
      setShowPopup(false);
      setPopupMessage('');
    }, 5000);
  };

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const orgEvents = await getEventsViaUserByOrgCode(organizationCode);
        setEvents(orgEvents);
      } catch (error) {
        console.error('Error loading events:', error);
        setError('Failed to load events');
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [organizationCode]);

  // Camera control functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Could not access camera. Please make sure you have granted camera permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !currentEvent) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        stopCamera();
        setShowCameraModal(false);
        setIsCameraActive(false);

        try {
          // Upload the selfie
          await uploadSelfie(file, currentEvent);
        } catch (error: any) {
          console.error('Error uploading selfie:', error);
          setError(error.message || 'Failed to upload selfie. Please try again.');
        }
      }
    }, 'image/jpeg');
  };

  // Function to upload selfie to S3
  const uploadSelfie = async (file: File, event: Event) => {
    setError(null);
    setProcessingStatus('Updating your selfie...');
    const { bucketName } = await validateEnvVariables();

    try {
      // Generate a unique filename
      const timestamp = Date.now();
      const fileName = `selfie-${timestamp}-${file.name}`;
      const selfiePath = `users/${userEmail}/selfies/${fileName}`;
      
      // Convert File to arrayBuffer and then to Uint8Array
      const buffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      // Upload selfie to S3
      const upload = new Upload({
        client: await s3ClientPromise,
        params: {
          Bucket: bucketName,
          Key: selfiePath,
          Body: uint8Array,
          ContentType: file.type,
          ACL: 'public-read'
        },
        partSize: 1024 * 1024 * 5
      });
      
      await upload.done();
      
      // Get the public URL of the uploaded selfie
      const selfieUrl = `https://${bucketName}.s3.amazonaws.com/${selfiePath}`;
      
      // Start the face comparison process
      await performFaceComparison(event, selfieUrl);
      
    } catch (error: any) {
      console.error('Error uploading selfie:', error);
      setError(error.message || 'Failed to upload selfie. Please try again.');
      setProcessingStatus(null);
    }
  };

  // Function to perform face comparison
  const performFaceComparison = async (event: Event, selfieUrl: string) => {
    try {
      setProcessingStatus('Finding your photos...');
      
      // Extract the S3 key from the selfie URL
      const { bucketName } = await validateEnvVariables();
      let selfiePath = '';
      
      if (selfieUrl.startsWith(`https://${bucketName}.s3.amazonaws.com/`)) {
        selfiePath = selfieUrl.substring(`https://${bucketName}.s3.amazonaws.com/`.length);
      } else {
        throw new Error('Invalid selfie format.');
      }

      // Use searchFacesByImage to find matches
      const matches = await searchFacesByImage(event.id, selfiePath);
      
      // Store the attendee data in DynamoDB regardless of matches
      await storeAttendeeImageData({
        userId: userEmail || '',
        eventId: event.id,
        eventName: event.name,
        coverImage: event.coverImage || '',
        selfieURL: selfieUrl,
        matchedImages: matches.map(match => match.imageKey),
        uploadedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });

      if (matches.length === 0) {
        // Show popup instead of throwing error
        showPopupMessage('No matching photos found in this event. Please try a different event.');
        return;
      }

      // Navigate to the photos page only if matches were found
      navigate(`/event-photos/${event.id}`);
      
    } catch (error: any) {
      console.error('Error processing photos:', error);
      showPopupMessage(error.message || 'Failed to process photos');
    } finally {
      setProcessingStatus(null);
      setProcessingEventId(null);
    }
  };

  const handleViewPhotos = async (event: Event) => {
    if (!userEmail) {
      setError('Please sign in to view photos');
      return;
    }

    try {
      setProcessingEventId(event.id);
      setProcessingStatus('Checking for your photos...');
      
      // First, check if we already have matched images for this user and event
      const existingMatches = await getMatchedImages(userEmail, event.id);
      
      if (existingMatches && existingMatches.matchedImages && existingMatches.matchedImages.length > 0) {
        // If we have existing matches, navigate directly to the photos page
        navigate(`/event-photos/${event.id}`);
        return;
      }

      // If no existing matches, proceed with face comparison
      setProcessingStatus('Finding your photos...');
      const selfieUrl = await getAttendeeSelfieURL(userEmail);
      
      if (!selfieUrl) {
        // Show camera modal instead of throwing error
        setCurrentEvent(event);
        setShowCameraModal(true);
        setIsCameraActive(true);
        startCamera();
        setProcessingStatus(null);
        setProcessingEventId(null);
        return;
      }

      // Extract the S3 key from the selfie URL
      const { bucketName } = await validateEnvVariables();
      let selfiePath = '';
      
      if (selfieUrl.startsWith(`https://${bucketName}.s3.amazonaws.com/`)) {
        selfiePath = selfieUrl.substring(`https://${bucketName}.s3.amazonaws.com/`.length);
      } else {
        throw new Error('Invalid selfie format. Please update your selfie first.');
      }

      // Use searchFacesByImage to find matches
      const matches = await searchFacesByImage(event.id, selfiePath);
      
      // Store the attendee data in DynamoDB regardless of matches
      await storeAttendeeImageData({
        userId: userEmail || '',
        eventId: event.id,
        eventName: event.name,
        coverImage: event.coverImage || '',
        selfieURL: selfieUrl,
        matchedImages: matches.map(match => match.imageKey),
        uploadedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });

      if (matches.length === 0) {
        // Show popup instead of throwing error
        showPopupMessage('No matching photos found in this event. Please try a different event.');
        return;
      }

      // Navigate to the photos page only if matches were found
      navigate(`/event-photos/${event.id}`);
      
    } catch (error: any) {
      console.error('Error processing photos:', error);
      showPopupMessage(error.message || 'Failed to process photos');
    } finally {
      setProcessingStatus(null);
      setProcessingEventId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={onBack}
              className="flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Organizations
            </button>
            <h1 className="text-3xl font-bold text-gray-900">{organizationName} Events</h1>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">
            {error}
          </div>
        )}

        {processingStatus && (
          <div className="bg-blue-50 text-blue-600 p-4 rounded-lg mb-8 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
            {processingStatus}
          </div>
        )}

        {events.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No events found for this organization</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
              >
                {/* Cover Image Container with Fixed Height */}
                <div className="relative h-40 sm:h-48 w-full overflow-hidden">
                  <img
                    src={event.thumbnailUrl}
                    alt={event.name}
                    className="absolute inset-0 w-full h-full object-cover transform hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>

                {/* Event Details Container */}
                <div className="p-3 sm:p-4">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1 line-clamp-2">
                    {event.name}
                  </h3>
                  <div className="flex flex-col space-y-2">
                    <p className="text-xs sm:text-sm text-gray-600 flex items-center">
                      <Calendar className="w-3 sm:w-4 h-3 sm:h-4 mr-1 sm:mr-1.5" />
                      {new Date(event.date).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                    
                    {/* View Photos Button */}
                    <button
                      onClick={() => handleViewPhotos(event)}
                      disabled={processingEventId !== null}
                      className={`w-full mt-1 sm:mt-2 px-3 sm:px-4 py-1.5 sm:py-2 ${processingEventId === event.id ? 'bg-blue-400' : 'bg-blue-600'} text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center`}
                    >
                      <ImageIcon className="w-3 sm:w-4 h-3 sm:h-4 mr-1 sm:mr-2" />
                      <span className="text-xs sm:text-sm font-medium">
                        {processingEventId === event.id ? 'Processing...' : 'View Photos'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Camera Modal */}
        {showCameraModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full relative">
              <button
                onClick={() => {
                  stopCamera();
                  setShowCameraModal(false);
                  setError(null);
                }}
                className="absolute -top-3 -right-3 bg-white text-gray-700 rounded-full p-2 shadow-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Take a Selfie</h3>
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg">
                  {error}
                </div>
              )}
              
              <div className="relative w-full">
                {isCameraActive && (
                  <div className="mb-4">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full rounded-lg border-2 border-blue-500"
                      style={{ transform: 'scaleX(-1)' }} // Mirror the video feed
                    />
                    
                    <button
                      onClick={captureImage}
                      className="mt-4 w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                    >
                      <Camera className="w-5 h-5 mr-2" />
                      Capture Selfie
                    </button>
                  </div>
                )}
                
                {!isCameraActive && processingStatus && (
                  <div className="flex items-center justify-center p-6">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mr-3"></div>
                    <p className="text-blue-600">{processingStatus}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Popup Message */}
        {showPopup && (
          <div className="fixed inset-x-0 top-20 sm:top-24 z-[60] flex items-center justify-center px-4 pointer-events-none">
            <div className="bg-red-50 text-red-600 px-6 py-4 rounded-lg shadow-lg max-w-md w-full flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{popupMessage}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrganizationEvents;