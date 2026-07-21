-- Migration: Add lesson-ready publication gating for local videos
-- Created: 2026-03-08
-- Purpose: Keep student-visible videos restricted to ready lesson artifacts

ALTER TABLE processed_local_videos ADD COLUMN is_published INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_local_videos_published_ready
    ON processed_local_videos(is_published, processing_status);
