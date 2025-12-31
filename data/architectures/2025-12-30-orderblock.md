# Strategy Architecture Document

## Metadata
```yaml
name: "Orderblock"
source_url: "https://www.youtube.com/watch?v=w-JekHg6Ldk"
source_title: "YouTube Video Analysis"
type: "strategy"
complexity: "complex"
generated: "2025-12-30 23:59:37"
confidence: 0.7
```

---

## 1. Overview

**Core Concept:**
- Entry Patterns: order block, equal highs
- Risk Management: stop loss, break even, be
- Market Structure: bias, consolidation, ll
- Indicators: relative strength

**Trading Style:** Smart Money Concepts (SMC), Break-even management

**Timeframe:** 1-minute, 5-minute, 15-minute, 1-hour, daily

---

## 2. Market Context & Bias

### 2.1 Bias Calculation
**Skill:** `TBD - synthesis needed` (novel)

**Logic:**
Determine directional bias based on session structure

**Time Window:** Session start to key time boundary

**Variables Required:**
- `sessionHigh`, `sessionLow` (session range)
- `bias` (Bullish/Bearish/Neutral)
- `biasCalculated` (bool)

**Code Snippet:**
```csharp
// TODO: Implement bias calculation based on video teaching
// Example structure:
// if (inBiasWindow) { collectSessionData(); }
// if (biasWindowEnded) { calculateBias(); }
```

---

## 3. Setup Conditions

### 3.1 Range Building
**Skill:** `TBD - synthesis needed` (novel)

**Description:** Build a range during specified time window

**Time Window:** Specified in video (extract from transcript)

**Variables Required:**
- rangeHigh, rangeLow, equilibrium, rangeSet

**Code Snippet:**
```csharp
// TODO: Implement range building logic
// Based on video teaching
```

### 3.2 Order Block
**Skill:** `TBD - synthesis needed` (novel)

**Description:** Detect order block pattern from video explanation

**Time Window:** Specified in video (extract from transcript)

**Variables Required:**
- orderblockDetected, orderblockPrice

**Code Snippet:**
```csharp
// TODO: Implement order block logic
// Based on video teaching
```

### 3.3 Equal Highs
**Skill:** `TBD - synthesis needed` (novel)

**Description:** Detect equal highs pattern from video explanation

**Time Window:** Specified in video (extract from transcript)

**Variables Required:**
- equalhighsDetected, equalhighsPrice

**Code Snippet:**
```csharp
// TODO: Implement equal highs logic
// Based on video teaching
```

---

## 4. Entry Scenarios

### 4.1 Scenario A: Primary Entry
**Type:** TBD

**Skills Used:**
- `Entry pattern from video` (synthesis needed)

**Entry Conditions:**
- Conditions to be extracted from transcript

**Code Snippet:**
```csharp
// Scenario A: Primary Entry
// TODO: Implement entry logic based on video
bool entryCondition = false;  // Replace with actual logic

if (entryCondition)
{
    if (tradeDirection == 1)
        EnterLong("EntryA");
    else
        EnterShort("EntryA");
}
```

---

## 5. Risk Management

### 5.1 Stop Loss
**Skill:** `TBD - synthesis needed`

**Logic:** Below/above recent swing or entry structure

**Code Snippet:**
```csharp
// Stop loss placement
double stopPrice = tradeDirection == 1 ? sweepLow : sweepHigh;
SetStopLoss(orderName, CalculationMode.Price, stopPrice, false);
```

### 5.2 Take Profit
**Skill:** `TBD - synthesis needed`

**Logic:** Fixed R:R or structural target

**Code Snippet:**
```csharp
// Take profit placement
double tpPrice = tradeDirection == 1
    ? entryPrice + (TakeProfitTicks * TickSize)
    : entryPrice - (TakeProfitTicks * TickSize);
SetProfitTarget(orderName, CalculationMode.Price, tpPrice);
```

### 5.3 Breakeven
**Skill:** `TBD - standard pattern`

**Logic:** Move stop to entry after specified profit threshold

**Code Snippet:**
```csharp
// Breakeven management
double currentProfit = Position.MarketPosition == MarketPosition.Long
    ? Close[0] - Position.AveragePrice
    : Position.AveragePrice - Close[0];

if (currentProfit / TickSize >= BreakevenTicks && !breakevenSet)
{
    SetStopLoss(orderName, CalculationMode.Price, Position.AveragePrice, false);
    breakevenSet = true;
}
```

