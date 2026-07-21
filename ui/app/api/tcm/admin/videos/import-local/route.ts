import { NextResponse } from 'next/server';
import { ensureAdminTables, importLocalVideo } from '@/lib/tcm-admin';

export async function POST(request: Request) {
  try {
    ensureAdminTables();

    const body = await request.json().catch(() => ({}));
    const {
      filePath,
      title,
      sourceType,
      autoProcess
    } = body as {
      filePath?: string;
      title?: string;
      sourceType?: string;
      autoProcess?: boolean;
    };

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json(
        { error: 'filePath is required' },
        { status: 400 }
      );
    }

    const result = importLocalVideo({
      filePath,
      title,
      sourceType,
      autoProcess: autoProcess !== false
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
    console.error('Error importing local video:', error);
    return NextResponse.json(
      { error: 'Failed to import local video' },
      { status: 500 }
    );
  }
}
