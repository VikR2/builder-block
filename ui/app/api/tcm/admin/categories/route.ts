import { NextResponse } from 'next/server';
import {
  getAllCategories,
  createCategory,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

// GET /api/tcm/admin/categories - List all categories
export async function GET() {
  try {
    ensureOrganizationTables();
    const categories = getAllCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/categories - Create a new category
export async function POST(request: Request) {
  try {
    ensureOrganizationTables();
    const body = await request.json();
    const { name, description, icon, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const id = createCategory({
      name: name.trim(),
      description: description?.trim() || undefined,
      icon: icon?.trim() || undefined,
      color: color?.trim() || undefined
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    const message = error instanceof Error ? error.message : 'Failed to create category';
    // Check for unique constraint violation
    if (message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A category with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
