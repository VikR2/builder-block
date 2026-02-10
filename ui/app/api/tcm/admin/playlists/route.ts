import { NextResponse } from 'next/server';
import {
  getAllPlaylists,
  createPlaylist,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

// GET /api/tcm/admin/playlists - List all playlists
export async function GET(request: Request) {
  try {
    ensureOrganizationTables();
    const { searchParams } = new URL(request.url);
    const includeUnpublished = searchParams.get('all') === 'true';

    const playlists = getAllPlaylists(includeUnpublished);
    return NextResponse.json({ playlists });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlists' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/playlists - Create a new playlist
export async function POST(request: Request) {
  try {
    ensureOrganizationTables();
    const body = await request.json();
    const { name, description, is_published } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Playlist name is required' },
        { status: 400 }
      );
    }

    const id = createPlaylist({
      name: name.trim(),
      description: description?.trim() || undefined,
      is_published: is_published !== false
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating playlist:', error);
    const message = error instanceof Error ? error.message : 'Failed to create playlist';
    if (message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A playlist with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
