-- ============================================================================
-- Migration 004: Add Model Rules and Failed Entry Conditions
-- Purpose: Support MODEL-FIRST thinking instead of skill concatenation
-- ============================================================================

-- Add explicit model rules (vs trade_flow_rules which is about sequence)
ALTER TABLE skill_combinations ADD COLUMN model_rules TEXT;
-- Schema: JSON array of explicit rules
-- [
--   "FVG touch MUST be followed by CISD before entry",
--   "Entry direction MUST align with Daily bias",
--   "H1 structure levels MUST be respected"
-- ]

-- Add failed entry conditions (when to SKIP - from video red X marks)
ALTER TABLE skill_combinations ADD COLUMN failed_entry_conditions TEXT;
-- Schema: JSON array of skip conditions
-- [
--   {"condition": "fvg_touch && !cisd_confirmed", "reason": "FVG touch without CISD"},
--   {"condition": "against_daily_bias", "reason": "Setup against HTF direction"},
--   {"condition": "structure_broken", "reason": "Price broke key structure"}
-- ]

-- Add model intent description (human-readable purpose)
ALTER TABLE skill_combinations ADD COLUMN model_intent TEXT;
-- Example: "Trade the distribution phase of a 4-hour candle by waiting for
--           the wick to form (via CISD/protected swing), then trade the
--           body/expansion."

-- Add visual context reference (links to video frames)
ALTER TABLE skill_combinations ADD COLUMN visual_context_path TEXT;
-- Example: "data/architectures/ttfm-video-context-nlw-pzhoViq.md"

-- Index for visual context queries
CREATE INDEX IF NOT EXISTS idx_skill_combinations_visual_context
ON skill_combinations(visual_context_path);
