# POI Type Logic Contracts

This document defines the **precise behavioral specifications** for each POI (Point of Interest) type. These contracts must be followed during code generation to prevent logic bugs.

**Version:** 1.0
**Last Updated:** 2026-01-07
**Source:** User clarification during planning session

---

## Overview

Different POI types have different rules for:
1. **Detection** - How is the POI identified?
2. **C1/C2 Confirmation** - Where must confirmation candles print?
3. **Invalidation** - When does the POI become invalid?

**CRITICAL:** Treat each POI type differently in code. Do NOT use generic POI logic.

---

## FVG (Fair Value Gap)

### Detection

```
Requires 3-candle pattern:
  Candle[2]: Impulse candle (starts move)
  Candle[1]: Gap candle (creates gap)
  Candle[0]: Continuation candle (doesn't fill gap)

Bullish FVG Zone:
  Top = Candle[0].Low
  Bottom = Candle[2].High
  (Gap between candle[2] high and candle[0] low)

Bearish FVG Zone:
  Top = Candle[2].Low
  Bottom = Candle[0].High
```

### C1/C2 Confirmation

| Rule | Value |
|------|-------|
| Location Requirement | **MUST print WITHIN FVG zone** |
| Wick Outside OK | Yes - wick can be slightly outside if touches zone |
| Body Outside | OK if wick touched zone |
| Counting Mode | CUMULATIVE (not consecutive) |
| Reset On | POI invalidation, new POI detected |
| Never Reset On | Candle outside zone, time elapsed |

```csharp
// FVG C1/C2 Validation
bool IsCandleInFVGZone(int barIdx)
{
    double candleLow = Lows[IDX_CONFIRMATION][barIdx];
    double candleHigh = Highs[IDX_CONFIRMATION][barIdx];

    // Wick OR body touching zone counts
    return (candleLow <= fvgTop && candleHigh >= fvgBottom);
}
```

### Invalidation

| Parameter | Value |
|-----------|-------|
| Trigger | Close beyond zone in opposite direction |
| Threshold | 6 consecutive Entry TF closes |
| Buffer | 50% of zone size |
| Direction Check | **Bullish FVG: invalid on close BELOW bottom** |
| Direction Check | **Bearish FVG: invalid on close ABOVE top** |

```csharp
// FVG Invalidation - DIRECTION IS CRITICAL
void CheckFVGInvalidation()
{
    double close = Closes[IDX_ENTRY][0];
    double buffer = (fvgTop - fvgBottom) * 0.5;

    if (fvgDirection == BiasDirection.Bullish)
    {
        // Bullish FVG invalid on close BELOW bottom
        if (close < fvgBottom - buffer)
            invalidationCount++;
        else
            invalidationCount = 0;  // Reset when price returns
    }
    else // Bearish
    {
        // Bearish FVG invalid on close ABOVE top
        if (close > fvgTop + buffer)
            invalidationCount++;
        else
            invalidationCount = 0;
    }

    if (invalidationCount >= 6)
        InvalidateFVG();
}
```

### Common FVG Bugs

| Bug | Symptom | Fix |
|-----|---------|-----|
| Inverted direction | Bullish FVG invalid when price goes UP | Check below for bullish, above for bearish |
| Single-close invalidation | POI invalidated on brief wick | Require 6 consecutive closes |
| Consecutive C1/C2 | Count resets when candle misses | Use cumulative counting |

---

## OB (Order Block)

### Detection

```
OB = Last opposing candle before CISD
     NOT the reversal candle itself!

For Bullish CISD:
  - Series of down-close (bearish) candles
  - Price sweeps low and closes above first opposing candle
  - OB = LAST down-close candle (index [1] from reversal)

For Bearish CISD:
  - Series of up-close (bullish) candles
  - Price sweeps high and closes below first opposing candle
  - OB = LAST up-close candle (index [1] from reversal)
```

### Candle Reference

**CRITICAL:** Use the correct candle index!

| Reference | Index | Description |
|-----------|-------|-------------|
| Reversal Candle | [0] | The candle that closes through series (triggers CISD) |
| **OB Candle (CORRECT)** | **[1]** | Last opposing candle BEFORE reversal |
| First Opposing | [N] | First candle in opposing series |

