'use client';

import { useState, useCallback, useEffect } from 'react';
import { getAssetPreviewType } from '@/lib/asset-display';
import { getAssetPreviewUrls } from '@/lib/asset-preview';
import type { AssetPreviewDescriptor } from '@/lib/asset-preview';
import { ImageRenderer } from './renderers/image-renderer';
import { VideoRenderer } from './renderers/video-renderer';
import { AudioRenderer } from './renderers/audio-renderer';
import { DocumentRenderer } from './renderers/document-renderer';
import { FileRenderer } from './renderers/file-renderer';
import { PreviewFallback } from './preview-fallback';
import { useMediaCleanup } from './hooks/use-media-cleanup';

interface PreviewMediaProps {
  descriptor: AssetPreviewDescriptor;
  compact?: boolean;
}

export function PreviewMedia({ descriptor, compact }: PreviewMediaProps) {
  const [errored, setErrored] = useState(false);
  const { setVideoRef, setAudioRef, setIframeRef, cleanup } = useMediaCleanup();

  const previewType = getAssetPreviewType(descriptor);
  const urls = getAssetPreviewUrls(descriptor);

  useEffect(() => {
    setErrored(false);
  }, [descriptor.driveFileId, descriptor.driveFileUrl]);

  const handleError = useCallback(() => {
    setErrored(true);
  }, []);

  if (errored) {
    return <PreviewFallback previewType={previewType} urls={urls} title={descriptor.title} />;
  }

  const props = { descriptor, urls, compact, onError: handleError };

  switch (previewType) {
    case 'image':
      return <ImageRenderer {...props} />;
    case 'video':
      return <VideoRenderer {...props} videoRef={setVideoRef} />;
    case 'audio':
      return <AudioRenderer {...props} audioRef={setAudioRef} />;
    case 'document':
      return <DocumentRenderer {...props} iframeRef={setIframeRef} />;
    default:
      return <FileRenderer descriptor={descriptor} urls={urls} compact={compact} />;
  }
}
