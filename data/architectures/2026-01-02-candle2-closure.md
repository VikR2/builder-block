# Strategy Architecture Document: Candle 2 Closure

**Source Video:** [Candle 2 Closure: The Foundation of TTrades Fractal Model](https://youtu.be/tyoxl1l-6iI)
**Generated:** 2026-01-02
**Confidence:** 86%

---

## Overview

The Candle 2 Closure strategy is the foundation of the TTrades Fractal Model. It identifies reversal patterns where price sweeps the previous candle's high/low and closes back inside the range, signaling a potential direction change.

**Key Insight:** A Candle 2 Closure is NOT just a pattern - it requires a Point of Interest (POI) on a higher timeframe to be valid.

---

## Timeframe Alignment (Fractal)

This model is **fractal** - it applies at any timeframe pair:

| Bias Timeframe | Entry Timeframe | Use Case |
|----------------|-----------------|----------|
| Monthly | Daily | Swing/Position |
| Daily | Hourly | Day trading |
| Hourly | 5-minute | Intraday scalp |
| 4-Hour | 15-minute | Intraday swing |

---

## Core Concepts

### Candle 2 Closure (Reversal)
- Price sweeps the previous candle's high (bearish) or low (bullish)
- Price closes BACK INSIDE the previous candle's range
- This signals a reversal, NOT a continuation

### Candle 3 Continuation
- Following C2 reversal, C3 should expand in the reversal direction
- C3 closing BEYOND C2's range = continuation closure
- Confirms the reversal and sets up C4 expansion

### Candle 4 Expansion
- If C3 closes strong, C4 continues the move
- This is where the main profit target is reached

---

## Entry Rules

### Prerequisites (HTF Bias)
1. **Point of Interest Required:**
   - Sweep of a HTF high/low
   - Entry into a HTF Fair Value Gap (FVG)
   - Opposing candles can serve as POI

2. **Candle 2 Closure Pattern:**
   - C1: Creates the high/low to be swept
   - C2: Sweeps C1's extreme AND closes back inside
   - This reversal closure sets up the trade

### Entry Trigger (LTF Confirmation)
1. **Change in State of Delivery (CISD):**
   - Drop to aligned lower timeframe
   - Find the series of candles that made the HTF high/low
   - Look for price to break this structure

2. **Entry Zone (EQ/T-Spot):**
   - Mark the 50% (equilibrium) of C2's range
   - Look for price to respect this level
   - Enter when LTF confirms direction

---

## Exit Rules

### Stop Loss
- **Primary:** Above/below the C2 sweep wick (the extreme of the sweep)
- **Alternative:** Above/below a protected swing on LTF (formed after CISD)

### Take Profit Targets
1. **ERL Target:** Opposite swing high/low (External Range Liquidity)
2. **Fixed R:R:** 1:2 or 1:3 based on stop distance
3. **C4 Completion:** Exit when C4 expansion completes

---

## Risk Management

### Position Sizing
- Risk 1-2% per trade based on stop distance
- Calculate position size from C2 sweep to entry

### Trade Invalidation
- C3 failing to close beyond C2 = weak setup
- Price trading back into C2's upper half (bearish) or lower half (bullish) = invalidation
- Caution on C5/C6 - may be entering new phase of price

---

## State Machine

```
WAITING_FOR_SESSION
    |
    v
SCANNING_FOR_CONTEXT (HTF POI sweep)
    |
    v
WAITING_FOR_C2_CLOSURE (Reversal pattern)
    |
    v
WAITING_FOR_LTF_CISD (Change in state of delivery)
    |
    v
WAITING_FOR_ENTRY (EQ/T-Spot respect)
    |
    v
MANAGING_TRADE (Stop at sweep, target at ERL)
    |
    v
TRADE_COMPLETE
```

---

## Skills Used

| Skill ID | Name | Role |
|----------|------|------|
| #64 | Candle 2 Closure (Reversal) | Entry pattern detection |
| #65 | Candle 3 Closure (Confirmation) | Continuation confirmation |
| #66 | Candle 4 Expansion (TTrades) | Target/exit logic |
| #82 | Expansion Phase | Market phase identification |

---

## Example Trade Flow

1. **Daily Chart:** Spot a C2 closure at a sweep of previous day's high
2. **Hourly Chart:** Find the series of candles that made the daily high
3. **Wait for CISD:** Price breaks below this hourly structure
4. **Mark EQ:** 50% of the C2 wick on hourly
5. **Entry:** When price retraces to EQ and shows rejection
6. **Stop:** Above the C2 sweep high
7. **Target:** Previous daily low (ERL) or 1:2 R:R

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-02 | Initial SAD created from YouTube extraction |
