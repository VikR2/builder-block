import Database from 'better-sqlite3';
import { join } from 'path';

// Database path (relative to ui folder)
const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');

// Get database connection
function getDb() {
  return new Database(DB_PATH);
}

// Admin Post types
export type PostType = 'post' | 'tip' | 'announcement' | 'video';

export interface AdminPost {
  id: number;
  type: PostType;
  title: string;
  content: string;
  link_url: string | null;
  link_label: string | null;
  pinned: number;
  notify_email: number;
  notify_discord: number;
  notified_at: string | null;
  created_at: string;
  image_urls: string | null; // JSON array of image URLs
}

export interface CreatePostInput {
  type: PostType;
  title: string;
  content: string;
  link_url?: string | null;
  link_label?: string | null;
  pinned?: boolean;
  image_urls?: string[] | null; // Array of image URLs
}

export interface NotificationOptions {
  notify_email?: boolean;
  notify_discord?: boolean;
}

// Discord webhook types
export interface DiscordWebhook {
  id: number;
  name: string;
  webhook_url: string;
  enabled: number;
  server_name: string | null;
  description: string | null;
  created_at: string;
}

// Post queries

/**
 * Get admin posts, ordered by pinned first, then newest
 */
export function getAdminPosts(limit: number = 20): AdminPost[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT * FROM admin_posts
      ORDER BY pinned DESC, created_at DESC
      LIMIT ?
    `).all(limit) as AdminPost[];
  } finally {
    db.close();
  }
}

/**
 * Get a single post by ID
 */
export function getPostById(id: number): AdminPost | undefined {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM admin_posts WHERE id = ?').get(id) as AdminPost | undefined;
  } finally {
    db.close();
  }
}

/**
 * Create a new admin post
 */
export function createAdminPost(
  post: CreatePostInput,
  options: NotificationOptions = {}
): AdminPost {
  const db = getDb();
  try {
    const stmt = db.prepare(`
      INSERT INTO admin_posts (type, title, content, link_url, link_label, pinned, notify_email, notify_discord, image_urls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Convert image_urls array to JSON string for storage
    const imageUrlsJson = post.image_urls && post.image_urls.length > 0
      ? JSON.stringify(post.image_urls)
      : null;

    const result = stmt.run(
      post.type,
      post.title,
      post.content,
      post.link_url ?? null,
      post.link_label ?? null,
      post.pinned ? 1 : 0,
      options.notify_email !== false ? 1 : 0, // Default true
      options.notify_discord ? 1 : 0, // Default false
      imageUrlsJson
    );

    return db.prepare('SELECT * FROM admin_posts WHERE id = ?').get(result.lastInsertRowid) as AdminPost;
  } finally {
    db.close();
  }
}

/**
 * Update an existing post
 */
export function updateAdminPost(
  id: number,
  updates: Partial<CreatePostInput>
): AdminPost | undefined {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM admin_posts WHERE id = ?').get(id) as AdminPost | undefined;
    if (!existing) return undefined;

    // Handle image_urls update
    let imageUrlsJson: string | null;
    if (updates.image_urls !== undefined) {
      imageUrlsJson = updates.image_urls && updates.image_urls.length > 0
        ? JSON.stringify(updates.image_urls)
        : null;
    } else {
      imageUrlsJson = existing.image_urls;
    }

    const stmt = db.prepare(`
      UPDATE admin_posts
      SET type = ?, title = ?, content = ?, link_url = ?, link_label = ?, pinned = ?, image_urls = ?
      WHERE id = ?
    `);

    stmt.run(
      updates.type ?? existing.type,
      updates.title ?? existing.title,
      updates.content ?? existing.content,
      updates.link_url !== undefined ? updates.link_url : existing.link_url,
      updates.link_label !== undefined ? updates.link_label : existing.link_label,
      updates.pinned !== undefined ? (updates.pinned ? 1 : 0) : existing.pinned,
      imageUrlsJson,
      id
    );

    return db.prepare('SELECT * FROM admin_posts WHERE id = ?').get(id) as AdminPost;
  } finally {
    db.close();
  }
}

/**
 * Delete a post
 */
export function deleteAdminPost(id: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM admin_posts WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

/**
 * Mark post as notified
 */
export function markPostNotified(id: number): void {
  const db = getDb();
  try {
    db.prepare(`
      UPDATE admin_posts
      SET notified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  } finally {
    db.close();
  }
}

/**
 * Get posts pending notification
 */
export function getPendingNotificationPosts(): AdminPost[] {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT * FROM admin_posts
      WHERE (notify_email = 1 OR notify_discord = 1)
        AND notified_at IS NULL
      ORDER BY created_at ASC
    `).all() as AdminPost[];
  } finally {
    db.close();
  }
}

// Discord webhook queries

/**
 * Get all discord webhooks
 */
export function getDiscordWebhooks(): DiscordWebhook[] {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM discord_webhooks ORDER BY created_at DESC').all() as DiscordWebhook[];
  } finally {
    db.close();
  }
}

/**
 * Get enabled discord webhooks only
 */
export function getEnabledDiscordWebhooks(): DiscordWebhook[] {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM discord_webhooks WHERE enabled = 1').all() as DiscordWebhook[];
  } finally {
    db.close();
  }
}

/**
 * Create a discord webhook
 */
export function createDiscordWebhook(
  name: string,
  webhookUrl: string,
  serverName?: string,
  description?: string
): DiscordWebhook {
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO discord_webhooks (name, webhook_url, server_name, description)
      VALUES (?, ?, ?, ?)
    `).run(name, webhookUrl, serverName ?? null, description ?? null);

    return db.prepare('SELECT * FROM discord_webhooks WHERE id = ?').get(result.lastInsertRowid) as DiscordWebhook;
  } finally {
    db.close();
  }
}

/**
 * Update a discord webhook
 */
export function updateDiscordWebhook(
  id: number,
  updates: {
    name?: string;
    webhook_url?: string;
    enabled?: boolean;
    server_name?: string | null;
    description?: string | null;
  }
): DiscordWebhook | undefined {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM discord_webhooks WHERE id = ?').get(id) as DiscordWebhook | undefined;
    if (!existing) return undefined;

    db.prepare(`
      UPDATE discord_webhooks
      SET name = ?, webhook_url = ?, enabled = ?, server_name = ?, description = ?
      WHERE id = ?
    `).run(
      updates.name ?? existing.name,
      updates.webhook_url ?? existing.webhook_url,
      updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled,
      updates.server_name !== undefined ? updates.server_name : existing.server_name,
      updates.description !== undefined ? updates.description : existing.description,
      id
    );

    return db.prepare('SELECT * FROM discord_webhooks WHERE id = ?').get(id) as DiscordWebhook;
  } finally {
    db.close();
  }
}

/**
 * Delete a discord webhook
 */
export function deleteDiscordWebhook(id: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM discord_webhooks WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}
