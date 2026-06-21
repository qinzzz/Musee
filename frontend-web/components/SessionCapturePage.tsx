import React from 'react';

export type CaptureTarget = 'artwork' | 'label';

type CapturedSlot = {
  kind: CaptureTarget;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  createdAt: number;
};

type SessionCaptureSubmission = {
  artwork: File;
  label: File | null;
  coords?: { latitude: number; longitude: number };
};

type DragPoint = { x: number; y: number };
type DragRect = { x: number; y: number; width: number; height: number };
type CaptureSourceImage = HTMLImageElement | HTMLVideoElement;
type ImageCaptureInstance = {
  takePhoto: () => Promise<Blob>;
};
type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureInstance;

type Props = {
  onClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSubmit: (payload: SessionCaptureSubmission) => Promise<void>;
};

type CameraState = 'loading' | 'ready' | 'denied' | 'error';

const MIN_CAPTURE_SIZE = 24;
const MOBILE_EDGE_GESTURE_GUTTER = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildRect(start: DragPoint, end: DragPoint): DragRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function getDisplayedVideoRect(
  stageWidth: number,
  stageHeight: number,
  videoWidth: number,
  videoHeight: number,
  fitMode: 'contain' | 'cover',
): DragRect | null {
  if (!stageWidth || !stageHeight || !videoWidth || !videoHeight) return null;

  const stageAspect = stageWidth / stageHeight;
  const videoAspect = videoWidth / videoHeight;

  if (fitMode === 'contain') {
    if (stageAspect > videoAspect) {
      const height = stageHeight;
      const width = height * videoAspect;
      return {
        x: (stageWidth - width) / 2,
        y: 0,
        width,
        height,
      };
    }

    const width = stageWidth;
    const height = width / videoAspect;
    return {
      x: 0,
      y: (stageHeight - height) / 2,
      width,
      height,
    };
  }

  if (stageAspect > videoAspect) {
    const width = stageWidth;
    const height = width / videoAspect;
    return {
      x: 0,
      y: (stageHeight - height) / 2,
      width,
      height,
    };
  }

  const height = stageHeight;
  const width = height * videoAspect;
  return {
    x: (stageWidth - width) / 2,
    y: 0,
    width,
    height,
  };
}

function isPointInsideRect(point: DragPoint, rect: DragRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function clampPointToRect(point: DragPoint, rect: DragRect): DragPoint {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.width),
    y: clamp(point.y, rect.y, rect.y + rect.height),
  };
}

function insetRect(rect: DragRect, insetX: number): DragRect {
  const widthInset = Math.min(insetX, rect.width / 2);
  return {
    x: rect.x + widthInset,
    y: rect.y,
    width: Math.max(0, rect.width - (widthInset * 2)),
    height: rect.height,
  };
}

function getImageCaptureConstructor(): ImageCaptureConstructor | null {
  const candidate = (globalThis as { ImageCapture?: ImageCaptureConstructor }).ImageCapture;
  return typeof candidate === 'function' ? candidate : null;
}

