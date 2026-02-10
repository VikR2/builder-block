-- Migration: Add Pine Script support to skills table
-- Created: 2026-01-13
-- Purpose: Enable storage of Pine Script code snippets alongside C# snippets

-- Add Pine Script snippet column
-- This stores the TradingView Pine Script v6 equivalent of the C# code
ALTER TABLE skills ADD COLUMN pine_snippet TEXT;

-- Add Pine Script version (default to v6)
ALTER TABLE skills ADD COLUMN pine_version INTEGER DEFAULT 6;

-- Mark which skills have Pine Script equivalents
-- This helps query skills that can be used for Pine output generation
CREATE INDEX IF NOT EXISTS idx_skills_has_pine ON skills(id)
    WHERE pine_snippet IS NOT NULL;

-- Add source tracking for Pine-extracted skills
-- (source_type = 'pinescript' indicates skill was extracted from a Pine file)
-- Note: skill_sources table should already exist from schema.sql
