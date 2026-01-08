# TTFM Video Context: Top-Down Chart Lessons #1

**Source:** https://youtu.be/Nlw-PZhoViQ
**Duration:** ~16 minutes
**Extracted:** 2026-01-05

## Video Intent Classification

**Type:** Educational / Model Reinforcement
**Purpose:** Teaches multi-timeframe analysis and FAILED ENTRY recognition

## Key Model Rules Extracted

### Rule 1: HTF Bias Determines Direction
- Daily timeframe establishes overall bias (bullish/bearish)
- Look for expected retracement paths before continuation
- Frame 3 shows: Strong downtrend → expect pullback → then continuation

### Rule 2: FVG Touch is NOT Automatic Entry
**CRITICAL MODEL RULE**

Multiple red X marks in video show setups that LOOK valid but should be AVOIDED:
- Price enters FVG zone
- BUT no follow-through / no CISD confirmation
- Result: Failed entry = loss

**Implementation:**
```
if (price_touches_fvg) {
    // NOT ENOUGH - wait for CISD
    if (cisd_confirmed) {
        // NOW can consider entry
    } else {
        // RED X - skip this setup
    }
}
```

### Rule 3: Multi-Timeframe Cascade
Video demonstrates progression:
```
Daily (bias) → H1 (FVG/structure) → 15M/3M (entry confirmation)
```

Each timeframe has specific role:
| Timeframe | Role | Check |
|-----------|------|-------|
| Daily | Bias | Trend direction |
| H1 | Structure | FVG zones, swing levels |
| 15M/3M | Entry | CISD confirmation, OB formation |

### Rule 4: C2 Significance
Frame 8 shows "C2" label - referring to Candle 2 in the 4H sequence.
- C2 is where the WICK forms
- Wait for C2 to complete before looking for entries
- Don't trade during C2 wick formation

### Rule 5: Stop/Target from Example
Frame 18 shows actual trade setup:
- Stop: 0.00078 (7.8 pips)
- Target: 0.00078 (7.8 pips)
- R:R: 1:1 (basic example, model uses 2:1)

## Failed Entry Patterns (Red X)

The video explicitly marks BAD entries. Patterns to AVOID:

1. **FVG touch without CISD** - Price enters zone, no confirmation
2. **Against HTF bias** - LTF setup doesn't align with Daily direction
3. **No structure respect** - Price doesn't respect H1 levels

## Model Constraints to Add

Based on video, these should be MODEL RULES (not individual skills):

```json
{
  "model_rules": [
    "FVG touch MUST be followed by CISD before entry",
    "Entry direction MUST align with Daily bias",
    "H1 structure levels MUST be respected"
  ],
  "failed_entry_conditions": [
    "FVG touch without CISD = SKIP",
    "Price breaks structure without recovery = SKIP",
    "Setup against Daily bias = SKIP"
  ]
}
```

## Integration with TTFM V13+

This video reinforces the current model but adds clarity on:

1. **When to SKIP** - Currently model knows when to ENTER, but needs explicit SKIP logic
2. **Failed Entry Logging** - Track setups that were correctly AVOIDED
3. **Red X Visualization** - Debug mode could mark skipped setups

## Suggested Code Enhancement

```csharp
// Add to TTFM state machine
private bool ShouldSkipEntry(string reason)
{
    if (debugMode)
        Print($"[SKIP] {reason}");
    skippedEntries++;
    return true;
}

// In entry logic:
if (fvgTouched && !cisdConfirmed)
{
    ShouldSkipEntry("FVG touch without CISD");
    return; // RED X equivalent
}
```

## Frame Reference

| Concept | Frame | Description |
|---------|-------|-------------|
| Daily bias | 3 | Downtrend with retracement path |
| C2 reference | 8 | H1 with C2 label |
| FVG zone | 13 | Shaded FVG on H1 |
| Failed entry | 18 | Red X with trade example |
| Skip pattern | 23 | Another red X on 3M |
| Level structure | 28 | Multiple horizontal levels |
