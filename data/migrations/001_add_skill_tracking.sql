-- ============================================================================
-- Migration: Add Skill Source Tracking Tables
-- Date: 2025-12-29
-- Description: Add skill_sources, skill_combinations, and processed_videos
-- ============================================================================

-- Track where each skill came from (YouTube videos, manual extraction, etc.)
CREATE TABLE IF NOT EXISTS skill_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,

  -- Source information
  source_type TEXT NOT NULL,           -- 'youtube', 'manual', 'script', 'documentation'
  source_url TEXT,                     -- YouTube URL, website, or file path
  source_title TEXT,                   -- Video title, document name, etc.

  -- Extraction quality
  extraction_confidence REAL,          -- 0.0-1.0, how confident the extraction was
  extraction_method TEXT,              -- 'automatic', 'manual', 'hybrid'

  -- Metadata
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,                          -- Additional context about the extraction

  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_sources_skill ON skill_sources(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_sources_type ON skill_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_skill_sources_url ON skill_sources(source_url);

-- Track commonly used skill combinations
CREATE TABLE IF NOT EXISTS skill_combinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Combination identity
  name TEXT NOT NULL,                  -- e.g., "Sweep Reversal Pattern"
  description TEXT,                    -- What this combination accomplishes

  -- Skills involved
  skill_ids TEXT NOT NULL,             -- JSON array: [1, 3, 7]

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,       -- How many times this combo was used
  last_used_at TIMESTAMP,

  -- Context
  typical_use_case TEXT,               -- When to use this combination
  complexity TEXT DEFAULT 'medium',    -- simple, medium, complex

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skill_combinations_name ON skill_combinations(name);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_usage ON skill_combinations(usage_count DESC);

-- Track processed YouTube videos to prevent duplicates
CREATE TABLE IF NOT EXISTS processed_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Video identification
  url TEXT NOT NULL UNIQUE,            -- Full YouTube URL
  video_id TEXT,                       -- YouTube video ID (extracted from URL)
  title TEXT,
  channel_name TEXT,

  -- Content metrics
  duration_seconds INTEGER,
  transcript_length INTEGER,           -- Character count of transcript

  -- Processing results
  skills_extracted INTEGER DEFAULT 0,  -- Count of new skills extracted
  skills_matched INTEGER DEFAULT 0,    -- Count of existing skills matched
  scripts_generated INTEGER DEFAULT 0, -- Count of scripts generated from this video

  -- Quality
  processing_status TEXT DEFAULT 'completed',  -- completed, failed, partial
  error_message TEXT,                  -- If processing failed

  -- Metadata
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_by TEXT,                   -- Optional: user or session identifier

  UNIQUE(url)
);

CREATE INDEX IF NOT EXISTS idx_processed_videos_url ON processed_videos(url);
CREATE INDEX IF NOT EXISTS idx_processed_videos_video_id ON processed_videos(video_id);
CREATE INDEX IF NOT EXISTS idx_processed_videos_channel ON processed_videos(channel_name);
CREATE INDEX IF NOT EXISTS idx_processed_videos_date ON processed_videos(processed_at);
