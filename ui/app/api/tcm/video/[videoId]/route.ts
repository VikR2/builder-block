import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/tcm-admin/db';

// Look up video file path from database by video folder ID or filename
function getVideoFilePath(videoId: string): string | null {
  const db = getDb();
  try {
    // First try: Search for video where file_path contains the videoId (folder name pattern)
    // e.g., videoId = "volume_insighst_p2_04321b27" matches path containing that folder
    let video = db.prepare(`
      SELECT file_path FROM processed_local_videos
      WHERE file_path LIKE ?
    `).get(`%${videoId}%`) as { file_path: string } | undefined;

    if (video) {
      return video.file_path;
    }

    // Second try: Parse videoId to extract filename base (remove trailing hash)
    // e.g., "Order-Fufilment-Tips_a89df5aa" -> "Order-Fufilment-Tips"
    // Keep original hyphens/underscores but also try with spaces
    const filenameBaseOriginal = videoId.replace(/_[a-f0-9]{8}$/, '');

    // Try exact match first (with hyphens preserved)
    video = db.prepare(`
      SELECT file_path FROM processed_local_videos
      WHERE filename LIKE ?
    `).get(`%${filenameBaseOriginal}%`) as { file_path: string } | undefined;

    if (video) {
      return video.file_path;
    }

    // Try with underscores converted to spaces (for uploaded videos)
    const filenameBaseSpaces = filenameBaseOriginal.replace(/_/g, ' ');
    video = db.prepare(`
      SELECT file_path FROM processed_local_videos
      WHERE filename LIKE ?
    `).get(`%${filenameBaseSpaces}%`) as { file_path: string } | undefined;

    return video?.file_path || null;
  } finally {
    db.close();
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const decodedVideoId = decodeURIComponent(videoId);

    // Look up video file path from database
    const filePath = getVideoFilePath(decodedVideoId);

    if (!filePath) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Video file not accessible' },
        { status: 404 }
      );
    }

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Handle range requests for video seeking
    const range = request.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024, fileSize - 1); // 1MB chunks
      const chunkSize = end - start + 1;

      // Read the specific chunk
      const buffer = Buffer.alloc(chunkSize);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, chunkSize, start);
      fs.closeSync(fd);

      return new NextResponse(buffer, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    // For HEAD requests, just return headers
    if (request.method === 'HEAD') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    }

    // Full file request - read first 2MB for preview
    // For full streaming, we'd need a different approach
    const previewSize = Math.min(fileSize, 2 * 1024 * 1024);
    const buffer = Buffer.alloc(previewSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, previewSize, 0);
    fs.closeSync(fd);

    return new NextResponse(buffer, {
      status: 206,
      headers: {
        'Content-Range': `bytes 0-${previewSize - 1}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(previewSize),
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Video streaming error:', error);
    return NextResponse.json(
      { error: 'Failed to stream video' },
      { status: 500 }
    );
  }
}

// Handle HEAD requests explicitly
export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  return GET(request, { params });
}
