import { useEffect, useState } from 'react';

type UseArtworkDetailMediaOptions = {
  imageUrl: string;
};

export function useArtworkDetailMedia({
  imageUrl,
}: UseArtworkDetailMediaOptions) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [mobileImageHeight, setMobileImageHeight] = useState(-1);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);

    const img = new Image();
    img.onload = () => {
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageError(true);
      setImageLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (window.innerWidth < 640) {
      setMobileImageHeight(window.innerWidth * 0.75);
    }
  }, []);

  useEffect(() => {
    setLightboxOpen(false);
  }, [imageUrl]);

  return {
    lightboxOpen,
    setLightboxOpen,
    imageLoaded,
    imageError,
    mobileImageHeight,
  };
}
