import { NextResponse } from 'next/server';
import {
  getCategoryById,
  updateCategory,
  deleteCategory,
  reorderCategories,
  ensureOrganizationTables
} from '@/lib/tcm-admin/organization';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/categories/[id] - Get category details
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const categoryId = parseInt(id);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
    }

    const category = getCategoryById(categoryId);
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json({ category });
  } catch (error) {
    console.error('Error fetching category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch category' },
      { status: 500 }
    );
  }
}

// PUT /api/tcm/admin/categories/[id] - Update category
export async function PUT(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const categoryId = parseInt(id);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, icon, color, display_order } = body;

    // Handle reorder request (special case)
    if (body.reorder && Array.isArray(body.reorder)) {
      const success = reorderCategories(body.reorder);
      return NextResponse.json({ success });
    }

    const updates: Record<string, string | number | null> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (icon !== undefined) updates.icon = icon?.trim() || null;
    if (color !== undefined) updates.color = color?.trim() || null;
    if (display_order !== undefined) updates.display_order = display_order;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const success = updateCategory(categoryId, updates);
    if (!success) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const category = getCategoryById(categoryId);
    return NextResponse.json({ category });
  } catch (error) {
    console.error('Error updating category:', error);
    const message = error instanceof Error ? error.message : 'Failed to update category';
    if (message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: 'A category with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/tcm/admin/categories/[id] - Delete category
export async function DELETE(request: Request, context: RouteContext) {
  try {
    ensureOrganizationTables();
    const { id } = await context.params;
    const categoryId = parseInt(id);

    if (isNaN(categoryId)) {
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 });
    }

    const success = deleteCategory(categoryId);
    if (!success) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
