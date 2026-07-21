import { NextResponse } from 'next/server';
import {
  getPlaylistById,
  updatePlaylist,
  deletePlaylist,
  getPlaylistItems,
  reorderPlaylists,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/playlists/[id] - Get playlist with items
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const playlistId = parseInt(id);

    if (isNaN(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const playlist = getPlaylistById(playlistId);
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const items = getPlaylistItems(playlistId);
    return NextResponse.json({ playlist, items });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist' },
      { status: 500 }
    );
  }
}

// PUT /api/tcm/admin/playlists/[id] - Update playlist
export async function PUT(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const playlistId = parseInt(id);

    if (isNaN(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, is_published, display_order } = body;

    // Handle reorder request for all playlists (special case)
    if (body.reorder && Array.isArray(body.reorder)) {
      const success = reorderPlaylists(body.reorder);
      return NextResponse.json({ success });
    }

    const updates: Record<string, string | number | boolean | null> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (is_published !== undefined) updates.is_published = is_published;
    if (display_order !== undefined) updates.display_order = display_order;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const success = updatePlaylist(playlistId, updates);
    if (!success) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const playlist = getPlaylistById(playlistId);
    return NextResponse.json({ playlist });
  } catch (error) {
    console.error('Error updating playlist:', error);
    const message = error instanceof Error ? error.message : 'Failed to update playlist';
    if (message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A playlist with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/tcm/admin/playlists/[id] - Delete playlist
export async function DELETE(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const playlistId = parseInt(id);

    if (isNaN(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist ID' }, { status: 400 });
    }

    const success = deletePlaylist(playlistId);
    if (!success) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return NextResponse.json(
      { error: 'Failed to delete playlist' },
      { status: 500 }
    );
  }
}
