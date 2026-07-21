import { NextResponse } from 'next/server';
import {
  getPlaylistItems,
  addToPlaylist,
  removeFromPlaylist,
  reorderPlaylistItems,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/playlists/[id]/items - Get playlist items
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const playlistId = parseInt(id);

    if (isNaN(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const items = getPlaylistItems(playlistId);
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching playlist items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist items' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/playlists/[id]/items - Add video to playlist
export async function POST(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const playlistId = parseInt(id);

    if (isNaN(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const body = await request.json();
    const { video_id } = body;

    if (!video_id || typeof video_id !== 'number') {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const success = addToPlaylist(playlistId, video_id);
    if (!success) {
      return NextResponse.json(
        { error: 'Video is already in this playlist' },
        { status: 409 }
      );
    }

    const items = getPlaylistItems(playlistId);
    return NextResponse.json({ items, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error adding to playlist:', error);
    return NextResponse.json(
      { error: 'Failed to add video to playlist' },
      { status: 500 }
    );
  }
}

// PUT /api/tcm/admin/playlists/[id]/items - Reorder playlist items
export async function PUT(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const playlistId = parseInt(id);

    if (isNaN(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const body = await request.json();
    const { video_ids } = body;

    if (!Array.isArray(video_ids) || video_ids.some(id => typeof id !== 'number')) {
      return NextResponse.json(
        { error: 'video_ids must be an array of numbers' },
        { status: 400 }
      );
    }

    const success = reorderPlaylistItems(playlistId, video_ids);
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to reorder playlist items' },
        { status: 500 }
      );
    }

    const items = getPlaylistItems(playlistId);
    return NextResponse.json({ items, success: true });
  } catch (error) {
    console.error('Error reordering playlist:', error);
    return NextResponse.json(
      { error: 'Failed to reorder playlist items' },
      { status: 500 }
    );
  }
}

// DELETE /api/tcm/admin/playlists/[id]/items - Remove video from playlist
export async function DELETE(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const playlistId = parseInt(id);

    if (isNaN(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const videoId = parseInt(searchParams.get('video_id') || '');

    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const success = removeFromPlaylist(playlistId, videoId);
    if (!success) {
      return NextResponse.json(
        { error: 'Video not found in playlist' },
        { status: 404 }
      );
    }

    const items = getPlaylistItems(playlistId);
    return NextResponse.json({ items, success: true });
  } catch (error) {
    console.error('Error removing from playlist:', error);
    return NextResponse.json(
      { error: 'Failed to remove video from playlist' },
      { status: 500 }
    );
  }
}
