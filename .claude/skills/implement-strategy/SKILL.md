---
name: implement-strategy
description: Generate NinjaTrader 8 strategy from model with frame-driven validation
allowed-tools: [Read, Write, Edit, Bash, AskUserQuestion]
---

# Implement Strategy Skill

Generate high-quality NinjaTrader C# code from a complete trading model with **frame-driven validation**.

## Usage

```
/implement-strategy --model-id <id> --output-name <ClassName>
```

**Example:**
```
/implement-strategy --model-id 1 --output-name TTradesFractalModelV24
```

---

## MANDATORY WORKFLOW (Follow in order)

### Step 1: Load Model, Visual Context, and POI Rules

Query the model via MCP with visual interpretations:

```
Call: nt-skills/get_model
Args: { model_id: <id>, include_skills: true }
```

This returns:
- **model** - Full model with trade_flow_rules, state_machine_spec, model_rules
- **model.visual_context_path** - Path to video frames (e.g., data/video-frames/9AL41xON3hA)
- **model.visual_interpretations** - Verified pattern interpretations (if exists)
- **model.poi_type_rules** - POI-type-specific validation rules (if exists)
- **skills** - All component skills with code_snippet

**THEN** get POI-type-specific rules for code generation:

```
Call: nt-skills/get_poi_type_rules
Args: { poi_type: "all" }
```

This returns code patterns for C1/C2, entry, and invalidation per POI type.

---

### Step 2: Frame-Driven Pattern Generation

**FOR EACH** pattern in [poi_detection, c1c2_confirmation, cisd_pattern, entry_logic]:

#### 2a. Check Existing Interpretation

```
IF model.visual_interpretations[pattern] exists AND verified_by_user = true:
  USE stored interpretation
  SKIP to step 2d
```

#### 2b. Load Frame Index and Read Relevant Frame

First, load the frame index to find frame mappings:
```
Read: {model.visual_context_path}/frame_index.json
```

The frame_index.json contains:
- `frames[]` with pattern_mappings per frame
- `pattern_mappings[pattern_name].code_insight` for code generation hints

**OR** use the pattern suggestion tool:
```
Call: nt-skills/suggest_pattern_mappings
Args: { annotation_labels: ["C1", "C2", "FVG"], zones_shown: ["PDH", "OB zone"] }
```

Then read the relevant frame image:
```
Read: {model.visual_context_path}/frames/{frame_file}.jpg
```

#### 2c. Document & Verify Interpretation

After reading frame, document what you see:

```
FRAME INTERPRETATION
====================
Frame: 9AL41xON3hA/frame_008.jpg (7:00)
Pattern: CISD

I see:
- Series of 3+ down-close candles (opposing series)
- Price sweeps low, then closes above first opposing candle's open
- "CISD" label marks the close-through candle
- OB reference appears to be the LAST opposing candle

Code implication:
- m5OBHigh = Highs[IDX_ENTRY][1] (last opposing, not reversal)
- m5OBLow = Lows[IDX_ENTRY][1]
- Entry trigger = close > first opposing candle open
====================
```

**IF UNCERTAIN:**
```
STOP - Use AskUserQuestion tool:
"I see X in frame Y. Does this mean [interpretation A] or [interpretation B]?"
WAIT for user confirmation before proceeding.
```

#### 2d. Generate Code for Pattern

Include frame reference comment in generated code:

```csharp
// ==========================================================
// Pattern: CISD (Change In State Of Delivery)
// Visual Reference: 9AL41xON3hA/frame_008.jpg (7:00)
// Interpretation: OB = last opposing candle (index [1])
// ==========================================================
private void DetectCISD()
{
    // Code matching verified interpretation
    m5OBHigh = Highs[IDX_ENTRY][1];  // Last opposing candle, NOT reversal
    m5OBLow = Lows[IDX_ENTRY][1];
    // ... rest of implementation
}
```

---

### Step 3: POI-Type-Specific Logic

**CRITICAL:** Different POI types have different C1/C2 validation rules.

| POI Type | C1/C2 Location Requirement | Invalidation Rule |
|----------|---------------------------|-------------------|
| **FVG** | Must print WITHIN zone (wick outside OK) | Close beyond + 6 consecutive bars |
| **OB** | Outside signals invalidation | C1/C2 outside OB = consider invalid |
| **Swing/HL** | More flexibility | Context-dependent |

**BEFORE generating POI validation code:**

```
IF poi_type is unclear:
  ASK USER: "Which POI type is primary for this model: FVG, OB, or Swing?"
  WAIT for response
```

Generate POI-type-specific code:

