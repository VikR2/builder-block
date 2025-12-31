# Strategy Architecture Document: LumiTraders Liquidity Sweep (ES Version)

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

### Breakeven Rule
- Move stop to breakeven when price moves favorably
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

---

## State Machine Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIQUIDITY SWEEP STRATEGY                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STATE 1: WAITING_FOR_SESSION                                   │
│    - Check if within trading hours (7-9 AM EST)                 │
│    - Skip PM session                                            │
│    → If in session: STATE 2                                     │
│                                                                 │
│  STATE 2: SCANNING_FOR_HTF_LEVEL                                │
│    - Identify H1/M30/M15 PDA (FVG, OB, liquidity)               │
│    - Mark potential sweep levels                                │
│    → If HTF level found: STATE 3                                │
│                                                                 │
│  STATE 3: WAITING_FOR_SWEEP                                     │
│    - Monitor for price to sweep the HTF level                   │
│    - H1 sweep or M30 sweep                                      │
│    → If sweep detected: STATE 4                                 │
│                                                                 │
│  STATE 4: WAITING_FOR_OB_RETURN                                 │
│    - Price swept, now wait for return to OB                     │
│    - H1 sweep → look for M5 OB                                  │
│    - M30 sweep → look for M3 OB                                 │
│    → If OB touched and respected: STATE 5                       │
│                                                                 │
│  STATE 5: ENTRY_TRIGGERED                                       │
│    - Enter at open of next candle                               │
│    - Set stop loss at sweep swing high/low                      │
│    - Set target at 2R from ideal entry                          │
│    → Position opened: STATE 6                                   │
│                                                                 │
│  STATE 6: MANAGING_TRADE                                        │
│    - Monitor for breakeven trigger                              │
│    - Check for consolidation (cut early)                        │
│    - Trail stop to swing points                                 │
│    → If target hit: STATE 7                                     │
│    → If stopped out: STATE 7                                    │
│    → If cut early: STATE 7                                      │
│                                                                 │
│  STATE 7: TRADE_COMPLETE                                        │
│    - Log trade result                                           │
│    - Reset for next opportunity                                 │
│    → Return to STATE 1                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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
