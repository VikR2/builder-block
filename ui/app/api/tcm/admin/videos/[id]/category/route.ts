import { NextResponse } from 'next/server';
import {
  setVideoCategory,
  getVideoCategory,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/videos/[id]/category - Get video's category
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const category = getVideoCategory(videoId);
    return NextResponse.json({ category });
  } catch (error) {
    console.error('Error fetching video category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video category' },
      { status: 500 }
    );
  }
}

// PUT /api/tcm/admin/videos/[id]/category - Set video's category
export async function PUT(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const body = await request.json();
    const { category_id } = body;

    // category_id can be null (remove from category) or a number
    if (category_id !== null && (typeof category_id !== 'number' || isNaN(category_id))) {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    const success = setVideoCategory(videoId, category_id);
    if (!success) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const category = category_id ? getVideoCategory(videoId) : null;
    return NextResponse.json({ category, success: true });
  } catch (error) {
    console.error('Error setting video category:', error);
    return NextResponse.json(
      { error: 'Failed to set video category' },
      { status: 500 }
    );
  }
}
