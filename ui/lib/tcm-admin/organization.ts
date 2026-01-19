import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';

const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');
const MIGRATIONS_PATH = join(process.cwd(), '..', 'data', 'migrations');

// Get writable database connection
function getDb() {
  return new Database(DB_PATH);
}

// Ensure organization tables exist
export function ensureOrganizationTables() {
  const db = getDb();
  try {
    // Check if video_categories table exists
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='video_categories'
    `).get();

    if (!tableCheck) {
      const migration040Path = join(MIGRATIONS_PATH, '040_add_video_organization.sql');
      if (existsSync(migration040Path)) {
        const sql = readFileSync(migration040Path, 'utf-8');
        // Split by semicolons and execute each statement
        const statements = sql.split(';').filter(s => s.trim());
        for (const stmt of statements) {
          try {
            db.exec(stmt);
          } catch (e) {
            // Ignore errors for idempotent operations (column already exists, etc.)
            const msg = (e as Error).message;
            if (!msg.includes('duplicate column') && !msg.includes('already exists')) {
              console.warn('Migration statement warning:', msg);
            }
          }
        }
      }
    }
  } finally {
    db.close();
  }
}

// ============ Types ============

export interface VideoCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  icon: string | null;
  color: string;
  created_at: string;
  video_count?: number;
}

export interface VideoPlaylist {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_published: boolean;
  created_at: string;
  video_count?: number;
  total_duration?: number;
}

export interface PlaylistItem {
  id: number;
  playlist_id: number;
  video_id: number;
  position: number;
  // Joined video data
  video_title?: string;
  video_duration?: number;
  video_folder_id?: string;
  video_frame_count?: number;
}

export interface VideoTag {
  id: number;
  name: string;
  slug: string;
  color: string;
  video_count?: number;
}

// ============ Utility Functions ============

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============ Category Operations ============

export function getAllCategories(): VideoCategory[] {
  const db = getDb();
  try {
    const categories = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM processed_local_videos v WHERE v.category_id = c.id) as video_count
      FROM video_categories c
      ORDER BY c.display_order ASC, c.name ASC
    `).all() as VideoCategory[];
    return categories;
  } finally {
    db.close();
  }
}

export function getCategoryById(id: number): VideoCategory | null {
  const db = getDb();
  try {
    const category = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM processed_local_videos v WHERE v.category_id = c.id) as video_count
      FROM video_categories c
      WHERE c.id = ?
    `).get(id) as VideoCategory | undefined;
    return category || null;
  } finally {
    db.close();
  }
}

export function getCategoryBySlug(slug: string): VideoCategory | null {
  const db = getDb();
  try {
    const category = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM processed_local_videos v WHERE v.category_id = c.id) as video_count
      FROM video_categories c
      WHERE c.slug = ?
    `).get(slug) as VideoCategory | undefined;
    return category || null;
  } finally {
    db.close();
  }
}

