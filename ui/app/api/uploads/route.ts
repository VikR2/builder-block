import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed file types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const POST_UPLOADS_DIR = join(process.cwd(), '..', 'data', 'post-uploads');

// Generate unique filename
function generateFilename(originalName: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();
  return `${timestamp}-${randomId}${ext}`;
}

/**
 * POST /api/uploads
 * Upload images for posts (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Admin only
    const { isAdmin } = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Validate max 4 images
    if (files.length > 4) {
      return NextResponse.json(
        { error: 'Maximum 4 images allowed' },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    if (!existsSync(POST_UPLOADS_DIR)) {
      await mkdir(POST_UPLOADS_DIR, { recursive: true });
    }

    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Allowed: JPG, PNG, GIF, WEBP`);
        continue;
      }

      // Validate extension
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push(`${file.name}: Invalid file extension`);
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large. Max size is 5MB`);
        continue;
      }

      // Generate unique filename and save
      const filename = generateFilename(file.name);
      const filepath = join(POST_UPLOADS_DIR, filename);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filepath, buffer);

      // Return public URL
      uploadedUrls.push(`/uploads/posts/${filename}`);
    }

    if (uploadedUrls.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: 'All files failed validation', details: errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      urls: uploadedUrls,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
