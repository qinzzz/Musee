
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { GalleryItem, TagCoordinate, NeighborItem } from '../types';
import TagDefinitionModal from './TagDefinitionModal';

interface Props {
  items: GalleryItem[];
  cachedTagMap: Record<string, TagCoordinate>;
  neighborItems?: NeighborItem[];
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface TouchSnapshot {
  clientX: number;
  clientY: number;
}

const CANVAS_SIZE = 3000;
const VIEWPORT_INITIAL_X = 1500;
const VIEWPORT_INITIAL_Y = 1500;
const LAYOUT_RADIUS = 700;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;

const TopographyView: React.FC<Props> = ({ items, cachedTagMap, neighborItems = [] }) => {
  const [zoom, setZoom] = useState(0.8);
  const [offset, setOffset] = useState<Point>({
    x: -VIEWPORT_INITIAL_X + window.innerWidth / 2,
    y: -VIEWPORT_INITIAL_Y + window.innerHeight / 2
  });
  const [isPanning, setIsPanning] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [definingTag, setDefiningTag] = useState<string | null>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  // Refs to keep latest values accessible in non-reactive callbacks
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  const lastTouches = useRef<TouchSnapshot[]>([]);
  const isPanningRef = useRef(false);

  zoomRef.current = zoom;
  offsetRef.current = offset;
  isPanningRef.current = isPanning;

  // Non-passive wheel listener for zoom-toward-cursor on desktop
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentZoom = zoomRef.current;
      const currentOffset = offsetRef.current;

      const factor = e.deltaMode === 1 ? 0.1 : 0.001; // line vs pixel delta
      const rawDelta = -e.deltaY * factor;
      const scaleFactor = Math.exp(rawDelta * 0.8);
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * scaleFactor));

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const canvasX = (mouseX - currentOffset.x) / currentZoom;
      const canvasY = (mouseY - currentOffset.y) / currentZoom;

      setOffset({
        x: mouseX - canvasX * newZoom,
        y: mouseY - canvasY * newZoom,
      });
      setZoom(newZoom);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const internalTags = useMemo(() => Object.keys(cachedTagMap), [cachedTagMap]);

  const tagNodes = useMemo(() => {
    const center = CANVAS_SIZE / 2;

    const internalNodes = internalTags.map(tag => {
      const coord = cachedTagMap[tag] || { x: 0, y: 0 };
      return {
        tag,
        isExternal: false,
        pos: {
          x: center + (coord.x * LAYOUT_RADIUS),
          y: center + (coord.y * LAYOUT_RADIUS)
        }
      };
    });

    const externalNodes = neighborItems.map(neighbor => {
      const coord = neighbor.coordinate;
      return {
        tag: neighbor.mainKeyword,
        isExternal: true,
        pos: {
          x: center + (coord.x * LAYOUT_RADIUS),
          y: center + (coord.y * LAYOUT_RADIUS)
        }
      };
    });

    return [...internalNodes, ...externalNodes];
  }, [internalTags, cachedTagMap, neighborItems]);

  const itemPositions = useMemo(() => {
    return items.map(item => {
      const relevantNodes = tagNodes.filter(node => item.keywords.includes(node.tag));

      let finalPos: Point;
      if (relevantNodes.length === 0) {
        finalPos = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
      } else {
        const sumX = relevantNodes.reduce((acc, node) => acc + node.pos.x, 0);
        const sumY = relevantNodes.reduce((acc, node) => acc + node.pos.y, 0);
        finalPos = { x: sumX / relevantNodes.length, y: sumY / relevantNodes.length };
      }

      const jitterX = (parseInt(item.id.slice(0, 4), 36) % 60) - 30;
      const jitterY = (parseInt(item.id.slice(4, 8), 36) % 60) - 30;

      return {
        item,
        pos: { x: finalPos.x + jitterX, y: finalPos.y + jitterY }
      };
    });
  }, [items, tagNodes]);

  // ── Mouse handlers ───────────────────────────────────
  const handleMouseDown = () => setIsPanning(true);
  const handleMouseUp = () => setIsPanning(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setOffset(prev => ({
      x: prev.x + e.movementX,
      y: prev.y + e.movementY
    }));
  };

  // ── Touch handlers (mobile pan + pinch zoom) ─────────
  const handleTouchStart = (e: React.TouchEvent) => {
    // Don't prevent default here — let links/buttons still work
    if (e.touches.length === 1) {
      setIsPanning(true);
      lastTouches.current = [e.touches[0]];
    } else if (e.touches.length >= 2) {
      setIsPanning(false);
      lastTouches.current = [e.touches[0], e.touches[1]];
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent native scroll / browser zoom
    const currentZoom = zoomRef.current;
    const currentOffset = offsetRef.current;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const prev = lastTouches.current[0];
      if (prev) {
        const dx = touch.clientX - prev.clientX;
        const dy = touch.clientY - prev.clientY;
        setOffset({ x: currentOffset.x + dx, y: currentOffset.y + dy });
      }
      lastTouches.current = [touch];
    } else if (e.touches.length >= 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const p1 = lastTouches.current[0];
      const p2 = lastTouches.current[1];

      if (p1 && p2) {
        // Current and previous distances for pinch scale
        const prevDist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
        const currDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scaleFactor = prevDist > 0 ? currDist / prevDist : 1;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * scaleFactor));

        // Midpoint in screen coords — zoom toward it
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const prevMidX = (p1.clientX + p2.clientX) / 2;
        const prevMidY = (p1.clientY + p2.clientY) / 2;

        const canvasX = (midX - currentOffset.x) / currentZoom;
        const canvasY = (midY - currentOffset.y) / currentZoom;

        setOffset({
          x: midX - canvasX * newZoom + (midX - prevMidX),
          y: midY - canvasY * newZoom + (midY - prevMidY),
        });
        setZoom(newZoom);
      }

      lastTouches.current = [t1, t2];
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    lastTouches.current = [];
  };

  // ── Zoom buttons ─────────────────────────────────────
  const zoomBy = (factor: number) => {
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor));
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const canvasX = (cx - offsetRef.current.x) / zoomRef.current;
    const canvasY = (cy - offsetRef.current.y) / zoomRef.current;
    setOffset({ x: cx - canvasX * newZoom, y: cy - canvasY * newZoom });
    setZoom(newZoom);
  };

  const centerOnTag = (tag: string) => {
    const node = tagNodes.find(n => n.tag === tag);
    if (node) {
      setSelectedTag(tag);
      setSelectedArtworkId(null);
      setOffset({
        x: (-node.pos.x * zoom) + window.innerWidth / 2,
        y: (-node.pos.y * zoom) + window.innerHeight / 2
      });
    }
  };

  const handleArtworkClick = (id: string) => {
    setSelectedArtworkId(prev => prev === id ? null : id);
    setSelectedTag(null);
  };

  const activeArtwork = useMemo(() =>
    items.find(i => i.id === selectedArtworkId), [items, selectedArtworkId]
  );

  // Filtered tag lists for sidebar
  const filteredInternal = useMemo(() => {
    const q = tagSearch.toLowerCase();
    return tagNodes.filter(n => !n.isExternal && n.tag.toLowerCase().includes(q));
  }, [tagNodes, tagSearch]);

  const filteredExternal = useMemo(() => {
    const q = tagSearch.toLowerCase();
    return tagNodes.filter(n => n.isExternal && n.tag.toLowerCase().includes(q));
  }, [tagNodes, tagSearch]);

  const SIDEBAR_W = 220;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-[#fdfdfd] overflow-hidden cursor-grab active:cursor-grabbing select-none animate-in fade-in duration-700"
      style={{ touchAction: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >

      {/* Dot-grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(#000 1.5px, transparent 0)`,
          backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
          transform: `translate(${offset.x % (40 * zoom)}px, ${offset.y % (40 * zoom)}px)`
        }}
      />

      {/* ── Backdrop — tap/click outside sidebar to close ────── */}
      {sidebarOpen && (
        <div
          className="absolute inset-x-0 bottom-0 z-[15] bg-black/20"
          style={{ top: 88 }}
          onClick={() => setSidebarOpen(false)}
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        />
      )}

      {/* ── Collapsible Tag Sidebar ─────────────────────────── */}
      <div
        className={`absolute left-0 bottom-0 z-20 flex flex-col bg-white/97 backdrop-blur-md border-r border-neutral-100 transition-all duration-300 overflow-hidden`}
        style={{ width: sidebarOpen ? SIDEBAR_W : 0, top: 88 }}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        {/* Sidebar header */}
        <div className="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between border-b border-neutral-100">
          <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 font-bold">Tags</p>
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18"/>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 px-3 py-2 border-b border-neutral-50">
          <div className="flex items-center bg-neutral-100 rounded-lg px-2.5 py-1.5 gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              value={tagSearch}
              onChange={e => setTagSearch(e.target.value)}
              placeholder="Search tags…"
              className="flex-1 bg-transparent outline-none text-[11px] text-neutral-700 placeholder-neutral-400 min-w-0"
              onMouseDown={e => e.stopPropagation()}
            />
            {tagSearch && (
              <button onClick={() => setTagSearch('')} className="text-neutral-300 hover:text-neutral-500 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Tag list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
          {/* Your tags */}
          {filteredInternal.length > 0 && (
            <div>
              <p className="text-[8px] tracking-[0.25em] uppercase text-neutral-300 px-2 mb-1.5">
                Your Tags · {filteredInternal.length}
              </p>
              {filteredInternal.map(node => (
                <button
                  key={node.tag}
                  onClick={() => centerOnTag(node.tag)}
                  onDoubleClick={() => setDefiningTag(node.tag)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-[11px] tracking-wide ${
                    selectedTag === node.tag
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedTag === node.tag ? 'bg-white' : 'bg-neutral-300'}`} />
                  <span className="truncate uppercase">{node.tag}</span>
                </button>
              ))}
            </div>
          )}

          {/* External / neighboring tags */}
          {filteredExternal.length > 0 && (
            <div>
              <p className="text-[8px] tracking-[0.25em] uppercase text-amber-400 px-2 mb-1.5">
                Neighboring · {filteredExternal.length}
              </p>
              {filteredExternal.map(node => (
                <button
                  key={node.tag}
                  onClick={() => centerOnTag(node.tag)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-[11px] tracking-wide ${
                    selectedTag === node.tag
                      ? 'bg-amber-100 text-amber-900'
                      : 'text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <span className="text-amber-400 shrink-0">◈</span>
                  <span className="truncate uppercase">{node.tag}</span>
                </button>
              ))}
            </div>
          )}

          {filteredInternal.length === 0 && filteredExternal.length === 0 && (
            <p className="text-[10px] text-neutral-300 px-2 pt-2">No tags match "{tagSearch}"</p>
          )}
        </div>

        {/* Reset button at bottom */}
        {(selectedTag || selectedArtworkId) && (
          <div className="shrink-0 px-3 py-3 border-t border-neutral-100">
            <button
              onClick={() => { setSelectedTag(null); setSelectedArtworkId(null); }}
              className="w-full text-[9px] tracking-widest uppercase text-neutral-400 hover:text-neutral-700 py-1 transition-colors"
            >
              Reset View
            </button>
          </div>
        )}
      </div>

      {/* ── Top-left: sidebar toggle ────────────────────────── */}
      {!sidebarOpen && (
        <div
          className="absolute top-[100px] left-4 z-10 pointer-events-auto"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            title="Show tags"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur border border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:bg-white shadow-sm transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Zoom controls ───────────────────────────────────── */}
      <div
        className="absolute bottom-10 right-10 z-10 flex flex-col gap-1"
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <button
          onClick={() => zoomBy(1.3)}
          title="Zoom in"
          className="w-9 h-9 bg-white/80 backdrop-blur border border-neutral-200 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-sm transition-all active:scale-95 text-lg leading-none"
        >
          +
        </button>
        <button
          onClick={() => zoomBy(1 / 1.3)}
          title="Zoom out"
          className="w-9 h-9 bg-white/80 backdrop-blur border border-neutral-200 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white shadow-sm transition-all active:scale-95 text-lg leading-none"
        >
          −
        </button>
        <div className="text-[8px] text-neutral-300 tracking-widest text-center mt-0.5 uppercase">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* ── Pannable canvas ─────────────────────────────────── */}
      <div
        className="absolute transition-transform duration-75 ease-out will-change-transform"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <svg width={CANVAS_SIZE} height={CANVAS_SIZE} className="absolute inset-0 pointer-events-none">
          {itemPositions.map(pos =>
            pos.item.keywords.map(kw => {
              const tagNode = tagNodes.find(n => n.tag === kw);
              if (!tagNode) return null;

              const isTagHighlighted = selectedTag === kw;
              const isArtworkSelected = selectedArtworkId === pos.item.id;
              const isActiveFilament = isTagHighlighted || isArtworkSelected;
              const isDimmed = (selectedTag || selectedArtworkId) && !isActiveFilament;

              return (
                <line
                  key={`${pos.item.id}-${kw}`}
                  x1={pos.pos.x} y1={pos.pos.y}
                  x2={tagNode.pos.x} y2={tagNode.pos.y}
                  stroke={tagNode.isExternal ? '#fbbf24' : (isActiveFilament ? pos.item.vibe.accentColor : '#000')}
                  strokeWidth={isActiveFilament ? 2.5 : 0.6}
                  strokeDasharray={tagNode.isExternal ? '4 2' : (isActiveFilament ? 'none' : '2 4')}
                  className="transition-all duration-500"
                  style={{ opacity: isActiveFilament ? 0.9 : isDimmed ? 0.01 : 0.1 }}
                />
              );
            })
          )}
        </svg>

        {tagNodes.map(node => {
          const isRelatedToArtwork = activeArtwork?.keywords.includes(node.tag);
          const isActive = selectedTag === node.tag || isRelatedToArtwork;

          return (
            <div
              key={node.tag}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group pointer-events-auto cursor-pointer"
              style={{ left: node.pos.x, top: node.pos.y }}
              onClick={() => centerOnTag(node.tag)}
              onDoubleClick={() => setDefiningTag(node.tag)}
            >
              <div className={`relative flex items-center justify-center transition-all duration-500 mb-4 ${
                node.isExternal ? 'w-10 h-10' : 'w-3 h-3'
              }`}>
                {node.isExternal && (
                  <>
                    <div className="absolute inset-0 bg-amber-400/20 rounded-full animate-ping" />
                    <div className="absolute inset-2 border border-amber-400/50 rounded-full animate-pulse" />
                  </>
                )}
                <div className={`rounded-full border-2 transition-all duration-500 ${
                  node.isExternal
                    ? 'w-4 h-4 bg-amber-500 border-white rotate-45'
                    : (isActive
                      ? 'w-4 h-4 bg-neutral-900 border-white scale-150 shadow-[0_0_20px_rgba(0,0,0,0.3)]'
                      : 'w-3 h-3 bg-white border-neutral-200 group-hover:scale-125')
                } ${isRelatedToArtwork ? 'animate-pulse ring-4 ring-neutral-900/10' : ''}`} />
              </div>

              <div className={`px-3 py-1.5 bg-white/95 backdrop-blur rounded-full border shadow-sm transition-all whitespace-nowrap ${
                node.isExternal
                  ? 'border-amber-200 z-0'
                  : (isActive ? 'scale-110 border-neutral-900 z-10' : 'opacity-60 group-hover:opacity-100 border-neutral-100')
              }`}>
                <span className={`text-[9px] tracking-[0.3em] uppercase font-bold ${
                  node.isExternal ? 'text-amber-700' : 'text-neutral-900'
                } ${isRelatedToArtwork ? 'drop-shadow-sm' : ''}`}>
                  {node.tag}
                </span>
                {node.isExternal && (
                   <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[6px] tracking-[0.3em] uppercase text-amber-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                     External Resonance
                   </div>
                )}
              </div>
            </div>
          );
        })}

        {itemPositions.map(({ item, pos }) => {
          const isHighlighted = selectedTag && item.keywords.includes(selectedTag);
          const isSelected = selectedArtworkId === item.id;
          const isDimmed = (selectedTag || selectedArtworkId) && !isHighlighted && !isSelected;

          return (
            <div
              key={item.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700 pointer-events-auto ${isDimmed ? 'opacity-5 scale-50 blur-[4px]' : 'opacity-100 z-10'}`}
              style={{ left: pos.x, top: pos.y }}
              onClick={(e) => { e.stopPropagation(); handleArtworkClick(item.id); }}
            >
              <div
                className={`relative p-1.5 shadow-2xl transition-all duration-500 hover:scale-150 hover:z-50 group/card cursor-pointer ${isSelected ? 'scale-125 ring-2 ring-neutral-900 ring-offset-4' : ''}`}
                style={{
                  backgroundColor: item.vibe.backgroundColor,
                  borderRadius: item.vibe.borderRadius,
                  border: (isHighlighted || isSelected) ? `2px solid ${item.vibe.accentColor}` : `1px solid rgba(0,0,0,0.03)`
                }}
              >
                <div className="w-16 h-24 overflow-hidden rounded-sm bg-neutral-100">
                  <img src={item.url} className="w-full h-full object-cover" alt="Thumb" draggable={false} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {definingTag && (
        <TagDefinitionModal tag={definingTag} onClose={() => setDefiningTag(null)} />
      )}
    </div>
  );
};

export default TopographyView;
