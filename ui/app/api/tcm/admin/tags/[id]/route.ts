import { NextResponse } from 'next/server';
import {
  getTagById,
  updateTag,
  deleteTag,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/tags/[id] - Get tag details
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const tagId = parseInt(id);

    if (isNaN(tagId)) {
      return NextResponse.json({ error: 'Invalid tag ID' }, { status: 400 });
    }

    const tag = getTagById(tagId);
    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ tag });
  } catch (error) {
    console.error('Error fetching tag:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tag' },
      { status: 500 }
    );
  }
}

// PUT /api/tcm/admin/tags/[id] - Update tag
export async function PUT(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const tagId = parseInt(id);

    if (isNaN(tagId)) {
      return NextResponse.json({ error: 'Invalid tag ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, color } = body;

    const updates: Record<string, string | null> = {};
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const success = updateTag(tagId, updates);
    if (!success) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    const tag = getTagById(tagId);
    return NextResponse.json({ tag });
  } catch (error) {
    console.error('Error updating tag:', error);
    const message = error instanceof Error ? error.message : 'Failed to update tag';
    if (message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A tag with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/tcm/admin/tags/[id] - Delete tag
export async function DELETE(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const tagId = parseInt(id);

    if (isNaN(tagId)) {
      return NextResponse.json({ error: 'Invalid tag ID' }, { status: 400 });
    }

    const success = deleteTag(tagId);
    if (!success) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json(
      { error: 'Failed to delete tag' },
      { status: 500 }
    );
  }
}
