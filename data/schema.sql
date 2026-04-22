-- ============================================================================
-- NinjaTrader Script Builder - Database Schema
-- ============================================================================

-- Enable WAL mode for better concurrency
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================================
-- SKILLS KNOWLEDGE BASE
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- e.g., "CISD Pattern Detection"
  slug TEXT NOT NULL UNIQUE,           -- e.g., "cisd-pattern-detection"
  category TEXT NOT NULL,              -- e.g., "Entry Patterns", "Risk Management"
  subcategory TEXT,                    -- e.g., "Reversal", "Continuation"
  description TEXT NOT NULL,           -- Plain text explanation

  -- Code components
  code_snippet TEXT,                   -- C# code template
  variables_required TEXT,             -- JSON: ["rangeHigh", "rangeLow"]
  dependencies TEXT,                   -- JSON: ["range-building", "bias-calculation"]

  -- Metadata
  complexity TEXT DEFAULT 'medium',    -- simple, medium, complex
  trading_style TEXT,                  -- scalping, swing, position
  timeframe TEXT,                      -- intraday, daily, weekly

  -- AI assistance
  nlp_keywords TEXT,                   -- JSON: ["sweep", "liquidity", "stop hunt"]
  usage_examples TEXT,                 -- JSON array of example descriptions
  common_combinations TEXT,            -- JSON: skills often used together

  -- Tracking
  usage_count INTEGER DEFAULT 0,       -- How many scripts use this
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indicator generation
  indicator_path TEXT,                 -- Path to generated indicator .cs file
  needs_indicator INTEGER DEFAULT 0,   -- 1 if category needs visual representation
  dll_class_name TEXT                  -- Class name for DLL compilation (e.g., "LiquiditySweep")
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_complexity ON skills(complexity);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);

-- Full-text search on skills
CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
  name,
  description,
  nlp_keywords,
  content='skills',
  content_rowid='id'
);

-- ============================================================================
-- PROJECTS & SCRIPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                  -- e.g., "7:40 Bias Strategies"
  slug TEXT NOT NULL UNIQUE,           -- e.g., "740-bias-strategies"
  description TEXT,

  -- Organization
  status TEXT DEFAULT 'active',        -- active, archived, testing
  trading_account TEXT,                -- sim, live-micro, live-standard

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_worked_on TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,

  -- Identity
  name TEXT NOT NULL,                  -- e.g., "SevenFortyBiasV6"
  version INTEGER DEFAULT 1,           -- Auto-increment per name
  description TEXT,

  -- File system
  file_path TEXT NOT NULL UNIQUE,      -- Absolute path to .cs file
  file_hash TEXT,                      -- SHA256 for change detection

  -- Generation metadata
  generation_prompt TEXT,              -- Original NL prompt from user
  ai_conversation_id TEXT,             -- Link to chat history if stored
  skills_used TEXT,                    -- JSON: [skill_id, skill_id]

  -- Testing & deployment
  compilation_status TEXT,             -- untested, success, failed
  compilation_errors TEXT,             -- Error messages if failed
  backtest_results TEXT,               -- JSON: performance metrics
  deployment_status TEXT,              -- local, sim, live

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scripts_project ON scripts(project_id);
CREATE INDEX IF NOT EXISTS idx_scripts_name_version ON scripts(name, version);
CREATE INDEX IF NOT EXISTS idx_scripts_file_path ON scripts(file_path);

