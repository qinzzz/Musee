
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { ArtworkClassification } from '../../types';
import type { ArtworkDetailItem, ArtworkSessionMembership, IdentifyAgainHints } from '../types';
import { getArtworkClientId } from '../../lib/artworkIdentity';
import { useArtworkCommunity } from '../hooks/useArtworkCommunity';
import { useArtworkDetailMedia } from '../hooks/useArtworkDetailMedia';
import { useArtworkDetailEditor } from '../hooks/useArtworkDetailEditor';
import {
  buildArtworkSessionMemberships,
  formatArtworkDisplayDate,
  getArtworkDisplayLocation,
  parseArtworkStreamingFields,
} from '../lib/artworkDetailPresentation';
import ArtworkActionsMenu from '../../components/ArtworkActionsMenu';
import IdentifyAgainModal from '../../components/IdentifyAgainModal';
import ArtworkDetailCommunityPanel from './ArtworkDetailCommunityPanel';
import ArtworkDetailMetadataPanel from './ArtworkDetailMetadataPanel';

interface Props {
  item: ArtworkDetailItem;
  onClose: () => void;
  onUpdateMetadata?: (id: string, updates: { artistName?: string; artworkName?: string; date?: string; medium?: string; keywords?: string[] }) => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  rightMode: 'metadata' | 'community';
  onRightModeChange: (mode: 'metadata' | 'community') => void;
  onIdentifyAgain?: (hints?: IdentifyAgainHints) => Promise<void>;
  onRetryAnalysis?: () => Promise<void> | void;
  onDelete?: () => void;
  userId?: string;
  onNavigateToArtist?: (artistEntityId: string | undefined, artworkId: string | undefined, artistName: string | undefined) => void;
  onNavigateToSession?: (sessionId: string) => void;
  sessionTitleById?: Record<string, string>;
  isInline?: boolean;
  onUpdateClassification?: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  editRequestToken?: number;
}
const ArtworkDetailModal: React.FC<Props> = ({ item, onClose, onUpdateMetadata, onNavigate, rightMode, onRightModeChange, onIdentifyAgain, onRetryAnalysis, onDelete, userId, onNavigateToArtist, onNavigateToSession, sessionTitleById, isInline, onUpdateClassification, editRequestToken }) => {
  const [funFacts, setFunFacts] = useState<Array<{ title: string; text: string }>>([]);
  const [isRetryingAnalysis, setIsRetryingAnalysis] = useState(false);
  const canRetryAnalysis = Boolean(
    onRetryAnalysis &&
    item.analysisStatus === 'failed' &&
    item.streamingText !== 'Identify again failed.',
  );
  const {
    lightboxOpen,
    setLightboxOpen,
    imageLoaded,
    imageError,
    mobileImageHeight,
  } = useArtworkDetailMedia({
    imageUrl: item.url,
  });
  const {
    community,
    commentInput,
    setCommentInput,
    isPublishing,
    handleDeleteComment,
    handlePublishComment,
  } = useArtworkCommunity({
    artworkId: item.artworkId,
    isAnalyzing: item.isAnalyzing,
    userId,
  });

  const {
    isEditing,
    editValues,
    setEditValues,
    editTags,
    setEditTags,
    tagInput,
    setTagInput,
    isSavingField,
    showIdentifyAgainModal,
    identifyAgainError,
    isIdentifyingAgain,
    identifyAgainValues,
    updateIdentifyAgainValues,
    isFailureAlertDismissed,
    setIsFailureAlertDismissed,
    firstEditInputRef,
    startEditing,
    cancelEditing,
    saveAllFields,
    openIdentifyAgainModal,
    closeIdentifyAgainModal,
    submitIdentifyAgain,
    handleEditKeyDown,
  } = useArtworkDetailEditor({
    item,
    onUpdateMetadata,
    onIdentifyAgain,
    editRequestToken,
  });

  // Custom markdown component to make bold/italic text clickable (Google search)
  const markdownComponents = {
    strong: ({ children }: { children?: React.ReactNode }) => {
      const text = String(children);
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      return (
        <a
          href={googleSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-neutral-800 underline decoration-neutral-300 hover:decoration-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
        >
          {children}
        </a>
      );
    },
    em: ({ children }: { children?: React.ReactNode }) => {
      const text = String(children);
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      return (
        <a
          href={googleSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="italic text-neutral-700 underline decoration-neutral-200 hover:decoration-neutral-400 transition-colors cursor-pointer"
        >
          {children}
        </a>
      );
    },
    p: ({ children }: { children?: React.ReactNode }) => (
      <span>{children}</span>
    ),
  };

  // Sync internal state when navigating between items in a session
  useEffect(() => {
    setFunFacts([]);
    onRightModeChange('metadata'); // Reset to metadata view for the new piece
  }, [item.clientId, item.id]);

  // Opening artwork details is read-only; generation happens once after analysis.
  useEffect(() => {
    setFunFacts(item.insights ?? []);
  }, [item.clientId, item.id, item.insights]);

  const displayLocation = useMemo(
    () => getArtworkDisplayLocation(item.location, item.captureMuseum?.canonicalName),
    [item.captureMuseum?.canonicalName, item.location],
  );

  const streamingFields = useMemo(
    () => parseArtworkStreamingFields(item),
    [item],
  );

  const displayArtist = streamingFields?.artist || item.artistName;
  const displayTitle = streamingFields?.title || item.artworkName;
  const displayDate = streamingFields?.date || item.date;
  const displayMedium = streamingFields?.medium || item.medium;
  const displayDescription = streamingFields?.description || item.description;
  const sessionMemberships = useMemo<Array<ArtworkSessionMembership>>(
    () => buildArtworkSessionMemberships(item.sessionLinks, sessionTitleById),
    [item.sessionLinks, sessionTitleById],
  );
  const navigationItems = item.navigationItems;
  const navigationIndex = navigationItems?.findIndex((navItem) => getArtworkClientId(navItem) === getArtworkClientId(item)) ?? -1;
  const currentClassification = item.classification || 'unsorted';
  const isInitialIdentifying = Boolean(item.isAnalyzing && item.analysisStatus !== 'reidentifying');
  const isReidentifying = Boolean(item.isAnalyzing && item.analysisStatus === 'reidentifying');
  const shouldHideInitialIdentityPlaceholders = isInitialIdentifying && item.analysisStatus !== 'analyzed';
  const visibleArtist = shouldHideInitialIdentityPlaceholders ? '' : displayArtist;
  const visibleTitle = shouldHideInitialIdentityPlaceholders ? '' : displayTitle;
  const visibleDate = shouldHideInitialIdentityPlaceholders ? '' : displayDate;
  const visibleMedium = shouldHideInitialIdentityPlaceholders ? '' : displayMedium;
  const hasNavigationFooter = Boolean(navigationItems && navigationItems.length > 1 && onNavigate && navigationIndex >= 0);
  const previousArtwork = navigationIndex >= 0 && navigationItems && navigationItems.length > 1
    ? navigationItems[(navigationIndex - 1 + navigationItems.length) % navigationItems.length]
    : null;
  const nextArtwork = navigationIndex >= 0 && navigationItems && navigationItems.length > 1
    ? navigationItems[(navigationIndex + 1) % navigationItems.length]
    : null;

  useEffect(() => {
    if (isEditing) firstEditInputRef.current?.focus();
  }, [firstEditInputRef, isEditing]);

  // Calculate modal dimensions based on screen size
  const getModalStyle = () => {
    if (isInline) {
      return { width: '100%', height: '100%', maxWidth: 'none' };
    }
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const isMobile = viewportWidth < 640;

    if (!imageLoaded) {
      if (isMobile) return { width: '100vw', height: '100dvh' };
      return { width: '600px', height: '400px' };
    }

    if (isMobile) {
      return { width: '100vw', height: '100dvh' };
    }

    // Desktop: wide layout
    const maxHeight = viewportWidth > 1200 ? 92 : 88; // vh
    const maxWidth = 94; // vw
    const totalWidth = (maxWidth / 100) * viewportWidth;
    const totalHeight = (maxHeight / 100) * viewportHeight;

    return {
      width: `${totalWidth}px`,
      height: `${totalHeight}px`,
      maxWidth: '1800px',
    };
  };

  const overflowMenu = !isInline && item.artworkId ? (
    <ArtworkActionsMenu
      disabled={item.isAnalyzing}
      onEdit={!item.isAnalyzing ? () => startEditing() : undefined}
      onIdentifyAgain={!item.isAnalyzing && onIdentifyAgain ? openIdentifyAgainModal : undefined}
      onDelete={onDelete}
    />
  ) : null;

  const mainDiv = (
    <div
      className={isInline ? `relative bg-white overflow-hidden flex flex-col w-full h-full transition-all ${imageLoaded ? 'opacity-100' : 'opacity-0'}` : `relative bg-white sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500 transition-all ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={getModalStyle()}
    >
      {/* Loading spinner inside main container for inline mode */}
      {!imageLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white space-y-4">
          <div className="w-12 h-12 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
          <p className="text-[10px] tracking-widest text-neutral-400 uppercase">Loading...</p>
        </div>
      )}

        {/* ── MOBILE HEADER BAR (mobile only): prev/next + close ── */}
        {!isInline && (
          <div className="sm:hidden flex items-center justify-between px-2 shrink-0 bg-white border-b border-neutral-100" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)', paddingBottom: '0.25rem' }}>
            <div className="w-16" />

            {/* Center: Back button (replaces ✕) */}
            <button
              onClick={onClose}
              className="flex flex-col items-center justify-center gap-0.5 text-neutral-500 active:text-neutral-900 transition-colors py-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="19 12 5 12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span className="text-[9px] tracking-[0.2em] uppercase font-bold">Back</span>
              {navigationItems && navigationItems.length > 1 && navigationIndex >= 0 && (
                <span className="text-[8px] font-mono text-neutral-400 tracking-wider">
                  {navigationIndex + 1}/{navigationItems.length}
                </span>
              )}
            </button>

            {/* Right: overflow "..." menu */}
            <div className="flex items-center gap-1 min-w-[4rem] justify-end">
              {overflowMenu}
            </div>
          </div>
        )}

        {/* ── MAIN AREA: left photo panel + right content panel ── */}
        <div className="flex flex-col sm:flex-row flex-1 sm:min-h-0 overflow-y-auto sm:overflow-hidden">

          {/* ── LEFT / TOP PANEL: Location + Time + Photo ── */}
          <div
            className="shrink-0 flex flex-col bg-neutral-50 border-b sm:border-b-0 sm:border-r border-neutral-100 sm:w-[44%] sm:h-auto overflow-hidden"
            style={mobileImageHeight >= 0 ? {
              height: `${mobileImageHeight}px`,
              transition: 'height 320ms cubic-bezier(0.4, 0, 0.2, 1)',
              visibility: mobileImageHeight === 0 ? 'hidden' : 'visible',
            } : {}}
          >
            {/* Location + Time row */}
            {!item.isAnalyzing && (displayLocation || item.photoTime) && (
              <div className="px-4 pt-3 pb-1.5 shrink-0 flex flex-wrap gap-x-5 gap-y-0.5 border-b border-neutral-100/60">
                {displayLocation && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 shrink-0">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span className="text-[11px] text-neutral-500 truncate">{displayLocation}</span>
                  </div>
                )}
                {item.photoTime && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span className="text-[11px] text-neutral-500">{formatArtworkDisplayDate(item.photoTime)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Photo — 4:3 center-crop on mobile, contain in panel on desktop */}
            <div className="relative p-3 sm:flex sm:items-center sm:justify-center sm:p-5 sm:flex-1 sm:min-h-0 sm:overflow-hidden">
              {imageError ? (
                <div className="w-full aspect-[4/3] sm:aspect-auto sm:w-auto sm:h-40 flex flex-col items-center justify-center gap-3 text-neutral-300 select-none">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <p className="text-[10px] tracking-[0.2em] uppercase">Image unavailable</p>
                </div>
              ) : (
                <img
                  src={item.url}
                  onClick={() => setLightboxOpen(true)}
                  className="w-full aspect-[4/3] object-cover object-center rounded-xl shadow-lg cursor-zoom-in sm:w-auto sm:aspect-auto sm:max-w-full sm:max-h-full sm:object-contain sm:shadow-xl sm:rounded-lg sm:cursor-default"
                  alt="Interpretation target"
                />
              )}


              {/* Analyzing overlay badge on photo */}
              {item.isAnalyzing && (
                <div className="absolute inset-0 flex items-end justify-start p-3 pointer-events-none">
                  <div className="flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm">
                    <div className="relative w-3 h-3 shrink-0">
                      <div className="absolute inset-0 border-[1.5px] border-neutral-200 rounded-full"></div>
                      <div className="absolute inset-0 border-t-[1.5px] border-neutral-800 rounded-full animate-spin"></div>
                    </div>
                    <span className="text-[9px] tracking-[0.2em] uppercase text-neutral-500 font-bold">Analyzing</span>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── RIGHT PANEL: Analysis Metadata OR Session Chat ── */}
          <div className="flex flex-col sm:flex-1 sm:min-h-0 min-w-0 bg-white">

            {/* Right panel header — hidden on mobile when not editing (toolbar merged into metadata strip) */}
            <div className={`px-2 py-2 border-b border-neutral-100 items-center justify-between shrink-0 relative ${isInline ? (isEditing ? 'flex' : 'hidden') : (isEditing ? 'flex' : 'hidden sm:flex')}`}>
              {/* LEFT: action icons */}
              <div className={`flex items-center gap-1 ${isEditing ? 'flex-1 justify-start' : ''}`}>
                {isEditing && (
                  <div className="flex items-center px-2">
                    <button
                      onClick={cancelEditing}
                      className="text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* RIGHT: mode label + close */}
              <div className={`flex items-center gap-1 ${isEditing ? 'flex-1 justify-end' : ''}`}>
                {false && rightMode === 'community' && (
                  <>
                    <button
                      onClick={() => onRightModeChange('metadata')}
                      className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 hover:text-neutral-700 transition-colors flex items-center gap-1 px-2 py-1"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      Info
                    </button>
                    <div className="w-px h-3 bg-neutral-200" />
                  </>
                )}
                {isEditing && (
                  <button
                    onClick={() => saveAllFields()}
                    disabled={isSavingField}
                    className="text-[11px] text-neutral-900 border border-neutral-300 px-3 py-1.5 rounded-full hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-all disabled:opacity-40"
                  >
                    {isSavingField ? 'Saving…' : 'Save'}
                  </button>
                )}
                {overflowMenu}
                {!isInline && <button onClick={onClose} className="hidden sm:flex w-9 h-9 items-center justify-center rounded-full text-neutral-300 hover:text-neutral-900 transition-colors text-lg leading-none">✕</button>}
              </div>
            </div>

            {/* Right panel scrollable content */}
            {rightMode === 'community' ? (
              <ArtworkDetailCommunityPanel
                community={community}
                userId={userId}
                hasNavigationFooter={hasNavigationFooter}
                commentInput={commentInput}
                isPublishing={isPublishing}
                onCommentInputChange={setCommentInput}
                onDeleteComment={handleDeleteComment}
                onPublishComment={handlePublishComment}
              />
            ) : (
              <ArtworkDetailMetadataPanel
                item={item}
                isEditing={isEditing}
                editValues={editValues}
                setEditValues={setEditValues}
                editTags={editTags}
                setEditTags={setEditTags}
                tagInput={tagInput}
                setTagInput={setTagInput}
                firstEditInputRef={firstEditInputRef}
                handleEditKeyDown={handleEditKeyDown}
                cancelEditing={cancelEditing}
                onNavigateToArtist={onNavigateToArtist}
                onNavigateToSession={onNavigateToSession}
                onUpdateClassification={onUpdateClassification}
                currentClassification={currentClassification}
                isInitialIdentifying={isInitialIdentifying}
                isReidentifying={isReidentifying}
                hasNavigationFooter={hasNavigationFooter}
                displayArtist={visibleArtist}
                displayTitle={visibleTitle}
                displayDate={visibleDate}
                displayMedium={visibleMedium}
                displayDescription={displayDescription}
                formatArtworkDisplayDate={formatArtworkDisplayDate}
                sessionMemberships={sessionMemberships}
                funFacts={funFacts}
                markdownComponents={markdownComponents}
                isFailureAlertDismissed={isFailureAlertDismissed}
                setIsFailureAlertDismissed={setIsFailureAlertDismissed}
                canRetryAnalysis={canRetryAnalysis}
                isRetryingAnalysis={isRetryingAnalysis}
                setIsRetryingAnalysis={setIsRetryingAnalysis}
                onRetryAnalysis={onRetryAnalysis}
              />
            )}
          </div>
        </div>

        {navigationItems && navigationItems.length > 1 && onNavigate && navigationIndex >= 0 && (
          <div className="absolute inset-x-0 bottom-0 z-40 hidden sm:block px-6 pb-5">
            <div className="mx-auto flex w-full max-w-[760px] items-center gap-3 rounded-[24px] border border-neutral-200 bg-white/96 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.10)] backdrop-blur">
              <button
                onClick={() => onNavigate('prev')}
                className="min-w-0 flex-1 text-left text-[13px] text-neutral-600 transition-colors hover:text-neutral-900"
              >
                <span className="mr-1 text-neutral-400">Prev:</span>
                <span className="truncate align-bottom inline-block max-w-full font-medium text-neutral-900">
                  {previousArtwork?.artworkName || previousArtwork?.artistName || 'Previous artwork'}
                </span>
              </button>
              <div className="shrink-0 text-[11px] font-mono tracking-[0.2em] text-neutral-400">
                {navigationIndex + 1}/{navigationItems.length}
              </div>
              <button
                onClick={() => onNavigate('next')}
                className="min-w-0 flex-1 text-right text-[13px] text-neutral-600 transition-colors hover:text-neutral-900"
              >
                <span className="mr-1 text-neutral-400">Next:</span>
                <span className="truncate align-bottom inline-block max-w-full font-medium text-neutral-900">
                  {nextArtwork?.artworkName || nextArtwork?.artistName || 'Next artwork'}
                </span>
              </button>
            </div>
          </div>
        )}
    </div>
  );

  if (isInline) {
    return (
      <>
        {mainDiv}
        {/* Lightbox — tap image on mobile to view full */}
        {lightboxOpen && createPortal(
          <div
            className="fixed inset-0 z-[var(--z-lightbox)] bg-black/95 flex items-center justify-center cursor-zoom-out"
            onClick={() => setLightboxOpen(false)}
          >
            <img
              src={item.url}
              className="max-w-full max-h-full object-contain"
              alt="Full view"
            />
            <button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
              onClick={() => setLightboxOpen(false)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[var(--z-overlay)] flex items-start justify-center sm:items-center sm:overflow-y-auto sm:p-12">
        <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-xl" onClick={onClose} />

        {!imageLoaded && (
          <div className="absolute z-10 flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-t-2 border-neutral-800 rounded-full animate-spin"></div>
            <p className="text-[10px] tracking-widest text-neutral-400 uppercase">Loading...</p>
          </div>
        )}

        {mainDiv}
      </div>

      {lightboxOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[var(--z-lightbox)] flex cursor-zoom-out items-center justify-center bg-black/95"
            onClick={() => setLightboxOpen(false)}
          >
            <img
              src={item.url}
              className="max-h-full max-w-full object-contain"
              alt="Full view"
            />
            <button
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              onClick={() => setLightboxOpen(false)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>,
          document.body,
        )}

      <IdentifyAgainModal
        open={showIdentifyAgainModal}
        values={identifyAgainValues}
        error={identifyAgainError}
        isSubmitting={isIdentifyingAgain}
        onValuesChange={updateIdentifyAgainValues}
        onClose={closeIdentifyAgainModal}
        onSubmit={() => void submitIdentifyAgain()}
      />
    </>
  );
};

export default ArtworkDetailModal;
