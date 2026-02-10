-- Migration: Add TCM Admin Panel tables
-- Created: 2026-01-17
-- Purpose: Track video processing jobs and chunked uploads

-- Processing job tracking
CREATE TABLE IF NOT EXISTS video_processing_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER REFERENCES processed_local_videos(id),
    job_type TEXT NOT NULL DEFAULT 'initial',

    -- Config
    whisper_model TEXT DEFAULT 'base',
    frame_interval INTEGER DEFAULT 45,
    extraction_mode TEXT DEFAULT 'reflective',

    -- Status tracking
    status TEXT DEFAULT 'queued',  -- queued, running, paused, completed, failed
    current_step TEXT,             -- transcribe, frames, embeddings, analysis, write
    progress_percent INTEGER DEFAULT 0,

    -- Checkpoint system
    checkpoint_type TEXT,          -- intent, skills, generation
    checkpoint_data TEXT,          -- JSON: checkpoint-specific data
    checkpoint_response TEXT,      -- JSON: user's response to checkpoint

    -- Results
    skills_extracted INTEGER DEFAULT 0,
    error_message TEXT,

    -- Timestamps
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT
);

-- Chunked upload sessions
CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    received_chunks INTEGER DEFAULT 0,
    chunk_size INTEGER DEFAULT 5242880,  -- 5MB default
    status TEXT DEFAULT 'uploading',      -- uploading, complete, failed, expired
    temp_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
);

-- Processing event log for real-time updates
CREATE TABLE IF NOT EXISTS processing_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER REFERENCES video_processing_jobs(id),
    event_type TEXT NOT NULL,      -- progress, status, checkpoint, error, log
    event_data TEXT,               -- JSON payload
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_jobs_status ON video_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_video_id ON video_processing_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_events_job_id ON processing_events(job_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON processing_events(created_at);
