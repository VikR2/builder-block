# Video Extraction Reference Guide

Stable patterns for YouTube video extraction. Use with `.claude/skills/youtube.md` workflow.

---

## 1. Extraction Workflow

```
/youtube <url>
    |
    v
CHECKPOINT 1: Intent Classification
    |-- skills_library: Individual concepts only
    |-- complete_strategy: Full model + SAD + code
    |-- educational: No extraction
    |
    v
CHECKPOINT 1a: Model Detection (if complete_strategy)
    |-- 3+ of 5 criteria met? -> Complete model flow
    |-- Otherwise -> Individual skills flow
    |
    v
Frame Extraction + Reflective Analysis
    |-- Multi-signal segmentation (concept boundaries)
    |-- 5-question reflective analysis per segment
    |-- Trade example mining (visual evidence)
    |
    v
CHECKPOINT 2: Skills Review
    |-- NEW: Create in database
    |-- AMBIGUOUS: User decides
    |-- EXISTING: Link to video
    |
    v
CHECKPOINT 2a: Model Spec Review (if complete model)
    |-- trade_flow_rules review
    |-- context_annotations review
    |-- skill_contexts review
    |
    v
CHECKPOINT 3: Generation Approval
    |-- SAD: Yes/No
    |-- C# Code: Yes/No
    |
    v
CHECKPOINT 4: Validation (if code generated)
    |-- Compare code vs visual evidence
    |-- Auto-fix or manual override
```

---

## 2. Intent Classification

| Intent | When to Use | Output |
|--------|-------------|--------|
| `skills_library` | Video teaches individual concepts (OB, FVG, sweeps) | Skills to DB only |
| `complete_strategy` | Video shows full trading system with flow | Skills + Model + SAD + C# |
| `educational` | General concepts, no actionable rules | Notes only |

**Signal words for complete_strategy:**
- "My complete model", "Full system", "Step by step"
- "First I look for... then I wait for... then I enter"
- Explicit entry, stop, and target rules given

**Signal words for skills_library:**
- "What is a...", "How to identify..."
- Single concept focus, no trade flow

---

## 3. Model Detection Criteria

A video describes a **complete trading model** when 3+ of these 5 criteria are met:

| Criteria | What to Look For |
|----------|------------------|
| **Trade Flow** | Entry -> Management -> Exit sequence described |
| **Conditional Logic** | "If HTF bullish THEN...", "Only when X THEN Y" |
| **Context Requirements** | Specific timeframes, sessions, or market conditions |
| **Risk Management** | Stop placement rules, position sizing, breakeven |
| **When NOT to Trade** | Edge cases, filters, avoidance rules |

**Example Detection:**
```
Transcript: "I only take longs if daily is bullish. I wait for a sweep
during NY session, then confirm with CISD. Stop goes below the sweep.
Target is the opposing FVG. Don't chase if price extended."

Criteria met:
[x] Trade flow: sweep -> CISD -> entry -> stop -> target
[x] Conditional: "only take longs if daily is bullish"
[x] Context: NY session, daily bias check
[x] Risk: Stop below sweep
[x] When NOT: "Don't chase if price extended"

Result: 5/5 = COMPLETE MODEL
```

---

## 4. Skill Matching Thresholds

When matching extracted concepts to existing skills:

| Score Range | Classification | Action |
|-------------|---------------|--------|
| < 0.40 | **NEW** | Create new skill in database |
| 0.40 - 0.69 | **AMBIGUOUS** | Present to user for decision |
| 0.70 - 0.84 | **EXISTING** | Link to existing skill |
| >= 0.85 | **SKIP** | Already fully captured |

**Ambiguous Resolution:**
- Check skill `description` field (not just name)
- Check `code_snippet` if available
- Consider video's specific context vs general concept

**Example:**
```
Extracted: "Liquidity grab below swing low"
Match: #12 "Liquidity Sweep Detection" (0.62)

Decision factors:
- #12 description mentions "swing highs/lows" -> SAME concept
- But #12 focuses on detection, not entry timing -> VARIANT

User options:
[1] Use existing #12 - concepts are the same
[2] Create new skill - video adds entry timing rules
[3] Create variant - link to #12 as parent
```

---

## 5. Model Context Structure

Complete models are stored in `skill_combinations` with three JSON fields:

