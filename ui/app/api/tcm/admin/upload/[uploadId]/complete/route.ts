import { NextResponse } from 'next/server';
import { finalizeUpload, cancelUpload } from '@/lib/tcm-admin';

interface RouteContext {
  params: Promise<{ uploadId: string }>;
}

// POST /api/tcm/admin/upload/[uploadId]/complete - Finalize upload
export async function POST(request: Request, context: RouteContext) {
  try {
    const { uploadId } = await context.params;

    const body = await request.json().catch(() => ({}));
    const { title, sourceType, autoProcess } = body;

    const result = finalizeUpload(uploadId, {
      title,
      sourceType,
      autoProcess: autoProcess !== false // Default to true
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      videoId: result.videoId,
      jobId: result.jobId,
      isDuplicate: result.isDuplicate ?? false,
      reusedExisting: result.reusedExisting ?? false,
      message: result.error
    });
  } catch (error) {
    console.error('Error finalizing upload:', error);
    return NextResponse.json(
      { error: 'Failed to finalize upload' },
      { status: 500 }
    );
  }
}

// DELETE /api/tcm/admin/upload/[uploadId]/complete - Cancel upload
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { uploadId } = await context.params;

    const success = cancelUpload(uploadId);

    if (!success) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error canceling upload:', error);
    return NextResponse.json(
      { error: 'Failed to cancel upload' },
      { status: 500 }
    );
  }
}
