'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  MessageCircle, Check, Square, MapPin, Circle, ArrowRight, Pencil,
  Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Volume2, VolumeX
} from 'lucide-react';
import * as fabric from 'fabric';

// Tool types
type ToolType = 'pin' | 'rectangle' | 'circle' | 'arrow' | 'freehand';

interface Annotation {
  id: string;
  type: string;
  x: number | null;
  y: number | null;
  width?: number | null;
  height?: number | null;
  pathData?: string | null;
  timestamp?: number | null;
  content: string;
  resolved: boolean;
  color: string;
  author: {
    id: string;
    displayName: string | null;
    avatar: string | null;
  };
  replies: Array<{
    id: string;
    content: string;
    author: {
      id: string;
      displayName: string | null;
      avatar: string | null;
    };
  }>;
  createdAt: string;
}

interface VideoReviewerProps {
  src: string;
  annotations: Annotation[];
  onAnnotationCreate?: (data: { 
    type: string; 
    x: number; 
    y: number; 
    width?: number;
    height?: number;
    pathData?: string;
    timestamp?: number;
    content: string;
    color: string;
  }) => void;
  onAnnotationSelect?: (id: string) => void;
  selectedAnnotationId?: string | null;
  readOnly?: boolean;
}

// Timestamp tolerance for showing annotations (±0.5 seconds)
const TIMESTAMP_TOLERANCE = 0.5;