### trade_flow_rules
Captures the conditional sequence of skills:
```json
{
  "trade_flow_rules": {
    "pre_market": [
      {"skill": "daily-bias-sma", "output": "bias_direction"}
    ],
    "entry": {
      "trigger": "liquidity-sweep-detection",
      "confirmations": [
        {"skill": "cisd-pattern", "required": true, "window": "5 bars"}
      ],
      "filters": [
        {"condition": "bias_direction == sweep_direction", "action": "proceed"},
        {"condition": "price_in_premium_zone AND bias == bullish", "action": "skip"}
      ]
    },
    "exit": {
      "targets": [
        {"type": "dynamic", "skill": "opposing-fvg-target", "order": 1},
        {"type": "fixed", "value": "2R", "order": 2}
      ],
      "stops": [
        {"type": "initial", "reference": "sweep_level"},
        {"type": "trailing", "skill": "protected-swings", "activate_at": "1R"}
      ]
    }
  }
}
```

### context_annotations
Captures trader wisdom beyond the rules:
```json
{
  "context_annotations": {
    "htf_timeframes": {"bias": "Daily", "structure": "H1", "entry": "M5"},
    "session_restrictions": {
      "allowed": ["london", "ny_am"],
      "reason": "Volume required for clean sweeps"
    },
    "trade_type": "reversal",
    "edge_cases": {
      "11am_reversal": "Consider fading setups - historically losers",
      "double_sweep": "Higher probability setup"
    },
    "common_mistakes": {
      "chasing": "Don't enter after price extended from sweep",
      "premium_zone": "Don't long from premium in bullish bias"
    }
  }
}
```

### skill_contexts
How each skill is used in THIS specific model:
```json
{
  "skill_contexts": {
    "12": {
      "phase": "entry",
      "order": 1,
      "role": "primary_trigger",
      "notes": "Sweep detection initiates entry sequence"
    },
    "45": {
      "phase": "confirmation",
      "order": 2,
      "conditions": "Must occur within 5 bars of sweep",
      "required": true
    },
    "7": {
      "phase": "risk",
      "role": "stop_management",
      "conditions": "Move to BE at 1R profit"
    }
  }
}
```

---

## 6. Visual Analysis Patterns

### Frame Extraction Settings
- **Interval:** 45 seconds default (adjust for video length)
- **Max frames:** 15 (balances context vs cost)
- **Format:** JPEG at 720p max

### Stop Reference Points
| Reference | Description | Use Case |
|-----------|-------------|----------|
| `CISD_CANDLE_LOW` | Low of the CISD candle | Reversal entries |
| `CISD_CANDLE_HIGH` | High of the CISD candle | Short reversal entries |
| `OB_BODY_LOW` | Low of order block body | Conservative stops |
| `OB_WICK_LOW` | Low of order block wick | Tight stops |
| `SWING_LOW` | Recent swing structure | Structure-based stops |
| `SWEEP_LEVEL` | The liquidity level swept | Sweep-based entries |

### Entry Reference Points
| Reference | Description | Use Case |
|-----------|-------------|----------|
| `OB_CLOSE` | Close of the order block candle | Standard entry |
| `OB_OPEN` | Open of the order block candle | Aggressive entry |
| `FVG_MIDPOINT` | Middle of fair value gap | Premium/discount entry |
| `CISD_CLOSE` | Close of CISD confirmation | Confirmation entry |

### Consistency Scoring
When multiple trade examples found:
- **100% consistent:** High confidence, use directly
- **67-99% consistent:** Note the variance, use majority
- **< 67% consistent:** Flag for user review

---

## 7. Common Issues -> Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Hallucinated understanding | No visual validation | Always use reflective mode with frames |
| Ambiguous skill match | Names too similar | Check description + code_snippet fields |
| Missing model context | Used skills_library intent | Switch to complete_strategy for full models |
| Wrong stop reference | Transcript ambiguity | Trust visual trade mining over transcript |
| Over-extraction | Every concept = skill | Group related concepts into single skill |
| Under-extraction | Missed implicit rules | Look for "when NOT to" and edge cases |
| Template code output | Simple mode used | Use reflective mode for complete strategies |
| Incorrect parameters | Defaults used | Visual mining extracts actual values |

### Anti-Patterns to Avoid
1. **Skipping checkpoints** - User approval prevents bad extractions
2. **Trusting transcript alone** - Visual evidence often contradicts
3. **Creating duplicate skills** - Always check existing library first
4. **Ignoring edge cases** - "When NOT to trade" is critical context
5. **Hardcoding values** - Extract actual parameters from examples

---

## Quick Reference

**Checkpoint Flow:**
1. Intent -> 1a. Model Detection -> 2. Skills -> 2a. Model Spec -> 3. Generation -> 4. Validation

**Model = 3+ of 5:**
Trade Flow | Conditional Logic | Context | Risk Management | When NOT to

**Skill Thresholds:**
< 0.40 NEW | 0.40-0.69 AMBIGUOUS | >= 0.70 EXISTING

**Visual References:**
Stop: CISD_CANDLE_LOW, OB_BODY_LOW, SWING_LOW
Entry: OB_CLOSE, FVG_MIDPOINT, CISD_CLOSE
