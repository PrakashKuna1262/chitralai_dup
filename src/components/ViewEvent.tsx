import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { s3ClientPromise, validateEnvVariables } from '../config/aws';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { Camera, X, ArrowLeft, Download, Upload as UploadIcon, Copy, UserPlus, Facebook, Instagram, Twitter, Youtube } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { Link, useNavigate } from 'react-router-dom';
import { getEventById, updateEventData } from '../config/eventStorage';
import ProgressiveImage from './ProgressiveImage';

interface ViewEventProps {
  eventId: string;
  selectedEvent?: string;
  onEventSelect?: (eventId: string) => void;
}

interface EventImage {
  url: string;
  key: string;
}

interface FaceRecordWithImage {
  faceId: string;
  boundingBox?: { Left: number; Top: number; Width: number; Height: number };
  image: EventImage;
}

interface FaceGroups {
  [groupId: string]: FaceRecordWithImage[];
}

/**
 * A small helper component that displays one face as a 96×96 circular thumbnail,
 * zooming and centering on the face bounding box.
 */
const FaceThumbnail: React.FC<{
  faceRec: FaceRecordWithImage;
  onClick: () => void;
}> = ({ faceRec, onClick }) => {
  const { image, boundingBox } = faceRec;

  // We interpret boundingBox as fractions of the original image:
  // boundingBox.Left, boundingBox.Top, boundingBox.Width, boundingBox.Height are in [0..1].
  // We'll place an absolutely positioned <img> inside a 96×96 container.
  // Then use transform to scale & shift the face center to the middle.

  const containerSize = 96; // px
  const centerX = boundingBox ? boundingBox.Left + boundingBox.Width / 2 : 0.5;
  const centerY = boundingBox ? boundingBox.Top + boundingBox.Height / 2 : 0.5;
  // Scale so that the bounding box is at least the container size in both width & height.
  // If boundingBox.Width = 0.2, then scale ~ 1 / 0.2 = 5 => we clamp to some max to avoid extremes.
  let scale = boundingBox
    ? 1 / Math.min(boundingBox.Width, boundingBox.Height)
    : 1;
  scale = Math.max(1.2, Math.min(scale, 2)); // clamp scale between [1.2..3] for better face visibility

  // We'll shift the image so that the face center ends up at the container's center (48px, 48px).
  // The face center in the image's local coordinate space (before scaling) is at
  // (centerX * imageWidth, centerY * imageHeight).
  // Because we're using fractional bounding boxes, we treat the image as if it's 1×1, 
  // then scaled to 'scale', so the face center is at (centerX * scale, centerY * scale) in "image" space.
  // We want that point to appear at (0.5, 0.5) in the container, i.e. 50% 50% of the container.
  // We'll do a trick: set transform-origin to top-left (0,0), then use translateX/Y to push the center to 50% of container.

  // The translation in fraction-of-container is:
  //   xTranslate = 0.5*containerSize - (centerX * containerSize * scale)
  //   yTranslate = 0.5*containerSize - (centerY * containerSize * scale)
  // We'll just compute them in px for clarity.
  const xTranslate = 0.5 * containerSize - centerX * containerSize * scale;
  const yTranslate = 0.5 * containerSize - centerY * containerSize * scale;

  const thumbnailStyle: React.CSSProperties = {
    width: `${containerSize}px`,
    height: `${containerSize}px`,
    borderRadius: '9999px',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'pointer'
  };

  const imgStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    // We'll assume a base size of containerSize for the image. 
    // Because we only have fractions, this is approximate.
    width: `${containerSize}px`,
    height: 'auto',
    transform: `translate(${xTranslate}px, ${yTranslate}px) scale(${scale})`,
    transformOrigin: 'top left',
    // If the image is originally landscape, 'height: auto' might not fill the container vertically.
    // But objectFit won't apply because we have an absolutely positioned element.
    // This approach still tends to produce a better face crop than background methods if bounding boxes are correct.
  };

  return (
    <div style={thumbnailStyle} onClick={onClick}>
      <img src={image.url} alt="face" style={imgStyle} />
    </div>
  );
};