```csharp
// POI Type: FVG
// Rule: C1/C2 must print WITHIN zone (wick outside OK)
private bool IsCandleInReactionZone(int barIdx)
{
    double candleLow = Lows[IDX_CONFIRMATION][barIdx];
    double candleHigh = Highs[IDX_CONFIRMATION][barIdx];

    // Reaction zone = expanded POI zone
    double expansion = (h1PoiTop - h1PoiBottom) * (ReactionMultiplier - 1.0) / 2.0;
    double reactionTop = h1PoiTop + expansion;
    double reactionBottom = h1PoiBottom - expansion;

    // FVG rule: ANY overlap counts (wick or body)
    return (candleLow <= reactionTop && candleHigh >= reactionBottom);
}

// POI Invalidation
// Rule: Bullish POI invalid on close BELOW zone (not above!)
private void CheckPOIInvalidation()
{
    if (!h1PoiValid) return;

    double close = Closes[IDX_ENTRY][0];
    double buffer = (h1PoiTop - h1PoiBottom) * POIInvalidationBufferPercent;

    bool outsideZone = false;

    // CRITICAL: Direction check matches bias
    if (h1FvgDirection == BiasDirection.Bullish)
    {
        // Bullish POI invalidated by closes BELOW zone
        outsideZone = close < (h1PoiBottom - buffer);
    }
    else if (h1FvgDirection == BiasDirection.Bearish)
    {
        // Bearish POI invalidated by closes ABOVE zone
        outsideZone = close > (h1PoiTop + buffer);
    }

    if (outsideZone)
    {
        invalidationCloseCount++;
        if (invalidationCloseCount >= POIInvalidationThreshold)
        {
            InvalidatePOI();
        }
    }
    else
    {
        invalidationCloseCount = 0;  // Reset on return to zone
    }
}
```

---

### Step 4: Store New Interpretations

After user verifies a new interpretation, store it in the database:

```sql
-- Store via MCP or direct SQL
UPDATE skill_combinations
SET visual_interpretations = json_set(
  COALESCE(visual_interpretations, '{}'),
  '$.{pattern_name}',
  json('{
    "frame_ref": "{frame_path}",
    "interpretation": "{text}",
    "code_implication": "{code_notes}",
    "verified_by_user": true,
    "verified_date": "{date}"
  }')
)
WHERE id = {model_id};
```

---

### Step 5: Generate Complete Strategy

Generate production-quality NinjaTrader code:

1. **State Machine** from `state_machine_spec`
2. **Model Rules as Guards** from `model_rules`
3. **Skip Conditions** from `failed_entry_conditions`
4. **POI-Type-Specific Logic** (FVG vs OB vs Swing)
5. **Helper Methods** with frame reference comments

Output to: `scripts-output/Strategies/<ClassName>.cs`

---

### Step 6: Code Review Checklist

Before delivering code, verify:

- [ ] Each pattern has frame reference comment
- [ ] POI types handled differently (FVG ≠ OB ≠ Swing)
- [ ] C1/C2 location checks match POI type rules
- [ ] CISD uses correct candle reference (index [1], not [0])
- [ ] POI invalidation direction is correct (bullish = below)
- [ ] Confirmation counting is CUMULATIVE (no reset on non-touch)
- [ ] No placeholder conditions or TODOs
- [ ] All state variables declared and initialized
- [ ] Daily reset clears all state

**Direction Logic (Multi-Timeframe):**
- [ ] HTF direction stored in dedicated variable
- [ ] LTF entry uses HTF direction variable (not derived from candle)
- [ ] State reset called when new HTF signal detected
- [ ] Cooldown between HTF detection and LTF entry
- [ ] Direction assertions in entry methods (DEBUG mode)

---

### Direction Assertion Template

For multi-timeframe strategies, include this assertion pattern in entry methods:

```csharp
private void SignalEntry(string source)
{
    // DIRECTION ASSERTION: Verify entry matches stored HTF direction
    #if DEBUG
    if (htfDirection == SignalDirection.None)
    {
        Print($"[ASSERTION FAIL] Entry signaled without HTF direction at bar {CurrentBars[0]}");
        return;
    }
    #endif

    // Debug output for verification (always include)
    Print($"[{Time[0]}] Entry: {source} | HTF Direction: {htfDirection}");

    // Entry logic uses htfDirection, not derived direction
    if (htfDirection == SignalDirection.Long)
    {
        // Long entry setup
    }
    else if (htfDirection == SignalDirection.Short)
    {
        // Short entry setup
    }
}
```

---

## FAILURE MODE: If Uncertain

```
STOP code generation
ASK: "I'm unclear about [X]. In frame [Y], does [Z] mean [A] or [B]?"
WAIT for user response
STORE verified interpretation
CONTINUE only after verification
```

**NEVER GUESS** ambiguous logic. Ask the user.

---

## POI Type Rules Reference

### FVG (Fair Value Gap)

```csharp
// Detection: 3-candle gap pattern
// C1/C2: Must be WITHIN zone (wick outside OK)
// Invalidation: 6 consecutive closes beyond zone
```

### OB (Order Block)

```csharp
// Detection: Last opposing candle before CISD (index [1])
// C1/C2: Outside = signals invalidation
// Stop: Full structure (m5OBLow/High), NOT just body
```

### Swing/HL

```csharp
// Detection: Local extremes with confirmation
// C1/C2: More flexibility than FVG/OB
// Invalidation: Context-dependent
```

---

## Files

- Models: `skill_combinations` table (query via MCP)
- Visual Interpretations: `skill_combinations.visual_interpretations` column
- SADs: `data/architectures/` (reference documentation)
- Video Frames: `data/video-frames/{video_id}/frames/`
- Output: `scripts-output/Strategies/`
