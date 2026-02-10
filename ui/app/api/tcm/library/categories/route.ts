import { NextResponse } from 'next/server';
import {
  getAllCategories,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

// GET /api/tcm/library/categories - List categories for public library
export async function GET() {
  try {
    ensureOrganizationTables();
    const categories = getAllCategories();

    // Only return categories that have videos
    const categoriesWithVideos = categories.filter(c => (c.video_count || 0) > 0);

    return NextResponse.json({ categories: categoriesWithVideos });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
