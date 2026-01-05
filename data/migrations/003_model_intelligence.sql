-- ============================================================================
-- Migration 003: Model Intelligence Enhancement
-- Adds new columns to skill_combinations and creates model_iterations table
-- ============================================================================

-- Add new columns to skill_combinations (existing data preserved)
ALTER TABLE skill_combinations ADD COLUMN model_type TEXT DEFAULT 'combination';
ALTER TABLE skill_combinations ADD COLUMN source_video_url TEXT;
ALTER TABLE skill_combinations ADD COLUMN source_video_title TEXT;
ALTER TABLE skill_combinations ADD COLUMN extraction_confidence REAL;
ALTER TABLE skill_combinations ADD COLUMN trade_flow_rules TEXT;
ALTER TABLE skill_combinations ADD COLUMN context_annotations TEXT;
ALTER TABLE skill_combinations ADD COLUMN state_machine_spec TEXT;
ALTER TABLE skill_combinations ADD COLUMN skill_contexts TEXT;
ALTER TABLE skill_combinations ADD COLUMN iteration_log TEXT;
ALTER TABLE skill_combinations ADD COLUMN backtest_history TEXT;
ALTER TABLE skill_combinations ADD COLUMN variant_of INTEGER;
ALTER TABLE skill_combinations ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE skill_combinations ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE skill_combinations ADD COLUMN created_from TEXT;

-- Add new indexes
CREATE INDEX IF NOT EXISTS idx_skill_combinations_model_type ON skill_combinations(model_type);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_status ON skill_combinations(status);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_source_url ON skill_combinations(source_video_url);
CREATE INDEX IF NOT EXISTS idx_skill_combinations_variant ON skill_combinations(variant_of);

-- Create model_iterations table
CREATE TABLE IF NOT EXISTS model_iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,
  version_before INTEGER NOT NULL,
  version_after INTEGER NOT NULL,
  iteration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  backtest_csv_path TEXT,
  trades_analyzed INTEGER,
  problems_detected TEXT,
  solution_applied TEXT NOT NULL,
  skills_added TEXT,
  skills_removed TEXT,
  parameters_changed TEXT,
  trade_flow_changes TEXT,
  impact_prediction REAL,
  impact_actual REAL,
  insight_captured TEXT,
  insight_confidence REAL,
  FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_iterations_model ON model_iterations(model_id);
CREATE INDEX IF NOT EXISTS idx_model_iterations_date ON model_iterations(iteration_date);
CREATE INDEX IF NOT EXISTS idx_model_iterations_version ON model_iterations(version_after);

-- Update existing records to have defaults
UPDATE skill_combinations SET
  model_type = 'combination',
  version = 1,
  status = 'draft',
  created_from = 'manual'
WHERE model_type IS NULL;
