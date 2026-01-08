-- ============================================================================
-- Migration 006: Add Visual Interpretations for Frame-Driven Code Generation
-- Purpose: Store verified pattern interpretations for reuse during code generation
-- Date: 2026-01-07
-- ============================================================================

-- Add visual_interpretations column for pattern-level insights
-- This enables quick lookup during code generation without re-analyzing frames
ALTER TABLE skill_combinations ADD COLUMN visual_interpretations TEXT;

-- Schema: JSON object with pattern-specific interpretations
-- {
--   "cisd_pattern": {
--     "frame_ref": "9AL41xON3hA/frame_008.jpg",
--     "interpretation": "OB = last opposing candle (index [1]), not reversal candle",
--     "code_implication": "m5OBHigh = Highs[IDX_ENTRY][1], not Highs[IDX_ENTRY][0]",
--     "verified_by_user": true,
--     "verified_date": "2026-01-07"
--   },
--   "fvg_c1c2": {
--     "frame_ref": "9AL41xON3hA/frame_004.jpg",
--     "interpretation": "C1/C2 must print within FVG zone, wick outside OK",
--     "code_implication": "Check candle.Low <= fvgTop && candle.High >= fvgBottom",
--     "poi_type_rule": "fvg",
--     "verified_by_user": true,
--     "verified_date": "2026-01-07"
--   },
--   "ob_c1c2": {
--     "frame_ref": null,
--     "interpretation": "C1/C2 must print OUTSIDE OB to signal invalidation",
--     "code_implication": "If C1/C2 inside OB, POI remains valid",
--     "poi_type_rule": "ob",
--     "verified_by_user": true,
--     "verified_date": "2026-01-07"
--   },
--   "poi_invalidation": {
--     "frame_ref": null,
--     "interpretation": "Bullish POI invalid on close BELOW zone, bearish on close ABOVE",
--     "code_implication": "if (bias == Bullish && close < poiBottom) invalidate",
--     "threshold": "6 consecutive closes",
--     "verified_by_user": true,
--     "verified_date": "2026-01-07"
--   }
-- }

-- Add POI type rules column for quick reference during code generation
ALTER TABLE skill_combinations ADD COLUMN poi_type_rules TEXT;

-- Schema: JSON object with POI-type-specific validation rules
-- {
--   "fvg": {
--     "c1c2_location": "must_be_within",
--     "wick_outside_ok": true,
--     "invalidation_direction": "opposite_close",
--     "invalidation_threshold": "6_consecutive_closes"
--   },
--   "ob": {
--     "c1c2_location": "outside_signals_invalidation",
--     "inside_means": "poi_remains_valid",
--     "ob_candle_reference": "last_opposing_not_reversal",
--     "stop_reference": "full_structure_not_just_body"
--   },
--   "swing": {
--     "c1c2_location": "flexible",
--     "invalidation_rule": "context_dependent"
--   }
-- }

-- Index for models with visual interpretations (for MCP queries)
CREATE INDEX IF NOT EXISTS idx_skill_combinations_has_visual_interp
ON skill_combinations(id) WHERE visual_interpretations IS NOT NULL;

-- Track interpretation verification history
CREATE TABLE IF NOT EXISTS interpretation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source identification
  model_id INTEGER NOT NULL,
  pattern_name TEXT NOT NULL,         -- 'cisd_pattern', 'fvg_c1c2', etc.

  -- Interpretation content
  frame_ref TEXT,                     -- Path to frame that was analyzed
  interpretation TEXT NOT NULL,       -- What Claude interpreted
  code_implication TEXT,              -- How it affects code generation

  -- Verification
  user_verified BOOLEAN DEFAULT FALSE,
  user_feedback TEXT,                 -- User's correction/confirmation

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP,

  FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interpretation_history_model ON interpretation_history(model_id);
CREATE INDEX IF NOT EXISTS idx_interpretation_history_pattern ON interpretation_history(pattern_name);
CREATE INDEX IF NOT EXISTS idx_interpretation_history_verified ON interpretation_history(user_verified);
