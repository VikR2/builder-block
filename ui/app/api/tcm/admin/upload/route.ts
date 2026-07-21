import { NextResponse } from 'next/server';
import { initializeUpload, ensureAdminTables } from '@/lib/tcm-admin';

// POST /api/tcm/admin/upload - Initialize a new chunked upload
export async function POST(request: Request) {
  try {
    ensureAdminTables();

    const body = await request.json();
    const { filename, fileSize, chunkSize } = body;

    if (!filename || !fileSize) {
      return NextResponse.json(
        { error: 'filename and fileSize are required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!filename.toLowerCase().endsWith('.mp4') &&
        !filename.toLowerCase().endsWith('.mov') &&
        !filename.toLowerCase().endsWith('.mkv') &&
        !filename.toLowerCase().endsWith('.webm')) {
      return NextResponse.json(
        { error: 'Only video files (mp4, mov, mkv, webm) are supported' },
        { status: 400 }
      );
    }

    // Validate file size (max 10GB)
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB
    if (fileSize > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10GB' },
        { status: 400 }
      );
    }

    const result = initializeUpload({
      filename,
      fileSize,
      chunkSize: chunkSize || 5 * 1024 * 1024 // 5MB default
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to initialize upload' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uploadId: result.uploadId,
      totalChunks: result.totalChunks,
      chunkSize: chunkSize || 5 * 1024 * 1024
    });
  } catch (error) {
    console.error('Error initializing upload:', error);
    return NextResponse.json(
      { error: 'Failed to initialize upload' },
      { status: 500 }
    );
  }
}
