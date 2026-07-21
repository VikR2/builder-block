import { Resend } from 'resend';
import { AdminPost, getEnabledDiscordWebhooks, markPostNotified } from './posts-db';
import { getAllUsers } from './auth/db';

// Lazy-load Resend client (same pattern as auth/email.ts)
let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';
const APP_NAME = 'The Currency Merchant';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface NotificationResult {
  success: boolean;
  emailsSent?: number;
  discordSent?: number;
  errors?: string[];
}

/**
 * Get emoji for post type (for Discord embeds)
 */
function getPostTypeEmoji(type: string): string {
  switch (type) {
    case 'announcement': return '📢';
    case 'tip': return '💡';
    case 'video': return '🎬';
    default: return '📝';
  }
}

/**
 * Get color for post type (Discord embed colors)
 */
function getPostTypeColor(type: string): number {
  switch (type) {
    case 'announcement': return 0xf59e0b; // Amber
    case 'tip': return 0x10b981; // Emerald
    case 'video': return 0x6366f1; // Indigo
    default: return 0x94a3b8; // Slate
  }
}

/**
 * Send email notifications to all users for a new post
 */
export async function sendPostEmailNotifications(post: AdminPost): Promise<{
  success: boolean;
  sent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sent = 0;

  try {
    // Get all users with valid emails
    const users = getAllUsers(1000); // Get up to 1000 users
    const validUsers = users.filter(u => u.email && u.email_verified);

    if (validUsers.length === 0) {
      return { success: true, sent: 0, errors: [] };
    }

    const resend = getResend();

    // Batch send emails (Resend supports batch API)
    const emails = validUsers.map(user => ({
      from: FROM_EMAIL,
      to: user.email,
      subject: `${getPostTypeEmoji(post.type)} ${post.title} - ${APP_NAME}`,
      html: generatePostEmailHtml(post),
    }));

    // Send in batches of 100 (Resend API limit)
    const batchSize = 100;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      try {
        await resend.batch.send(batch);
        sent += batch.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Batch ${i / batchSize + 1} failed: ${message}`);
      }
    }

    return { success: errors.length === 0, sent, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(message);
    return { success: false, sent, errors };
  }
}

/**
 * Generate HTML email content for a post
 */
function generatePostEmailHtml(post: AdminPost): string {
  const linkSection = post.link_url
    ? `<a href="${APP_URL}${post.link_url}" style="display: inline-block; background-color: #f59e0b; color: #1a1a2e; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0; font-weight: 600;">
        ${post.link_label || 'View More'}
      </a>`
    : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #1a1a2e; color: #e2e8f0; padding: 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #f59e0b; margin: 0; font-size: 24px;">${APP_NAME}</h1>
      </div>

      <div style="background-color: #262647; border-radius: 12px; padding: 24px; border-left: 4px solid #f59e0b;">
        <span style="font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">
          ${getPostTypeEmoji(post.type)} ${post.type}
        </span>

        <h2 style="color: #f8fafc; margin: 12px 0 16px 0; font-size: 22px;">
          ${post.title}
        </h2>

        <p style="color: #cbd5e1; line-height: 1.6; margin: 0 0 20px 0;">
          ${post.content}
        </p>

        ${linkSection}
      </div>

      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #334155;">
        <a href="${APP_URL}/home" style="color: #f59e0b; text-decoration: none;">
          Visit Dashboard
        </a>
        <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
          You're receiving this because you're subscribed to ${APP_NAME} updates.
        </p>
      </div>
    </div>
  `;
}

/**
 * Send post notification to Discord webhooks
 * @param post The post to send
 * @param webhookIds Optional array of webhook IDs to send to. If not provided, sends to all enabled webhooks.
 */
export async function sendPostToDiscord(
  post: AdminPost,
  webhookIds?: number[]
): Promise<{
  success: boolean;
  sent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let sent = 0;

  try {
    let webhooks = getEnabledDiscordWebhooks();
    
    // Filter to specific webhooks if IDs provided
    if (webhookIds && webhookIds.length > 0) {
      const idSet = new Set(webhookIds);
      webhooks = webhooks.filter(w => idSet.has(w.id));
    }

    if (webhooks.length === 0) {
      return { success: true, sent: 0, errors: [] };
    }

    // Create Discord embed
    const embed = {
      title: post.title,
      description: post.content,
      color: getPostTypeColor(post.type),
      url: post.link_url ? `${APP_URL}${post.link_url}` : undefined,
      author: {
        name: APP_NAME,
        icon_url: `${APP_URL}/favicon.ico`,
      },
      footer: {
        text: `${post.type.charAt(0).toUpperCase() + post.type.slice(1)} • ${new Date(post.created_at).toLocaleDateString()}`,
      },
      timestamp: new Date(post.created_at).toISOString(),
    };

    const payload = {
      embeds: [embed],
    };

    // Send to each webhook
    for (const webhook of webhooks) {
      try {
        const response = await fetch(webhook.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          sent++;
        } else {
          const text = await response.text();
          errors.push(`Webhook "${webhook.name}" failed: ${response.status} ${text}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Webhook "${webhook.name}" error: ${message}`);
      }
    }

    return { success: errors.length === 0, sent, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(message);
    return { success: false, sent, errors };
  }
}

/**
 * Send all notifications for a post (email + discord)
 * @param post The post to send notifications for
 * @param webhookIds Optional array of webhook IDs to send Discord notifications to
 */
export async function sendPostNotifications(
  post: AdminPost,
  webhookIds?: number[]
): Promise<NotificationResult> {
  const errors: string[] = [];
  let emailsSent = 0;
  let discordSent = 0;

  // Send email notifications if enabled
  if (post.notify_email) {
    const emailResult = await sendPostEmailNotifications(post);
    emailsSent = emailResult.sent;
    errors.push(...emailResult.errors);
  }

  // Send Discord notifications if enabled
  if (post.notify_discord) {
    const discordResult = await sendPostToDiscord(post, webhookIds);
    discordSent = discordResult.sent;
    errors.push(...discordResult.errors);
  }

  // Mark post as notified
  if (emailsSent > 0 || discordSent > 0) {
    markPostNotified(post.id);
  }

  return {
    success: errors.length === 0,
    emailsSent,
    discordSent,
    errors: errors.length > 0 ? errors : undefined,
  };
}
