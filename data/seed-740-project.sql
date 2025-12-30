-- ============================================================================
-- Seed 740.cs Project Data
-- ============================================================================
-- This script populates the database with:
-- 1. SevenFortyBias V6 project
-- 2. The 740.cs script file
-- 3. Links between the script and all 10 skills used
-- 4. 3 sample journal entries documenting development
-- ============================================================================

-- ============================================================================
-- 1. INSERT PROJECT
-- ============================================================================
INSERT INTO projects (name, slug, description, status, created_at, updated_at, last_worked_on)
VALUES (
  'SevenFortyBias V6',
  'sevenforten-bias-v6',
  '7:40 Bias Strategy - Full Logic with Real-Time Support. Combines pre-market bias analysis with range building and two entry scenarios: sweep reversals and breakout pullbacks.',
  'active',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

-- ============================================================================
-- 2. INSERT SCRIPT
-- ============================================================================
INSERT INTO scripts (
  project_id,
  name,
  version,
  description,
  file_path,
  file_hash,
  generation_prompt,
  skills_used,
  compilation_status,
  deployment_status,
  created_at,
  updated_at
)
VALUES (
  1, -- project_id (references SevenFortyBias V6)
  'SevenFortyBiasV6',
  '6.0',
  'Full logic trading strategy with real-time support. Implements pre-market bias calculation, 7:00-7:40 AM range building, liquidity sweep detection with CISD pattern for reversals, and breakout-pullback continuation setups. Includes automatic breakeven management and time-based session windows.',
  '/home/satvik/repos/builder-block/scripts-output/740.cs',
  'sha256_placeholder', -- Would be actual hash in production
  'Build a NinjaTrader strategy that uses 7:40 AM bias with sweep reversals and breakout pullbacks',
  '["1","2","3","4","5","6","7","8","9","10"]', -- JSON array of skill IDs (all 10 skills)
  'success',
  'testing',
  datetime('now'),
  datetime('now')
);

-- ============================================================================
-- 3. LINK SCRIPT TO SKILLS (script_skills junction table)
-- ============================================================================
-- These links will auto-trigger skill.usage_count increments

-- Skill 1: Pre-market Bias Calculation (VWAP-POC)
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1, -- script_id
  1, -- skill_id
  'Implements VWAP-based POC calculation during 3-7 AM pre-market session. Uses BullishThreshold=55% and BearishThreshold=45% to classify bias.',
  datetime('now')
);

-- Skill 2: Range Building (Opening Range)
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  2,
  'Builds 7:00-7:40 AM range by tracking high/low. Calculates equilibrium at midpoint for use in entry logic.',
  datetime('now')
);

-- Skill 3: Liquidity Sweep Detection
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  3,
  'Detects when price sweeps range high or low. Tracks sweep price and bar for CISD pattern confirmation.',
  datetime('now')
);

-- Skill 4: CISD Pattern (Change in State of Delivery)
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  4,
  'After sweep, waits for opposite candle then confirms CISD when close crosses reference candle open. Core reversal entry trigger.',
  datetime('now')
);

-- Skill 5: Range Breakout Detection
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  5,
  'Detects breakout above range high (bullish) or below range low (bearish). First step in Scenario B continuation setup.',
  datetime('now')
);

-- Skill 6: Breakout Pullback Pattern
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  6,
  'After breakout, waits for pullback into range. Then uses CISD to confirm continuation entry in breakout direction.',
  datetime('now')
);

-- Skill 7: Automatic Breakeven Stop
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  7,
  'Moves stop to entry price after 80 ticks profit. Prevents BE flag from resetting on new candles.',
  datetime('now')
);

-- Skill 8: Time-based Session Windows
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  8,
  'Uses PremarketStartHour=3, RangeStartHour=7, RangeEndHour=7:40, ExecutionEndHour=9:30, SessionEndHour=16 for window logic.',
  datetime('now')
);

-- Skill 9: Fixed Stop Loss & Take Profit
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  9,
  'MaxStopTicks=200, TakeProfitTicks=120. Validates stop distance before entry. Uses sweep price or range boundary for stops.',
  datetime('now')
);

-- Skill 10: Daily State Reset
INSERT INTO script_skills (script_id, skill_id, implementation_notes, created_at)
VALUES (
  1,
  10,
  'Resets all state variables (bias, range, sweep flags, position tracking) when barTime.Date != currentDate.',
  datetime('now')
);

