import { NextResponse } from 'next/server';
import { getAllVideos, ensureAdminTables, getAdminStats } from '@/lib/tcm-admin';

// GET /api/tcm/admin/videos - List all videos with optional stats
export async function GET(request: Request) {
  try {
    ensureAdminTables();

    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('stats') === 'true';

    const videos = getAllVideos();

    const response: {
      videos: typeof videos;
      stats?: ReturnType<typeof getAdminStats>;
    } = { videos };

    if (includeStats) {
      response.stats = getAdminStats();
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}
