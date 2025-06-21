import React, { useState, useEffect, useRef } from 'react';

interface ProgressiveImageProps {
  compressedSrc: string;
  originalSrc: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  compressedSrc,
  originalSrc,
  alt = '',
  className = '',
  style = {},
}) => {
  const [highResLoaded, setHighResLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect(); // Stop observing once visible
          }
        });
      },
      {
        rootMargin: '50px 0px',
        threshold: 0.1
      }
    );

    if (imageRef.current) {
      observer.observe(imageRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={imageRef}
      className="relative w-full h-full"
      style={style}
    >
      {isVisible && (
        <>
          <img
            src={compressedSrc}
            alt={alt}
            className={`absolute inset-0 w-full h-full ${className}`}
            style={{
              filter: highResLoaded ? 'blur(0px)' : 'blur(8px)',
              transition: 'filter 0.3s ease-in-out',
              objectFit: 'cover',
              objectPosition: 'center',
            }}
            loading="lazy"
            draggable={false}
          />
          <img
            src={originalSrc}
            alt={alt}
            className={`absolute inset-0 w-full h-full ${className}`}
            style={{
              opacity: highResLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out',
              objectFit: 'cover',
              objectPosition: 'center',
              zIndex: 1,
            }}
            loading="lazy"
            onLoad={() => setHighResLoaded(true)}
            draggable={false}
          />
        </>
      )}
    </div>
  );
};

export default ProgressiveImage; 