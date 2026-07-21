-- Migration: Add video organization tables (categories, playlists, tags)
-- Created: 2026-01-18
-- Purpose: YouTube Studio-style video organization for TCM admin panel

-- Video categories (folders)
CREATE TABLE IF NOT EXISTS video_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    icon TEXT,                    -- lucide icon name
    color TEXT DEFAULT '#f59e0b', -- amber default
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Video playlists (ordered courses)
CREATE TABLE IF NOT EXISTS video_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_published INTEGER DEFAULT 1,  -- SQLite boolean
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Playlist items (video ordering)
CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    video_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (playlist_id) REFERENCES video_playlists(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, video_id)
);

-- Video tags
CREATE TABLE IF NOT EXISTS video_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6b7280'
);

-- Video-tag assignments
CREATE TABLE IF NOT EXISTS video_tag_assignments (
    video_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (video_id, tag_id),
    FOREIGN KEY (tag_id) REFERENCES video_tags(id) ON DELETE CASCADE
);

-- Add category FK to processed_local_videos
-- Note: SQLite ALTER TABLE can only add columns, not constraints
ALTER TABLE processed_local_videos ADD COLUMN category_id INTEGER;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_position ON playlist_items(playlist_id, position);
CREATE INDEX IF NOT EXISTS idx_video_tag_assignments_video ON video_tag_assignments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_tag_assignments_tag ON video_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_videos_category ON processed_local_videos(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_order ON video_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_playlists_order ON video_playlists(display_order);
CREATE INDEX IF NOT EXISTS idx_playlists_published ON video_playlists(is_published);