export function createCategory(data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}): number {
  const db = getDb();
  try {
    const slug = slugify(data.name);

    // Get max display_order
    const maxOrder = db.prepare(`
      SELECT MAX(display_order) as max_order FROM video_categories
    `).get() as { max_order: number | null };
    const displayOrder = (maxOrder.max_order ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO video_categories (name, slug, description, icon, color, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      slug,
      data.description || null,
      data.icon || null,
      data.color || '#f59e0b'
    , displayOrder);

    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updateCategory(id: number, data: Partial<Omit<VideoCategory, 'id' | 'created_at' | 'video_count'>>): boolean {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key === 'name') {
        fields.push('name = ?', 'slug = ?');
        values.push(value as string, slugify(value as string));
      } else {
        fields.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (fields.length === 0) return false;
    values.push(id);

    const result = db.prepare(`
      UPDATE video_categories
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function deleteCategory(id: number): boolean {
  const db = getDb();
  try {
    // Remove category from videos first
    db.prepare('UPDATE processed_local_videos SET category_id = NULL WHERE category_id = ?').run(id);
    const result = db.prepare('DELETE FROM video_categories WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function reorderCategories(orderedIds: number[]): boolean {
  const db = getDb();
  try {
    const stmt = db.prepare('UPDATE video_categories SET display_order = ? WHERE id = ?');
    db.transaction(() => {
      orderedIds.forEach((id, index) => {
        stmt.run(index, id);
      });
    })();
    return true;
  } finally {
    db.close();
  }
}

// ============ Playlist Operations ============

export function getAllPlaylists(includeUnpublished = true): VideoPlaylist[] {
  const db = getDb();
  try {
    const whereClause = includeUnpublished ? '' : 'WHERE p.is_published = 1';
    const playlists = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) as video_count,
        (SELECT SUM(v.duration_sec) FROM playlist_items pi
         JOIN processed_local_videos v ON pi.video_id = v.id
         WHERE pi.playlist_id = p.id) as total_duration
      FROM video_playlists p
      ${whereClause}
      ORDER BY p.display_order ASC, p.name ASC
    `).all() as (VideoPlaylist & { is_published: number })[];

    // Convert SQLite boolean
    return playlists.map(p => ({
      ...p,
      is_published: Boolean(p.is_published)
    }));
  } finally {
    db.close();
  }
}

export function getPlaylistById(id: number): VideoPlaylist | null {
  const db = getDb();
  try {
    const playlist = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) as video_count,
        (SELECT SUM(v.duration_sec) FROM playlist_items pi
         JOIN processed_local_videos v ON pi.video_id = v.id
         WHERE pi.playlist_id = p.id) as total_duration
      FROM video_playlists p
      WHERE p.id = ?
    `).get(id) as (VideoPlaylist & { is_published: number }) | undefined;

    if (!playlist) return null;
    return { ...playlist, is_published: Boolean(playlist.is_published) };
  } finally {
    db.close();
  }
}

export function getPlaylistBySlug(slug: string): VideoPlaylist | null {
  const db = getDb();
  try {
    const playlist = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) as video_count,
        (SELECT SUM(v.duration_sec) FROM playlist_items pi
         JOIN processed_local_videos v ON pi.video_id = v.id
         WHERE pi.playlist_id = p.id) as total_duration
      FROM video_playlists p
      WHERE p.slug = ?
    `).get(slug) as (VideoPlaylist & { is_published: number }) | undefined;

    if (!playlist) return null;
    return { ...playlist, is_published: Boolean(playlist.is_published) };
  } finally {
    db.close();
  }
}

