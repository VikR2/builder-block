import { NextResponse } from 'next/server';
import {
  getAllTags,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

// GET /api/tcm/library/tags - List tags for public library filtering
export async function GET() {
  try {
    ensureOrganizationTables();
    const tags = getAllTags();

    // Only return tags that are used
    const usedTags = tags.filter(t => (t.video_count || 0) > 0);

    return NextResponse.json({ tags: usedTags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}
