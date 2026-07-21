import { NextResponse } from 'next/server';
import {
  getAllTags,
  createTag,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

// GET /api/tcm/admin/tags - List all tags
export async function GET() {
  try {
    ensureOrganizationTables();
    const tags = getAllTags();
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/tags - Create a new tag
export async function POST(request: Request) {
  try {
    ensureOrganizationTables();
    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      );
    }

    const id = createTag({
      name: name.trim(),
      color: color?.trim() || undefined
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    const message = error instanceof Error ? error.message : 'Failed to create tag';
    if (message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A tag with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
