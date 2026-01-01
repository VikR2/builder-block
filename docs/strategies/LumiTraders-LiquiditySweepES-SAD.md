# Strategy Architecture Document: LumiTraders Liquidity Sweep (ES Version)

**Version:** 5.0 (11 AM Fade Strategy)

## Version History
| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-31 | Initial implementation |
| 2.0 | 2025-12-31 | MTF + CISD confirmation |
| 3.0 | 2025-12-31 | Partial profits (50% at 1R), trailing stops (protected swings), BE at 1R |
| 4.0 | 2025-12-31 | Daily bias filter using swing structure (too loose - allowed Neutral) |
| 4.1 | 2025-12-31 | Strict SMA-based bias: Price > SMA = longs only, Price < SMA = shorts only |
| 5.0 | 2025-12-31 | 11 AM Fade: Trade opposite direction when setup forms in 11 AM trap window |

## Source
- **Video:** "Liquidity Sweep Explained" by LumiTraders
- **URL:** https://youtu.be/-D_JBnsMsAA
- **Extracted:** 2025-12-31

---

## Backtest Results (TradeZella Dashboard - March/April 2024)

| Metric | Value |
|--------|-------|
| **Net P&L** | $10,150 |
| **Win Rate** | 80.56% |
| **Profit Factor** | 8.20 |
| **Day Win %** | 84.21% |
| **Avg Win/Loss Ratio** | 1.98R |
| **Zella Score** | 89.61/100 |
| **Sample Size** | ~36+ trades |

### Key Observations
- Consistent profitability across trading days
- High win rate (>80%) with favorable risk/reward
- Strong Zella Score indicates disciplined execution

---

## Strategy Overview

**Name:** Turtle Soup / Liquidity Sweep Strategy
**Style:** ICT-based liquidity sweep with order block entry
**Instruments:** ES (E-mini S&P 500)
**Timeframes:** Multi-timeframe (H1 → M30 → M5/M3)
**Target:** 2R minimum

---

## Trading Sessions

| Session | Time (EST) | Notes |
|---------|------------|-------|
| **AM Open Session** | 9:00 AM - 12:00 PM | Primary session (covers 9:30 open) |
| **Power Hour** | 3:00 - 4:00 PM | Alternative session |
| **Asia Kill Zone** | Available | For experienced traders |
| **London Session** | Available | For experienced traders |
| **PM Session** | AVOID | No volume, slow, choppy |

---

## Entry Checklist (All Required)

### 1. HTF Bias Confirmation
- Determine daily/H4 directional bias
- Identify key levels from higher timeframe

### 2. HTF PDA (Premium/Discount Array) on H1, M30, or M15
- [ ] Fair Value Gap (FVG)
- [ ] Order Block (OB)
- [ ] Liquidity level (equal highs/lows)

### 3. Liquidity Sweep Detection
- [ ] H1 sweep detected → Use M5 Order Block for entry
- [ ] M30 sweep detected → Use M3 Order Block for entry
- [ ] Double/Triple sweep = STRONGER confirmation

### 4. Order Block Confirmation
- Wait for price to return to the Order Block
- OB must be respected (price reacts at the level)

---

## Entry Rules

```
ENTRY TRIGGER:
  IF sweep detected on H1 or M30 timeframe
  AND price returns to Order Block (M5 for H1 sweep, M3 for M30 sweep)
  AND OB shows reaction (candle closes respecting the level)
  THEN enter at OPEN of NEXT candle
```

### Entry Types by Sweep Timeframe
| Sweep Timeframe | Entry Timeframe | Order Block |
|-----------------|-----------------|-------------|
| H1 sweep | M5 | 5-minute OB |
| M30 sweep | M3 | 3-minute OB |

---

## Stop Loss Rules

```
STOP LOSS PLACEMENT:
  FOR LONG: Place stop below swing low (the sweep low)
  FOR SHORT: Place stop above swing high (the sweep high)
```