export function VideoReviewer({
  src,
  annotations,
  onAnnotationCreate,
  onAnnotationSelect,
  selectedAnnotationId,
  readOnly = false,
}: VideoReviewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  
  // Tool selection - with localStorage persistence
  const [currentTool, setCurrentToolState] = useState<ToolType>('pin');
  
  // Color selection - with localStorage persistence
  const [selectedColor, setSelectedColorState] = useState('#FF3B30');
  
  // Video state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  
  // Load saved preferences from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const savedTool = localStorage.getItem('reviewTool');
      if (savedTool && ['pin', 'rectangle', 'circle', 'arrow', 'freehand'].includes(savedTool)) {
        setCurrentToolState(savedTool as ToolType);
      }
      
      const savedColor = localStorage.getItem('reviewColor');
      if (savedColor && /^#[0-9A-Fa-f]{6}$/.test(savedColor)) {
        setSelectedColorState(savedColor);
      }
    } catch (e) {
      console.warn('Could not load review preferences from localStorage:', e);
    }
  }, []);
  
  // Wrapper functions to persist changes to localStorage
  const setCurrentTool = (tool: ToolType) => {
    setCurrentToolState(tool);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('reviewTool', tool);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  };
  
  const setSelectedColor = (color: string) => {
    setSelectedColorState(color);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('reviewColor', color);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  };
  
  const colorSwatches = [
    { color: '#FF3B30', name: 'Red' },
    { color: '#FF9500', name: 'Orange' },
    { color: '#FFCC00', name: 'Yellow' },
    { color: '#34C759', name: 'Green' },
    { color: '#007AFF', name: 'Blue' },
    { color: '#AF52DE', name: 'Purple' },
  ];
  
  // Annotation creation state
  const [isAddingAnnotation, setIsAddingAnnotation] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<{
    type: ToolType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    pathData?: string;
    timestamp?: number;
  } | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const [newComment, setNewComment] = useState('');
  
  // Hover/selection state
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);
  
  const [mounted, setMounted] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  
  // Drawing state refs
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentRectRef = useRef<fabric.Rect | null>(null);
  const currentEllipseRef = useRef<fabric.Ellipse | null>(null);
  const currentArrowRef = useRef<fabric.Group | null>(null);
  const currentFreehandRef = useRef<fabric.Path | null>(null);
  const freehandPointsRef = useRef<{ x: number; y: number }[]>([]);

  // Filter annotations by current timestamp
  const visibleAnnotations = annotations.filter(annotation => {
    if (annotation.timestamp === null || annotation.timestamp === undefined) {
      // Show annotations without timestamp always (legacy behavior)
      return true;
    }
    return Math.abs(annotation.timestamp - currentTime) <= TIMESTAMP_TOLERANCE;
  });

  // Ensure we're on client for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle video load
  const handleVideoLoad = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    setDuration(video.duration);
    setVideoDimensions({
      width: video.clientWidth,
      height: video.clientHeight,
    });
    setVideoLoaded(true);
  }, []);

  // Handle video time update
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  }, []);

  // Video controls
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.max(0, Math.min(time, duration));
    setCurrentTime(video.currentTime);
  }, [duration]);

  const frameStep = useCallback((direction: 'forward' | 'backward') => {
    const video = videoRef.current;
    if (!video) return;
    
    // Assume ~30fps, so 1 frame ≈ 0.033 seconds
    const frameTime = 1 / 30;
    const newTime = direction === 'forward' 
      ? video.currentTime + frameTime 
      : video.currentTime - frameTime;
    
    video.currentTime = Math.max(0, Math.min(newTime, duration));
    setCurrentTime(video.currentTime);
  }, [duration]);

  const skipSeconds = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newTime = video.currentTime + seconds;
    video.currentTime = Math.max(0, Math.min(newTime, duration));
    setCurrentTime(video.currentTime);
  }, [duration]);

  // Pause video when starting to draw
  const pauseForDrawing = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Format time as MM:SS.ms
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            frameStep('backward');
          } else {
            skipSeconds(-5);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            frameStep('forward');
          } else {
            skipSeconds(5);
          }
          break;
        case 'm':
          toggleMute();
          break;
        case ',':
          e.preventDefault();
          frameStep('backward');
          break;
        case '.':
          e.preventDefault();
          frameStep('forward');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleMute, frameStep, skipSeconds]);

  // Initialize Fabric.js canvas
  useEffect(() => {
    console.log('[Video Fabric] Init check:', { canvasRef: !!canvasRef.current, videoLoaded, videoDimensions });
    if (!canvasRef.current || !videoLoaded || !videoDimensions) return;

    // Don't initialize if dimensions are 0 (element is off-screen or not visible)
    if (videoDimensions.width <= 0 || videoDimensions.height <= 0) {
      console.log('[Video Fabric] Skipping init - dimensions are 0');
      return;
    }

    console.log('[Video Fabric] Creating canvas with dimensions:', videoDimensions);
    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: false,
      renderOnAddRemove: true,
    });
    
    canvas.setDimensions({
      width: videoDimensions.width,
      height: videoDimensions.height,
    });

    const wrapperEl = canvas.wrapperEl;
    if (wrapperEl) {
      wrapperEl.style.zIndex = '30';
      wrapperEl.style.position = 'absolute';
      wrapperEl.style.top = '0';
      wrapperEl.style.left = '0';
    }

    fabricCanvasRef.current = canvas;
    setCanvasReady(true);

    return () => {
      setCanvasReady(false);
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [videoLoaded, videoDimensions]);

  // Update wrapper z-index based on current tool
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    
    const wrapperEl = canvas.wrapperEl;
    if (wrapperEl) {
      const zIndex = currentTool === 'pin' ? '0' : '30';
      wrapperEl.style.zIndex = zIndex;
    }
  }, [currentTool, canvasReady]);

  // Draw existing annotations on canvas (only visible ones based on timestamp)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !videoDimensions) return;

    // Clear existing objects
    const objects = canvas.getObjects();
    objects.forEach(obj => {
      if (obj !== currentRectRef.current && obj !== currentEllipseRef.current && 
          obj !== currentArrowRef.current && obj !== currentFreehandRef.current) {
        canvas.remove(obj);
      }
    });

    // Draw visible annotations (filtered by timestamp)
    visibleAnnotations.forEach(annotation => {
      if (annotation.type === 'rectangle' && 
          annotation.x !== null && 
          annotation.y !== null && 
          annotation.width && 
          annotation.height) {
        
        const isSelected = selectedAnnotationId === annotation.id;
        const isHovered = hoveredAnnotation === annotation.id;
        
        const rect = new fabric.Rect({
          left: (annotation.x / 100) * videoDimensions.width,
          top: (annotation.y / 100) * videoDimensions.height,
          width: (annotation.width / 100) * videoDimensions.width,
          height: (annotation.height / 100) * videoDimensions.height,
          fill: 'transparent',
          stroke: annotation.resolved ? '#22c55e' : annotation.color,
          strokeWidth: isSelected || isHovered ? 3 : 2,
          selectable: false,
          evented: true,
          data: { annotationId: annotation.id },
        });

        rect.on('mousedown', (e) => {
          e.e.stopPropagation();
          onAnnotationSelect?.(annotation.id);
        });
        
        rect.on('mouseover', () => {
          setHoveredAnnotation(annotation.id);
          canvas.renderAll();
        });
        
        rect.on('mouseout', () => {
          setHoveredAnnotation(null);
          canvas.renderAll();
        });

        canvas.add(rect);
      }

      if (annotation.type === 'circle' && 
          annotation.x !== null && 
          annotation.y !== null && 
          annotation.width && 
          annotation.height) {
        
        const isSelected = selectedAnnotationId === annotation.id;
        const isHovered = hoveredAnnotation === annotation.id;
        
        const centerX = (annotation.x / 100) * videoDimensions.width;
        const centerY = (annotation.y / 100) * videoDimensions.height;
        const radiusX = ((annotation.width / 100) * videoDimensions.width) / 2;
        const radiusY = ((annotation.height / 100) * videoDimensions.height) / 2;
        
        const ellipse = new fabric.Ellipse({
          left: centerX - radiusX,
          top: centerY - radiusY,
          rx: radiusX,
          ry: radiusY,
          fill: 'transparent',
          stroke: annotation.resolved ? '#22c55e' : annotation.color,
          strokeWidth: isSelected || isHovered ? 3 : 2,
          selectable: false,
          evented: true,
          data: { annotationId: annotation.id },
        });

        ellipse.on('mousedown', (e) => {
          e.e.stopPropagation();
          onAnnotationSelect?.(annotation.id);
        });
        
        ellipse.on('mouseover', () => {
          setHoveredAnnotation(annotation.id);
          canvas.renderAll();
        });
        
        ellipse.on('mouseout', () => {
          setHoveredAnnotation(null);
          canvas.renderAll();
        });

        canvas.add(ellipse);
      }

      if (annotation.type === 'arrow' && 
          annotation.x !== null && 
          annotation.y !== null && 
          annotation.pathData) {
        
        const isSelected = selectedAnnotationId === annotation.id;
        const isHovered = hoveredAnnotation === annotation.id;
        
        try {
          const endPoint = JSON.parse(annotation.pathData);
          const startX = (annotation.x / 100) * videoDimensions.width;
          const startY = (annotation.y / 100) * videoDimensions.height;
          const endX = (endPoint.endX / 100) * videoDimensions.width;
          const endY = (endPoint.endY / 100) * videoDimensions.height;
          
          const strokeColor = annotation.resolved ? '#22c55e' : annotation.color;
          const strokeWidth = isSelected || isHovered ? 3 : 2;
          
          const line = new fabric.Line([startX, startY, endX, endY], {
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            evented: false,
          });
          
          const angle = Math.atan2(endY - startY, endX - startX);
          const headLength = 15;
          const headAngle = Math.PI / 6;
          
          const arrowHead = new fabric.Polygon([
            { x: endX, y: endY },
            { x: endX - headLength * Math.cos(angle - headAngle), y: endY - headLength * Math.sin(angle - headAngle) },
            { x: endX - headLength * Math.cos(angle + headAngle), y: endY - headLength * Math.sin(angle + headAngle) },
          ], {
            fill: strokeColor,
            stroke: strokeColor,
            strokeWidth: 1,
            selectable: false,
            evented: false,
          });
          
          const arrowGroup = new fabric.Group([line, arrowHead], {
            selectable: false,
            evented: true,
          });
          
          (arrowGroup as fabric.Group & { data?: { annotationId: string } }).data = { annotationId: annotation.id };
          
          arrowGroup.on('mousedown', (e) => {
            e.e.stopPropagation();
            onAnnotationSelect?.(annotation.id);
          });
          
          arrowGroup.on('mouseover', () => {
            setHoveredAnnotation(annotation.id);
            canvas.renderAll();
          });
          
          arrowGroup.on('mouseout', () => {
            setHoveredAnnotation(null);
            canvas.renderAll();
          });
          
          canvas.add(arrowGroup);
        } catch (e) {
          console.error('Failed to parse arrow pathData:', e);
        }
      }

      if (annotation.type === 'freehand' && 
          annotation.x !== null && 
          annotation.y !== null && 
          annotation.pathData) {
        
        const isSelected = selectedAnnotationId === annotation.id;
        const isHovered = hoveredAnnotation === annotation.id;
        
        try {
          const points: { x: number; y: number }[] = JSON.parse(annotation.pathData);
          if (points.length < 2) return;
          
          const strokeColor = annotation.resolved ? '#22c55e' : annotation.color;
          const strokeWidth = isSelected || isHovered ? 4 : 3;
          
          let pathString = `M ${(points[0].x / 100) * videoDimensions.width} ${(points[0].y / 100) * videoDimensions.height}`;
          for (let i = 1; i < points.length; i++) {
            pathString += ` L ${(points[i].x / 100) * videoDimensions.width} ${(points[i].y / 100) * videoDimensions.height}`;
          }
          
          const path = new fabric.Path(pathString, {
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            selectable: false,
            evented: true,
          });
          
          (path as fabric.Path & { data?: { annotationId: string } }).data = { annotationId: annotation.id };
          
          path.on('mousedown', (e) => {
            e.e.stopPropagation();
            onAnnotationSelect?.(annotation.id);
          });
          
          path.on('mouseover', () => {
            setHoveredAnnotation(annotation.id);
            canvas.renderAll();
          });
          
          path.on('mouseout', () => {
            setHoveredAnnotation(null);
            canvas.renderAll();
          });
          
          canvas.add(path);
        } catch (e) {
          console.error('Failed to parse freehand pathData:', e);
        }
      }
    });

    canvas.renderAll();
  }, [visibleAnnotations, selectedAnnotationId, hoveredAnnotation, videoDimensions, onAnnotationSelect]);

  // Rectangle drawing handlers
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || readOnly || currentTool !== 'rectangle') return;

    const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
      if (isAddingAnnotation) return;
      
      pauseForDrawing();
      
      const pointer = opt.scenePoint;
      isDrawingRef.current = true;
      drawStartRef.current = { x: pointer.x, y: pointer.y };

      const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      const rect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        originX: 'left',
        originY: 'top',
        fill: hexToRgba(selectedColor, 0.1),
        stroke: selectedColor,
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });

      currentRectRef.current = rect;
      canvas.add(rect);
    };

    const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawingRef.current || !drawStartRef.current || !currentRectRef.current) return;

      const pointer = opt.scenePoint;
      const rect = currentRectRef.current;

      const left = Math.min(drawStartRef.current.x, pointer.x);
      const top = Math.min(drawStartRef.current.y, pointer.y);
      const width = Math.abs(pointer.x - drawStartRef.current.x);
      const height = Math.abs(pointer.y - drawStartRef.current.y);

      rect.set({ left, top, width, height });
      canvas.renderAll();
    };

    const handleMouseUp = () => {
      if (!isDrawingRef.current || !drawStartRef.current || !currentRectRef.current || !videoDimensions) {
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      const rect = currentRectRef.current;
      const width = rect.width || 0;
      const height = rect.height || 0;

      if (width < 10 || height < 10) {
        canvas.remove(rect);
        currentRectRef.current = null;
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      const xPercent = ((rect.left || 0) / videoDimensions.width) * 100;
      const yPercent = ((rect.top || 0) / videoDimensions.height) * 100;
      const widthPercent = (width / videoDimensions.width) * 100;
      const heightPercent = (height / videoDimensions.height) * 100;

      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const popupWidth = 280;
        const rectCenterX = containerRect.left + (rect.left || 0) + width / 2;
        const rectBottomY = containerRect.top + (rect.top || 0) + height + 10;
        
        const adjustedLeft = rectCenterX + popupWidth / 2 > window.innerWidth
          ? window.innerWidth - popupWidth - 20
          : Math.max(20, rectCenterX - popupWidth / 2);

        setPopupPosition({ 
          top: Math.min(rectBottomY, window.innerHeight - 200), 
          left: adjustedLeft 
        });
      }

      setPendingAnnotation({
        type: 'rectangle',
        x: xPercent,
        y: yPercent,
        width: widthPercent,
        height: heightPercent,
        timestamp: currentTime,
      });
      setIsAddingAnnotation(true);
      setNewComment('');
      
      rect.set({ stroke: '#3B82F6', strokeDashArray: [5, 5] });
      canvas.renderAll();

      isDrawingRef.current = false;
      drawStartRef.current = null;
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [currentTool, readOnly, videoDimensions, isAddingAnnotation, selectedColor, canvasReady, pauseForDrawing, currentTime]);

  // Circle drawing handlers
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    console.log('[Video Circle] useEffect:', { canvas: !!canvas, readOnly, currentTool, canvasReady });
    if (!canvas || readOnly || currentTool !== 'circle') return;

    console.log('[Video Circle] Attaching handlers to canvas');
    const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
      console.log('[Video Circle] mousedown fired!');
      if (isAddingAnnotation) return;
      
      pauseForDrawing();
      
      const pointer = opt.scenePoint;
      isDrawingRef.current = true;
      drawStartRef.current = { x: pointer.x, y: pointer.y };

      const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      const ellipse = new fabric.Ellipse({
        left: pointer.x,
        top: pointer.y,
        rx: 0,
        ry: 0,
        originX: 'left',
        originY: 'top',
        fill: hexToRgba(selectedColor, 0.1),
        stroke: selectedColor,
        strokeWidth: 2,
        selectable: false,
        evented: false,
      });

      currentEllipseRef.current = ellipse;
      canvas.add(ellipse);
    };

    const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawingRef.current || !drawStartRef.current || !currentEllipseRef.current) return;

      const pointer = opt.scenePoint;
      const ellipse = currentEllipseRef.current;

      const left = Math.min(drawStartRef.current.x, pointer.x);
      const top = Math.min(drawStartRef.current.y, pointer.y);
      const width = Math.abs(pointer.x - drawStartRef.current.x);
      const height = Math.abs(pointer.y - drawStartRef.current.y);

      ellipse.set({ left, top, rx: width / 2, ry: height / 2 });
      canvas.renderAll();
    };

    const handleMouseUp = () => {
      if (!isDrawingRef.current || !drawStartRef.current || !currentEllipseRef.current || !videoDimensions) {
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      const ellipse = currentEllipseRef.current;
      const rx = ellipse.rx || 0;
      const ry = ellipse.ry || 0;
      const width = rx * 2;
      const height = ry * 2;

      if (width < 10 || height < 10) {
        canvas.remove(ellipse);
        currentEllipseRef.current = null;
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      const centerX = ((ellipse.left || 0) + rx) / videoDimensions.width * 100;
      const centerY = ((ellipse.top || 0) + ry) / videoDimensions.height * 100;
      const widthPercent = (width / videoDimensions.width) * 100;
      const heightPercent = (height / videoDimensions.height) * 100;

      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const popupWidth = 280;
        const ellipseCenterX = containerRect.left + (ellipse.left || 0) + rx;
        const ellipseBottomY = containerRect.top + (ellipse.top || 0) + height + 10;
        
        const adjustedLeft = ellipseCenterX + popupWidth / 2 > window.innerWidth
          ? window.innerWidth - popupWidth - 20
          : Math.max(20, ellipseCenterX - popupWidth / 2);

        setPopupPosition({ 
          top: Math.min(ellipseBottomY, window.innerHeight - 200), 
          left: adjustedLeft 
        });
      }

      setPendingAnnotation({
        type: 'circle',
        x: centerX,
        y: centerY,
        width: widthPercent,
        height: heightPercent,
        timestamp: currentTime,
      });
      setIsAddingAnnotation(true);
      setNewComment('');
      
      ellipse.set({ stroke: '#3B82F6', strokeDashArray: [5, 5] });
      canvas.renderAll();

      isDrawingRef.current = false;
      drawStartRef.current = null;
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [currentTool, readOnly, videoDimensions, isAddingAnnotation, selectedColor, canvasReady, pauseForDrawing, currentTime]);

  // Arrow drawing handlers
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || readOnly || currentTool !== 'arrow') return;

    const createArrowGroup = (startX: number, startY: number, endX: number, endY: number, color: string, strokeWidth: number) => {
      const line = new fabric.Line([startX, startY, endX, endY], {
        stroke: color,
        strokeWidth: strokeWidth,
        selectable: false,
        evented: false,
      });

      const angle = Math.atan2(endY - startY, endX - startX);
      const headLength = 15;
      const headAngle = Math.PI / 6;

      const arrowHead = new fabric.Polygon([
        { x: endX, y: endY },
        { x: endX - headLength * Math.cos(angle - headAngle), y: endY - headLength * Math.sin(angle - headAngle) },
        { x: endX - headLength * Math.cos(angle + headAngle), y: endY - headLength * Math.sin(angle + headAngle) },
      ], {
        fill: color,
        stroke: color,
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });

      return new fabric.Group([line, arrowHead], {
        selectable: false,
        evented: false,
      });
    };

    const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
      if (isAddingAnnotation) return;
      
      pauseForDrawing();
      
      const pointer = opt.scenePoint;
      isDrawingRef.current = true;
      drawStartRef.current = { x: pointer.x, y: pointer.y };

      const arrow = createArrowGroup(pointer.x, pointer.y, pointer.x, pointer.y, selectedColor, 2);
      currentArrowRef.current = arrow;
      canvas.add(arrow);
    };

    const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawingRef.current || !drawStartRef.current || !currentArrowRef.current) return;

      const pointer = opt.scenePoint;
      
      canvas.remove(currentArrowRef.current);
      const arrow = createArrowGroup(drawStartRef.current.x, drawStartRef.current.y, pointer.x, pointer.y, selectedColor, 2);
      currentArrowRef.current = arrow;
      canvas.add(arrow);
      canvas.renderAll();
    };

    const handleMouseUp = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawingRef.current || !drawStartRef.current || !currentArrowRef.current || !videoDimensions) {
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      const pointer = opt.scenePoint;
      const length = Math.sqrt(
        Math.pow(pointer.x - drawStartRef.current.x, 2) + Math.pow(pointer.y - drawStartRef.current.y, 2)
      );

      if (length < 20) {
        canvas.remove(currentArrowRef.current);
        currentArrowRef.current = null;
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      const startXPercent = (drawStartRef.current.x / videoDimensions.width) * 100;
      const startYPercent = (drawStartRef.current.y / videoDimensions.height) * 100;
      const endXPercent = (pointer.x / videoDimensions.width) * 100;
      const endYPercent = (pointer.y / videoDimensions.height) * 100;

      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const popupWidth = 280;
        const arrowEndX = containerRect.left + pointer.x;
        const arrowEndY = containerRect.top + pointer.y + 10;
        
        const adjustedLeft = arrowEndX + popupWidth / 2 > window.innerWidth
          ? window.innerWidth - popupWidth - 20
          : Math.max(20, arrowEndX - popupWidth / 2);

        setPopupPosition({ 
          top: Math.min(arrowEndY, window.innerHeight - 200), 
          left: adjustedLeft 
        });
      }

      setPendingAnnotation({
        type: 'arrow',
        x: startXPercent,
        y: startYPercent,
        pathData: JSON.stringify({ endX: endXPercent, endY: endYPercent }),
        timestamp: currentTime,
      });
      setIsAddingAnnotation(true);
      setNewComment('');
      
      canvas.remove(currentArrowRef.current);
      const pendingArrow = createArrowGroup(drawStartRef.current.x, drawStartRef.current.y, pointer.x, pointer.y, '#3B82F6', 2);
      currentArrowRef.current = pendingArrow;
      canvas.add(pendingArrow);
      canvas.renderAll();

      isDrawingRef.current = false;
      drawStartRef.current = null;
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [currentTool, readOnly, videoDimensions, isAddingAnnotation, selectedColor, canvasReady, pauseForDrawing, currentTime]);

  // Freehand drawing handlers
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || readOnly || currentTool !== 'freehand') return;

    const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
      if (isAddingAnnotation) return;
      
      pauseForDrawing();
      
      const pointer = opt.scenePoint;
      isDrawingRef.current = true;
      drawStartRef.current = { x: pointer.x, y: pointer.y };
      
      freehandPointsRef.current = [{ x: pointer.x, y: pointer.y }];

      const path = new fabric.Path(`M ${pointer.x} ${pointer.y}`, {
        fill: 'transparent',
        stroke: selectedColor,
        strokeWidth: 3,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: false,
        evented: false,
      });

      currentFreehandRef.current = path;
      canvas.add(path);
    };

    const handleMouseMove = (opt: fabric.TPointerEventInfo) => {
      if (!isDrawingRef.current || !currentFreehandRef.current) return;

      const pointer = opt.scenePoint;
      
      freehandPointsRef.current.push({ x: pointer.x, y: pointer.y });
      
      const points = freehandPointsRef.current;
      let pathString = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        pathString += ` L ${points[i].x} ${points[i].y}`;
      }
      
      canvas.remove(currentFreehandRef.current);
      const path = new fabric.Path(pathString, {
        fill: 'transparent',
        stroke: selectedColor,
        strokeWidth: 3,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: false,
        evented: false,
      });
      currentFreehandRef.current = path;
      canvas.add(path);
      canvas.renderAll();
    };

    const handleMouseUp = () => {
      if (!isDrawingRef.current || !currentFreehandRef.current || !videoDimensions) {
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      const points = freehandPointsRef.current;

      if (points.length < 3) {
        canvas.remove(currentFreehandRef.current);
        currentFreehandRef.current = null;
        freehandPointsRef.current = [];
        isDrawingRef.current = false;
        drawStartRef.current = null;
        return;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }

      const percentPoints = points.map(p => ({
        x: (p.x / videoDimensions.width) * 100,
        y: (p.y / videoDimensions.height) * 100,
      }));

      const xPercent = (minX / videoDimensions.width) * 100;
      const yPercent = (minY / videoDimensions.height) * 100;

      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const popupWidth = 280;
        const centerX = containerRect.left + (minX + maxX) / 2;
        const bottomY = containerRect.top + maxY + 10;
        
        const adjustedLeft = centerX + popupWidth / 2 > window.innerWidth
          ? window.innerWidth - popupWidth - 20
          : Math.max(20, centerX - popupWidth / 2);

        setPopupPosition({ 
          top: Math.min(bottomY, window.innerHeight - 200), 
          left: adjustedLeft 
        });
      }

      setPendingAnnotation({
        type: 'freehand',
        x: xPercent,
        y: yPercent,
        pathData: JSON.stringify(percentPoints),
        timestamp: currentTime,
      });
      setIsAddingAnnotation(true);
      setNewComment('');
      
      canvas.remove(currentFreehandRef.current);
      let pathString = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        pathString += ` L ${points[i].x} ${points[i].y}`;
      }
      const pendingPath = new fabric.Path(pathString, {
        fill: 'transparent',
        stroke: '#3B82F6',
        strokeWidth: 3,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        strokeDashArray: [5, 5],
        selectable: false,
        evented: false,
      });
      currentFreehandRef.current = pendingPath;
      canvas.add(pendingPath);
      canvas.renderAll();

      isDrawingRef.current = false;
      drawStartRef.current = null;
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [currentTool, readOnly, videoDimensions, isAddingAnnotation, selectedColor, canvasReady, pauseForDrawing, currentTime]);

  // Handle canvas mouse events for pin tool
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    console.log('[Video Pin] useEffect:', { canvas: !!canvas, readOnly, currentTool, canvasReady });
    if (!canvas || readOnly || currentTool !== 'pin' || !containerRef.current) return;

    console.log('[Video Pin] Attaching handler to canvas');
    const handleMouseDown = (opt: fabric.TPointerEventInfo) => {
      console.log('[Video Pin] mousedown fired!', { isAddingAnnotation });
      if (isAddingAnnotation) return;
      
      pauseForDrawing();
      
      const pointer = opt.scenePoint;
      if (!videoDimensions) return;
      
      // Convert to percentage coordinates
      const x = (pointer.x / videoDimensions.width) * 100;
      const y = (pointer.y / videoDimensions.height) * 100;
      
      // Calculate popup position - use the original event for screen coords
      const e = opt.e as MouseEvent;
      const popupWidth = 280;
      const popupLeft = e.clientX + 20;
      const adjustedLeft = popupLeft + popupWidth > window.innerWidth 
        ? e.clientX - popupWidth - 20
        : popupLeft;

      setPendingAnnotation({ type: 'pin', x, y, timestamp: currentTime });
      setPopupPosition({ top: e.clientY - 20, left: adjustedLeft });
      setIsAddingAnnotation(true);
      setNewComment('');
    };

    canvas.on('mouse:down', handleMouseDown);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
    };
  }, [currentTool, readOnly, videoDimensions, isAddingAnnotation, canvasReady, pauseForDrawing, currentTime]);

  // Handle pin click (fallback for non-canvas clicks)
  const handleVideoClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !containerRef.current || currentTool !== 'pin' || isAddingAnnotation) return;
    if ((e.target as HTMLElement).tagName === 'CANVAS') return;

    pauseForDrawing();

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const popupWidth = 280;
    const popupLeft = e.clientX + 20;
    const adjustedLeft = popupLeft + popupWidth > window.innerWidth 
      ? e.clientX - popupWidth - 20
      : popupLeft;

    setPendingAnnotation({ type: 'pin', x, y, timestamp: currentTime });
    setPopupPosition({ top: e.clientY - 20, left: adjustedLeft });
    setIsAddingAnnotation(true);
    setNewComment('');
  }, [readOnly, currentTool, isAddingAnnotation, pauseForDrawing, currentTime]);

  const handleSubmitAnnotation = useCallback(() => {
    if (!pendingAnnotation || !newComment.trim() || !onAnnotationCreate) return;

    onAnnotationCreate({
      type: pendingAnnotation.type,
      x: pendingAnnotation.x,
      y: pendingAnnotation.y,
      width: pendingAnnotation.width,
      height: pendingAnnotation.height,
      pathData: pendingAnnotation.pathData,
      timestamp: pendingAnnotation.timestamp,
      content: newComment.trim(),
      color: selectedColor,
    });

    // Remove pending shapes from canvas
    if (currentRectRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentRectRef.current);
      currentRectRef.current = null;
    }
    if (currentEllipseRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentEllipseRef.current);
      currentEllipseRef.current = null;
    }
    if (currentArrowRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentArrowRef.current);
      currentArrowRef.current = null;
    }
    if (currentFreehandRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentFreehandRef.current);
      currentFreehandRef.current = null;
      freehandPointsRef.current = [];
    }

    setPendingAnnotation(null);
    setPopupPosition(null);
    setIsAddingAnnotation(false);
    setNewComment('');
  }, [pendingAnnotation, newComment, onAnnotationCreate, selectedColor]);

  const handleCancelAnnotation = useCallback(() => {
    if (currentRectRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentRectRef.current);
      fabricCanvasRef.current.renderAll();
      currentRectRef.current = null;
    }
    if (currentEllipseRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentEllipseRef.current);
      fabricCanvasRef.current.renderAll();
      currentEllipseRef.current = null;
    }
    if (currentArrowRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentArrowRef.current);
      fabricCanvasRef.current.renderAll();
      currentArrowRef.current = null;
    }
    if (currentFreehandRef.current && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(currentFreehandRef.current);
      fabricCanvasRef.current.renderAll();
      currentFreehandRef.current = null;
      freehandPointsRef.current = [];
    }

    setPendingAnnotation(null);
    setPopupPosition(null);
    setIsAddingAnnotation(false);
    setNewComment('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelAnnotation();
    } else if (e.key === 'Enter' && e.metaKey) {
      handleSubmitAnnotation();
    }
  }, [handleCancelAnnotation, handleSubmitAnnotation]);

  // Update canvas dimensions on container resize
  useEffect(() => {
    if (!containerRef.current || !fabricCanvasRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target.querySelector('video');
        if (video && fabricCanvasRef.current) {
          setVideoDimensions({
            width: video.clientWidth,
            height: video.clientHeight,
          });
          fabricCanvasRef.current.setDimensions({
            width: video.clientWidth,
            height: video.clientHeight,
          });
          fabricCanvasRef.current.renderAll();
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [videoLoaded]);

  // Close annotation form when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isAddingAnnotation && 
          popupRef.current && 
          !popupRef.current.contains(e.target as Node) &&
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)) {
        handleCancelAnnotation();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAddingAnnotation, handleCancelAnnotation]);

  // Comment input popup rendered via portal
  const commentPopup = mounted && isAddingAnnotation && popupPosition && createPortal(
    <div
      ref={popupRef}
      className="fixed bg-zinc-800 rounded-lg shadow-2xl w-72 p-3 z-[9999]"
      style={{
        top: popupPosition.top,
        left: popupPosition.left,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400">
        {pendingAnnotation?.type === 'rectangle' ? (
          <>
            <Square className="w-3 h-3" />
            <span>Rectangle annotation</span>
          </>
        ) : pendingAnnotation?.type === 'circle' ? (
          <>
            <Circle className="w-3 h-3" />
            <span>Circle annotation</span>
          </>
        ) : pendingAnnotation?.type === 'arrow' ? (
          <>
            <ArrowRight className="w-3 h-3" />
            <span>Arrow annotation</span>
          </>
        ) : pendingAnnotation?.type === 'freehand' ? (
          <>
            <Pencil className="w-3 h-3" />
            <span>Freehand annotation</span>
          </>
        ) : (
          <>
            <MapPin className="w-3 h-3" />
            <span>Pin annotation</span>
          </>
        )}
        {pendingAnnotation?.timestamp !== undefined && (
          <span className="ml-auto text-blue-400">@ {formatTime(pendingAnnotation.timestamp)}</span>
        )}
      </div>
      <textarea
        autoFocus
        value={newComment}
        onChange={(e) => setNewComment(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        className="w-full bg-zinc-700 text-white rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={3}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-zinc-500">⌘ + Enter to submit</span>
        <div className="flex gap-2">
          <button
            onClick={handleCancelAnnotation}
            className="px-3 py-1 text-sm text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitAnnotation}
            disabled={!newComment.trim()}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-1 p-2 bg-zinc-800/90 backdrop-blur-sm rounded-lg mb-2 w-fit">
          <button
            onClick={() => setCurrentTool('pin')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              currentTool === 'pin'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title="Pin Tool (click to add comment)"
          >
            <MapPin className="w-4 h-4" />
            <span>Pin</span>
          </button>
          <button
            onClick={() => setCurrentTool('rectangle')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              currentTool === 'rectangle'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title="Rectangle Tool (click and drag)"
          >
            <Square className="w-4 h-4" />
            <span>Rectangle</span>
          </button>
          <button
            onClick={() => setCurrentTool('circle')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              currentTool === 'circle'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title="Circle Tool (click and drag)"
          >
            <Circle className="w-4 h-4" />
            <span>Circle</span>
          </button>
          <button
            onClick={() => setCurrentTool('arrow')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              currentTool === 'arrow'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title="Arrow Tool (click and drag)"
          >
            <ArrowRight className="w-4 h-4" />
            <span>Arrow</span>
          </button>
          <button
            onClick={() => setCurrentTool('freehand')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
              currentTool === 'freehand'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title="Freehand Tool (click and drag to draw)"
          >
            <Pencil className="w-4 h-4" />
            <span>Freehand</span>
          </button>
          
          {/* Separator */}
          <div className="w-px h-6 bg-zinc-600 mx-1" />
          
          {/* Color Picker */}
          <div className="flex items-center gap-1.5 px-2">
            {colorSwatches.map((swatch) => (
              <button
                key={swatch.color}
                onClick={() => setSelectedColor(swatch.color)}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                  selectedColor === swatch.color
                    ? 'border-white scale-110'
                    : 'border-zinc-600'
                }`}
                style={{ backgroundColor: swatch.color }}
                title={swatch.name}
              />
            ))}
            
            <div className="relative ml-1">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Custom color"
              />
              <div 
                className={`w-5 h-5 rounded-full border-2 ${
                  !colorSwatches.some(s => s.color === selectedColor)
                    ? 'border-white'
                    : 'border-zinc-600'
                }`}
                style={{ 
                  background: `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`,
                }}
                title="Custom color"
              />
            </div>
          </div>
        </div>
      )}

      {/* Video container */}
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-hidden bg-zinc-900 rounded-lg ${
          currentTool === 'pin' && !readOnly ? 'cursor-crosshair' : ''
        } ${['rectangle', 'circle', 'arrow', 'freehand'].includes(currentTool) && !readOnly ? 'cursor-crosshair' : ''}`}
        onClick={handleVideoClick}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-contain"
          onLoadedMetadata={handleVideoLoad}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />

        {/* Fabric.js Canvas Overlay - z-index is set via JS on the wrapper element */}
        {videoLoaded && videoDimensions && (
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-auto"
            style={{
              width: videoDimensions.width,
              height: videoDimensions.height,
            }}
          />
        )}

        {/* Pin annotations */}
        {videoLoaded && visibleAnnotations.map((annotation) => {
          if (annotation.type !== 'pin' || annotation.x === null || annotation.y === null) return null;
          
          const isSelected = selectedAnnotationId === annotation.id;
          const isHovered = hoveredAnnotation === annotation.id;

          return (
            <div
              key={annotation.id}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform ${
                isSelected || isHovered ? 'scale-125 z-20' : 'z-10'
              }`}
              style={{
                left: `${annotation.x}%`,
                top: `${annotation.y}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onAnnotationSelect?.(annotation.id);
              }}
              onMouseEnter={() => setHoveredAnnotation(annotation.id)}
              onMouseLeave={() => setHoveredAnnotation(null)}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 ${
                  annotation.resolved
                    ? 'bg-green-500 border-green-400'
                    : 'bg-red-500 border-red-400'
                } ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''}`}
                style={{ backgroundColor: annotation.resolved ? '#22c55e' : annotation.color }}
              >
                {annotation.resolved ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <MessageCircle className="w-4 h-4 text-white" />
                )}
              </div>

              {/* Tooltip on hover */}
              {isHovered && !isSelected && (
                <div className={`absolute ml-2 top-1/2 -translate-y-1/2 bg-zinc-800 rounded-lg p-2 shadow-xl w-48 z-[90] ${
                  (annotation.x || 0) > 60 ? 'right-full mr-2' : 'left-full'
                }`}>
                  <p className="text-xs text-zinc-400 mb-1">
                    {annotation.author.displayName || 'Anonymous'}
                    {annotation.timestamp !== null && annotation.timestamp !== undefined && (
                      <span className="ml-2 text-blue-400">@ {formatTime(annotation.timestamp)}</span>
                    )}
                  </p>
                  <p className="text-sm text-white line-clamp-2">{annotation.content}</p>
                </div>
              )}
            </div>
          );
        })}

        {/* Pending pin annotation marker */}
        {pendingAnnotation?.type === 'pin' && (
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
            style={{
              left: `${pendingAnnotation.x}%`,
              top: `${pendingAnnotation.y}%`,
            }}
          >
            <div 
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center animate-pulse"
              style={{ backgroundColor: selectedColor, borderColor: selectedColor }}
            >
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
          </div>
        )}

        {/* Instructions hint */}
        {!readOnly && annotations.length === 0 && !isAddingAnnotation && videoLoaded && (
          <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-1.5 text-xs text-white/80 shadow-lg">
              {currentTool === 'pin' 
                ? 'Click anywhere to add a comment at this timestamp'
                : currentTool === 'rectangle'
                ? 'Click and drag to draw a rectangle'
                : currentTool === 'circle'
                ? 'Click and drag to draw a circle'
                : currentTool === 'arrow'
                ? 'Click and drag to draw an arrow'
                : 'Click and drag to draw freehand'
              }
            </div>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div className="mt-2 bg-zinc-800/90 backdrop-blur-sm rounded-lg p-3">
        {/* Progress bar */}
        <div className="mb-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.01"
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Frame step backward */}
            <button
              onClick={() => frameStep('backward')}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              title="Previous frame (,)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Skip backward 5s */}
            <button
              onClick={() => skipSeconds(-5)}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              title="Skip back 5s (←)"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* Skip forward 5s */}
            <button
              onClick={() => skipSeconds(5)}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              title="Skip forward 5s (→)"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Frame step forward */}
            <button
              onClick={() => frameStep('forward')}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
              title="Next frame (.)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Mute toggle */}
            <button
              onClick={toggleMute}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors ml-2"
              title={isMuted ? 'Unmute (m)' : 'Mute (m)'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Time display */}
          <div className="text-sm text-zinc-400 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Annotation count at current timestamp */}
          <div className="text-xs text-zinc-500">
            {visibleAnnotations.length} annotation{visibleAnnotations.length !== 1 ? 's' : ''} at this time
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="mt-2 text-xs text-zinc-600 text-center">
          Space: play/pause • ←/→: ±5s • Shift+←/→ or ,/.: frame step • m: mute
        </div>
      </div>

      {/* Portal-rendered comment popup */}
      {commentPopup}
    </div>
  );
}

export default VideoReviewer;
