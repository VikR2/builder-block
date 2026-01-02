-- ============================================================================
-- Migration 003: Add Vector Search Support
-- ============================================================================
-- Adds sqlite-vec vector search capability to the skills table
-- Uses nomic-embed-text-v1.5 embeddings (768 dimensions)

-- Add embedding column to skills table
ALTER TABLE skills ADD COLUMN embedding BLOB;

-- Create vector virtual table for similarity search
-- Note: sqlite-vec must be loaded as extension before this runs
CREATE VIRTUAL TABLE IF NOT EXISTS vec_skills USING vec0(
  skill_id INTEGER PRIMARY KEY,
  embedding float[768]
);

-- Index for fast lookups of skills with embeddings
CREATE INDEX IF NOT EXISTS idx_skills_has_embedding
  ON skills(id) WHERE embedding IS NOT NULL;
