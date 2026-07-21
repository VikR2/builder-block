import { NextResponse } from 'next/server';
import { receiveChunk } from '@/lib/tcm-admin';

interface RouteContext {
  params: Promise<{ uploadId: string }>;
}

// POST /api/tcm/admin/upload/[uploadId]/chunk - Receive a chunk
export async function POST(request: Request, context: RouteContext) {
  try {
    const { uploadId } = await context.params;

    // Get chunk index from query params
    const { searchParams } = new URL(request.url);
    const chunkIndexStr = searchParams.get('index');

    if (!chunkIndexStr) {
      return NextResponse.json(
        { error: 'Chunk index is required' },
        { status: 400 }
      );
    }

    const chunkIndex = parseInt(chunkIndexStr);
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json(
        { error: 'Invalid chunk index' },
        { status: 400 }
      );
    }

    // Get chunk data from request body
    const arrayBuffer = await request.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'Empty chunk data' },
        { status: 400 }
      );
    }

    const result = receiveChunk(uploadId, chunkIndex, data);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      receivedChunks: result.receivedChunks,
      totalChunks: result.totalChunks,
      complete: result.complete
    });
  } catch (error) {
    console.error('Error receiving chunk:', error);
    return NextResponse.json(
      { error: 'Failed to receive chunk' },
      { status: 500 }
    );
  }
}