async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode captured photo.'));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const SessionCapturePage: React.FC<Props> = ({
  onClose,
  onDirtyChange,
  onSubmit,
}) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const captureCoordsRef = React.useRef<{ latitude: number; longitude: number } | undefined>(undefined);
  const locationRequestRef = React.useRef<Promise<void> | null>(null);
  const currentPreviewUrlsRef = React.useRef<{ artwork: string | null; label: string | null }>({
    artwork: null,
    label: null,
  });
  const [cameraState, setCameraState] = React.useState<CameraState>('loading');
  const [cameraMessage, setCameraMessage] = React.useState('Preparing camera…');
  const [activeTarget, setActiveTarget] = React.useState<CaptureTarget>('artwork');
  const [artworkSlot, setArtworkSlot] = React.useState<CapturedSlot | null>(null);
  const [labelSlot, setLabelSlot] = React.useState<CapturedSlot | null>(null);
  const [dragStart, setDragStart] = React.useState<DragPoint | null>(null);
  const [dragCurrent, setDragCurrent] = React.useState<DragPoint | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [viewportFitMode, setViewportFitMode] = React.useState<'contain' | 'cover'>('contain');
  const [edgeGestureGutter, setEdgeGestureGutter] = React.useState(0);
  const [captureCoords, setCaptureCoords] = React.useState<{ latitude: number; longitude: number } | undefined>(undefined);
  const hasRequestedLocationRef = React.useRef(false);

  const hasCapturedSlots = Boolean(artworkSlot || labelSlot);
  const currentRect = dragStart && dragCurrent ? buildRect(dragStart, dragCurrent) : null;
  const activeSlot = activeTarget === 'artwork' ? artworkSlot : labelSlot;
  const showActiveSlotPreview = Boolean(activeSlot);

  React.useEffect(() => {
    onDirtyChange(hasCapturedSlots);
  }, [hasCapturedSlots, onDirtyChange]);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const updateFitMode = () => {
      setViewportFitMode(mediaQuery.matches ? 'contain' : 'cover');
      setEdgeGestureGutter(mediaQuery.matches ? 0 : MOBILE_EDGE_GESTURE_GUTTER);
    };

    updateFitMode();
    mediaQuery.addEventListener('change', updateFitMode);
    return () => {
      mediaQuery.removeEventListener('change', updateFitMode);
    };
  }, []);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const requestCamera = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraMessage('This browser does not support live camera capture.');
      return;
    }

    setCameraState('loading');
    setCameraMessage('Preparing camera…');
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      setCameraState('ready');
      setCameraMessage('Drag to capture the active slot.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Camera access failed.';
      setCameraState(message.toLowerCase().includes('denied') || message.toLowerCase().includes('permission') ? 'denied' : 'error');
      setCameraMessage(
        message.toLowerCase().includes('denied') || message.toLowerCase().includes('permission')
          ? 'Camera permission was denied. Allow camera access to continue.'
          : 'Could not start the camera.',
      );
    }
  }, [stopCamera]);

  const requestLocation = React.useCallback(async () => {
    if (!navigator.geolocation) {
      return;
    }

    const request = new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextCoords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          captureCoordsRef.current = nextCoords;
          setCaptureCoords(nextCoords);
          resolve();
        },
        () => resolve(),
        { timeout: 4000, enableHighAccuracy: false, maximumAge: 60000 },
      );
    });

    locationRequestRef.current = request;
    void request.finally(() => {
      if (locationRequestRef.current === request) {
        locationRequestRef.current = null;
      }
    });
    return request;
  }, []);

  React.useEffect(() => {
    void requestCamera();
    return () => {
      stopCamera();
    };
  }, [requestCamera, stopCamera]);

  React.useEffect(() => {
    if (cameraState !== 'ready' || hasRequestedLocationRef.current) {
      return;
    }

    hasRequestedLocationRef.current = true;
    void requestLocation();
  }, [cameraState, requestLocation]);

  React.useEffect(() => {
    if (showActiveSlotPreview) {
      return;
    }

    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) {
      return;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    void video.play().catch(() => undefined);
  }, [showActiveSlotPreview, activeTarget, artworkSlot, labelSlot]);

  React.useEffect(() => {
    currentPreviewUrlsRef.current = {
      artwork: artworkSlot?.previewUrl || null,
      label: labelSlot?.previewUrl || null,
    };
  }, [artworkSlot, labelSlot]);

  React.useEffect(() => {
    return () => {
      const { artwork, label } = currentPreviewUrlsRef.current;
      if (artwork) URL.revokeObjectURL(artwork);
      if (label) URL.revokeObjectURL(label);
    };
  }, []);

  const replaceSlot = React.useCallback((nextSlot: CapturedSlot) => {
    if (nextSlot.kind === 'artwork') {
      setArtworkSlot((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return nextSlot;
      });
      return;
    }

    setLabelSlot((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return nextSlot;
    });
  }, []);

  const clearSlot = React.useCallback((kind: CaptureTarget) => {
    setActiveTarget(kind);
    if (kind === 'artwork') {
      setArtworkSlot((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    } else {
      setLabelSlot((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    }
    setCameraMessage(`Drag to capture the ${kind} slot.`);
  }, []);

  const getSlot = React.useCallback((kind: CaptureTarget) => (
    kind === 'artwork' ? artworkSlot : labelSlot
  ), [artworkSlot, labelSlot]);

  const canCaptureIntoTarget = React.useCallback((kind: CaptureTarget) => {
    const slot = getSlot(kind);
    return !slot;
  }, [getSlot]);

  const handleSelectTarget = (kind: CaptureTarget) => {
    setActiveTarget(kind);
    const slot = getSlot(kind);
    if (slot) {
      setCameraMessage(`${kind === 'artwork' ? 'Artwork' : 'Label'} captured.`);
      return;
    }
    setCameraMessage(`Drag to capture the ${kind} slot.`);
  };

  const handleRetake = (kind: CaptureTarget) => {
    clearSlot(kind);
  };

  const getStageVideoRect = React.useCallback((): DragRect | null => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return null;
    return getDisplayedVideoRect(
      stage.clientWidth,
      stage.clientHeight,
      video.videoWidth,
      video.videoHeight,
      viewportFitMode,
    );
  }, [viewportFitMode]);

  const getInteractiveVideoRect = React.useCallback((): DragRect | null => {
    const stageRect = getStageVideoRect();
    if (!stageRect) return null;
    if (!edgeGestureGutter) return stageRect;
    return insetRect(stageRect, edgeGestureGutter);
  }, [edgeGestureGutter, getStageVideoRect]);

  const buildStagePoint = React.useCallback((event: React.PointerEvent<HTMLDivElement>): DragPoint | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const getCaptureMetrics = React.useCallback((
    rect: DragRect,
    sourceWidth: number,
    sourceHeight: number,
  ) => {
    const stageRect = getStageVideoRect();
    if (!stageRect || !sourceWidth || !sourceHeight) {
      return null;
    }

    const scaleX = sourceWidth / stageRect.width;
    const scaleY = sourceHeight / stageRect.height;
    const sx = clamp(Math.round((rect.x - stageRect.x) * scaleX), 0, Math.max(0, sourceWidth - 1));
    const sy = clamp(Math.round((rect.y - stageRect.y) * scaleY), 0, Math.max(0, sourceHeight - 1));
    const sw = Math.max(1, Math.min(sourceWidth - sx, Math.round(rect.width * scaleX)));
    const sh = Math.max(1, Math.min(sourceHeight - sy, Math.round(rect.height * scaleY)));

    return { sx, sy, sw, sh };
  }, [getStageVideoRect]);

  const cropCaptureSource = React.useCallback(async (
    source: CaptureSourceImage,
    metrics: { sx: number; sy: number; sw: number; sh: number },
  ): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = metrics.sw;
    canvas.height = metrics.sh;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.drawImage(source, metrics.sx, metrics.sy, metrics.sw, metrics.sh, 0, 0, metrics.sw, metrics.sh);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.94);
    });
  }, []);

  const captureRectFromStillPhoto = React.useCallback(async (rect: DragRect): Promise<CapturedSlot | null> => {
    const stream = streamRef.current;
    const videoTrack = stream?.getVideoTracks()?.[0];
    const ImageCaptureCtor = getImageCaptureConstructor();

    if (!videoTrack || !ImageCaptureCtor) {
      return null;
    }

    try {
      const imageCapture = new ImageCaptureCtor(videoTrack);
      const photoBlob = await imageCapture.takePhoto();
      const photo = await loadImageElement(photoBlob);
      const metrics = getCaptureMetrics(rect, photo.naturalWidth || photo.width, photo.naturalHeight || photo.height);
      if (!metrics) {
        setCameraMessage('Camera is not ready yet.');
        return null;
      }

      const croppedBlob = await cropCaptureSource(photo, metrics);
      if (!croppedBlob) {
        setCameraMessage('Could not process this photo.');
        return null;
      }

      const kind = activeTarget;
      return {
        kind,
        file: new File([croppedBlob], `${kind}-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }),
        previewUrl: URL.createObjectURL(croppedBlob),
        width: metrics.sw,
        height: metrics.sh,
        createdAt: Date.now(),
      };
    } catch (error) {
      console.warn('Still photo capture failed, falling back to video frame capture.', error);
      return null;
    }
  }, [activeTarget, cropCaptureSource, getCaptureMetrics]);

  const captureRectFromVideoFrame = React.useCallback(async (rect: DragRect): Promise<CapturedSlot | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraMessage('Camera is not ready yet.');
      return null;
    }

    const metrics = getCaptureMetrics(rect, video.videoWidth, video.videoHeight);
    if (!metrics) {
      setCameraMessage('Camera is not ready yet.');
      return null;
    }

    const blob = await cropCaptureSource(video, metrics);

    if (!blob) {
      setCameraMessage('Could not capture this frame.');
      return null;
    }

    const kind = activeTarget;
    return {
      kind,
      file: new File([blob], `${kind}-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }),
      previewUrl: URL.createObjectURL(blob),
      width: metrics.sw,
      height: metrics.sh,
      createdAt: Date.now(),
    };
  }, [activeTarget, cropCaptureSource, getCaptureMetrics]);

  const captureRect = React.useCallback(async (rect: DragRect) => {
    const stillPhotoSlot = await captureRectFromStillPhoto(rect);
    const nextSlot = stillPhotoSlot || await captureRectFromVideoFrame(rect);
    if (!nextSlot) {
      return;
    }

    replaceSlot(nextSlot);
    setCameraMessage(nextSlot.kind === 'artwork' ? 'Artwork captured.' : 'Label captured.');
  }, [captureRectFromStillPhoto, captureRectFromVideoFrame, replaceSlot]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cameraState !== 'ready' || isSubmitting || isCapturing) return;

    const videoRect = getInteractiveVideoRect();
    const point = buildStagePoint(event);
    if (!videoRect || !point) return;
    if (!isPointInsideRect(point, videoRect)) {
      const stage = stageRef.current;
      if (
        stage &&
        edgeGestureGutter > 0 &&
        (point.x < edgeGestureGutter || point.x > stage.clientWidth - edgeGestureGutter)
      ) {
        setCameraMessage('Start the drag slightly away from the screen edge.');
      }
      return;
    }

    if (!canCaptureIntoTarget(activeTarget)) {
      setCameraMessage(`${activeTarget === 'artwork' ? 'Artwork' : 'Label'} already captured.`);
      return;
    }

    const clampedPoint = clampPointToRect(point, videoRect);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(clampedPoint);
    setDragCurrent(clampedPoint);
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart) return;

    const videoRect = getInteractiveVideoRect();
    const point = buildStagePoint(event);
    if (!videoRect || !point) return;

    setDragCurrent(clampPointToRect(point, videoRect));
  };

  const finishDrag = async (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart || !dragCurrent) {
      setDragStart(null);
      setDragCurrent(null);
      setIsDragging(false);
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = buildRect(dragStart, dragCurrent);

    setDragStart(null);
    setDragCurrent(null);
    setIsDragging(false);

    if (rect.width < MIN_CAPTURE_SIZE || rect.height < MIN_CAPTURE_SIZE) {
      setCameraMessage('Draw a slightly larger rectangle to capture.');
      return;
    }

    setIsCapturing(true);
    setCameraMessage('Capturing photo…');
    try {
      await captureRect(rect);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSubmit = async () => {
    if (!artworkSlot || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (locationRequestRef.current) {
        await locationRequestRef.current;
      }
      await onSubmit({
        artwork: artworkSlot.file,
        label: labelSlot?.file || null,
        coords: captureCoordsRef.current,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderMobileTargetChip = (
    kind: CaptureTarget,
    label: string,
    options?: { optional?: boolean },
  ) => {
    const slot = getSlot(kind);
    const isActive = activeTarget === kind;

    return (
      <button
        type="button"
        onClick={() => handleSelectTarget(kind)}
        className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-5 py-3 text-[13px] font-medium backdrop-blur transition-colors ${
          isActive
            ? 'border-white/65 bg-white/65 text-neutral-900 shadow-[0_10px_24px_rgba(0,0,0,0.18)]'
            : 'border-white/35 bg-white/35 text-neutral-700 shadow-[0_8px_20px_rgba(0,0,0,0.14)]'
        }`}
      >
        {slot ? (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M4 10.5 8 14.5 16 5.5" />
          </svg>
        ) : null}
        <span className="truncate">{label}</span>
        {options?.optional ? <span className="text-neutral-500">- Optional</span> : null}
      </button>
    );
  };

  const renderSlotCard = (
    kind: CaptureTarget,
    label: string,
    badge?: { text: string },
  ) => {
    const slot = getSlot(kind);
    const isActive = activeTarget === kind;

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => handleSelectTarget(kind)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelectTarget(kind);
          }
        }}
        className={`rounded-[20px] border px-3 py-3 transition-colors cursor-pointer ${
          isActive
            ? 'border-neutral-900 bg-neutral-50'
            : 'border-neutral-200 bg-white'
        }`}
      >
        <div className="flex items-start gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold text-neutral-900">{label}</p>
              {badge ? (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                  {badge.text}
                </span>
              ) : null}
            </div>
            {slot ? (
              <p className="mt-1 text-[11px] text-neutral-500">
                {`${slot.width} × ${slot.height}`}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[16px] bg-neutral-100">
            {slot ? (
              <img
                src={slot.previewUrl}
                alt={`${label} capture`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-neutral-400">
                Empty
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1" />
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-neutral-900">
      <button
        type="button"
        onClick={onClose}
        aria-label="Back"
        className="absolute left-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-sm backdrop-blur transition-colors hover:bg-black/65 md:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {activeSlot ? (
        <button
          type="button"
          onClick={() => handleRetake(activeTarget)}
          className="absolute right-4 top-4 z-20 flex h-11 items-center rounded-full border border-white/15 bg-black/55 px-4 text-[12px] font-medium text-white shadow-sm backdrop-blur transition-colors hover:bg-black/65"
        >
          Retake
        </button>
      ) : null}

      <div className="hidden items-center justify-between border-b border-neutral-200 px-4 py-4 sm:px-6 lg:flex">
        <div>
          <p className="text-[18px] font-semibold">Capture</p>
          <p className="mt-1 text-[12px] text-neutral-500">Drag to frame the active target.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-neutral-200 px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Back
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[42vh] flex-1 overflow-hidden bg-black lg:min-h-0">
            <div
              ref={stageRef}
              className="relative h-full w-full touch-none"
              style={{ overscrollBehaviorX: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
            onPointerUp={(event) => void finishDrag(event)}
            onPointerCancel={() => {
              setDragStart(null);
              setDragCurrent(null);
              setIsDragging(false);
            }}
          >
            {showActiveSlotPreview ? (
              <img
                src={activeSlot.previewUrl}
                alt={`${activeTarget} preview`}
                className="h-full w-full object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover lg:object-contain"
              />
            )}

            {!showActiveSlotPreview && cameraState !== 'ready' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center">
                <div className="max-w-sm space-y-3">
                  <p className="text-[15px] font-medium text-white">{cameraMessage}</p>
                  {(cameraState === 'denied' || cameraState === 'error') && (
                    <button
                      type="button"
                      onClick={() => void requestCamera()}
                      className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-white/15"
                    >
                      Retry camera
                    </button>
                  )}
                </div>
              </div>
            )}

            {!showActiveSlotPreview && cameraState === 'ready' && isCapturing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 px-6 text-center">
                <div className="rounded-full border border-white/15 bg-black/45 px-4 py-2 text-[13px] font-medium text-white backdrop-blur">
                  Capturing photo…
                </div>
              </div>
            )}

            {!showActiveSlotPreview && currentRect && (
              <div
                className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                style={{
                  left: `${currentRect.x}px`,
                  top: `${currentRect.y}px`,
                  width: `${currentRect.width}px`,
                  height: `${currentRect.height}px`,
                }}
              >
                <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-white" />
                <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-white" />
                <div className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-white" />
                <div className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-full bg-white" />
              </div>
            )}

            {!activeSlot && cameraState === 'ready' ? (
              <div className="pointer-events-none absolute right-4 top-4 flex h-11 items-center rounded-full bg-black/45 px-4 text-[11px] font-medium text-white backdrop-blur">
                {isCapturing ? 'Capturing photo…' : `Drag to capture ${activeTarget}`}
              </div>
            ) : null}

            <div className="absolute bottom-24 left-4 right-4 z-10 lg:hidden">
              <div className="flex flex-wrap justify-center gap-3">
                {renderMobileTargetChip('artwork', 'Artwork')}
                {renderMobileTargetChip('label', 'Label', { optional: true })}
              </div>
            </div>

            <div className="absolute bottom-6 left-4 right-4 z-10 lg:hidden">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!artworkSlot || isSubmitting}
                className="flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-[13px] font-medium text-neutral-900 transition-opacity disabled:bg-white/70 disabled:text-neutral-500"
              >
                {isSubmitting ? 'Preparing capture…' : 'Analyze'}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden w-full shrink-0 flex-col border-t border-neutral-200 bg-white lg:flex lg:w-[360px] lg:border-l lg:border-t-0">
          <div className="space-y-4 px-4 py-4 sm:px-6">
            <div className="grid grid-cols-2 gap-3">
              {renderSlotCard('artwork', 'Artwork')}
              {renderSlotCard('label', 'Label', { text: 'Optional' })}
            </div>
          </div>

          <div className="mt-auto border-t border-neutral-200 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!artworkSlot || isSubmitting}
              className="flex w-full items-center justify-center rounded-full bg-neutral-900 px-5 py-3 text-[13px] font-medium text-white transition-opacity disabled:opacity-30"
            >
              {isSubmitting ? 'Preparing capture…' : 'Analyze'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionCapturePage;