---

## 6. Time Windows

| Phase | Start | End | Activity |
|-------|-------|-----|----------|
| Pre-market | 3:00 AM | 7:00 AM | Bias calculation |
| Range Building | 7:00 AM | 7:40 AM | Build trading range |
| Execution | 7:40 AM | 9:30 AM | Look for setups and entries |
| Session End | 4:00 PM | - | Close all positions |

---

## 7. State Machine

```
[IDLE] --> [COLLECTING_BIAS]
[COLLECTING_BIAS] --> [BUILDING_RANGE]
[BUILDING_RANGE] --> [WAITING_SETUP]
[WAITING_SETUP] --> [SETUP_DETECTED]
[SETUP_DETECTED] --> [WAITING_ENTRY]
[WAITING_ENTRY] --> [IN_POSITION]
[IN_POSITION] --> [MANAGING_TRADE]
[MANAGING_TRADE] --> [IDLE] (on exit/EOD)
```

---

## 8. State Variables

### Required Variables
```csharp
// Core state
private DateTime currentDate;
private bool tradeTaken;
private int tradeDirection;  // 1 = long, -1 = short

// Bias state
private double sessionHigh;
private double sessionLow;
private BiasType bias;  // Bullish/Bearish/Neutral
private bool biasCalculated;

// Range state
private double rangeHigh;
private double rangeLow;
private double equilibrium;
private bool rangeSet;

// Setup state
private bool setupDetected;
private double setupPrice;
private int setupBar;

// Position management
private double entryPrice;
private double stopLoss;
private double takeProfit;
private bool breakevenSet;
```

### Daily Reset
```csharp
// Daily reset - call at start of each day
private void ResetDailyState()
{
    // Reset all state variables to defaults
    tradeTaken = false;
    tradeDirection = 0;
    setupDetected = false;
    breakevenSet = false;
    // ... reset other state as needed
}
```

---

## 9. Skills Composition Summary

### Direct Use (score > 0.85)
- None identified

### Adaptation Needed (0.7-0.85)
- None identified

### Novel Synthesis Required (< 0.7)
- `order block` (score: 0.00)
- `equal highs` (score: 0.00)
- `stop loss` (score: 0.00)
- `break even` (score: 0.00)
- `partial` (score: 0.00)

---

## 10. Implementation Checklist

- [ ] Declare all state variables (#region Variables)
- [ ] Implement OnStateChange with all parameters
- [ ] Implement bias calculation
- [ ] Implement range building
- [ ] Implement setup detection
- [ ] Implement entry logic for each scenario
- [ ] Implement OnExecutionUpdate for stop/target
- [ ] Implement breakeven management
- [ ] Implement daily reset
- [ ] Add time window controls
- [ ] Add debug output option
- [ ] Backtest on historical data

---

## 11. User Questions

- What is the take profit target (fixed R:R or structural)?

---

## 12. Transcript Excerpts

### Key Passages
**order block** (entry_patterns):
> ...I'm looking in here for my entry. I have an SMT as NQ has taken out that low. I have a continuation order block here. And then I look to take my position and I partial off at logical points over 2 R. And then at my target, I get knocked out of my runners here. And what happens eventually? Well, we come back do...

**equal highs** (entry_patterns):
> ...sset as well as the setup for it and the time frame pairings for scalping. You can see here we have equal highs at the highs which is the draw on liquidity for me on this trade and why I was looking to scalp it. But the main reason is the previous day low SMT. So taking a look at this we have YM here ES here M...

**stop loss** (risk_management):
> ...have runners left. I then watch price trade into here. I'm currently sitting at break even with my stop loss. Price sweeps out a low and then do we close over this level? We do. So then I move my stop to right here. That is a new protected swing. So, I was looking for price to continue higher here without t...

**break even** (risk_management):
> ...xiting that, I just have runners left. I then watch price trade into here. I'm currently sitting at break even with my stop loss. Price sweeps out a low and then do we close over this level? We do. So then I move my stop to right here. That is a new protected swing. So, I was looking for price to continue hig...

**bias** (market_structure):
> .... But if I'm going to be looking to scalp, I'm going to use the hourly time frame for context or my bias or a candle that supports expansion and then using the 15-minute as a swing point and 1 minute as entry. So, a 15-minute and 1 minute fractal model. This is very similar to using a daily for bias, a...


---

## Appendix: Full Skill Code References

No skills matched. All patterns require novel synthesis from transcript.
