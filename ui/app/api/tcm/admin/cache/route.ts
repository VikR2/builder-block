import { NextRequest, NextResponse } from 'next/server';
import { resetFAISSCache } from '@/lib/tcm-faiss.server';
import { clearVideoClipCache, getVideoClipCacheStats } from '@/lib/tcm-video-clips.server';

/**
 * GET /api/tcm/admin/cache - Get cache statistics
 */
export async function GET() {
  const clipStats = getVideoClipCacheStats();

  return NextResponse.json({
    videoClipCache: clipStats,
    message: 'Use POST to clear caches'
  });
}

/**
 * POST /api/tcm/admin/cache - Clear all caches
 *
 * Useful after generating new embeddings or updating transcripts.
 */
export async function POST(request: NextRequest) {
  try {
    // Clear FAISS availability cache
    resetFAISSCache();

    // Clear video clip search cache
    clearVideoClipCache();

    return NextResponse.json({
      success: true,
      message: 'All caches cleared. Next search will use fresh data.',
      cleared: ['faissAvailable', 'videoClipCache']
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    return NextResponse.json(
      { error: 'Failed to clear caches' },
      { status: 500 }
    );
  }
}
