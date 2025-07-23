import React, { useState, useEffect, useRef } from 'react';
import { ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { s3ClientPromise, rekognitionClientPromise, validateEnvVariables } from '../config/aws';
import { DetectFacesCommand, CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { Download, Trash2, Camera, RotateCw, X, Share2 } from 'lucide-react';
import { getEventById, updateEventData, convertToAppropriateUnit, subtractSizes } from '../config/eventStorage';
import ProgressiveImage from './ProgressiveImage';

interface EventImagesProps {
  eventId: string;
}

interface ProcessedImage {
  url: string;
  key: string;
  hasFace: boolean;
  faceCoordinates?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

const EventImages = ({ eventId }: EventImagesProps) => {
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingStatus, setProcessingStatus] = useState('');
  const [deleting, setDeleting] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<ProcessedImage | null>(null);
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const IMAGES_PER_PAGE = 300;
  const [bucketName, setBucketName] = useState<string | undefined>();

  // Modify fetchEventImages to include preloading
  const fetchEventImages = async (pageNum = 1) => {
    try {
      setLoading(true);
      const { bucketName } = await validateEnvVariables();
      setBucketName(bucketName);
      
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `events/shared/${eventId}/images/`,
        MaxKeys: IMAGES_PER_PAGE,
        StartAfter: pageNum > 1 ? `events/shared/${eventId}/images/${(pageNum - 1) * IMAGES_PER_PAGE}` : undefined
      });
  
      const result = await (await s3ClientPromise).send(listCommand);
      if (!result.Contents) {
        setHasMore(false);
        return;
      }
  
      const imageItems = result.Contents
        .filter(item => item.Key && item.Key.match(/\.(jpg|jpeg|png)$/i))
        .map(item => ({
          url: `https://${bucketName}.s3.amazonaws.com/${item.Key}`,
          key: item.Key || '',
          hasFace: false
        }));
  
      setImages(prev => pageNum === 1 ? imageItems : [...prev, ...imageItems]);
      
      setHasMore(imageItems.length === IMAGES_PER_PAGE);
      setProcessingStatus('');
    } catch (error) {
      console.error('Error fetching event images:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
      fetchEventImages(page + 1);
    }
  };

  const handleDownload = async (image: ProcessedImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.key.split('/').pop() || 'image';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const handleDelete = async (image: ProcessedImage) => {
    try {
      setDeleting(prev => [...prev, image.key]);
      const { bucketName } = await validateEnvVariables();
      
      // Get the image size before deleting
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: image.key
      });
      
      const objectData = await (await s3ClientPromise).send(getObjectCommand);
      const imageSizeBytes = objectData.ContentLength || 0;
      
      // Convert to appropriate unit (MB or GB)
      const { size: imageSize, unit: imageUnit } = convertToAppropriateUnit(imageSizeBytes);
      
      // Delete the image
      const deleteCommand = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: image.key
      });
      await (await s3ClientPromise).send(deleteCommand);
      setImages(prev => prev.filter(img => img.key !== image.key));
      
      // Update the event data in DynamoDB
      const userEmail = localStorage.getItem('userEmail');
      if (userEmail) {
        const currentEvent = await getEventById(eventId);
        if (currentEvent) {
          // Subtract the deleted image size from the total
          const { size: newTotalSize, unit: newTotalUnit } = subtractSizes(
            currentEvent.totalImageSize || 0,
            currentEvent.totalImageSizeUnit || 'MB',
            imageSize,
            imageUnit
          );

          await updateEventData(eventId, userEmail, {
            photoCount: Math.max(0, (currentEvent.photoCount || 0) - 1),
            totalImageSize: newTotalSize,
            totalImageSizeUnit: newTotalUnit
          });
        }
      }
    } catch (error) {
      console.error('Error deleting image:', error);
    } finally {
      setDeleting(prev => prev.filter(key => key !== image.key));
    }
  };
  
  // Image compression utility
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
  
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;
          const maxDimension = 1200;
  
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }
  
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
  
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            0.8
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
  
    setProcessingStatus('Preparing images for upload...');
    const files = Array.from(e.target.files);
    const userEmail = localStorage.getItem('userEmail');
    if (!userEmail) {
      setProcessingStatus('Error: User not authenticated');
      return;
    }
  
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Compress image before upload
        const compressedFile = await compressImage(file);
        const { bucketName } = await validateEnvVariables();
        const key = `events/${eventId}/images/${Date.now()}-${file.name}`;
        
        setProcessingStatus(`Uploading image ${i + 1} of ${files.length}...`);
        
        const upload = new Upload({
          client: await s3ClientPromise,
          params: {
            Bucket: bucketName,
            Key: key,
            Body: compressedFile,
            ContentType: file.type,
            CacheControl: 'max-age=31536000' // Cache for 1 year
          },
          queueSize: 4,
          partSize: 1024 * 1024 * 5,
          leavePartsOnError: false
        });
  
        await upload.done();
      }
      
      // Update the photoCount in DynamoDB
      const currentEvent = await getEventById(eventId);
      if (currentEvent) {
        await updateEventData(eventId, userEmail, {
          photoCount: (currentEvent.photoCount || 0) + files.length
        });
      }
  
      // Refresh only the latest page of images
      await fetchEventImages(page);
      setProcessingStatus('Upload complete!');
      setTimeout(() => setProcessingStatus(''), 2000);
    } catch (error) {
      console.error('Error uploading images:', error);
      setProcessingStatus('Error uploading images. Please try again.');
    }
  };

  useEffect(() => {
    fetchEventImages();
  }, [eventId]);

  useEffect(() => {
    const fetchBucketName = async () => {
      const env = await validateEnvVariables();
      setBucketName(env.bucketName);
    };
    fetchBucketName();
  }, []);

  useEffect(() => {
    setRotation(0);
  }, [selectedImage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-gray-50 rounded-lg">
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading event images...</p>
        </div>
      </div>
    );
  }

  const ImageGrid = () => {
    if (bucketName === undefined) {
      return <div>Loading image resources...</div>;
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
        {images.map((image, index) => (
          <div
            key={image.key}
            className="relative group"
          >
            <div
              className="aspect-square relative cursor-pointer"
              onClick={() => setSelectedImage(image)}
            >
              <ProgressiveImage
                compressedSrc={image.url}
                originalSrc={image.url}
                alt={`Event photo ${index + 1}`}
                className="w-full h-full object-cover rounded-lg shadow-md"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-200 rounded-lg flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => handleDownload(image)}
                  className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors duration-200"
                  title="Download image"
                >
                  <Download className="w-4 h-4 text-gray-700" />
                </button>
                <button
                  onClick={() => handleDelete(image)}
                  className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors duration-200"
                  disabled={deleting.includes(image.key)}
                  title="Delete image"
                >
                  <Trash2 className="w-4 h-4 text-blue-500" />
                </button>
              </div>
              {deleting.includes(image.key) && (
                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Helper to get button style for anchoring to image
  const getButtonStyle = (button: string, rotation: number) => {
    // Returns style object for absolute positioning and counter-rotation
    const inset = '2px';
    const base = {
      close: { top: inset, right: inset, zIndex: 10 },
      left: { top: '50%', left: inset, transform: 'translateY(-50%)', zIndex: 10 },
      right: { top: '50%', right: inset, transform: 'translateY(-50%)', zIndex: 10 },
      counter: { top: inset, left: inset, zIndex: 10 },
      download: { bottom: inset, right: '56px', zIndex: 10 }, // space for rotate
      rotate: { bottom: inset, right: inset, zIndex: 10 },
      share: { bottom: inset, left: inset, zIndex: 10 },
    };
    return base[button as keyof typeof base];
  };

  // Helper to get image aspect ratio and dynamic overlay size
  const getOverlayStyle = (img: HTMLImageElement | null, rotation: number) => {
    let aspect = 4 / 3;
    if (img && img.naturalWidth && img.naturalHeight) {
      aspect = img.naturalWidth / img.naturalHeight;
      if (rotation % 180 !== 0) aspect = 1 / aspect;
    }
    return {
      width: aspect >= 1 ? '70%' : `${70 * aspect}%`,
      height: aspect >= 1 ? `${70 / aspect}%` : '70%',
      maxWidth: '70%',
      maxHeight: '70%',
      borderRadius: '2rem 2rem 4rem 4rem/3rem 3rem 6rem 6rem',
      background: 'rgba(255,255,255,0.7)',
      boxShadow: '0 4px 32px 0 rgba(0,0,0,0.10)',
      overflow: 'hidden',
      transform: `rotate(${rotation}deg)`
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Event Photos</h2>
        <label className="cursor-pointer bg-primary text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-secondary transition-colors duration-200 flex items-center text-sm sm:text-base whitespace-nowrap w-full sm:w-auto justify-center">
          <Camera className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          Upload Photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
        </label>
      </div>
      {processingStatus && (
        <div className="bg-blue-50 text-blue-700 p-3 rounded-lg mb-4">
          {processingStatus}
        </div>
      )}
      <ImageGrid />
      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={loadMore}
            disabled={loading}
            className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-secondary transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative flex items-center justify-center bg-white rounded-2xl shadow-xl overflow-hidden"
            style={{
              width: 'min(90vw, 90vh)',
              height: 'min(90vw, 90vh)',
              minWidth: 320,
              minHeight: 320,
              maxWidth: 900,
              maxHeight: 900,
              aspectRatio: '1/1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              padding: 0,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Image with 4–5px gap, centered, rotates */}
            <div
              className="flex items-center justify-center w-full h-full"
              style={{
                boxSizing: 'border-box',
                padding: 5,
                width: '100%',
                height: '100%',
              }}
            >
              <img
                id="modal-img"
                src={selectedImage.url}
                alt="Enlarged event photo"
                className="object-contain"
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 'inherit',
                  display: 'block',
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.3s',
                  background: 'transparent',
                  pointerEvents: 'auto',
                  userSelect: 'none',
                }}
              />
            </div>
            {/* Action icons - not rotating, always on top, with consistent background */}
            {/* Close button */}
            <button
              className="absolute p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
              onClick={() => setSelectedImage(null)}
              style={{ top: 12, right: 12, zIndex: 10 }}
              title="Close"
            >
              <X className="w-8 h-8" />
            </button>
            <div className="absolute flex space-x-6" style={{ bottom: 12, right: 20, zIndex: 10 }}>
              <button
                onClick={e => {
                  e.stopPropagation();
                  handleDownload(selectedImage);
                }}
                className="p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                title="Download"
              >
                <Download className="w-6 h-6" />
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setRotation(r => (r + 90) % 360);
                }}
                className="p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                title="Rotate image"
              >
                <RotateCw className="w-6 h-6" />
              </button>
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                // Add share logic if needed
              }}
              className="absolute p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
              style={{ bottom: 12, left: 12, zIndex: 10 }}
              title="Share"
            >
              <Share2 className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventImages;