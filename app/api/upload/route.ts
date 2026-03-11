import { NextRequest } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { withAuth } from '@/lib/modules/api/middleware';
import { ok, badRequest } from '@/lib/modules/api/response';
import { generateThumbnail, getThumbnailPath } from '@/lib/modules/media';

// Upload directory - in production, use cloud storage
const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads';

// Max file sizes (in bytes)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Allowed MIME types
const ALLOWED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  file: ['application/pdf', 'text/plain', 'application/json'],
};

function getFileType(mimeType: string): string {
  for (const [type, mimes] of Object.entries(ALLOWED_TYPES)) {
    if (mimes.includes(mimeType)) return type;
  }
  return 'file';
}

function getMaxSize(fileType: string): number {
  switch (fileType) {
    case 'image': return MAX_IMAGE_SIZE;
    case 'video': return MAX_VIDEO_SIZE;
    default: return MAX_FILE_SIZE;
  }
}

export const POST = withAuth(async (req: NextRequest, user) => {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return badRequest('No file provided');
  }

  // Validate MIME type
  const allAllowed = Object.values(ALLOWED_TYPES).flat();
  if (!allAllowed.includes(file.type)) {
    return badRequest(`File type ${file.type} not allowed`);
  }

  const fileType = getFileType(file.type);
  const maxSize = getMaxSize(fileType);

  // Validate size
  if (file.size > maxSize) {
    return badRequest(`File too large. Max ${maxSize / 1024 / 1024}MB for ${fileType}`);
  }

  // Generate unique filename
  const ext = path.extname(file.name) || `.${file.type.split('/')[1]}`;
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const filename = `${timestamp}-${random}${ext}`;
  
  // Create upload directory structure: /uploads/YYYY/MM/
  const date = new Date();
  const yearMonth = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  const uploadPath = path.join(UPLOAD_DIR, yearMonth);
  
  await mkdir(uploadPath, { recursive: true });

  // Write file
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(uploadPath, filename);
  await writeFile(filePath, buffer);

  // Return URL path via API route
  const url = `/api/files/uploads/${yearMonth}/${filename}`;

  // Generate thumbnail for images/videos (async, non-blocking)
  let thumbnailUrl: string | undefined;
  if (fileType === 'image' || fileType === 'video') {
    try {
      const result = await generateThumbnail(filePath, { mimeType: file.type });
      if (result.success && result.thumbnailPath) {
        const thumbFilename = path.basename(result.thumbnailPath);
        thumbnailUrl = `/api/files/uploads/${yearMonth}/${thumbFilename}`;
      }
    } catch (err) {
      // Log but don't fail upload if thumbnail generation fails
      console.error('[upload] Thumbnail generation failed:', err);
    }
  }

  return ok({
    url,
    thumbnailUrl,
    name: file.name,
    type: fileType,
    size: file.size,
    mimeType: file.type,
  });
});
