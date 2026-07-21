import { NextResponse } from 'next/server';
import { handleProgressCallback } from '@/lib/tcm-admin/processor';

// POST /api/tcm/admin/progress - Callback endpoint for Python processing script
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    handleProgressCallback(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handling progress callback:', error);
    return NextResponse.json(
      { error: 'Failed to handle progress callback' },
      { status: 500 }
    );
  }
}
