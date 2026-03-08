"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { CaseFile } from "@/types";

interface ImageViewerProps {
  images: CaseFile[];
  initialIndex?: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.25;

export function ImageViewer({ images, initialIndex = 0 }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1))
  );
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentFile = images[currentIndex];

  // Reset transform when image changes
  const resetTransform = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    resetTransform();
  }, [currentIndex, resetTransform]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((i) => Math.min(images.length - 1, i + 1));
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
      } else if (e.key === "-") {
        setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));
  }, []);

  // Mouse drag for pan (only when zoomed)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  // Touch drag
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (zoom <= 1) return;
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX - pan.x, y: t.clientY - pan.y };
    },
    [zoom, pan]
  );
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    setPan({ x: t.clientX - touchStartRef.current.x, y: t.clientY - touchStartRef.current.y });
  }, []);
  const handleTouchEnd = useCallback(() => { touchStartRef.current = null; }, []);

  // Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  if (!images.length) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-muted text-muted-foreground text-sm">
        No images available.
      </div>
    );
  }

  const isImageFile = currentFile && (
    currentFile.file_type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(currentFile.file_name)
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-2 bg-gray-950 rounded-xl overflow-hidden select-none">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900/80">
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title="Zoom out (−)"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-400 font-mono w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title="Zoom in (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetTransform}
            className="ml-1 px-2 py-1 rounded text-xs text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            title="Reset"
          >
            Reset
          </button>
        </div>

        {/* Rotate + fullscreen */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRotation((r) => r - 90)}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title="Rotate counterclockwise"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => r + 90)}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title="Rotate clockwise"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="relative overflow-hidden bg-gray-950 flex items-center justify-center"
        style={{ height: isFullscreen ? "calc(100vh - 120px)" : "400px", cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isImageFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={currentFile.file_url}
            alt={currentFile.file_name}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              setImgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transition: isDragging ? "none" : "transform 0.15s ease",
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div className="text-gray-400 text-sm text-center p-8">
            <p className="font-medium">Preview not available</p>
            <p className="text-xs mt-1 text-gray-500">{currentFile?.file_name}</p>
            <a
              href={currentFile?.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-primary underline text-xs"
            >
              Download file
            </a>
          </div>
        )}

        {/* Prev/Next overlays */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.min(images.length - 1, i + 1))}
              disabled={currentIndex === images.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Image info bar */}
      {currentFile && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/60 text-xs text-gray-400">
          <span className="truncate max-w-[60%]" title={currentFile.file_name}>
            {currentFile.file_name}
          </span>
          <div className="flex items-center gap-3 flex-shrink-0">
            {imgDimensions && (
              <span>{imgDimensions.w} × {imgDimensions.h}px</span>
            )}
            <span>{(currentFile.file_size / 1024).toFixed(0)} KB</span>
            <span>{currentIndex + 1} / {images.length}</span>
          </div>
        </div>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto">
          {images.map((file, i) => {
            const isImg =
              file.file_type.startsWith("image/") ||
              /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.file_name);
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  i === currentIndex
                    ? "border-primary"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
                aria-label={`View image ${i + 1}: ${file.file_name}`}
              >
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={file.file_url}
                    alt={file.file_name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-500 text-xs">
                    FILE
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
