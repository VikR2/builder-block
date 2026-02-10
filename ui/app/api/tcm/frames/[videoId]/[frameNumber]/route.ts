import { NextRequest, NextResponse } from 'next/server';
import { getFrameBuffer, getFrame } from '@/lib/tcm-frames';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ videoId: string; frameNumber: string }> }
) {
  const { videoId, frameNumber } = await context.params;
  const frameNum = parseInt(frameNumber);

  if (isNaN(frameNum) || frameNum < 1) {
    return NextResponse.json(
      { error: 'Invalid frame number' },
      { status: 400 }
    );
  }

  // Get frame metadata
  const frame = getFrame(videoId, frameNum);

  if (!frame) {
    return NextResponse.json(
      { error: 'Frame not found' },
      { status: 404 }
    );
  }

  // Get frame buffer
  const buffer = getFrameBuffer(videoId, frameNum);

  if (!buffer) {
    return NextResponse.json(
      { error: 'Could not read frame file' },
      { status: 500 }
    );
  }

  // Determine content type
  const contentType = frame.filename.endsWith('.png')
    ? 'image/png'
    : 'image/jpeg';

  // Return image with caching headers
  // Convert Node.js Buffer to Uint8Array for NextResponse compatibility
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': buffer.length.toString(),
    },
  });
}
