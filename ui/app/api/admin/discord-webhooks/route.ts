import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth';
import {
  getDiscordWebhooks,
  createDiscordWebhook,
  updateDiscordWebhook,
  deleteDiscordWebhook,
} from '@/lib/posts-db';

/**
 * GET /api/admin/discord-webhooks
 * List all configured Discord webhooks (admin only)
 */
export async function GET() {
  try {
    const { isAdmin } = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const webhooks = getDiscordWebhooks();

    // Mask webhook URLs for security (show only last 8 chars)
    const maskedWebhooks = webhooks.map(w => ({
      ...w,
      webhook_url: `...${w.webhook_url.slice(-8)}`,
    }));

    return NextResponse.json({ webhooks: maskedWebhooks });
  } catch (error) {
    console.error('Get webhooks error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhooks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/discord-webhooks
 * Create a new Discord webhook (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { isAdmin } = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (!body.name || !body.webhook_url) {
      return NextResponse.json(
        { error: 'Missing required fields: name, webhook_url' },
        { status: 400 }
      );
    }

    // Validate Discord webhook URL format
    const discordWebhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/.+$/;
    if (!discordWebhookPattern.test(body.webhook_url)) {
      return NextResponse.json(
        { error: 'Invalid Discord webhook URL format' },
        { status: 400 }
      );
    }

    const webhook = createDiscordWebhook(
      body.name,
      body.webhook_url,
      body.server_name,
      body.description
    );

    return NextResponse.json({
      webhook: {
        ...webhook,
        webhook_url: `...${webhook.webhook_url.slice(-8)}`,
      },
    });
  } catch (error) {
    console.error('Create webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/discord-webhooks
 * Update a Discord webhook (admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const { isAdmin } = await checkAdmin();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    // Validate Discord webhook URL format if provided
    if (body.webhook_url) {
      const discordWebhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/.+$/;
      if (!discordWebhookPattern.test(body.webhook_url)) {
        return NextResponse.json(
          { error: 'Invalid Discord webhook URL format' },
          { status: 400 }
        );
      }
    }

    const webhook = updateDiscordWebhook(body.id, {
      name: body.name,
      webhook_url: body.webhook_url,
      enabled: body.enabled,
      server_name: body.server_name,
      description: body.description,
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      webhook: {
        ...webhook,
        webhook_url: `...${webhook.webhook_url.slice(-8)}`,
      },
    });
  } catch (error) {
    console.error('Update webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/discord-webhooks
 * Delete a Discord webhook (admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
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

    const deleted = deleteDiscordWebhook(parseInt(id, 10));

    if (!deleted) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}
