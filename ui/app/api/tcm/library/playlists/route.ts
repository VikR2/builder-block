import { NextResponse } from 'next/server';
import {
  getAllPlaylists,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

// GET /api/tcm/library/playlists - List published playlists for public library
export async function GET() {
  try {
    ensureOrganizationTables();

    // Only get published playlists
    const playlists = getAllPlaylists(false);

    // Only return playlists that have videos
    const playlistsWithVideos = playlists.filter(p => (p.video_count || 0) > 0);

    return NextResponse.json({ playlists: playlistsWithVideos });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    );
  }
}
