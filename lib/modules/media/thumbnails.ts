/**
 * Thumbnail Generator - Mission Control
 * Uses FFmpeg (via fluent-ffmpeg) to generate thumbnails for images and videos
 */

import ffmpeg from 'fluent-ffmpeg';
import { existsSync } from 'fs';
import path from 'path';

const THUMBNAIL_WIDTH = 400; // pixels
const VIDEO_FRAME_POSITION = '25%'; // Extract frame at 25% duration

export interface ThumbnailResult {
  success: boolean;
  thumbnailPath?: string;
  error?: string;
}

/**
 * Get thumbnail path for a given file
 * Original: /uploads/2026/03/file.jpg -> /uploads/2026/03/file_thumb.jpg
 */
export function getThumbnailPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return path.join(dir, `${base}_thumb.jpg`);
}

/**
 * Generate thumbnail for an image file
 */
async function generateImageThumbnail(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${THUMBNAIL_WIDTH}:-1`, // Width 400, maintain aspect ratio
        '-q:v 2', // High quality JPEG
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Generate thumbnail from video by extracting a frame
 */
async function generateVideoThumbnail(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [VIDEO_FRAME_POSITION],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: `${THUMBNAIL_WIDTH}x?`, // Width 400, maintain aspect ratio
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

/**
 * Detect if file is an image or video based on mime type or extension
 */
function getMediaType(filePath: string, mimeType?: string): 'image' | 'video' | 'unknown' {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  
  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  
  return 'unknown';
}

/**
 * Generate a thumbnail for a media file
 * Works with both images and videos
 */
export async function generateThumbnail(
  filePath: string,
  options?: { mimeType?: string }
): Promise<ThumbnailResult> {
  try {
    // Check file exists
    if (!existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    
    const mediaType = getMediaType(filePath, options?.mimeType);
    
    if (mediaType === 'unknown') {
      return { success: false, error: 'Unsupported media type' };
    }
    
    const thumbnailPath = getThumbnailPath(filePath);
    
    if (mediaType === 'image') {
      await generateImageThumbnail(filePath, thumbnailPath);
    } else {
      await generateVideoThumbnail(filePath, thumbnailPath);
    }
    
    return { success: true, thumbnailPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[thumbnails] Generation failed:', error);
    return { success: false, error };
  }
}