-- ============================================================================
-- JOURNAL & DOCUMENTATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  script_id INTEGER,

  -- Content
  title TEXT NOT NULL,
  entry_type TEXT DEFAULT 'note',      -- note, trade-idea, analysis, lesson
  content TEXT NOT NULL,               -- Markdown supported

  -- Attachments
  has_attachments BOOLEAN DEFAULT 0,
  attachment_count INTEGER DEFAULT 0,

  -- Trading context
  trade_date DATE,                     -- If analyzing specific trading day
  symbols TEXT,                        -- JSON: ["ES", "NQ"]

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_project ON journal_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_journal_script ON journal_entries(script_id);
CREATE INDEX IF NOT EXISTS idx_journal_type ON journal_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(trade_date);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL,

  -- File info
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,      -- Relative to attachments dir
  file_type TEXT NOT NULL,             -- image/png, image/jpeg, application/pdf
  file_size INTEGER,                   -- Bytes

  -- Visual aids
  caption TEXT,                        -- User description
  width INTEGER,                       -- For images
  height INTEGER,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_entry ON attachments(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_attachments_type ON attachments(file_type);

-- Full-text search on journal
CREATE VIRTUAL TABLE IF NOT EXISTS journal_fts USING fts5(
  title,
  content,
  content='journal_entries',
  content_rowid='id'
);

-- ============================================================================
-- SKILL USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS script_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,

  -- How was it used?
  implementation_notes TEXT,           -- Custom modifications

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,

  UNIQUE(script_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_script_skills_script ON script_skills(script_id);
CREATE INDEX IF NOT EXISTS idx_script_skills_skill ON script_skills(skill_id);

-- ============================================================================
-- SKILL SOURCE TRACKING
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_sources_unique_skill_source
  ON skill_sources(skill_id, source_type, source_url);

-- Track commonly used skill combinations (enhanced for full model intelligence)
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- ============================================================================
  -- MODEL INTELLIGENCE FIELDS (v2.0)
  -- ============================================================================

  -- Model type and source
  model_type TEXT DEFAULT 'combination',    -- 'combination' | 'complete_model'
  source_video_url TEXT,                    -- YouTube URL if extracted from video
  source_video_title TEXT,                  -- Video title for reference
  extraction_confidence REAL,               -- 0.0-1.0 confidence score

  -- Trade flow specification (JSON)
  trade_flow_rules TEXT,                    -- Entry/exit conditional logic
  -- Schema: {
  --   "pre_market": [{"skill": "slug", "output": "var_name"}],
  --   "entry": {"trigger": "skill", "confirmations": [...], "filters": [...]},
  --   "exit": {"targets": [...], "stops": [...]}
  -- }

  context_annotations TEXT,                 -- HTF, sessions, edge cases
  -- Schema: {
  --   "htf_timeframes": {"bias": "D1", "structure": "H1", "entry": "M5"},
  --   "session_restrictions": {"allowed": [...], "forbidden": [...], "reason": "..."},
  --   "edge_cases": {"11am_window": "Consider fading - historically losers"}
  -- }

  state_machine_spec TEXT,                  -- State transitions for code generation
  -- Schema: {
  --   "initial_state": "WAITING_FOR_SESSION",
  --   "states": [{"name": "...", "skill_ids": [...], "transitions": [...]}]
  -- }

  -- Per-skill context within this model
  skill_contexts TEXT,                      -- JSON: {skill_id: {phase, order, conditions, notes}}
  -- Schema: {
  --   "3": {"phase": "entry", "order": 1, "conditions": "After range forms", "notes": "..."},
  --   "7": {"phase": "risk", "order": 1, "conditions": "At 1R profit", "notes": "..."}
  -- }

  -- Iteration tracking
  iteration_log TEXT,                       -- JSON array of iteration insights
  -- Schema: [
  --   {"version": 5, "problem": "mfe_reversal", "solution": "Added partials", "impact": "+$2600", "confidence": 0.8}
  -- ]

  backtest_history TEXT,                    -- JSON array of backtest results
  -- Schema: [
  --   {"date": "2024-01-15", "csv_path": "...", "trades": 45, "win_rate": 65, "pf": 2.1}
  -- ]

  variant_of INTEGER,                       -- Parent model ID if this is a variant

  -- Versioning
  version INTEGER DEFAULT 1,                -- Model version number
  status TEXT DEFAULT 'draft',              -- draft, backtested, validated, production
  created_from TEXT                         -- youtube, iteration, manual

  -- Note: FOREIGN KEY for variant_of not enforced to allow flexibility
);

CREATE INDEX IF NOT EXISTS idx_skill_combinations_name ON skill_combinations(name);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_usage ON skill_combinations(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_model_type ON skill_combinations(model_type);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_status ON skill_combinations(status);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_source_url ON skill_combinations(source_video_url);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_variant ON skill_combinations(variant_of);

-- ============================================================================
-- MODEL ITERATIONS (Track optimization cycles for model learning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,              -- References skill_combinations(id)

  -- Version tracking
  version_before INTEGER NOT NULL,        -- Model version before this iteration
  version_after INTEGER NOT NULL,         -- Model version after this iteration
  iteration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Analysis context
  backtest_csv_path TEXT,                 -- Path to analyzed backtest CSV
  trades_analyzed INTEGER,                -- Number of trades in analysis
  problems_detected TEXT,                 -- JSON: [{pattern, severity, impact, trades_affected}]
  -- Schema: [
  --   {"pattern": "mfe_reversal", "severity": "high", "impact": -5200, "trades_affected": 4}
  -- ]

  -- Changes made
  solution_applied TEXT NOT NULL,         -- Description of the fix
  skills_added TEXT,                      -- JSON: [skill_ids added]
  skills_removed TEXT,                    -- JSON: [skill_ids removed]
  parameters_changed TEXT,                -- JSON: {param: {before, after}}
  trade_flow_changes TEXT,                -- JSON: description of flow changes

  -- Results
  impact_prediction REAL,                 -- Expected $ improvement
  impact_actual REAL,                     -- Actual $ improvement (filled after next backtest)

  -- Learning capture
  insight_captured TEXT,                  -- What we learned from this iteration
  -- Schema: {
  --   "problem_pattern": "mfe_reversal",
  --   "solution_applied": "partial-profits at 1R",
  --   "conditions": {"applies_when": "...", "does_not_apply_when": "..."},
  --   "generalizable": true,
  --   "suggested_rule": "For any sweep reversal model, take 50% at 1R"
  -- }
  insight_confidence REAL,                -- 0.0-1.0 confidence in the insight

  FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_iterations_model ON model_iterations(model_id);
CREATE INDEX IF NOT EXISTS idx_model_iterations_date ON model_iterations(iteration_date);
CREATE INDEX IF NOT EXISTS idx_model_iterations_version ON model_iterations(version_after);

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

-- ============================================================================
-- VIDEO FRAMES (Visual context for strategy-iterator)
-- ============================================================================

-- Track persisted video frames for visual contradiction detection
CREATE TABLE IF NOT EXISTS video_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,                -- YouTube video ID

  -- Frame identification
  frame_filename TEXT NOT NULL,          -- e.g., "frame_001.jpg"
  frame_index INTEGER,                   -- 0-based index within video

  -- Temporal context
  timestamp_sec INTEGER,                 -- Seconds into video
  timestamp_str TEXT,                    -- Human-readable "MM:SS"

  -- Classification
  frame_type TEXT,                       -- 'entry' | 'exit' | 'risk' | 'context' | 'general'
  sad_section TEXT,                      -- Which SAD section this frame illustrates
  categories TEXT,                       -- JSON: ["entry", "context"] - all matching categories

  -- Contradiction detection support
  is_contradiction_relevant INTEGER DEFAULT 0,  -- 1 if frame relevant for contradiction checks

  -- Transcript context
  transcript_segment TEXT,               -- First 500 chars of transcript around this frame

  -- Linking
  sad_path TEXT,                         -- Path to associated SAD file

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (video_id) REFERENCES processed_videos(video_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_video_frames_video_id ON video_frames(video_id);
CREATE INDEX IF NOT EXISTS idx_video_frames_type ON video_frames(frame_type);
CREATE INDEX IF NOT EXISTS idx_video_frames_contradiction ON video_frames(is_contradiction_relevant);
CREATE INDEX IF NOT EXISTS idx_video_frames_section ON video_frames(sad_section);

-- ============================================================================
-- TRIGGERS FOR MAINTENANCE
-- ============================================================================

-- Update skill usage count when script_skills relationship is added
CREATE TRIGGER IF NOT EXISTS update_skill_usage_count
AFTER INSERT ON script_skills
BEGIN
  UPDATE skills
  SET usage_count = (
    SELECT COUNT(DISTINCT script_id)
    FROM script_skills
    WHERE skill_id = NEW.skill_id
  ),
  updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.skill_id;
END;

-- Decrement skill usage count when relationship is removed
CREATE TRIGGER IF NOT EXISTS decrement_skill_usage_count
AFTER DELETE ON script_skills
BEGIN
  UPDATE skills
  SET usage_count = (
    SELECT COUNT(DISTINCT script_id)
    FROM script_skills
    WHERE skill_id = OLD.skill_id
  ),
  updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.skill_id;
END;

-- Update project last_worked_on when script is added
CREATE TRIGGER IF NOT EXISTS update_project_worked_on
AFTER INSERT ON scripts
BEGIN
  UPDATE projects
  SET last_worked_on = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.project_id;
END;

-- Update attachment count when attachment is added
CREATE TRIGGER IF NOT EXISTS increment_attachment_count
AFTER INSERT ON attachments
BEGIN
  UPDATE journal_entries
  SET attachment_count = attachment_count + 1,
      has_attachments = 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.journal_entry_id;
END;

-- Update attachment count when attachment is removed
CREATE TRIGGER IF NOT EXISTS decrement_attachment_count
AFTER DELETE ON attachments
BEGIN
  UPDATE journal_entries
  SET attachment_count = (
    SELECT COUNT(*) FROM attachments WHERE journal_entry_id = OLD.journal_entry_id
  ),
  has_attachments = (
    CASE WHEN (SELECT COUNT(*) FROM attachments WHERE journal_entry_id = OLD.journal_entry_id) > 0
    THEN 1 ELSE 0 END
  ),
  updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.journal_entry_id;
END;

-- Sync FTS tables for skills
CREATE TRIGGER IF NOT EXISTS skills_fts_insert
AFTER INSERT ON skills
BEGIN
  INSERT INTO skills_fts(rowid, name, description, nlp_keywords)
  VALUES (NEW.id, NEW.name, NEW.description, NEW.nlp_keywords);
END;

CREATE TRIGGER IF NOT EXISTS skills_fts_update
AFTER UPDATE ON skills
BEGIN
  UPDATE skills_fts
  SET name = NEW.name,
      description = NEW.description,
      nlp_keywords = NEW.nlp_keywords
  WHERE rowid = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS skills_fts_delete
AFTER DELETE ON skills
BEGIN
  DELETE FROM skills_fts WHERE rowid = OLD.id;
END;

-- Sync FTS tables for journal
CREATE TRIGGER IF NOT EXISTS journal_fts_insert
AFTER INSERT ON journal_entries
BEGIN
  INSERT INTO journal_fts(rowid, title, content)
  VALUES (NEW.id, NEW.title, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS journal_fts_update
AFTER UPDATE ON journal_entries
BEGIN
  UPDATE journal_fts
  SET title = NEW.title,
      content = NEW.content
  WHERE rowid = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS journal_fts_delete
AFTER DELETE ON journal_entries
BEGIN
  DELETE FROM journal_fts WHERE rowid = OLD.id;
END;

-- ============================================================================
-- INITIAL DATA (Optional seed data)
-- ============================================================================

-- You can uncomment this section to add initial test data
-- INSERT INTO projects (name, slug, description, status) VALUES
--   ('7:40 Bias Strategies', '740-bias-strategies', 'Trading strategies based on 7:40 AM bias', 'active');