const ViewEvent: React.FC<ViewEventProps> = ({ eventId, selectedEvent, onEventSelect }) => {
  const navigate = useNavigate();
  const [images, setImages] = useState<EventImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<EventImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showAddAccessModal, setShowAddAccessModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailAccessList, setEmailAccessList] = useState<string[]>([]);
  const [isEventCreator, setIsEventCreator] = useState(false);
  const [anyoneCanUpload, setAnyoneCanUpload] = useState(false);
  const [eventName, setEventName] = useState<string>('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const qrCodeRef = useRef<SVGSVGElement>(null);

  // Toggle header and footer visibility when image is clicked
  const toggleHeaderFooter = (visible: boolean) => {
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    
    if (header) {
      if (visible) {
        header.classList.remove('hidden');
      } else {
        header.classList.add('hidden');
      }
    }
    
    if (footer) {
      if (visible) {
        footer.classList.remove('hidden');
      } else {
        footer.classList.add('hidden');
      }
    }
  };

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('upload_selfie') || path.includes('upload-selfie')) {
      const userEmail = localStorage.getItem('userEmail');
      if (!userEmail) {
        setError('Authentication required. Please log in.');
        return;
      }
      if (path !== `/upload-selfie/${eventId}`) {
        navigate(`/upload-selfie/${eventId}`, { state: { eventId }, replace: true });
        return;
      }
    }
  }, [eventId, navigate]);

  useEffect(() => {
    fetchEventImages();
    if (selectedEvent && onEventSelect) {
      onEventSelect(selectedEvent);
    }
  }, [eventId, selectedEvent]);

  useEffect(() => {
    const checkEventCreator = async () => {
      const event = await getEventById(eventId);
      const userEmail = localStorage.getItem('userEmail');
      if (event && userEmail) {
        setIsEventCreator(event.organizerId === userEmail);
        setEmailAccessList(event.emailAccess || []);
        setAnyoneCanUpload(event.anyoneCanUpload || false);
        setEventName(event.name || 'Untitled Event');
      }
    };
    checkEventCreator();
  }, [eventId]);

  const fetchEventImages = async () => {
    try {
      setLoading(true);
      const eventToUse = selectedEvent || eventId;
      const prefixes = [`events/shared/${eventToUse}/images`];
      let allImages: EventImage[] = [];

      for (const prefix of prefixes) {
        try {
          const { bucketName } = await validateEnvVariables();
          const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix
          });
          const result = await (await s3ClientPromise).send(listCommand);
          if (result.Contents) {
            const imageItems = result.Contents
              .filter((item) => item.Key && item.Key.match(/\.(jpg|jpeg|png)$/i))
              .map((item) => ({
                url: `https://${bucketName}.s3.amazonaws.com/${item.Key}`,
                key: item.Key || ''
              }));
            allImages = [...allImages, ...imageItems];
          }
        } catch (error) {
          console.error(`Error fetching from path ${prefix}:`, error);
          continue;
        }
      }

      if (allImages.length > 0) {
        const deduplicatedImages = deduplicateImages(allImages);
        setImages(deduplicatedImages);
        setError(null);
        setLoading(false);
      } else {
        setError('No images found for this event.');
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Error fetching event images:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  // Function to deduplicate images based on the filename after the timestamp code
  const deduplicateImages = (images: EventImage[]): EventImage[] => {
    const fileNameMap = new Map<string, EventImage>();
    
    images.forEach(image => {
      // Extract the filename after the timestamp code
      // Pattern: timestamp-actualfilename.extension
      const match = image.key.match(/\d+-(.+\.(jpg|jpeg|png))$/i);
      if (match && match[1]) {
        const actualFileName = match[1].toLowerCase();
        // Keep the first occurrence of each unique filename
        if (!fileNameMap.has(actualFileName)) {
          fileNameMap.set(actualFileName, image);
        }
      } else {
        // If the pattern doesn't match, keep the image anyway
        fileNameMap.set(image.key, image);
      }
    });
    
    return Array.from(fileNameMap.values());
  };

  const handleDownload = useCallback(async (url: string) => {
    try {
      const response = await fetch(url, {
        mode: 'cors',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('image/')) {
        throw new Error('Invalid image format received');
      }
      const blob = await response.blob();
      const fileName = decodeURIComponent(url.split('/').pop() || 'image.jpg');
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error downloading image:', error);
      throw error;
    }
  }, []);

  const handleAddEmail = async () => {
    if (!emailInput || !emailInput.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      alert('User not authenticated');
      return;
    }

    try {
      const updatedEmailList = [...new Set([...emailAccessList, emailInput])];
      await updateEventData(eventId, userEmail, { emailAccess: updatedEmailList });
      setEmailAccessList(updatedEmailList);
      setEmailInput('');
    } catch (error) {
      console.error('Error adding email access:', error);
      alert('Failed to add email access');
    }
  };

  const handleRemoveEmail = async (emailToRemove: string) => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      alert('User not authenticated');
      return;
    }

    try {
      const updatedEmailList = emailAccessList.filter(email => email !== emailToRemove);
      await updateEventData(eventId, userEmail, { emailAccess: updatedEmailList });
      setEmailAccessList(updatedEmailList);
    } catch (error) {
      console.error('Error removing email access:', error);
      alert('Failed to remove email access');
    }
  };

  const handleAnyoneCanUploadChange = async (checked: boolean) => {
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      alert('User not authenticated');
      return;
    }

    try {
      await updateEventData(eventId, userEmail, { anyoneCanUpload: checked });
      setAnyoneCanUpload(checked);
    } catch (error) {
      console.error('Error updating anyone can upload setting:', error);
      alert('Failed to update upload settings');
    }
  };

  // Handler for toggling selection of an image
  const toggleSelectImage = (key: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Handler for Select All
  const handleSelectAll = () => {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(images.map(img => img.key)));
    }
  };

  // Handler for Cancel selection mode
  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedImages(new Set());
  };

  // Handler for deleting selected images
  const handleDeleteSelected = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { bucketName } = await validateEnvVariables();
      const keysToDelete = images.filter(img => selectedImages.has(img.key)).map(img => img.key);
      for (const key of keysToDelete) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          });
          await (await s3ClientPromise).send(deleteCommand);
        } catch (err) {
          setDeleteError('Failed to delete one or more images.');
          setDeleting(false);
          return;
        }
      }
      // Remove deleted images from UI
      setImages(prev => prev.filter(img => !selectedImages.has(img.key)));
      setSelectedImages(new Set());
      setSelectionMode(false);
      setShowDeleteModal(false);
      setDeleting(false);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete images.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-black-600">Loading event images...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="text-blue-500 mb-4">⚠️</div>
          <p className="text-gray-800">{error}</p>
          <Link to="/upload" className="mt-4 inline-flex items-center text-primary hover:text-secondary">
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Click to Upload images
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Add spacer for navbar */}
      <div className="h-20"></div>

      <main className="flex-1 container mx-auto px-4 py-4 sm:py-8">
        {/* Header and controls */}
        <div className="flex flex-col space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <Link
              to="/events"
              className="flex items-center text-gray-600 hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Events
            </Link>
            <div className="text-sm text-blue-500">
              Event Code: 
              <span className="font-mono bg-gray-100 px-2 py-1 rounded">{eventId}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(eventId);
                }}
                className="ml-2 text-blue-500 hover:text-blue-700 transition-colors duration-200"
                aria-label="Copy event code"
              >
                <Copy className="w-5 h-3" />
              </button>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
        </div>

        

        {/* QR Code Modal */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Scan QR Code</h3>
                <button
                  onClick={() => setShowQRModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex justify-center mb-4">
                <QRCodeSVG
                  value={`${window.location.origin}/attendee-dashboard?eventId=${eventId}`}
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Scan this QR code to access the event photos
              </p>
            </div>
          </div>
        )}
        
        {/* Button grid with consistent sizing */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <button
            onClick={() => setShowQRModal(true)}
            className="flex items-center justify-center bg-blue-200 text-black py-3 px-4 rounded-lg hover:bg-secondary transition-colors duration-200 h-12 w-full"
          >
            <QRCodeSVG
              ref={qrCodeRef}
              value={`${window.location.origin}/attendee-dashboard?eventId=${eventId}`}
              size={24}
              level="H"
              includeMargin={true}
            />
            <span className="ml-2">Show QR</span>
          </button>
          
          <button
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/attendee-dashboard?eventId=${eventId}`
              );
              setShowCopySuccess(true);
              setTimeout(() => setShowCopySuccess(false), 2000);
            }}
            className="flex items-center justify-center bg-blue-200 text-black py-3 px-4 rounded-lg hover:bg-secondary transition-colors duration-200 h-12 w-full"
          >
            <Copy className="w-5 h-5 mr-2" />
            {showCopySuccess ? 'Copied!' : 'Share Link'}
          </button>
          
          <button
            onClick={() => {
              images.forEach((image, index) => {
                setTimeout(() => {
                  handleDownload(image.url);
                }, index * 500);
              });
            }}
            className="flex items-center justify-center bg-blue-200 text-black py-3 px-4 rounded-lg hover:bg-secondary transition-colors duration-200 h-12 w-full"
            disabled={images.length === 0}
          >
            <Download className="w-5 h-5 mr-2" />
            Download
          </button>
          
          <button
            onClick={() => navigate(`/upload?eventId=${eventId}`)}
            className="flex items-center justify-center bg-blue-200 text-black py-3 px-4 rounded-lg hover:bg-secondary transition-colors duration-200 h-12 w-full"
          >
            <UploadIcon className="w-5 h-5 mr-2" />
            Upload
          </button>
          
          {isEventCreator && (
            <button
              onClick={() => setShowAddAccessModal(true)}
              className="flex items-center justify-center bg-blue-200 text-black py-3 px-4 rounded-lg hover:bg-secondary transition-colors duration-200 h-12 w-full"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Add Access
            </button>
          )}
        </div>

        {uploading && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-600 mt-2">
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}
         {/* Selection mode controls */}
        <div className="flex items-center justify-between mb-4 relative">
          <h2 className="text-2xl font-bold text-gray-900 mt-1">Event Photos</h2>
          {!selectionMode && (
            <button
              className="bg-blue-200 text-black px-4 py-2 rounded hover:bg-blue-300 transition"
              onClick={() => setSelectionMode(true)}
            >
              Select
            </button>
          )}
        </div>
        {selectionMode && (
          <div className="flex items-center gap-3 mb-4 justify-end">
            <label className="flex items-center gap-2 mr-auto select-none cursor-pointer">
              <input
                type="checkbox"
                checked={selectedImages.size === images.length && images.length > 0}
                ref={el => {
                  if (el) {
                    el.indeterminate = selectedImages.size > 0 && selectedImages.size < images.length;
                  }
                }}
                onChange={handleSelectAll}
              />
              <span className="text-gray-700 text-sm">Select All</span>
            </label>
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50 transition"
              disabled={selectedImages.size === 0}
              onClick={() => setShowShareModal(true)}
            >
              Share
            </button>
            <button
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:opacity-50 transition"
              disabled={selectedImages.size === 0}
              onClick={() => setShowDeleteModal(true)}
            >
              Delete
            </button>
            <button
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition"
              onClick={handleCancelSelection}
            >
              Cancel
            </button>
          </div>
        )}
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-4 p-4">
            {images.map((image, idx) => (
              <div
                key={image.key}
                className="relative aspect-square overflow-hidden rounded-xl shadow-md cursor-pointer group"
                onClick={() => {
                  if (selectionMode) {
                    toggleSelectImage(image.key);
                    return;
                  }
                  setSelectedImage(image);
                  toggleHeaderFooter(false);
                }}
              >
                {/* Checkbox overlay in selection mode */}
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedImages.has(image.key)}
                    onChange={() => toggleSelectImage(image.key)}
                    className="absolute top-2 left-2 z-20 w-5 h-5 accent-blue-500 border-blue-400 focus:ring-blue-300 bg-white border-2 rounded focus:ring-2"
                    onClick={e => e.stopPropagation()}
                  />
                )}
                <img
                  src={image.url}
                  alt={`Event photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(image.url);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors duration-200"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        

        {images.length === 0 && (
          <div className="text-center py-16 bg-gray-50 rounded-lg">
            <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-xl text-gray-600">No images found for this event</p>
            <p className="text-gray-400 mt-2">
              Images uploaded to this event will appear here
            </p>
          </div>
        )}

        {selectedImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" 
            onClick={() => {
              setSelectedImage(null);
              toggleHeaderFooter(true);
            }}
          >
            <div className="relative bg-white rounded-lg shadow-xl max-w-[800px] max-h-[600px] w-full mx-auto" onClick={e => e.stopPropagation()}>
              <img
                src={selectedImage.url}
                alt="Enlarged event photo"
                className="w-full h-full object-contain rounded-lg"
                style={{ maxHeight: 'calc(600px - 4rem)' }}
              />
              <button
                className="absolute top-4 right-4 p-2 rounded-full bg-black/20 text-white hover:bg-black/70 transition-colors duration-200"
                onClick={() => {
                  setSelectedImage(null);
                  toggleHeaderFooter(true);
                }}
              >
                <X className="w-8 h-8" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(selectedImage.url);
                }}
                className="absolute bottom-4 right-4 p-2 rounded-full bg-black/10 text-white hover:bg-black/70 transition-colors duration-200 flex items-center gap-2"
              >
                <Download className="w-6 h-6" />
                
              </button>
            </div>
          </div>
        )}

        {/* Add Access Modal */}
        {showAddAccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowAddAccessModal(false)}>
            <div className="relative bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-auto" onClick={e => e.stopPropagation()}>
              <button
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-200"
                onClick={() => setShowAddAccessModal(false)}
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Manage Event Access</h3>
              
              {/* Anyone can upload checkbox */}
              <div className="mb-6">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={anyoneCanUpload}
                    onChange={(e) => handleAnyoneCanUploadChange(e.target.checked)}
                    className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Allow anyone to upload photos</span>
                </label>
              </div>

              {/* Share link button */}
              <div className="mb-6">
                <button
                  onClick={() => {
                    const uploadLink = `${window.location.origin}/upload?eventId=${eventId}`;
                    navigator.clipboard.writeText(uploadLink);
                    setShowCopySuccess(true);
                    setTimeout(() => setShowCopySuccess(false), 2000);
                  }}
                  className="w-full flex items-center justify-center bg-blue-100 text-blue-700 py-2 px-4 rounded-lg hover:bg-blue-200 transition-colors duration-200"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {showCopySuccess ? 'Copied!' : 'Copy Upload Link'}
                </button>
              </div>

              <div className="mb-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddEmail}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-gray-700">Current Access List:</h4>
                {emailAccessList.length === 0 ? (
                  <p className="text-gray-500">No emails added yet</p>
                ) : (
                  <ul className="space-y-2">
                    {emailAccessList.map((email) => (
                      <li key={email} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                        <span className="text-gray-700">{email}</span>
                        <button
                          onClick={() => handleRemoveEmail(email)}
                          className="p-1 text-red-500 hover:text-red-700 transition-colors duration-200"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Share Modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowShareModal(false)}>
            <div className="relative bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-auto" onClick={e => e.stopPropagation()}>
              <button
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-200"
                onClick={() => setShowShareModal(false)}
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Share Selected Images</h3>
              <p className="mb-4 text-gray-700">You have selected {selectedImages.size} image(s).</p>
              {/* Share links and copy button will go here */}
              <div className="flex flex-col gap-2 mb-4 max-h-40 overflow-y-auto">
                {images.filter(img => selectedImages.has(img.key)).map(img => (
                  <div key={img.key} className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={img.url}
                      className="flex-1 px-2 py-1 border rounded text-xs bg-gray-100"
                    />
                    <button
                      className="text-blue-500 hover:text-blue-700 text-xs"
                      onClick={() => navigator.clipboard.writeText(img.url)}
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition mb-4"
                onClick={() => {
                  const urls = images.filter(img => selectedImages.has(img.key)).map(img => img.url).join('\n');
                  navigator.clipboard.writeText(urls);
                }}
              >
                Copy All Links
              </button>
              <div className="my-2 text-center text-gray-500 text-sm">Or share via:</div>
              <div className="flex gap-3 justify-center mb-2">
                {/* WhatsApp */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(images.filter(img => selectedImages.has(img.key)).map(img => img.url).join('\n'))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 hover:bg-green-600 text-white rounded-full p-2 flex items-center justify-center"
                  title="Share on WhatsApp"
                >
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.151-.174.2-.298.3-.497.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.571-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.363.709.306 1.262.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.288.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.617h-.001a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.455 4.436-9.89 9.893-9.89 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.896 6.994c-.003 5.455-4.438 9.89-9.893 9.89m8.413-18.304A11.815 11.815 0 0 0 12.05 0C5.495 0 .06 5.435.058 12.09c0 2.13.557 4.21 1.615 6.033L.057 24l6.063-1.616A11.888 11.888 0 0 0 12.051 24c6.555 0 11.89-5.435 11.893-12.09a11.86 11.86 0 0 0-3.489-8.715"/></svg>
                </a>
                {/* Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(Array.from(selectedImages).length === 1 ? images.find(img => selectedImages.has(img.key))?.url || window.location.href : window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 flex items-center justify-center"
                  title="Share on Facebook"
                >
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M22.675 0h-21.35C.595 0 0 .592 0 1.326v21.348C0 23.408.595 24 1.325 24H12.82v-9.294H9.692v-3.622h3.127V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.797.143v3.24l-1.918.001c-1.504 0-1.797.715-1.797 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.324-.592 1.324-1.326V1.326C24 .592 23.405 0 22.675 0"/></svg>
                </a>
                {/* Twitter/X */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(images.filter(img => selectedImages.has(img.key)).map(img => img.url).join('\n'))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-400 hover:bg-blue-500 text-white rounded-full p-2 flex items-center justify-center"
                  title="Share on Twitter"
                >
                  <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557a9.83 9.83 0 0 1-2.828.775 4.932 4.932 0 0 0 2.165-2.724c-.951.564-2.005.974-3.127 1.195a4.916 4.916 0 0 0-8.38 4.482C7.691 8.095 4.066 6.13 1.64 3.161c-.542.929-.856 2.01-.857 3.17 0 2.188 1.115 4.116 2.823 5.247a4.904 4.904 0 0 1-2.229-.616c-.054 2.281 1.581 4.415 3.949 4.89a4.936 4.936 0 0 1-2.224.084c.627 1.956 2.444 3.377 4.6 3.417A9.867 9.867 0 0 1 0 21.543a13.94 13.94 0 0 0 7.548 2.212c9.057 0 14.009-7.496 14.009-13.986 0-.21 0-.423-.016-.634A9.936 9.936 0 0 0 24 4.557z"/></svg>
                </a>
                {/* Web Share API */}
                {navigator.share && (
                  <button
                    className="bg-gray-700 hover:bg-gray-800 text-white rounded-full p-2 flex items-center justify-center"
                    title="Share via..."
                    onClick={async () => {
                      const urls = images.filter(img => selectedImages.has(img.key)).map(img => img.url).join('\n');
                      try {
                        await navigator.share({
                          title: 'Event Photos',
                          text: `Check out these event photos!`,
                          url: urls
                        });
                      } catch (e) {
                        // User cancelled or not supported
                      }
                    }}
                  >
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77l-7.13-4.13c.05-.25.09-.5.09-.77s-.03-.52-.09-.77l7.09-4.11c.54.5 1.25.81 2.01.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .27.04.52.09.77l-7.09 4.11c-.54-.5-1.25-.81-2.01-.81-1.66 0-3 1.34-3 3s1.34 3 3 3c.76 0 1.47-.31 2-.8l7.13 4.13c-.05.23-.08.47-.08.72 0 1.52 1.23 2.75 2.75 2.75s2.75-1.23 2.75-2.75-1.23-2.75-2.75-2.75z"/></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => !deleting && setShowDeleteModal(false)}>
            <div className="relative bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-auto" onClick={e => e.stopPropagation()}>
              <button
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-200"
                onClick={() => !deleting && setShowDeleteModal(false)}
                disabled={deleting}
              >
                <X className="w-6 h-6" />
              </button>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Delete Selected Images</h3>
              <p className="mb-6 text-gray-700">Are you sure you want to delete {selectedImages.size} image(s)? This action cannot be undone.</p>
              {deleteError && <div className="mb-4 text-red-500 text-sm">{deleteError}</div>}
              {deleting && (
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div>
                  <span className="ml-3 text-gray-700">Deleting...</span>
                </div>
              )}
              <div className="flex gap-4 justify-end">
                <button
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition disabled:opacity-50"
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ViewEvent;
