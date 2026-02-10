import { NextResponse } from 'next/server';
import {
  getVideoTags,
  setVideoTags,
  addVideoTag,
  removeVideoTag,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/videos/[id]/tags - Get video's tags
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const tags = getVideoTags(videoId);
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Error fetching video tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video tags' },
      { status: 500 }
    );
  }
}

// PUT /api/tcm/admin/videos/[id]/tags - Set video's tags (replaces all)
export async function PUT(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const body = await request.json();
    const { tag_ids } = body;

    if (!Array.isArray(tag_ids) || tag_ids.some(id => typeof id !== 'number')) {
      return NextResponse.json(
        { error: 'tag_ids must be an array of numbers' },
        { status: 400 }
      );
    }

    const success = setVideoTags(videoId, tag_ids);
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to set video tags' },
        { status: 500 }
      );
    }

    const tags = getVideoTags(videoId);
    return NextResponse.json({ tags, success: true });
  } catch (error) {
    console.error('Error setting video tags:', error);
    return NextResponse.json(
      { error: 'Failed to set video tags' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/videos/[id]/tags - Add a tag to video
export async function POST(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const body = await request.json();
    const { tag_id } = body;

    if (typeof tag_id !== 'number' || isNaN(tag_id)) {
      return NextResponse.json(
        { error: 'Tag ID is required' },
        { status: 400 }
      );
    }

    const success = addVideoTag(videoId, tag_id);
    if (!success) {
      return NextResponse.json(
        { error: 'Tag already assigned to this video' },
        { status: 409 }
      );
    }

    const tags = getVideoTags(videoId);
    return NextResponse.json({ tags, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error adding video tag:', error);
    return NextResponse.json(
      { error: 'Failed to add video tag' },
      { status: 500 }
    );
  }
}

// DELETE /api/tcm/admin/videos/[id]/tags - Remove a tag from video
export async function DELETE(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const tagId = parseInt(searchParams.get('tag_id') || '');

    if (isNaN(tagId)) {
      return NextResponse.json(
        { error: 'Tag ID is required' },
        { status: 400 }
      );
    }

    const success = removeVideoTag(videoId, tagId);
    if (!success) {
      return NextResponse.json(
        { error: 'Tag not found on this video' },
        { status: 404 }
      );
    }

    const tags = getVideoTags(videoId);
    return NextResponse.json({ tags, success: true });
  } catch (error) {
    console.error('Error removing video tag:', error);
    return NextResponse.json(
      { error: 'Failed to remove video tag' },
      { status: 500 }
    );
  }
}
