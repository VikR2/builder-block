-- ============================================================================
-- Migration 005: Add Trade Examples and Visual Evidence Tables
-- Purpose: Enable visual trade analysis for accurate stop/entry reference points
-- Date: 2026-01-06
-- ============================================================================

-- Track actual trade examples extracted from video frames
-- These provide measured stop/entry reference points (not transcript interpretation)
CREATE TABLE IF NOT EXISTS trade_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source identification
  video_id TEXT NOT NULL,               -- YouTube video ID (e.g., '9AL41xON3hA')
  model_id INTEGER,                     -- FK to skill_combinations.id
  frame_path TEXT NOT NULL,             -- Path to frame showing the trade
  frame_number INTEGER,                 -- Frame number in video
  timestamp_seconds REAL,               -- Timestamp in video

  -- Trade direction
  direction TEXT NOT NULL,              -- 'LONG' or 'SHORT'

  -- Price levels (extracted from frame)
  entry_price REAL,
  stop_price REAL,
  target_price REAL,

  -- Measured stop reference (KEY for code generation)
  stop_distance_ticks REAL,             -- Measured: |entry - stop| / tick_size
  stop_reference_point TEXT,            -- 'CISD_CANDLE_LOW', 'OB_BODY_LOW', 'FVG_BOTTOM', etc.
  stop_reference_measurement TEXT,      -- JSON: {"anchor": "CISD_CANDLE_LOW", "offset_ticks": 3}

  -- Entry reference
  entry_reference_point TEXT,           -- 'OB_CLOSE', 'FVG_50_PCT', 'SWING_LEVEL', etc.
  entry_reference_measurement TEXT,     -- JSON: {"anchor": "OB_CLOSE", "offset_ticks": 0}

  -- Target reference
  target_reference_point TEXT,          -- 'PDH', 'OPPOSING_FVG', 'FIXED_RR', etc.
  target_rr_ratio REAL,                 -- Risk:Reward ratio (e.g., 2.0 for 2R)

  -- Analysis metadata
  extraction_confidence REAL,           -- 0.0-1.0, how clear the frame data is
  analysis_notes TEXT,                  -- Notes about what was measured

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trade_examples_video ON trade_examples(video_id);
CREATE INDEX IF NOT EXISTS idx_trade_examples_model ON trade_examples(model_id);
CREATE INDEX IF NOT EXISTS idx_trade_examples_direction ON trade_examples(direction);
CREATE INDEX IF NOT EXISTS idx_trade_examples_stop_ref ON trade_examples(stop_reference_point);

-- Track visual evidence linking model rules to video frames
-- Enables traceability: every rule must have source evidence
CREATE TABLE IF NOT EXISTS visual_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source identification
  model_id INTEGER NOT NULL,            -- FK to skill_combinations.id
  video_id TEXT NOT NULL,               -- YouTube video ID

  -- Rule information
  rule_type TEXT NOT NULL,              -- 'ENTRY', 'STOP', 'BIAS', 'CONFIRMATION', 'SKIP'
  rule_text TEXT NOT NULL,              -- The extracted rule text

  -- Evidence frames (multiple frames can support one rule)
  evidence_frames TEXT NOT NULL,        -- JSON array: [{"frame": "frame_008.jpg", "timestamp": 120.5}]

  -- Measurements from visual analysis
  measured_values TEXT,                 -- JSON: {"stop_distance": 13, "zone_height": 15}

  -- Source comparison
  transcript_text TEXT,                 -- What the transcript said
  visual_text TEXT,                     -- What the visual showed
  source_match BOOLEAN,                 -- Do transcript and visual agree?

  -- Confidence scoring
  confidence REAL NOT NULL,             -- 0.0-1.0
  requires_verification BOOLEAN,        -- True if confidence < 0.7 or sources don't match
  verification_notes TEXT,              -- Notes for human reviewer

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,                -- When human verified
  verified_by TEXT,                     -- Who verified

  FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_visual_evidence_model ON visual_evidence(model_id);
CREATE INDEX IF NOT EXISTS idx_visual_evidence_video ON visual_evidence(video_id);
CREATE INDEX IF NOT EXISTS idx_visual_evidence_type ON visual_evidence(rule_type);
CREATE INDEX IF NOT EXISTS idx_visual_evidence_confidence ON visual_evidence(confidence);
CREATE INDEX IF NOT EXISTS idx_visual_evidence_needs_verify ON visual_evidence(requires_verification);

-- Track understanding diagrams generated for each model
-- These are the anti-hallucination Mermaid diagrams
CREATE TABLE IF NOT EXISTS understanding_diagrams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source identification
  model_id INTEGER NOT NULL,            -- FK to skill_combinations.id
  video_id TEXT NOT NULL,               -- YouTube video ID

  -- Diagram content
  mermaid_code TEXT NOT NULL,           -- The Mermaid diagram source
  evidence_panel TEXT NOT NULL,         -- The evidence panel content

  -- Concepts tracked
  concepts_extracted INTEGER,           -- Count of concepts in diagram
  concepts_verified INTEGER,            -- Count with high confidence
  concepts_flagged INTEGER,             -- Count needing verification

  -- Approval tracking
  user_approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP,
  approval_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_understanding_diagrams_model ON understanding_diagrams(model_id);
CREATE INDEX IF NOT EXISTS idx_understanding_diagrams_video ON understanding_diagrams(video_id);
CREATE INDEX IF NOT EXISTS idx_understanding_diagrams_approved ON understanding_diagrams(user_approved);

-- Track code-visual validation results
-- Catches mismatches like V18's m5OBBodyLow vs CISD candle
CREATE TABLE IF NOT EXISTS code_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source identification
  model_id INTEGER NOT NULL,
  strategy_file TEXT NOT NULL,          -- Path to .cs file validated
  strategy_version TEXT,                -- e.g., 'V19'

  -- Validation results
  validation_passed BOOLEAN,
  checks_total INTEGER,
  checks_passed INTEGER,
  checks_failed INTEGER,

  -- Detailed results
  validation_results TEXT NOT NULL,     -- JSON array of check results
  -- Schema: [
  --   {"check": "stop_placement", "code_uses": "m5OBBodyLow", "video_shows": "CISD_CANDLE_LOW", "passed": false},
  --   {"check": "entry_placement", "code_uses": "obClose", "video_shows": "OB_CLOSE", "passed": true}
  -- ]

  -- User decision
  user_action TEXT,                     -- 'APPROVE', 'AUTO_FIX', 'MANUAL_FIX', 'OVERRIDE'
  override_reason TEXT,                 -- If user chose to override failed validation

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,

  FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_code_validations_model ON code_validations(model_id);
CREATE INDEX IF NOT EXISTS idx_code_validations_passed ON code_validations(validation_passed);
CREATE INDEX IF NOT EXISTS idx_code_validations_strategy ON code_validations(strategy_file);

-- Add new columns to processed_videos for trade example tracking
ALTER TABLE processed_videos ADD COLUMN trade_examples_extracted INTEGER DEFAULT 0;
ALTER TABLE processed_videos ADD COLUMN visual_evidence_count INTEGER DEFAULT 0;
ALTER TABLE processed_videos ADD COLUMN understanding_verified BOOLEAN DEFAULT FALSE;

-- Add trade_examples reference to skill_combinations
ALTER TABLE skill_combinations ADD COLUMN trade_examples_count INTEGER DEFAULT 0;
ALTER TABLE skill_combinations ADD COLUMN visual_evidence_count INTEGER DEFAULT 0;
ALTER TABLE skill_combinations ADD COLUMN understanding_diagram_id INTEGER;
