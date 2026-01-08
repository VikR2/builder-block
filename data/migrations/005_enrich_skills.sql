-- ============================================================================
-- Migration 005: Enrich Skills for POI-Type Specificity
-- Purpose: Add POI-type awareness and visual references to skills
-- ============================================================================

-- Add POI types that this skill applies to (e.g., FVG-specific, OB-specific)
ALTER TABLE skills ADD COLUMN poi_types TEXT;
-- Schema: JSON array of POI types this skill applies to
-- ["FVG", "OB", "Swing", "CandleHigh", "CandleLow"]
-- null means applies to all POI types

-- Add timeframe context (which timeframe(s) this skill is typically used on)
ALTER TABLE skills ADD COLUMN timeframe_context TEXT;
-- Values: "HTF_only", "LTF_only", "any", or specific like "1H,4H"
-- null means applies to any timeframe

-- Add visual examples (frame references showing this skill in action)
ALTER TABLE skills ADD COLUMN visual_examples TEXT;
-- Schema: JSON array of frame references
-- [
--   {"video_id": "9AL41xON3hA", "frame": "frame_0008.jpg", "description": "C2 closure example"},
--   {"video_id": "9AL41xON3hA", "frame": "frame_0015.jpg", "description": "Entry execution"}
-- ]

-- Create poi_type_rules table for POI-specific validation rules
CREATE TABLE IF NOT EXISTS poi_type_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poi_type TEXT NOT NULL,                -- "FVG", "OB", "Swing", "CandleHigh", "CandleLow"
  rule_type TEXT NOT NULL,               -- "c1_confirmation", "c2_confirmation", "invalidation", "entry"
  rule_text TEXT NOT NULL,               -- Human-readable rule
  code_pattern TEXT,                     -- C# code snippet implementing the rule
  timeframe_restriction TEXT,            -- null = any, or "HTF_only", "LTF_only"
  source_video_id TEXT,                  -- Video where this rule was extracted from
  source_frame TEXT,                     -- Frame showing this rule in action
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(poi_type, rule_type)            -- One rule per POI type per rule type
);

-- Index for fast POI type lookups
CREATE INDEX IF NOT EXISTS idx_poi_type_rules_poi_type
ON poi_type_rules(poi_type);

-- Index for rule type queries
CREATE INDEX IF NOT EXISTS idx_poi_type_rules_rule_type
ON poi_type_rules(rule_type);

-- Insert initial POI-type rules extracted from TTrades Fractal Model video
INSERT OR REPLACE INTO poi_type_rules (poi_type, rule_type, rule_text, code_pattern, source_video_id, source_frame) VALUES
-- FVG Rules
('FVG', 'c1_confirmation', 'C1 candle must close beyond the FVG edge (into the gap)',
 'Close[0] > fvgLow // For bullish FVG\nClose[0] < fvgHigh // For bearish FVG',
 '9AL41xON3hA', 'frame_0008.jpg'),

('FVG', 'c2_confirmation', 'C2 candle must close beyond C1 high/low (continuation)',
 'Close[0] > c1High // For bullish\nClose[0] < c1Low // For bearish',
 '9AL41xON3hA', 'frame_0010.jpg'),

('FVG', 'invalidation', 'FVG invalidates when completely filled (price trades through entire gap)',
 'if (Low[0] <= fvgLow && High[0] >= fvgHigh) fvgInvalidated = true;',
 '9AL41xON3hA', 'frame_0012.jpg'),

-- Order Block Rules
('OB', 'c1_confirmation', 'C1 candle must close beyond the OB body (not just wick)',
 'Close[0] > orderBlockHigh // For bullish OB\nClose[0] < orderBlockLow // For bearish OB',
 '9AL41xON3hA', 'frame_0014.jpg'),

('OB', 'c2_confirmation', 'C2 candle must show continuation beyond C1 with body closure',
 'Close[0] > c1High && Close[0] > Open[0] // Bullish continuation',
 '9AL41xON3hA', 'frame_0015.jpg'),

('OB', 'invalidation', 'OB invalidates when price closes beyond the opposite side of the OB',
 'if (Close[0] < orderBlockLow) obInvalidated = true; // For bullish OB',
 '9AL41xON3hA', 'frame_0016.jpg'),

-- Swing Point Rules
('Swing', 'c1_confirmation', 'No C1 required for swing levels - they are structural',
 '// Swing levels are structural, entry on reaction',
 '9AL41xON3hA', 'frame_0018.jpg'),

('Swing', 'c2_confirmation', 'Swing reaction confirmed by price rejection (wick or reversal candle)',
 'if (High[0] >= swingHigh && Close[0] < High[0]) swingRejected = true;',
 '9AL41xON3hA', 'frame_0019.jpg'),

('Swing', 'invalidation', 'Swing level invalidates when price closes beyond it decisively',
 'if (Close[0] > swingHigh && Close[1] > swingHigh) swingBroken = true;',
 '9AL41xON3hA', 'frame_0020.jpg');

-- Add structured code_guard field to model_rules in skill_combinations
-- This allows model_rules to include code guards directly
-- Note: model_rules column already exists, this documents the enhanced schema:
-- {
--   "rules": [
--     {
--       "id": "R1",
--       "text": "FVG touch MUST be followed by CISD before entry",
--       "code_guard": "if (fvgTouched && !cisdConfirmed) return;",
--       "debug_msg": "[R1] Entry blocked - CISD not confirmed"
--     }
--   ]
-- }
