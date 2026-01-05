# Strategy Architecture Document: TTrades Fractal Model 2026

**Model ID:** #1 (skill_combinations)
**Source:** [The Only Trading Strategy You Need For 2026](https://www.youtube.com/watch?v=9AL41xON3hA)
**Creator:** TTrades
**Extraction Date:** 2026-01-03
**Status:** Active

---

## Overview

The Fractal Model is a multi-timeframe trading system built on one core principle:

> **"Price cannot reverse without forming a swing point."**

This model aligns three timeframes (Bias → Structure → Entry) to catch high-probability reversals and continuations. It uses candle closures, fair value gaps, and CISD patterns to confirm entries.

---

## Trade Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: DAILY BIAS                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Check previous day's candle closure:                                    │
│                                                                          │
│  CONTINUATION:                    REVERSAL:                              │
│  • Close > PDH → Bullish         • Sweep PDL + close above → Bullish    │
│  • Close < PDL → Bearish         • Sweep PDH + close below → Bearish    │
│                                                                          │
│  OUTPUT: bias_direction (bullish/bearish)                               │
└────────────────────────────────┬────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASE 2: STRUCTURE (H1/H4)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Wait for SWING POINT to form at Point of Interest                   │
│  2. Identify POI in previous day's range:                               │
│     • Fair Value Gap (FVG)                                              │
│     • Swing high/low                                                    │
│  3. Wait for CANDLE 2 or CANDLE 3 closure at POI                        │
│  4. Confirm with CISD (Change in State of Delivery)                     │
│                                                                          │
│  CHECK: Is CISD direction = bias_direction?                             │
│         If YES → proceed to Phase 3                                     │
│         If NO → wait or skip                                            │
│                                                                          │
│  EDGE CASE: If price trades too high into swing → wait for V-reversal   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                       PHASE 3: ENTRY (M5/M3)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  Drop to lower timeframe using TIMEFRAME ALIGNMENT table:               │
│                                                                          │
│  ┌──────────────┬──────────────┐                                        │
│  │ Structure TF │  Entry TF    │                                        │
│  ├──────────────┼──────────────┤                                        │
│  │     H4       │     W1       │                                        │
│  │     H1       │     D1       │                                        │
│  │     M15      │     H4       │                                        │
│  │     M5       │     H1       │  ← Most common                         │
│  │     M3       │     M30      │                                        │
│  │     M1       │     M15      │                                        │
│  └──────────────┴──────────────┘                                        │
│                                                                          │
│  ENTRY TRIGGER: Continuation Order Block                                │
│  1. Price sweeps a low/high into FVG                                    │
│  2. Price closes through series of opposite-colored candles             │
│  3. Enter on close OR on retest of the order block                      │
│                                                                          │
│  REQUIREMENT: All 3 TFs must align in same direction for expansion      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         PHASE 4: RISK/TARGET                             │
├─────────────────────────────────────────────────────────────────────────┤
│  STOP LOSS:                                                              │
│  • Place beyond protected swing (body high/low of entry candle)         │
│  • Can use actual high/low for wider stop                               │
│                                                                          │
│  TARGET OPTIONS:                                                         │
│  • Minimum 2R (required for profitability at 34%+ win rate)             │
│  • Previous Day High/Low                                                │
│  • Daily Fair Value Gap                                                 │
│  • Logical liquidity on daily chart                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Skills Used (14)

| Phase | Skill ID | Skill Name | Role |
|-------|----------|------------|------|
| Framework | 70 | Timeframe Alignment | TF pairing rules |
| Bias | 62 | Daily Bias Determination | Direction from daily closure |
| Structure | 53 | Swing Point | Core concept - reversals need swings |
| Structure | 4 | CISD Pattern | Confirms swing point validity |
| POI | 55 | Fair Value Gap | Entry zone identification |
| Confirmation | 64 | Candle 2 Closure | POI closure for reversal setups |
| Confirmation | 65 | Candle 3 Closure | Alternative POI closure |
| Entry | 67 | Order Blocks for Continuations | LTF entry via continuation OB |
| Risk | 63 | Protected Swings | Stop placement rule |
| Target | 89 | 2R Target | Minimum risk/reward |
| Edge Case | 79 | Failure Swing | Multiple = consolidation |
| Edge Case | 97 | Consolidation Phase Rules | When continuation fails |
| Context | 91 | Candle 1 Reference | Reference for sequence start |
| Context | 66 | Candle 4 Expansion | Post-entry validation |

---

## Entry Rules (Checklist)

**Required for valid entry:**
- [ ] Daily bias determined (continuation OR reversal closure)
- [ ] CISD confirmed on structure timeframe
- [ ] POI identified in previous day's range
- [ ] C2 or C3 closure at POI
- [ ] Continuation order block formed on LTF
- [ ] All 3 timeframes aligned in same direction

**Invalidation:**
- [ ] Price trades back through protected swing
- [ ] Consolidation forms (multiple failure swings)
- [ ] Structure becomes "messy"

---

## Edge Cases & Conditional Logic

### When Price Trades Too High Into Swing
```
IF price retraces deep into structure zone without C2/C3
THEN wait for V-shaped reversal
THEN look for new continuation after V-reversal completes
```

### When Continuation Fails to Form
```
IF price fails to form continuation order block multiple times
THEN treat as CONSOLIDATION
THEN wait for range high OR range low to be taken
THEN look for entry on breakdown/breakout
```

### Multiple Failure Swings
```
IF multiple failure swings form
THEN market is consolidating
THEN AVOID trading until clear direction
```

### Equal Highs/Lows Above/Below
```
IF equal highs visible above current price AND bias is bullish
THEN they represent DRAW ON LIQUIDITY
THEN can be used as target
```

---

## State Machine Specification

```
States:
  IDLE           → Waiting for daily close
  BIAS_SET       → Daily bias determined, waiting for structure
  STRUCTURE_WAIT → Looking for C2/C3 at POI
  CISD_CONFIRMED → Swing point validated, drop to LTF
  ENTRY_WAIT     → Looking for continuation OB on LTF
  IN_TRADE       → Position open, managing risk
  CONSOLIDATION  → Avoiding, waiting for range break

Transitions:
  IDLE → BIAS_SET:           Daily candle closes with continuation/reversal pattern
  BIAS_SET → STRUCTURE_WAIT: Move to structure timeframe after open
  STRUCTURE_WAIT → CISD_CONFIRMED: C2/C3 closure + CISD in bias direction
  STRUCTURE_WAIT → CONSOLIDATION:  Multiple failure swings detected
  CISD_CONFIRMED → ENTRY_WAIT:     Drop to entry timeframe
  ENTRY_WAIT → IN_TRADE:           Continuation OB forms, enter on close/retest
  ENTRY_WAIT → IDLE:               Price invalidates setup
  IN_TRADE → IDLE:                 Stop hit OR target hit
  CONSOLIDATION → BIAS_SET:        Range break occurs
```

---

## Parameters (Configurable)

| Parameter | Default | Description |
|-----------|---------|-------------|
| StructureTF | H1 | Timeframe for structure analysis |
| EntryTF | M5 | Timeframe for entry triggers |
| MinRR | 2.0 | Minimum risk/reward for entry |
| StopType | BodyHigh | Body vs Wick for stop placement |
| MaxFailureSwings | 2 | Before declaring consolidation |
| RequireCISD | true | Require CISD confirmation |
| RequireC2C3 | true | Require candle closure at POI |

---

## Implementation Notes

### Multi-Timeframe Data Requirements
- **Daily (Bias):** Previous day OHLC, PDH, PDL
- **Structure (H1/M15):** Swing detection, FVG detection, CISD detection
- **Entry (M5/M3):** Order block detection, protected swing tracking

### Key Calculations
1. **Daily Bias:** Compare close to PDH/PDL, check for sweep+close pattern
2. **CISD Detection:** Close through series of same-colored candles
3. **FVG Detection:** Gap between candle 1 high and candle 3 low (bullish)
4. **Continuation OB:** Close through series of opposite candles after sweep

### Complexity Considerations
- This strategy involves significant discretion in pattern recognition
- "Messy" vs "clean" structure is subjective
- V-shaped reversal detection requires visual judgment
- Consider starting with indicator mode before full automation

---

## Statistics (From Source)

- **Win Rate Range:** 40-80% (depending on selectivity)
- **Minimum Profitable WR:** 34% at 2R target
- **Typical Assets:** ES, NQ, Gold (XAU), USD/JPY, Oil (CL)
- **Best Sessions:** NY Open, London Open

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-03 | 1.0 | Initial extraction from YouTube video |
| 2026-01-04 | 4.0 | V4 major rewrite with true ICT mechanics (see below) |

---

## V4 Implementation Details

### New State Machine (10 states)
```
Idle → BiasSet → ERLIdentified → ERLSwept → POIFound → CISDConfirmed → OBFormed → EntryWait → InTrade
                                                                                              ↓
                                                                                           Paused (circuit breaker)
```

### Key V4 Enhancements

**1. True CISD Detection:**
- Tracks series of opposite-colored candles (1-5)
- CISD = closing above opening price of opposing series
- Configurable via `CISDMinCandles` parameter

**2. Order Block Detection:**
- Finds last opposite candle before displacement
- Prioritizes FVG-creating OBs
- Entry at FVG touch or OB 50% level (limit order)

**3. ERL→IRL Flow:**
- ERL sources: equal H/L, PDH/PDL, structure swings
- Must sweep ERL before targeting IRL
- Enforces proper liquidity sequence

**4. Risk Management:**
- Partial exits: 50% at 1R, stop to BE
- Circuit breaker: 2 losses → pause for session
- OB-based stops (configurable: OBWick, OBBody, ProtectedSwing)

**5. Session Filtering:**
- NY, London, Asia sessions (all enabled by default)
- Configurable start/end hours per session

### V4 Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| CISDMinCandles | 2 | Min candles in opposing series |
| ERLTolerance | 3 ticks | For equal H/L detection |
| OBStopType | OBWick | Stop placement method |
| MaxConsecutiveLosses | 2 | Circuit breaker threshold |
| EnablePartialExit | true | 50% at 1R |
| PartialExitRR | 1.0 | R-multiple for partial |
| EnableNYSession | true | NY session filter |
| EnableLondonSession | true | London session filter |
| EnableAsiaSession | true | Asia session filter |

### Expected V4 Outcomes

| Metric | V3 | V4 Target |
|--------|-----|-----------|
| Max Drawdown | ~$48,000 | < $25,000 |
| Consecutive Losses | 5-7 | ≤ 2 |
| Monthly Volatility | High | Reduced |
