# Strategy Architecture Document

## Metadata
```yaml
name: "Changeofcharacter"
source_url: "https://www.youtube.com/watch?v=Lhf_2gJJS1I"
source_title: "YouTube Video Analysis"
type: "strategy"
complexity: "medium"
generated: "2025-12-31 00:31:28"
confidence: 0.7
```

---

## 1. Overview

**Core Concept:**
- Entry Patterns: change of character
- Risk Management: be
- Market Structure: range, consolidation, support

**Trading Style:** Market Structure

**Timeframe:** daily

---

## 2. Market Context & Bias

### 2.1 Bias Calculation
**Skill:** `TBD - synthesis needed` (novel)

**Logic:**
Not specified in transcript

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

### 3.2 Change Of Character
**Skill:** `Change Of Character` (direct)

**Description:** Detect change of character pattern from video explanation

**Time Window:** Specified in video (extract from transcript)

**Variables Required:**
- changeofcharacterDetected, changeofcharacterPrice

**Code Snippet:**
```csharp
// TODO: Implement change of character logic
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

**Logic:** Move stop to entry after X ticks profit

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
- `consolidation` (score: 1.07)

### Adaptation Needed (0.7-0.85)
- `range` (score: 0.66)

### Novel Synthesis Required (< 0.7)
- `support` (score: 0.00)
- `resistance` (score: 0.00)
- `change of character` (score: 0.38)

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

- What is the specific stop loss placement logic?
- What is the take profit target (fixed R:R or structural)?

---

## 12. Transcript Excerpts

### Key Passages
**change of character** (entry_patterns):
> ...hat that does is it it it occurs at or slightly below the trading range and it's used to indicate a change of character in the price action of the stock so this is the moment where supply becomes dominant they've actually increased the supply all the way down actually breaking the trading range creating this lowest lo...

**be** (risk_management):
> ...ne knows we went from a high of around 60 000 crashing down in the last couple of days um and we've been hovering right around that 50 000 mark and i've been paying attention to a lot of people in the space as they analyze these charts um everyone is saying you know we we have corrections in bitcoin i...

**range** (market_structure):
> ...t they do at the buying climax right around this time is they drop the price and start this trading range so they dump supply into the market we have a huge all of a sudden correction this was that big first dump that we saw down to the ar which stands for automatic reaction because we have this huge you...

**consolidation** (market_structure):
> ...bit longer until we're going up again uh it's much more likely that we're going down into a larger consolidation that takes months for them to build their next position to make another move up the market doesn't just move the market is moved so that the people that are you know buying or i'm sorry selling peopl...


---

## Appendix: Full Skill Code References

### Support
**Category:** Market Analysis

```csharp
// support Detection
// TODO: Implement support logic based on video explanation
private bool CheckSupport()
{
    // Placeholder - implement based on video teaching
    return false;
}
```

### Resistance
**Category:** Market Analysis

```csharp
// resistance Detection
// TODO: Implement resistance logic based on video explanation
private bool CheckResistance()
{
    // Placeholder - implement based on video teaching
    return false;
}
```

### Change Of Character
**Category:** Entry Patterns

```csharp
// change of character Detection
// TODO: Implement change of character logic based on video explanation
private bool CheckChangeOfCharacter()
{
    // Placeholder - implement based on video teaching
    return false;
}
```

