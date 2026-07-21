import { NextResponse } from 'next/server';
import {
  getAllPlaylists,
  getPlaylistItems,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

// GET /api/tcm/library/playlists - List published playlists for public library
export async function GET() {
  try {
    ensureOrganizationTables();

    const playlistsWithVideos = getAllPlaylists(false)
      .map((playlist) => {
        const items = getPlaylistItems(playlist.id, { publishedOnly: true });
        return {
          ...playlist,
          video_count: items.length,
          total_duration: items.reduce((sum, item) => sum + (item.video_duration || 0), 0)
        };
      })
      .filter((playlist) => (playlist.video_count || 0) > 0);

    return NextResponse.json({ playlists: playlistsWithVideos });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    );
  }
}