export function createPlaylist(data: {
  name: string;
  description?: string;
  is_published?: boolean;
}): number {
  const db = getDb();
  try {
    const slug = slugify(data.name);

    // Get max display_order
    const maxOrder = db.prepare(`
      SELECT MAX(display_order) as max_order FROM video_playlists
    `).get() as { max_order: number | null };
    const displayOrder = (maxOrder.max_order ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO video_playlists (name, slug, description, is_published, display_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.name,
      slug,
      data.description || null,
      data.is_published !== false ? 1 : 0,
      displayOrder
    );

    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updatePlaylist(id: number, data: Partial<Omit<VideoPlaylist, 'id' | 'created_at' | 'video_count' | 'total_duration'>>): boolean {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key === 'name') {
        fields.push('name = ?', 'slug = ?');
        values.push(value as string, slugify(value as string));
      } else if (key === 'is_published') {
        fields.push('is_published = ?');
        values.push(value ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (fields.length === 0) return false;
    values.push(id);

    const result = db.prepare(`
      UPDATE video_playlists
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function deletePlaylist(id: number): boolean {
  const db = getDb();
  try {
    // Playlist items are deleted by CASCADE
    const result = db.prepare('DELETE FROM video_playlists WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function reorderPlaylists(orderedIds: number[]): boolean {
  const db = getDb();
  try {
    const stmt = db.prepare('UPDATE video_playlists SET display_order = ? WHERE id = ?');
    db.transaction(() => {
      orderedIds.forEach((id, index) => {
        stmt.run(index, id);
      });
    })();
    return true;
  } finally {
    db.close();
  }
}

// ============ Playlist Item Operations ============

export function getPlaylistItems(playlistId: number): PlaylistItem[] {
  const db = getDb();
  try {
    const items = db.prepare(`
      SELECT pi.*, v.title as video_title, v.duration_sec as video_duration, v.folder_id as video_folder_id, v.frame_count as video_frame_count
      FROM playlist_items pi
      JOIN processed_local_videos v ON pi.video_id = v.id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC
    `).all(playlistId) as PlaylistItem[];
    return items;
  } finally {
    db.close();
  }
}

export function addToPlaylist(playlistId: number, videoId: number): boolean {
  const db = getDb();
  try {
    // Get max position
    const maxPos = db.prepare(`
      SELECT MAX(position) as max_pos FROM playlist_items WHERE playlist_id = ?
    `).get(playlistId) as { max_pos: number | null };
    const position = (maxPos.max_pos ?? -1) + 1;

    try {
      db.prepare(`
        INSERT INTO playlist_items (playlist_id, video_id, position)
        VALUES (?, ?, ?)
      `).run(playlistId, videoId, position);
      return true;
    } catch {
      // Video already in playlist (UNIQUE constraint)
      return false;
    }
  } finally {
    db.close();
  }
}

export function removeFromPlaylist(playlistId: number, videoId: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare(`
      DELETE FROM playlist_items WHERE playlist_id = ? AND video_id = ?
    `).run(playlistId, videoId);

    // Reorder remaining items
    if (result.changes > 0) {
      const items = db.prepare(`
        SELECT id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC
      `).all(playlistId) as { id: number }[];

      const stmt = db.prepare('UPDATE playlist_items SET position = ? WHERE id = ?');
      items.forEach((item, index) => {
        stmt.run(index, item.id);
      });
    }

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function reorderPlaylistItems(playlistId: number, orderedVideoIds: number[]): boolean {
  const db = getDb();
  try {
    const stmt = db.prepare(`
      UPDATE playlist_items SET position = ? WHERE playlist_id = ? AND video_id = ?
    `);

    db.transaction(() => {
      orderedVideoIds.forEach((videoId, index) => {
        stmt.run(index, playlistId, videoId);
      });
    })();

    return true;
  } finally {
    db.close();
  }
}

// ============ Tag Operations ============

export function getAllTags(): VideoTag[] {
  const db = getDb();
  try {
    const tags = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM video_tag_assignments vta WHERE vta.tag_id = t.id) as video_count
      FROM video_tags t
      ORDER BY t.name ASC
    `).all() as VideoTag[];
    return tags;
  } finally {
    db.close();
  }
}

export function getTagById(id: number): VideoTag | null {
  const db = getDb();
  try {
    const tag = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM video_tag_assignments vta WHERE vta.tag_id = t.id) as video_count
      FROM video_tags t
      WHERE t.id = ?
    `).get(id) as VideoTag | undefined;
    return tag || null;
  } finally {
    db.close();
  }
}

export function getTagBySlug(slug: string): VideoTag | null {
  const db = getDb();
  try {
    const tag = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM video_tag_assignments vta WHERE vta.tag_id = t.id) as video_count
      FROM video_tags t
      WHERE t.slug = ?
    `).get(slug) as VideoTag | undefined;
    return tag || null;
  } finally {
    db.close();
  }
}

export function createTag(data: {
  name: string;
  color?: string;
}): number {
  const db = getDb();
  try {
    const slug = slugify(data.name);

    const result = db.prepare(`
      INSERT INTO video_tags (name, slug, color)
      VALUES (?, ?, ?)
    `).run(data.name, slug, data.color || '#6b7280');

    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function updateTag(id: number, data: Partial<Omit<VideoTag, 'id' | 'video_count'>>): boolean {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key === 'name') {
        fields.push('name = ?', 'slug = ?');
        values.push(value as string, slugify(value as string));
      } else {
        fields.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (fields.length === 0) return false;
    values.push(id);

    const result = db.prepare(`
      UPDATE video_tags
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function deleteTag(id: number): boolean {
  const db = getDb();
  try {
    // Tag assignments are deleted by CASCADE
    const result = db.prepare('DELETE FROM video_tags WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// ============ Video Tag Assignment Operations ============

export function getVideoTags(videoId: number): VideoTag[] {
  const db = getDb();
  try {
    const tags = db.prepare(`
      SELECT t.*
      FROM video_tags t
      JOIN video_tag_assignments vta ON t.id = vta.tag_id
      WHERE vta.video_id = ?
      ORDER BY t.name ASC
    `).all(videoId) as VideoTag[];
    return tags;
  } finally {
    db.close();
  }
}

export function setVideoTags(videoId: number, tagIds: number[]): boolean {
  const db = getDb();
  try {
    db.transaction(() => {
      // Remove existing assignments
      db.prepare('DELETE FROM video_tag_assignments WHERE video_id = ?').run(videoId);

      // Add new assignments
      const stmt = db.prepare('INSERT INTO video_tag_assignments (video_id, tag_id) VALUES (?, ?)');
      for (const tagId of tagIds) {
        stmt.run(videoId, tagId);
      }
    })();
    return true;
  } finally {
    db.close();
  }
}

export function addVideoTag(videoId: number, tagId: number): boolean {
  const db = getDb();
  try {
    try {
      db.prepare('INSERT INTO video_tag_assignments (video_id, tag_id) VALUES (?, ?)').run(videoId, tagId);
      return true;
    } catch {
      // Already assigned
      return false;
    }
  } finally {
    db.close();
  }
}

export function removeVideoTag(videoId: number, tagId: number): boolean {
  const db = getDb();
  try {
    const result = db.prepare('DELETE FROM video_tag_assignments WHERE video_id = ? AND tag_id = ?').run(videoId, tagId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// ============ Video Category Assignment Operations ============

export function setVideoCategory(videoId: number, categoryId: number | null): boolean {
  const db = getDb();
  try {
    const result = db.prepare(`
      UPDATE processed_local_videos SET category_id = ? WHERE id = ?
    `).run(categoryId, videoId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function getVideoCategory(videoId: number): VideoCategory | null {
  const db = getDb();
  try {
    const category = db.prepare(`
      SELECT c.*
      FROM video_categories c
      JOIN processed_local_videos v ON v.category_id = c.id
      WHERE v.id = ?
    `).get(videoId) as VideoCategory | undefined;
    return category || null;
  } finally {
    db.close();
  }
}

// ============ Query Helpers ============

export function getVideosByCategory(categoryId: number | null): { id: number; title: string; folder_id: string | null }[] {
  const db = getDb();
  try {
    const whereClause = categoryId === null
      ? 'WHERE category_id IS NULL'
      : 'WHERE category_id = ?';
    const params = categoryId === null ? [] : [categoryId];

    const videos = db.prepare(`
      SELECT id, title, folder_id FROM processed_local_videos
      ${whereClause}
      ORDER BY title ASC
    `).all(...params) as { id: number; title: string; folder_id: string | null }[];
    return videos;
  } finally {
    db.close();
  }
}

export function getVideosByTag(tagId: number): { id: number; title: string; folder_id: string | null }[] {
  const db = getDb();
  try {
    const videos = db.prepare(`
      SELECT v.id, v.title, v.folder_id
      FROM processed_local_videos v
      JOIN video_tag_assignments vta ON v.id = vta.video_id
      WHERE vta.tag_id = ?
      ORDER BY v.title ASC
    `).all(tagId) as { id: number; title: string; folder_id: string | null }[];
    return videos;
  } finally {
    db.close();
  }
}

export function getVideoPlaylistMembership(videoId: number): { playlist_id: number; playlist_name: string; position: number }[] {
  const db = getDb();
  try {
    const memberships = db.prepare(`
      SELECT pi.playlist_id, p.name as playlist_name, pi.position
      FROM playlist_items pi
      JOIN video_playlists p ON pi.playlist_id = p.id
      WHERE pi.video_id = ?
      ORDER BY p.name ASC
    `).all(videoId) as { playlist_id: number; playlist_name: string; position: number }[];
    return memberships;
  } finally {
    db.close();
  }
}
