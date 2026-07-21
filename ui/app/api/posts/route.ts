import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, checkAdmin } from '@/lib/auth';
import {
  getAdminPosts,
  createAdminPost,
  updateAdminPost,
  deleteAdminPost,
  type PostType,
  type CreatePostInput,
  type NotificationOptions,
} from '@/lib/posts-db';
import { sendPostNotifications } from '@/lib/notifications';

/**
 * GET /api/posts
 * Get admin posts for the feed
 */
export async function GET(request: NextRequest) {
  try {
    // Posts are public for authenticated users
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const posts = getAdminPosts(Math.min(limit, 50));

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Get posts error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posts
 * Create a new admin post (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Admin only
    const { user, isAdmin } = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.type || !body.title || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, content' },
        { status: 400 }
      );
    }

    // Validate post type
    const validTypes: PostType[] = ['post', 'tip', 'announcement', 'video'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid post type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const postInput: CreatePostInput = {
      type: body.type as PostType,
      title: body.title,
      content: body.content,
      link_url: body.link_url || null,
      link_label: body.link_label || null,
      pinned: body.pinned || false,
      image_urls: Array.isArray(body.image_urls) ? body.image_urls : null,
    };

    const notificationOptions: NotificationOptions = {
      notify_email: body.notify_email !== false, // Default true
      notify_discord: body.notify_discord || false, // Default false
    };

    // Create the post
    const post = createAdminPost(postInput, notificationOptions);

    // Send notifications if requested
    let notificationResult = null;
    if (notificationOptions.notify_email || notificationOptions.notify_discord) {
      // Pass webhook IDs if provided (for selective Discord notifications)
      const webhookIds = Array.isArray(body.webhook_ids) ? body.webhook_ids : undefined;
      notificationResult = await sendPostNotifications(post, webhookIds);
    }

    return NextResponse.json({
      post,
      notifications: notificationResult,
    });
  } catch (error) {
    console.error('Create post error:', error);
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}


/**
 * PATCH /api/posts
 * Update an existing post (admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    // Admin only
    const { isAdmin } = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate post ID
    if (!body.id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    // Validate post type if provided
    const validTypes: PostType[] = ['post', 'tip', 'announcement', 'video'];
    if (body.type && !validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid post type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Build update input
    const updateInput: Partial<CreatePostInput> = {};
    if (body.type !== undefined) updateInput.type = body.type;
    if (body.title !== undefined) updateInput.title = body.title;
    if (body.content !== undefined) updateInput.content = body.content;
    if (body.link_url !== undefined) updateInput.link_url = body.link_url || null;
    if (body.link_label !== undefined) updateInput.link_label = body.link_label || null;
    if (body.pinned !== undefined) updateInput.pinned = body.pinned;
    if (body.image_urls !== undefined) {
      updateInput.image_urls = Array.isArray(body.image_urls) ? body.image_urls : null;
    }

    // Update the post
    const post = updateAdminPost(parseInt(body.id, 10), updateInput);

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Update post error:', error);
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts
 * Delete a post (admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Admin only
    const { isAdmin } = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    const deleted = deleteAdminPost(parseInt(id, 10));

    if (!deleted) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    );
  }
}
