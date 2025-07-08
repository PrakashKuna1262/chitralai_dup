// Comprehensive image format support for S3 uploads
// Supports: JPEG, PNG, WebP, SVG, HEIC/HEIF, RAW formats, PSD, ICO, APNG, and more

export interface ImageFormatInfo {
  extension: string;
  mimeType: string;
  description: string;
  category: 'web' | 'print' | 'raw' | 'animation' | 'vector';
  isSupported: boolean;
  needsConversion: boolean;
  targetFormat?: string;
}

// All supported image formats
export const SUPPORTED_IMAGE_FORMATS: ImageFormatInfo[] = [
  // Web formats (fully supported)
  { extension: '.jpg', mimeType: 'image/jpeg', description: 'JPEG Image', category: 'web', isSupported: true, needsConversion: false },
  { extension: '.jpeg', mimeType: 'image/jpeg', description: 'JPEG Image', category: 'web', isSupported: true, needsConversion: false },
  { extension: '.png', mimeType: 'image/png', description: 'PNG Image', category: 'web', isSupported: true, needsConversion: false },
  { extension: '.webp', mimeType: 'image/webp', description: 'WebP Image', category: 'web', isSupported: true, needsConversion: false },
  { extension: '.svg', mimeType: 'image/svg+xml', description: 'SVG Vector', category: 'vector', isSupported: true, needsConversion: false },
  { extension: '.gif', mimeType: 'image/gif', description: 'GIF Animation', category: 'animation', isSupported: true, needsConversion: false },
  { extension: '.bmp', mimeType: 'image/bmp', description: 'Bitmap Image', category: 'web', isSupported: true, needsConversion: false },
  { extension: '.tiff', mimeType: 'image/tiff', description: 'TIFF Image', category: 'print', isSupported: true, needsConversion: false },
  { extension: '.tif', mimeType: 'image/tiff', description: 'TIFF Image', category: 'print', isSupported: true, needsConversion: false },
  { extension: '.ico', mimeType: 'image/x-icon', description: 'Icon File', category: 'web', isSupported: true, needsConversion: false },
  { extension: '.apng', mimeType: 'image/apng', description: 'Animated PNG', category: 'animation', isSupported: true, needsConversion: false },

  // HEIC/HEIF formats (need conversion)
  { extension: '.heic', mimeType: 'image/heic', description: 'HEIC Image', category: 'web', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.heif', mimeType: 'image/heif', description: 'HEIF Image', category: 'web', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },

  // RAW camera formats (need conversion)
  { extension: '.raw', mimeType: 'image/x-raw', description: 'RAW Image', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.cr2', mimeType: 'image/x-canon-cr2', description: 'Canon RAW', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.nef', mimeType: 'image/x-nikon-nef', description: 'Nikon RAW', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.arw', mimeType: 'image/x-sony-arw', description: 'Sony RAW', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.orf', mimeType: 'image/x-olympus-orf', description: 'Olympus RAW', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.dng', mimeType: 'image/x-adobe-dng', description: 'Adobe DNG', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.rw2', mimeType: 'image/x-panasonic-rw2', description: 'Panasonic RAW', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.pef', mimeType: 'image/x-pentax-pef', description: 'Pentax RAW', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.srw', mimeType: 'image/x-samsung-srw', description: 'Samsung RAW', category: 'raw', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },

  // Design formats (need conversion)
  { extension: '.psd', mimeType: 'image/vnd.adobe.photoshop', description: 'Photoshop Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.ai', mimeType: 'application/postscript', description: 'Adobe Illustrator', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.eps', mimeType: 'application/postscript', description: 'Encapsulated PostScript', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.indd', mimeType: 'application/x-indesign', description: 'InDesign Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.sketch', mimeType: 'application/x-sketch', description: 'Sketch Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.fig', mimeType: 'application/x-figma', description: 'Figma Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },

  // Other formats
  { extension: '.tga', mimeType: 'image/x-tga', description: 'Targa Image', category: 'web', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.pcx', mimeType: 'image/x-pcx', description: 'PCX Image', category: 'web', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.xcf', mimeType: 'image/x-xcf', description: 'GIMP Image', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.kra', mimeType: 'image/x-krita', description: 'Krita Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.cdr', mimeType: 'application/x-coreldraw', description: 'CorelDRAW Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.afphoto', mimeType: 'application/x-affinity-photo', description: 'Affinity Photo Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
  { extension: '.afdesign', mimeType: 'application/x-affinity-designer', description: 'Affinity Designer Document', category: 'print', isSupported: false, needsConversion: true, targetFormat: 'image/jpeg' },
];

// Create a map for quick lookup
export const IMAGE_FORMAT_MAP = new Map<string, ImageFormatInfo>();
SUPPORTED_IMAGE_FORMATS.forEach(format => {
  IMAGE_FORMAT_MAP.set(format.extension.toLowerCase(), format);
  IMAGE_FORMAT_MAP.set(format.mimeType, format);
});

// Function to get image format info from file
export const getImageFormatInfo = (file: File): ImageFormatInfo | null => {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.type.toLowerCase();
  
  // Try to find by extension first
  let formatInfo = IMAGE_FORMAT_MAP.get(extension);
  
  // If not found by extension, try by MIME type
  if (!formatInfo) {
    formatInfo = IMAGE_FORMAT_MAP.get(mimeType);
  }
  
  // If still not found, check if it's a generic image type
  if (!formatInfo && file.type.startsWith('image/')) {
    return {
      extension: extension || '.unknown',
      mimeType: file.type,
      description: 'Unknown Image Format',
      category: 'web',
      isSupported: true,
      needsConversion: false
    };
  }
  
  return formatInfo || null;
};

// Function to check if file is an image (including all supported formats)
export const isImageFile = (file: File): boolean => {
  // Check if it's a known image format
  const formatInfo = getImageFormatInfo(file);
  if (formatInfo) {
    return true;
  }
  
  // Fallback to MIME type check
  return file.type.startsWith('image/');
};

// Function to get target format for conversion
export const getTargetFormat = (file: File): string => {
  const formatInfo = getImageFormatInfo(file);
  
  if (!formatInfo) {
    return 'image/jpeg'; // Default fallback
  }
  
  if (formatInfo.needsConversion && formatInfo.targetFormat) {
    return formatInfo.targetFormat;
  }
  
  return file.type || 'image/jpeg';
};

// Function to get file extension from MIME type
export const getExtensionFromMimeType = (mimeType: string): string => {
  const formatInfo = IMAGE_FORMAT_MAP.get(mimeType);
  return formatInfo?.extension || '.jpg';
};

// Function to get MIME type from extension
export const getMimeTypeFromExtension = (extension: string): string => {
  const formatInfo = IMAGE_FORMAT_MAP.get(extension.toLowerCase());
  return formatInfo?.mimeType || 'image/jpeg';
};

// Function to check if format needs conversion
export const needsConversion = (file: File): boolean => {
  const formatInfo = getImageFormatInfo(file);
  return formatInfo?.needsConversion || false;
};

// Function to get format description
export const getFormatDescription = (file: File): string => {
  const formatInfo = getImageFormatInfo(file);
  return formatInfo?.description || 'Unknown Image Format';
};

// Function to get format category
export const getFormatCategory = (file: File): string => {
  const formatInfo = getImageFormatInfo(file);
  return formatInfo?.category || 'web';
};

// Function to validate file for upload
export const validateImageFile = (file: File): { isValid: boolean; error?: string; formatInfo?: ImageFormatInfo } => {
  const formatInfo = getImageFormatInfo(file);
  
  if (!formatInfo) {
    return {
      isValid: false,
      error: 'Unsupported file format. Please upload an image file.'
    };
  }
  
  return {
    isValid: true,
    formatInfo
  };
};

// Function to get supported formats list for display
export const getSupportedFormatsList = (): string[] => {
  return SUPPORTED_IMAGE_FORMATS.map(format => format.extension);
};

// Function to get formats by category
export const getFormatsByCategory = (category: string): ImageFormatInfo[] => {
  return SUPPORTED_IMAGE_FORMATS.filter(format => format.category === category);
};

// Function to get all web formats
export const getWebFormats = (): ImageFormatInfo[] => {
  return getFormatsByCategory('web');
};

// Function to get all raw formats
export const getRawFormats = (): ImageFormatInfo[] => {
  return getFormatsByCategory('raw');
};

// Function to get all print formats
export const getPrintFormats = (): ImageFormatInfo[] => {
  return getFormatsByCategory('print');
};

// Function to get all animation formats
export const getAnimationFormats = (): ImageFormatInfo[] => {
  return getFormatsByCategory('animation');
};

// Function to get all vector formats
export const getVectorFormats = (): ImageFormatInfo[] => {
  return getFormatsByCategory('vector');
}; 