-- ============================================================================
-- 4. INSERT JOURNAL ENTRIES
-- ============================================================================

-- Journal Entry 1: Initial Setup Notes
INSERT INTO journal_entries (
  project_id,
  script_id,
  title,
  entry_type,
  content,
  has_attachments,
  attachment_count,
  created_at,
  updated_at
)
VALUES (
  1, -- project_id
  1, -- script_id
  'Initial Setup Notes',
  'note',
  '# Initial Setup Notes

Configured pre-market bias calculation using VWAP-based POC. Set range building window from 7:00-7:40 AM.

## Key Implementation Details

- **Pre-market Window:** 3:00 AM - 7:00 AM
- **Range Building:** 7:00 AM - 7:40 AM
- **Execution Window:** 7:40 AM - 9:30 AM

Implemented sweep detection and CISD pattern recognition for both reversal and continuation setups.

## Bias Thresholds
- Bullish: POC >= 55% of PM range
- Bearish: POC <= 45% of PM range
- Neutral: Between 45-55%

The strategy correctly filters trades based on bias alignment.',
  0, -- no attachments
  0, -- attachment count
  datetime('now', '-2 days'), -- Created 2 days ago
  datetime('now', '-2 days')
);

-- Journal Entry 2: Risk Management Update
INSERT INTO journal_entries (
  project_id,
  script_id,
  title,
  entry_type,
  content,
  has_attachments,
  attachment_count,
  created_at,
  updated_at
)
VALUES (
  1, -- project_id
  1, -- script_id
  'Risk Management Update',
  'note',
  '# Risk Management Update

Added breakeven logic that triggers after 80 ticks profit. Max stop distance set to 200 ticks with 120 tick profit target.

## Stop Loss Placement

**Scenario A (Sweep Reversal):**
- Stop: Sweep price (the liquidity grab point)
- Validates: stopDistance <= 200 ticks

**Scenario B (Breakout Pullback):**
- Stop: Range boundary (rangeHigh for shorts, rangeLow for longs)
- Validates: stopDistance <= 200 ticks

## Breakeven Management

```csharp
if (profitTicks >= BreakevenTicks) // 80 ticks
{
    SetStopLoss(activeOrderName, CalculationMode.Price, Position.AveragePrice, false);
    breakevenSet = true;
}
```

Implemented position management with proper order execution tracking via `OnExecutionUpdate()` and `OnPositionUpdate()` handlers.',
  0, -- no attachments
  0, -- attachment count
  datetime('now', '-1 days'), -- Created 1 day ago
  datetime('now', '-1 days')
);

-- Journal Entry 3: Testing Results
INSERT INTO journal_entries (
  project_id,
  script_id,
  title,
  entry_type,
  content,
  has_attachments,
  attachment_count,
  created_at,
  updated_at
)
VALUES (
  1, -- project_id
  1, -- script_id
  'Testing Results',
  'analysis',
  '# Testing Results

Completed backtesting on historical data. Strategy shows strong performance during trending markets.

## Observations

### Bias Calculation Accuracy
✅ Bias calculation accurately identifies market direction
✅ POC positioning correctly filters out counter-trend setups
✅ VWAP-based approach more stable than simple range midpoint

### Entry Pattern Performance

**Scenario A (Sweep + CISD):**
- Works well in ranging/choppy sessions
- Lower win rate but better R:R (sweep provides tight stop)
- 12 trades, 58% win rate in testing period

**Scenario B (Breakout + Pullback):**
- Excels in trending sessions
- Higher win rate, slightly wider stops
- 8 trades, 75% win rate in testing period

## Next Steps

Need to test edge cases for range-bound days:
- [ ] Test with MinRangeTicks validation (currently 20 ticks)
- [ ] Evaluate performance when bias is Neutral
- [ ] Review behavior when both scenarios trigger same day
- [ ] Consider adding volume confirmation for breakouts',
  0, -- no attachments
  0, -- attachment count
  datetime('now'), -- Created today
  datetime('now')
);

-- ============================================================================
-- VERIFICATION QUERIES (commented out - for manual testing)
-- ============================================================================

-- SELECT * FROM projects;
-- SELECT * FROM scripts;
-- SELECT * FROM script_skills;
-- SELECT * FROM journal_entries;
-- SELECT s.name, COUNT(ss.skill_id) as usage_count
-- FROM skills s
-- LEFT JOIN script_skills ss ON s.id = ss.skill_id
-- GROUP BY s.id;
