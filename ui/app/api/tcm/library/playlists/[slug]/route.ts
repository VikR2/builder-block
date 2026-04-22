import { NextResponse } from 'next/server';
import {
  getPlaylistBySlug,
  getPlaylistItems,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// GET /api/tcm/library/playlists/[slug] - Get playlist with videos for public viewing
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { slug } = await context.params;

    const playlist = getPlaylistBySlug(slug);
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    // Only allow viewing published playlists
    if (!playlist.is_published) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const items = getPlaylistItems(playlist.id, { publishedOnly: true });

    // Transform items to match frontend's expected video structure
    const videos = items.map(item => ({
      id: item.video_id,
      folder_id: item.video_folder_id || '',
      title: item.video_title || '',
      duration_sec: item.video_duration || null,
      frame_count: item.video_frame_count || 0,
      position: item.position
    }));

    // Return flattened playlist object with videos array
    return NextResponse.json({
      ...playlist,
      videos
    });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist' },
      { status: 500 }
    );
  }
}
