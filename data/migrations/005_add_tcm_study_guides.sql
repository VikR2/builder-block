-- Migration: Add TCM Study Guides table
-- Date: 2026-01-16

-- Generated study guides (persisted)
CREATE TABLE IF NOT EXISTS tcm_study_guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,        -- Markdown
  skill_ids TEXT,               -- JSON: [101, 102]
  source_topic TEXT,            -- What question generated this
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FTS for study guide search
CREATE VIRTUAL TABLE IF NOT EXISTS tcm_study_guides_fts USING fts5(
  title,
  content,
  content='tcm_study_guides',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS tcm_study_guides_ai AFTER INSERT ON tcm_study_guides BEGIN
  INSERT INTO tcm_study_guides_fts(rowid, title, content)
  VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS tcm_study_guides_ad AFTER DELETE ON tcm_study_guides BEGIN
  INSERT INTO tcm_study_guides_fts(tcm_study_guides_fts, rowid, title, content)
  VALUES ('delete', old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS tcm_study_guides_au AFTER UPDATE ON tcm_study_guides BEGIN
  INSERT INTO tcm_study_guides_fts(tcm_study_guides_fts, rowid, title, content)
  VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO tcm_study_guides_fts(rowid, title, content)
  VALUES (new.id, new.title, new.content);
END;

-- Index for quick slug lookups
CREATE INDEX IF NOT EXISTS idx_tcm_study_guides_slug ON tcm_study_guides(slug);
