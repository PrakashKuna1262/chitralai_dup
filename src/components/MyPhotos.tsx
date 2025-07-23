import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image as ImageIcon, ArrowLeft, Download, X, Share2, Facebook, Twitter, Link, Mail, Instagram, Linkedin, MessageCircle, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { validateEnvVariables } from '../config/aws';
import ProgressiveImage from './ProgressiveImage';

interface ShareMenuState {
  isOpen: boolean;
  imageUrl: string;
  position: {
    top: number;
    left: number;
  };
}
import { getAllAttendeeImagesByUser } from '../config/attendeeStorage';

interface MatchingImage {
  imageId: string;
  eventId: string;
  eventName: string;
  imageUrl: string;
  matchedDate: string;
}

const MyPhotos: React.FC = () => {
  const navigate = useNavigate();
  const [images, setImages] = useState<MatchingImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<MatchingImage | null>(null);
  const [bucketName, setBucketName] = useState<string | undefined>();
  const [shareMenu, setShareMenu] = useState<ShareMenuState>({
    isOpen: false,
    imageUrl: '',
    position: { top: 0, left: 0 }
  });
  const [rotation, setRotation] = useState(0);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const modalImgRef = useRef<HTMLImageElement | null>(null);

  // Helper function to construct S3 URL
  const constructS3Url = (imageUrl: string, bucket?: string): string => {
    // If it's already a full URL, return as is
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }
    // Use provided bucket name or fallback to state variable or default
    const useBucket = bucket || bucketName || 'chitral-ai';
    // Otherwise construct the URL using the bucket name
    return `https://${useBucket}.s3.amazonaws.com/${imageUrl}`;
  };

  const handleShare = async (platform: string, imageUrl: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    try {
      // Fetch the image and convert to blob
      const response = await fetch(imageUrl, {
        headers: {
          'Cache-Control': 'no-cache',
        },
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const imageFile = new File([blob], 'photo.jpg', { type: blob.type });

      // If Web Share API is supported and platform is not specified (direct share button click)
      if (typeof navigator.share === 'function' && !platform) {
        try {
          await navigator.share({
            title: 'Check out this photo!',
            text: 'Photo from Chitralai',
            files: [imageFile]
          });
          setShareMenu(prev => ({ ...prev, isOpen: false }));
          return;
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            console.error('Error sharing file:', err);
          }
        }
      }

      // Fallback to custom share menu for specific platforms
      const shareUrl = encodeURIComponent(imageUrl);
      const shareText = encodeURIComponent('Check out this photo!');
      
      let shareLink = '';
      switch (platform) {
        case 'facebook':
          shareLink = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
          break;
        case 'twitter':
          shareLink = `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`;
          break;
        case 'instagram':
          shareLink = `instagram://library?AssetPath=${shareUrl}`;
          break;
        case 'linkedin':
          shareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`;
          break;
        case 'whatsapp':
          shareLink = `https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}`;
          break;
        case 'email':
          shareLink = `mailto:?subject=${shareText}&body=${shareUrl}`;
          break;
        case 'copy':
          try {
            await navigator.clipboard.writeText(imageUrl);
            alert('Link copied to clipboard!');
            setShareMenu(prev => ({ ...prev, isOpen: false }));
            return;
          } catch (err) {
            console.error('Failed to copy link:', err);
            alert('Failed to copy link');
          }
          break;
      }
      
      if (shareLink) {
        window.open(shareLink, '_blank', 'noopener,noreferrer');
        setShareMenu(prev => ({ ...prev, isOpen: false }));
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      alert('Failed to share image. Please try again.');
    }
  };

  // Close share menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareMenu.isOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.share-menu')) {
          setShareMenu(prev => ({ ...prev, isOpen: false }));
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [shareMenu.isOpen]);

  // Reset rotation when image changes or modal closes
  useEffect(() => {
    setRotation(0);
  }, [selectedImage]);

  // Navigation functions for enlarged image view
  const getCurrentImageIndex = () => {
    if (!selectedImage) return -1;
    return images.findIndex(img => img.imageUrl === selectedImage.imageUrl);
  };

  const goToNextImage = () => {
    const currentIndex = getCurrentImageIndex();
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % images.length;
    setSelectedImage(images[nextIndex]);
  };

  const goToPreviousImage = () => {
    const currentIndex = getCurrentImageIndex();
    if (currentIndex === -1) return;
    const prevIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1;
    setSelectedImage(images[prevIndex]);
  };

  // Keyboard navigation for enlarged image
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedImage) return;
      
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNextImage();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPreviousImage();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedImage(null);
        toggleHeaderFooter(true);
      }
    };

    if (selectedImage) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedImage, images]);

  // Toggle header and footer visibility when image is clicked
  const toggleHeaderFooter = (visible: boolean) => {
    // Find header and footer elements in DOM
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
    const fetchUserPhotos = async () => {
      try {
        setLoading(true);
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
          navigate('/GoogleLogin');
          return;
        }

        // Get the S3 bucket name
        const { bucketName } = await validateEnvVariables();
        setBucketName(bucketName);

        // Get all attendee images
        const attendeeImageData = await getAllAttendeeImagesByUser(userEmail);
        
        // Extract all images
        const allImages: MatchingImage[] = [];
        
        // Process each attendee-event entry sequentially to get event details
        for (const data of attendeeImageData) {
          // Get event details from the events database
          const { getEventById } = await import('../config/eventStorage');
          const eventDetails = await getEventById(data.eventId);
          
          // Default event name and date if details not found
          const eventName = eventDetails?.name || `Event ${data.eventId}`;
          
          // Add all matched images to the images list
          data.matchedImages.forEach(imageUrl => {
            allImages.push({
              imageId: imageUrl.split('/').pop() || '',
              eventId: data.eventId,
              eventName: eventName,
              imageUrl: constructS3Url(imageUrl, bucketName),
              matchedDate: data.uploadedAt
            });
          });
        }

        // Sort images by date (newest first)
        allImages.sort((a, b) => new Date(b.matchedDate).getTime() - new Date(a.matchedDate).getTime());
        
        setImages(allImages);
      } catch (error) {
        console.error('Error fetching user photos:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserPhotos();
  }, [navigate]);

  const handleDownload = async (url: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      // Fetch the image with appropriate headers
      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache',
        },
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      // Get the content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Get the image as a blob
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Extract filename from URL
      const filename = url.split('/').pop() || 'photo.jpg';
      
      // Create a temporary anchor element
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.type = contentType;
      link.target = '_blank';
      
      // Required for Firefox
      document.body.appendChild(link);
      
      // Trigger the download
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error('Error downloading image:', error);
      // If download fails, open the image in a new tab
      window.open(url, '_blank');
    }
  };

  const handleDownloadAll = async () => {
    try {
      // Show a message that downloads are starting
      alert('Starting downloads. Please allow multiple downloads in your browser settings.');
      
      // Download each image with a small delay to prevent browser blocking
      for (const image of images) {
        await handleDownload(image.imageUrl);
        // Add a small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error downloading all images:', error);
      alert('Some downloads may have failed. Please try downloading individual photos.');
    }
  };

  // Helper to get button positions based on rotation
  const getButtonPosition = (button: string, rotation: number) => {
    // rotation: 0, 90, 180, 270
    // returns Tailwind classes for absolute positioning
    const positions = {
      close: [
        'top-4 right-4', // 0
        'bottom-4 right-4', // 90
        'bottom-4 left-4', // 180
        'top-4 left-4', // 270
      ],
      left: [
        'left-4 top-1/2 -translate-y-1/2', // 0
        'bottom-4 left-1/2 -translate-x-1/2', // 90
        'right-4 top-1/2 -translate-y-1/2', // 180
        'top-4 left-1/2 -translate-x-1/2', // 270
      ],
      right: [
        'right-4 top-1/2 -translate-y-1/2', // 0
        'top-4 left-1/2 -translate-x-1/2', // 90
        'left-4 top-1/2 -translate-y-1/2', // 180
        'bottom-4 right-1/2 translate-x-1/2', // 270
      ],
      counter: [
        'top-4 left-4', // 0
        'bottom-4 left-4', // 90
        'bottom-4 right-4', // 180
        'top-4 right-4', // 270
      ],
      download: [
        'bottom-4 right-4', // 0
        'bottom-4 left-4', // 90
        'top-4 left-4', // 180
        'top-4 right-4', // 270
      ],
      share: [
        'bottom-4 right-20', // 0
        'bottom-20 left-4', // 90
        'top-4 left-20', // 180
        'top-20 right-4', // 270
      ],
    };
    return positions[button][(rotation / 90) % 4];
  };

  // Replace the getButtonStyle helper with the one from ViewEvent
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
    return base[button];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading photos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-6 px-4 sm:px-6 lg:px-8">
      {shareMenu.isOpen && (
        <div
          className="share-menu fixed z-50 bg-white rounded-lg shadow-xl p-4 w-64"
          style={{
            top: `${shareMenu.position.top}px`,
            left: `${shareMenu.position.left}px`,
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={(e) => handleShare('facebook', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Facebook className="h-6 w-6 text-blue-600" />
            </button>
            <button
              onClick={(e) => handleShare('instagram', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Instagram className="h-6 w-6 text-pink-600" />
            </button>
            <button
              onClick={(e) => handleShare('twitter', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Twitter className="h-6 w-6 text-blue-400" />
            </button>
            <button
              onClick={(e) => handleShare('linkedin', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Linkedin className="h-6 w-6 text-blue-700" />
            </button>
            <button
              onClick={(e) => handleShare('whatsapp', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MessageCircle className="h-6 w-6 text-green-500" />
            </button>
            <button
              onClick={(e) => handleShare('email', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Mail className="h-6 w-6 text-gray-600" />
            </button>
            <button
              onClick={(e) => handleShare('copy', shareMenu.imageUrl, e)}
              className="flex flex-col items-center justify-center p-2 hover:bg-gray-100 rounded-lg transition-colors col-start-2"
            >
              <Link className="h-6 w-6 text-gray-600" />
            </button>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/attendee-dashboard')}
            className="text-blue-600 hover:text-blue-800 flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Events
          </button>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Photos</h1>
              <p className="mt-2 text-gray-600">
                All your photos from all events
              </p>
            </div>
            {images.length > 0 && (
              <button
                onClick={handleDownloadAll}
                className="flex items-center w-full sm:w-auto justify-center px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
              >
                <Download className="h-4 w-4 mr-2" />
                Download All
              </button>
            )}
            {/* Place any filter or controls here, stacked below on mobile */}
          </div>
        </div>

        {images.length > 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-1.5">
            {images.map((image) => (
              <div
                key={image.imageId}
                className="relative bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow border border-gray-200"
              >
                <div 
                  className="aspect-square w-full cursor-pointer"
                  onClick={() => {
                    setSelectedImage(image);
                    toggleHeaderFooter(false);
                  }}
                >
                  <ProgressiveImage
                    compressedSrc={image.imageUrl}
                    originalSrc={image.imageUrl}
                    alt={`Photo from ${image.eventName}`}
                    className="rounded-lg"
                  />
                  <div className="absolute top-2 right-2 flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(image.imageUrl);
                      }}
                      className="p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                      title="Download photo"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <ImageIcon className="h-12 w-12 text-gray-400 mx-auto" />
            <p className="mt-2 text-gray-500">No photos found</p>
            <p className="mt-2 text-sm text-gray-500">Enter an event code in the dashboard to find your photos</p>
          </div>
        )}
        
        {/* Enlarged Image Modal */}
        {selectedImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setSelectedImage(null);
              toggleHeaderFooter(true);
            }}
          >
            <div
              className="relative flex items-center justify-center bg-black rounded-2xl shadow-xl overflow-hidden"
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
                  ref={modalImgRef}
                  id="modal-img"
                  src={selectedImage.imageUrl}
                  alt={`Enlarged photo from ${selectedImage.eventName}`}
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
                  onLoad={e => {
                    setImageNaturalSize({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight
                    });
                  }}
                />
              </div>
              {/* Close button */}
              <button
                className="absolute p-2 sm:p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                onClick={() => {
                  setSelectedImage(null);
                  toggleHeaderFooter(true);
                }}
                style={{ top: 12, right: 12, zIndex: 10 }}
                title="Close"
              >
                <X className="w-5 h-5 sm:w-8 sm:h-8" />
              </button>
              {/* Navigation arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      goToPreviousImage();
                    }}
                    className="absolute p-2 sm:p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                    title="Previous image (←)"
                    style={{ left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
                  >
                    <ChevronLeft className="w-5 h-5 sm:w-8 sm:h-8" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      goToNextImage();
                    }}
                    className="absolute p-2 sm:p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                    title="Next image (→)"
                    style={{ right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
                  >
                    <ChevronRight className="w-5 h-5 sm:w-8 sm:h-8" />
                  </button>
                </>
              )}
              {/* Image counter */}
              {images.length > 1 && (
                <div className="absolute px-3 py-1 sm:px-4 sm:py-2 rounded-full bg-black/40 text-white text-xs sm:text-sm shadow-lg" style={{ top: 12, left: 12, zIndex: 10 }}>
                  {getCurrentImageIndex() + 1} / {images.length}
                </div>
              )}
              {/* Download and Rotate buttons at bottom-right with more spacing */}
              <div className="absolute flex space-x-3 sm:space-x-6" style={{ bottom: 12, right: 20, zIndex: 10 }}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleDownload(selectedImage.imageUrl, e);
                  }}
                  className="p-2 sm:p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                  title="Download"
                >
                  <Download className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setRotation(r => (r + 90) % 360);
                  }}
                  className="p-2 sm:p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                  title="Rotate image"
                >
                  <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
              {/* Share button at bottom-left */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (typeof navigator.share === 'function') {
                    handleShare('', selectedImage.imageUrl, e);
                  } else {
                    setShareMenu({
                      isOpen: true,
                      imageUrl: selectedImage.imageUrl,
                      position: {
                        top: rect.top - 200,
                        left: rect.left - 200
                      }
                    });
                  }
                }}
                className="absolute p-2 sm:p-3 rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors duration-200 shadow-lg"
                style={{ bottom: 12, left: 12, zIndex: 10 }}
                title="Share"
              >
                <Share2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPhotos;

