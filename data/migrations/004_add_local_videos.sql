-- Migration: Add local video tracking table
-- Created: 2026-01-13
-- Purpose: Track processed local MP4 files (non-YouTube sources)

CREATE TABLE IF NOT EXISTS processed_local_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- File identification
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT UNIQUE,           -- SHA256 hash for deduplication
    file_size_bytes INTEGER,

    -- Video metadata
    duration_sec INTEGER,
    frame_count INTEGER,
    resolution TEXT,                 -- e.g., "1920x1080"

    -- Transcription
    transcript_method TEXT,          -- 'whisper', 'manual', 'none'
    whisper_model TEXT,              -- 'tiny', 'base', 'small', 'medium', 'large'
    transcript_path TEXT,            -- Path to saved transcript file

    -- Processing results
    skills_extracted INTEGER DEFAULT 0,
    sad_path TEXT,                   -- Path to generated SAD
    pine_path TEXT,                  -- Path to generated Pine Script

    -- Status tracking
    processing_status TEXT DEFAULT 'pending',  -- pending, processing, completed, failed
    error_message TEXT,

    -- Metadata
    title TEXT,                      -- User-provided or extracted title
    description TEXT,                -- User-provided description
    source_type TEXT,                -- 'webinar', 'screen_recording', 'course', 'other'

    -- Timestamps
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    processed_at TEXT
);

-- Index for finding videos by status
CREATE INDEX IF NOT EXISTS idx_local_videos_status
    ON processed_local_videos(processing_status);

-- Index for finding videos by source type
CREATE INDEX IF NOT EXISTS idx_local_videos_source
    ON processed_local_videos(source_type);

-- Index for hash-based deduplication lookup
CREATE INDEX IF NOT EXISTS idx_local_videos_hash
    ON processed_local_videos(file_hash) WHERE file_hash IS NOT NULL;