- Stop loss at the swing high/low that was swept
- Do NOT use arbitrary tick-based stops
- The sweep level IS the invalidation level

---

## Take Profit Rules

```
TARGET: 2R (2x the risk)

IMPORTANT: The 2R target is measured from the IDEAL entry level,
NOT from where you actually entered.

If entry was late, target is still calculated from:
  - The Order Block level (ideal entry)
  - NOT your actual fill price
```

### Target Calculation
1. Measure distance from OB entry to stop loss = 1R
2. Target = Entry + (2 × Risk)
3. If using session levels (Asia/London high/low), can extend target

---

## Trade Management

### V3 Trade Management (Partial Profits + Trailing)

**Problem Solved:** V2 backtests showed trades reaching 2-4R then reversing to losses (e.g., Trade #8: $1,162 MFE → -$562; Trade #14: $2,275 MFE → -$1,350).

**Solution:** Implement partial profits and trailing stop per TTrades Skill #12.

#### Partial Profits at 1R
```csharp
// V3: Take 50% off at 1R, let runner ride
public bool UsePartialProfits { get; set; } = true;
public int PartialPercent { get; set; } = 50;      // Take 50% off
public double PartialTargetR { get; set; } = 1.0;  // At 1R
```

**Example (Trade #14):**
- Entry: Short at 5139, Risk = 27 pts ($1,350 for 1 lot)
- At 1R (5112): Take 50% = +$675 locked
- Full reversal to stop: Runner hits BE = $0
- **Net: +$675 instead of -$1,350**

#### Breakeven at 1R
```csharp
// Reduced from 2R to 1R to match partial timing
public double BreakevenTriggerR { get; set; } = 1.0;
```

#### Trailing Stop (Protected Swings - TTrades Skill #12)
```csharp
// Trail runner using LTF swing structure
public bool UseTrailingStop { get; set; } = true;
public int TrailingSwingLookback { get; set; } = 5;

// Logic:
// - Only activates after partial taken
// - Finds recent swing high/low in lookback period
// - Long: Trail stop up to swing low - buffer
// - Short: Trail stop down to swing high + buffer
// - Only trails in favorable direction (never against)
```

### Breakeven Rule (Original)
- Move stop to breakeven at 1R (previously 2R)
- Trail stop loss to swing highs/lows as trade progresses

### Cut Trade Early (Low Probability Scenarios)
```
CUT THE TRADE IF:
  - Price consolidates after entry (no immediate follow-through)
  - Trading during PM session and price chops
  - Entry was in consolidation range
  - Price doesn't want to move in your direction
```

### Add to Position
```
IF missed initial entry:
  - Wait for new 1H or 30M candle to form
  - Use the fresh LTF Order Block created by that new candle
  - Same stop loss rules apply
```

---

## Trade Filters (Avoid These)

### DO NOT TRADE:
1. **PM Session on Gold** - No volume, slow, choppy
2. **Inside consolidation** - Cut trade if enters consolidation
3. **Before major news** - No sense to trade before news
4. **Deep Premium for longs** - Only longs in discount zone
5. **Deep Discount for shorts** - Only shorts in premium zone

### HIGHER PROBABILITY SETUPS:
1. Double/Triple sweep on HTF
2. Sweep into HTF FVG or OB
3. Clear directional bias from daily
4. Multiple confirmations aligned

---

## NinjaTrader C# Implementation Parameters

### Time Filters
```csharp
// Pre-market session (primary)
public int TradeStartHour { get; set; } = 9;   // 9:00 AM EST (covers 9:30 open)
public int TradeEndHour { get; set; } = 12;    // 12:00 PM EST (AM session)

// PM Session filter (avoid)
public bool AvoidPMSession { get; set; } = true;
public int PMSessionStart { get; set; } = 13;  // 1:00 PM EST
public int PMSessionEnd { get; set; } = 16;    // 4:00 PM EST
```

**Strict Session Enforcement (v2 Enhancement):**
- State machine now enforces `isInTradingSession` check in ALL states
- Any setup in progress is reset when leaving the 7-9 AM window
- Prevents entries that trigger outside session hours
- Each state handler (SCANNING, WAITING_FOR_SWEEP, WAITING_FOR_OB, ENTRY_TRIGGERED) checks session

### Sweep Detection
```csharp
// Sweep parameters
public int SwingLookback { get; set; } = 20;   // Bars to identify swing H/L
public double SweepThresholdTicks { get; set; } = 4; // Higher for NQ volatility

// Multi-timeframe
public bool UseH1Sweep { get; set; } = true;   // H1 sweep → M5 OB
public bool UseM30Sweep { get; set; } = true;  // M30 sweep → M3 OB
```

### Order Block Detection
```csharp
// Order block parameters
public int OBLookback { get; set; } = 10;      // Bars to find OB
public bool RequireOBMitigation { get; set; } = true; // Wait for price to return
public double OBPullbackPercent { get; set; } = 50.0; // NEW: Require 50% pullback into OB
```

**OB Pullback Requirement (v2 Enhancement):**
- For longs: Price must pull back to at least 50% into the OB (measured from OB high)
- For shorts: Price must pull back to at least 50% into the OB (measured from OB low)
- Aligns with Skill #68 (Equilibrium Trading): "50% midpoint of range"
- Reduces false entries where price barely touches OB edge

### Risk Management
```csharp
// Stop loss
public bool UseSwingStopLoss { get; set; } = true;  // SL at sweep swing
public int MaxStopLossTicks { get; set; } = 100;    // Maximum SL cap

// Take profit
public double TargetRMultiple { get; set; } = 2.0;  // 2R target
public bool MeasureFromIdealEntry { get; set; } = true;

// Breakeven
public bool UseBreakeven { get; set; } = true;
public double BreakevenTriggerR { get; set; } = 1.0; // Move BE at 1R
```

### Trade Management
```csharp
// Cut trade filters
public bool CutOnConsolidation { get; set; } = true;
public int ConsolidationBars { get; set; } = 5;     // Bars without progress

// Premium/Discount filter
public bool UsePremiumDiscountFilter { get; set; } = true;
public double EquilibriumPercent { get; set; } = 50.0; // 50% of range
```

### V3 Trade Management (NEW)
```csharp
// Partial profits - lock in gains at 1R
public bool UsePartialProfits { get; set; } = true;
public int PartialPercent { get; set; } = 50;       // Take 50% at partial
public double PartialTargetR { get; set; } = 1.0;   // Partial at 1R

// Trailing stop - TTrades Skill #12 (Protected Swings)
public bool UseTrailingStop { get; set; } = true;
public int TrailingSwingLookback { get; set; } = 5; // Bars to find swing
```

**Expected V3 Impact (based on V2 backtest):**
- Trade #8: -$562 → +$200 (partial locks profit before reversal)
- Trade #14: -$1,350 → +$675 (partial locks profit before reversal)
- **Net improvement: +$2,587 from these 2 trades alone**

### V4.1 Strict HTF Bias Filter (NEW)
```csharp
// Daily bias filter - strict SMA-based trend
public bool UseHTFBiasFilter { get; set; } = true;
public int HTFSwingLookback { get; set; } = 5;  // SMA period (days)

// Logic (V4.1 - strict, no Neutral):
// - Previous close > 5-day SMA → Bullish → ONLY longs allowed
// - Previous close < 5-day SMA → Bearish → ONLY shorts allowed
// - No neutral state - always filtered to one direction
```

**V4 vs V4.1:**
- V4.0 used swing structure with Neutral fallback (didn't filter trades)
- V4.1 uses SMA comparison - always has a direction, strictly filters

**Expected V4.1 Impact:**
- Filters counter-trend trades (e.g., longs during April 2025 crash)
- Trade #26 (Apr 17): Long at 5433 during daily downtrend → will be filtered
- May reduce trade count but improve win rate

### V5 11 AM Fade Strategy (NEW)

**Problem:** Analysis of backtest data revealed that 11 AM trades were 90% losers:
| Trade | Date | Direction | Entry Time | Result |
|-------|------|-----------|------------|--------|
| #3 | Jan 15 | Short | 11:25 AM | -$1,050 |
| #5 | Feb 18 | Long | 11:35 AM | -$587 |
| #7 | Mar 3 | Long | 11:35 AM | -$150 |
| #9 | Mar 13 | Long | 11:25 AM | -$425 |

**Total 11 AM losses:** -$11,200+

**Solution:** Instead of avoiding 11 AM setups, **FADE them** - use them as counter-signals.

```csharp
// V5: 11 AM Fade parameters
public bool Use11AMFade { get; set; } = true;
public int FadeHourStart { get; set; } = 11;  // Start of fade window
public int FadeHourEnd { get; set; } = 12;    // End of fade window
```

**Logic Flow:**
```
Normal Setup at 11 AM (e.g., Long signal)
    ↓
DON'T take the long (it's historically a 90% loser)
    ↓
Wait for CISD in OPPOSITE direction (bearish CISD)
    ↓
Wait for pullback into LTF Order Block
    ↓
Enter SHORT (opposite of original signal)
    ↓
Stop loss at original setup's swing level (the trap)
```

**New States:**
- `WAITING_FOR_FADE_CISD` - Wait for CISD in opposite direction of original signal
- `WAITING_FOR_FADE_OB` - Wait for pullback to LTF Order Block in fade direction
- `FADE_ENTRY_TRIGGERED` - Enter opposite direction of original signal

**Theoretical Impact:**
If fading turns the 4 major 11 AM losers into winners:
- Original: -$11,200
- Faded: +$11,200 (potential)
- **Swing: +$22,400 improvement**

---

## State Machine Flow (v5 - MTF + CISD + 11AM Fade)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIQUIDITY SWEEP STRATEGY (MTF)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HTF Processing (H1 or M30 bars):                               │
│  ─────────────────────────────────                              │
│  STATE 1: WAITING_FOR_SESSION                                   │
│    - Check if within trading hours (9 AM - 12 PM EST)           │
│    → If in session: STATE 2                                     │
│                                                                 │
│  STATE 2: SCANNING_FOR_HTF_LEVEL                                │
│    - Identify swing H/L on H1 or M30                            │
│    → If HTF level found: STATE 3                                │
│                                                                 │
│  STATE 3: WAITING_FOR_SWEEP (on HTF)                            │
│    - Monitor for price to sweep the HTF level                   │
│    - H1 sweep → activeOBTF = M5 (BarsInProgress 0)              │
│    - M30 sweep → activeOBTF = M3 (BarsInProgress 3)             │
│    → If sweep detected: STATE 4 (CISD) or STATE 5 (no CISD)     │
│                                                                 │
│  LTF Processing (M5 or M3 bars):                                │
│  ─────────────────────────────────                              │
│  STATE 4: WAITING_FOR_CISD (NEW - v3)                           │
│    - After HTF sweep, wait for Change in State of Delivery      │
│    - For longs: LTF close > sweep candle open                   │
│    - For shorts: LTF close < sweep candle open                  │
│    → If CISD confirmed: STATE 5                                 │
│    → If timeout: Reset to STATE 3                               │
│                                                                 │
│  STATE 5: WAITING_FOR_OB_RETURN                                 │
│    - Find Order Block on LTF (M5 or M3)                         │
│    - Wait for price to return to OB with pullback requirement   │
│    → If OB touched and respected: STATE 6                       │
│                                                                 │
│  STATE 6: ENTRY_TRIGGERED                                       │
│    - Check for 11 AM fade window (V5)                           │
│    - If in fade window: → STATE 6a (FADE flow)                  │
│    - Otherwise: Enter at open of next candle                    │
│    - Set stop loss at sweep swing high/low                      │
│    - Set target at 2R from ideal entry                          │
│    → Position opened: STATE 7                                   │
│                                                                 │
│  V5 11AM FADE FLOW (if in fade window 11-12):                   │
│  ───────────────────────────────────────────                    │
│  STATE 6a: WAITING_FOR_FADE_CISD                                │
│    - Original signal direction saved                            │
│    - Wait for CISD in OPPOSITE direction                        │
│    - Long trap → wait for bearish CISD                          │
│    - Short trap → wait for bullish CISD                         │
│    → If opposite CISD: STATE 6b                                 │
│                                                                 │
│  STATE 6b: WAITING_FOR_FADE_OB                                  │
│    - Find Order Block in fade direction                         │
│    - Wait for pullback to fade OB                               │
│    → If OB touched and respected: STATE 6c                      │
│                                                                 │
│  STATE 6c: FADE_ENTRY_TRIGGERED                                 │
│    - Enter OPPOSITE direction of original signal                │
│    - Stop at original setup's swing (the trap level)            │
│    - Target: 2R from fade OB                                    │
│    → Position opened: STATE 7                                   │
│                                                                 │
│  STATE 7: MANAGING_TRADE                                        │
│    - V3: Take partial profits at 1R (50%)                       │
│    - V3: Move to breakeven at 1R                                │
│    - V3: Trail runner using protected swings                    │
│    - Check for consolidation (cut early)                        │
│    → If target/stop hit: STATE 8                                │
│                                                                 │
│  STATE 8: TRADE_COMPLETE                                        │
│    - Log trade result, reset for next opportunity               │
│    → Return to STATE 1                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Timeframe Data Series (v4)
```csharp
// BarsInProgress mapping:
// 0 = Primary (M5) - OB confirmation for H1 sweeps
// 1 = H1 (60-min) - HTF sweep detection
// 2 = M30 (30-min) - HTF sweep detection
// 3 = M3 (3-min) - OB confirmation for M30 sweeps
// 4 = Daily - HTF bias filter (V4)

AddDataSeries(BarsPeriodType.Minute, 60);  // H1
AddDataSeries(BarsPeriodType.Minute, 30);  // M30
AddDataSeries(BarsPeriodType.Minute, 3);   // M3
AddDataSeries(BarsPeriodType.Day, 1);      // Daily (V4)
```

### CISD Confirmation (Skill #4)
```csharp
// Change in State of Delivery - confirms reversal after sweep
public bool RequireCISD { get; set; } = true;

// For bullish (sweep low): CISD = close > bearish candle open
// For bearish (sweep high): CISD = close < bullish candle open
```

### Timeframe Pair Selection
```csharp
public enum MTFMode { H1_M5, M30_M3, Both }
public MTFMode TimeframePair { get; set; } = MTFMode.Both;
```

---

## Key Skills Required (from builder.db)

| Skill | Description |
|-------|-------------|
| Liquidity Sweep Detection | Identify when price takes out swing high/low |
| Order Block Identification | Find last opposite candle before move |
| Fair Value Gap | 3-candle imbalance pattern |
| Premium/Discount Zones | Above/below 50% of range |
| Multi-Timeframe Analysis | H1 → M30 → M5/M3 confirmation |
| Session-Based Trading | Time filters for Gold/Silver |

---

## Implementation Priority

1. **Phase 1:** Basic sweep detection with swing high/low
2. **Phase 2:** Order block identification on LTF
3. **Phase 3:** Multi-timeframe confirmation
4. **Phase 4:** Trade management (BE, trailing, cut early)
5. **Phase 5:** Session filters and premium/discount zones

---

## Notes from Video

- "I don't trade PM session on gold at all"
- "Double/triple sweeps give stronger confirmation"
- "If price consolidates after entry, cut the trade"
- "The 2R target is measured from where entry SHOULD have been"
- "79% win rate with 26+ trades backtested"
- "More trades needed to confirm - 36 trades means nothing statistically"