```csharp
// OB Reference - Use index [1], NOT [0]
void SetOBLevels()
{
    // CORRECT: Last opposing candle
    m5OBHigh = Highs[IDX_ENTRY][1];
    m5OBLow = Lows[IDX_ENTRY][1];

    // WRONG: Reversal candle (this is NOT the OB)
    // m5OBHigh = Highs[IDX_ENTRY][0];  // DON'T DO THIS
}
```

### C1/C2 Confirmation

| Rule | Value |
|------|-------|
| Location Requirement | **C1/C2 OUTSIDE OB = signals invalidation** |
| Inside OB Meaning | POI remains valid |
| Counting Mode | Different from FVG - based on location |

```csharp
// OB C1/C2 Validation
// C1/C2 printing OUTSIDE OB zone = invalidation signal
bool IsC1C2OutsideOB(int barIdx)
{
    double candleLow = Lows[IDX_CONFIRMATION][barIdx];
    double candleHigh = Highs[IDX_CONFIRMATION][barIdx];

    // If candle is entirely outside OB zone
    return (candleHigh < m5OBLow || candleLow > m5OBHigh);
}
```

### Stop Placement

**CRITICAL:** Use full CISD structure, not just body!

| Reference | Variable | Description |
|-----------|----------|-------------|
| **CORRECT** | m5OBLow / m5OBHigh | Full structure including wicks |
| WRONG | m5OBBodyLow / m5OBBodyHigh | Just the body - stop too tight |

```csharp
// Stop Placement - Use FULL structure
void SetStopLoss()
{
    if (tradeDirection == TradeDirection.Long)
    {
        // CORRECT: Full structure low
        stopPrice = m5OBLow - (StopBufferTicks * TickSize);

        // WRONG: Body only - stop too tight
        // stopPrice = m5OBBodyLow - (StopBufferTicks * TickSize);
    }
}
```

### Invalidation

| Parameter | Value |
|-----------|-------|
| Trigger | C1/C2 pattern prints outside OB zone |
| OR | Price sweeps through OB with momentum |
| Threshold | Context-dependent (less strict than FVG) |

### Common OB Bugs

| Bug | Symptom | Fix |
|-----|---------|-----|
| Wrong candle reference | OB at reversal candle | Use index [1], not [0] |
| Body-only stop | Stop hit too often | Use full structure (m5OBLow/High) |
| FVG rules applied | Wrong C1/C2 validation | OB rules are different - outside = invalid |

---

## Swing Points / Highs / Lows

### Detection

```
Protected Swing High:
  - Local maximum with lower highs on both sides
  - Not yet swept by price

Protected Swing Low:
  - Local minimum with higher lows on both sides
  - Not yet swept by price

Unprotected:
  - Swing point that has been swept but price returned
```

### C1/C2 Confirmation

| Rule | Value |
|------|-------|
| Location Requirement | More flexibility than FVG/OB |
| Near Swing Level | Context-dependent validation |
| Counting Mode | Based on proximity and reaction |

### Invalidation

| Parameter | Value |
|-----------|-------|
| Trigger | Price breaks swing level with close |
| Threshold | Less strict than FVG |
| Context | Consider market structure |

### Common Swing Bugs

| Bug | Symptom | Fix |
|-----|---------|-----|
| Too strict validation | No trades qualify | Allow more flexibility |
| Protected/unprotected confusion | Wrong invalidation | Track sweep status |

---

## Summary Table

| Aspect | FVG | OB | Swing |
|--------|-----|-----|-------|
| **C1/C2 Location** | WITHIN zone | OUTSIDE = invalid | Flexible |
| **Wick Outside OK** | Yes | N/A | Yes |
| **Counting Mode** | Cumulative | Location-based | Context |
| **Invalidation Trigger** | 6 closes beyond | C1/C2 outside | Level break |
| **Direction Critical** | YES | N/A | YES |
| **Candle Reference** | N/A | Index [1] | N/A |
| **Stop Reference** | Zone edge | Full structure | Swing level |

---

## Validation Checklist

Before generating POI-related code, verify:

- [ ] POI type is identified (FVG, OB, or Swing)
- [ ] C1/C2 validation logic matches POI type rules
- [ ] Invalidation direction check is correct (bullish/bearish)
- [ ] OB candle reference uses index [1]
- [ ] Stop placement uses full structure (not body-only)
- [ ] Counting mode is cumulative (FVG) or location-based (OB)
- [ ] Reset conditions are correct (never reset on non-touch for FVG)
