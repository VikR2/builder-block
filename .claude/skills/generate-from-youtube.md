---
name: generate-from-youtube
description: Generate NinjaTrader Indicators/Strategies from YouTube trading tutorials
---

# Generate NinjaTrader Code from YouTube

Extract trading concepts from YouTube videos and generate NinjaTrader C# code (Indicators and/or Strategies).

## When to Use

- User provides a YouTube URL to a trading tutorial
- User asks to "learn from this video", "convert this to a script", or "generate from YouTube"
- Keywords: "youtube", "video tutorial", "from this video", "youtube.com/watch"

## Architecture

Generate code based on video content:
- **General concepts** (e.g., "liquidity sweep detection") → NinjaTrader **Indicator**
- **Full strategies** (e.g., "7:40 bias strategy") → **Indicator(s) + Strategy**

## Workflow

### Step 1: Fetch Transcript

Use the `youtube-transcript` MCP server to get the video transcript:

```typescript
// MCP tool call
get_transcript({ url: "https://www.youtube.com/watch?v=VIDEO_ID" })
```

**Error handling:**
- Invalid URL → Ask user to verify the link
- No transcript available → Inform user: "This video doesn't have captions enabled. Please provide a text description of the concepts."
- Transcript too long (>50,000 chars) → Use first 50,000 characters and warn user about truncation

### Step 2: Analyze Trading Concepts

Parse the transcript to identify trading concepts:

**Entry Patterns:**
- Keywords: "sweep", "liquidity grab", "break of structure", "order block", "fair value gap", "CISD", "change in state of delivery"

**Risk Management:**
- Keywords: "stop loss", "take profit", "breakeven", "risk reward", "position sizing"

**Market Structure:**
- Keywords: "bias", "trend", "direction", "support", "resistance", "asian session", "london", "new york"

**Indicators/Calculations:**
- Keywords: "VWAP", "POC", "range", "ATR", "moving average", "volume profile"

### Step 3: Map to Existing Skills

Use the `get_relevant_skills` MCP tool to find matching patterns in the database:

```typescript
// For each identified concept
get_relevant_skills({
  query: "liquidity sweep detection",
  limit: 3
})
```

**Common mappings:**
- "CISD" / "change in state" → search: "cisd pattern reversal"
- "Liquidity sweep" → search: "sweep liquidity wick"
- "Order block" → search: "order block support resistance"
- "Breakout" → search: "breakout range expansion"
- "Bias calculation" → search: "bias vwap poc"

### Step 4: Classify Content Type

Determine what to generate:

**Indicator only** (general concept):
- Video focuses on ONE calculation/technique
- Keywords: "how to calculate", "identify", "detect", "measure", "indicator"
- Example: "How to detect liquidity sweeps"

**Indicator(s) + Strategy** (full strategy):
- Video describes complete entry/exit rules
- Keywords: "when to enter", "take profit", "stop loss", "full strategy", "complete system"
- Example: "Complete 7:40 bias strategy"

### Step 5: Generate Code

#### For General Concepts → NinjaTrader Indicator

Create an Indicator class for reusable calculations:

```csharp
// File: [ConceptName]Indicator.cs
// Generated from: [YouTube URL]
// Video: [Title]

namespace NinjaTrader.NinjaScript.Indicators
{
    public class [ConceptName]Indicator : Indicator
    {
        #region Variables
        // Parameters from video transcript
        private int lookbackPeriod = 20;
        private double threshold = 0.0;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"[Description from video]";
                Name = "[ConceptName]Indicator";
                Calculate = Calculate.OnBarClose;
                IsOverlay = true; // true for price overlay, false for panel

                // Add plot for visualization
                AddPlot(Brushes.Blue, "Signal");
            }
            else if (State == State.Configure)
            {
                // Add any data series or indicators needed
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < lookbackPeriod)
                return;

            // Calculation logic from transcript
            // Use matched skill code snippets here

            // Example: Detect sweep condition
            bool sweepDetected = High[0] > High[1] && Close[0] < High[1];

            // Output result
            Value[0] = sweepDetected ? 1 : 0;
        }

        #region Properties
        [Browsable(false)]
        [XmlIgnore]
        public Series<double> Signal
        {
            get { return Values[0]; }
        }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Lookback Period", Order=1, GroupName="Parameters")]
        public int LookbackPeriod
        {
            get { return lookbackPeriod; }
            set { lookbackPeriod = Math.Max(1, value); }
        }
        #endregion
    }
}
```

**Save to:** `scripts-output/Indicators/[ConceptName]Indicator.cs`

**Database fields:**
- `deployment_status` = `'library'`
- `compilation_status` = `'untested'`
- `generation_prompt` = `'YouTube: [URL]\nType: Indicator\nConcepts: [list]'`

#### For Full Strategies → Indicator(s) + Strategy

Generate BOTH:

**1. Indicator(s) for calculations:**

```csharp
// LiquiditySweepDetector.cs
namespace NinjaTrader.NinjaScript.Indicators
{
    public class LiquiditySweepDetector : Indicator
    {
        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Detects liquidity sweeps";
                Name = "LiquiditySweepDetector";
                Calculate = Calculate.OnBarClose;
                IsOverlay = true;
                AddPlot(Brushes.Red, "Sweep");
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 2)
                return;

            // Detect sweep: price exceeds previous high but closes below
            bool sweepHigh = High[0] > High[1] && Close[0] < High[1];
            bool sweepLow = Low[0] < Low[1] && Close[0] > Low[1];

            Value[0] = (sweepHigh || sweepLow) ? 1 : 0;
        }

        #region Properties
        [Browsable(false)]
        [XmlIgnore]
        public Series<double> Sweep
        {
            get { return Values[0]; }
        }
        #endregion
    }
}
```

**2. Strategy that uses the indicators:**

```csharp
// LiquiditySweepStrategy.cs
namespace NinjaTrader.NinjaScript.Strategies
{
    public class LiquiditySweepStrategy : Strategy
    {
        private LiquiditySweepDetector sweepDetector;

        #region Variables
        private int stopLossTicks = 20;
        private int profitTargetTicks = 40;
        #endregion

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"Strategy based on liquidity sweep detection";
                Name = "LiquiditySweepStrategy";
                Calculate = Calculate.OnBarClose;
                EntriesPerDirection = 1;
                EntryHandling = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds = 30;
                IsFillLimitOnTouch = false;
                MaximumBarsLookBack = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution = OrderFillResolution.Standard;
                Slippage = 0;
                StartBehavior = StartBehavior.WaitUntilFlat;
                TimeInForce = TimeInForce.Gtc;
                TraceOrders = false;
                RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade = 20;
            }
            else if (State == State.Configure)
            {
            }
            else if (State == State.DataLoaded)
            {
                // Add the indicator
                sweepDetector = LiquiditySweepDetector();
                AddChartIndicator(sweepDetector);
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < BarsRequiredToTrade)
                return;

            // Entry logic: sweep detected and flat
            if (sweepDetector.Sweep[0] == 1 && Position.MarketPosition == MarketPosition.Flat)
            {
                // Enter based on sweep direction
                if (High[0] > High[1])
                    EnterShort("SweepShort");
                else if (Low[0] < Low[1])
                    EnterLong("SweepLong");
            }

            // Risk management
            if (Position.MarketPosition == MarketPosition.Long)
            {
                SetStopLoss(CalculationMode.Ticks, stopLossTicks);
                SetProfitTarget(CalculationMode.Ticks, profitTargetTicks);
            }
            else if (Position.MarketPosition == MarketPosition.Short)
            {
                SetStopLoss(CalculationMode.Ticks, stopLossTicks);
                SetProfitTarget(CalculationMode.Ticks, profitTargetTicks);
            }
        }

        #region Properties
        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Stop Loss (Ticks)", Order=1, GroupName="Risk Management")]
        public int StopLossTicks
        {
            get { return stopLossTicks; }
            set { stopLossTicks = Math.Max(1, value); }
        }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name="Profit Target (Ticks)", Order=2, GroupName="Risk Management")]
        public int ProfitTargetTicks
        {
            get { return profitTargetTicks; }
            set { profitTargetTicks = Math.Max(1, value); }
        }
        #endregion
    }
}
```

**File organization:**
```
scripts-output/
  Indicators/
    LiquiditySweepDetector.cs
    OrderBlockIdentifier.cs
  Strategies/
    LiquiditySweepStrategy.cs
```

**Database fields for Strategy:**
- `deployment_status` = `'draft'`
- `skills_used` = JSON array of indicator script IDs: `'[12, 15]'`
- `generation_prompt` = `'YouTube: [URL]\nType: Strategy\nIndicators: LiquiditySweepDetector, OrderBlockIdentifier\nConcepts: [list]'`

### Step 6: Save to Database

**For each generated file:**

1. Create the script file in the appropriate directory
2. Call the existing upload function or directly insert into database
3. Update metadata fields

**Example pseudo-code:**
```typescript
// For an Indicator
const indicatorCode = generateIndicatorCode(concepts, matchedSkills);
const filePath = `scripts-output/Indicators/${conceptName}Indicator.cs`;

// Save file
writeFileSync(filePath, indicatorCode);

// Insert into database
db.prepare(`
  INSERT INTO scripts (
    project_id, name, description, file_path,
    generation_prompt, deployment_status, compilation_status
  ) VALUES (?, ?, ?, ?, ?, 'library', 'untested')
`).run(
  projectId,
  `${conceptName}Indicator`,
  `Indicator: ${description}`,
  filePath,
  `YouTube: ${videoUrl}\nType: Indicator\nConcepts: ${concepts.join(', ')}`
);
```

### Step 7: Report to User

**For Indicator generation:**
```
✅ Indicator generated: LiquiditySweepDetector.cs

**Type:** NinjaTrader Indicator (reusable library component)

**Concept:** Liquidity Sweep Detection
- Detects when price sweeps previous high/low and rejects
- Returns: 1 (sweep detected), 0 (no sweep)
- Matched skills: "Sweep Detection", "Wick Analysis"

**File:** scripts-output/Indicators/LiquiditySweepDetector.cs

**Source:**
Video: "ICT Liquidity Concepts Explained"
URL: https://youtube.com/watch?v=...
Transcript: 25 min, 6,500 words

**Usage in strategies:**
```csharp
private LiquiditySweepDetector sweepDetector;
sweepDetector = LiquiditySweepDetector();
if (sweepDetector.Sweep[0] == 1) { /* trade logic */ }
```

**Next steps:**
1. Compile in NinjaTrader (F5 or Tools → Compile)
2. Add to chart to visualize sweep signals
3. Use in your strategies via AddChartIndicator()
```

**For Strategy generation:**
```
✅ Strategy generated: LiquiditySweepStrategy

**Files created:**
1. 📊 LiquiditySweepDetector.cs (Indicator)
2. 📊 OrderBlockIdentifier.cs (Indicator)
3. 🎯 LiquiditySweepStrategy.cs (Strategy)

**Strategy logic:**
- Entry: Liquidity sweep + order block confirmation
- Exit: Stop at swing low (-20 ticks), TP at 2:1 RR (+40 ticks)
- Matched skills: "Sweep Detection", "Order Block", "Risk Management"

**Files:**
- scripts-output/Indicators/LiquiditySweepDetector.cs
- scripts-output/Indicators/OrderBlockIdentifier.cs
- scripts-output/Strategies/LiquiditySweepStrategy.cs

**Source:**
Video: "Complete 7:40 Strategy Breakdown"
URL: https://youtube.com/watch?v=...
Transcript: 45 min, 12,000 words

**Next steps:**
1. Compile INDICATORS first in NinjaTrader
2. Then compile the STRATEGY
3. Test in Strategy Analyzer with historical data
4. Refine parameters based on backtest results

**Note:** Indicators are reusable across strategies. Test them independently on charts first.
```

## Error Handling

| Error | Action |
|-------|--------|
| Invalid YouTube URL | Ask user to verify the link format |
| No transcript available | "This video doesn't have captions enabled. Please provide a text description of the concepts." |
| Transcript >50K chars | Use first 50,000 characters, warn about truncation |
| No trading concepts found | "Could not identify clear trading concepts. Can you describe the key idea from the video?" |
| No matching skills | Generate from scratch, suggest running `/extract-nt-skills` afterward to add to library |

## Tips for Users

- **Timestamps:** If transcript has timestamps, use them to locate key strategy sections
- **Multiple concepts:** If video covers multiple strategies, ask user which one to implement
- **Skill extraction:** After generating, suggest running `/extract-nt-skills` to save new patterns to the database
- **Iterative refinement:** First pass generates structure; user should refine specific values and parameters
- **Compilation order:** ALWAYS compile Indicators BEFORE Strategies that reference them

## Example Usage

```
User: "Generate from https://www.youtube.com/watch?v=XYZ123"

Assistant workflow:
1. Fetch transcript via youtube-transcript MCP → "ICT Liquidity Sweep Strategy"
2. Analyze concepts → finds: sweep detection, order block, risk management
3. Classify → Full strategy (has entry + exit rules)
4. Search skills → get_relevant_skills("sweep") → finds 3 matches
5. Generate:
   - LiquiditySweepDetector.cs (Indicator)
   - OrderBlockIdentifier.cs (Indicator)
   - LiquiditySweepStrategy.cs (Strategy)
6. Save to database with YouTube URL in generation_prompt
7. Report summary with file locations and next steps
```

## Database Schema Notes

- Use `deployment_status` to distinguish file types:
  - `'library'` = Indicator (reusable component)
  - `'draft'` = Strategy (trading logic)
- Store indicator dependencies in `skills_used` field (JSON array of script IDs)
- Include subdirectory in `file_path`: `scripts-output/Indicators/` or `scripts-output/Strategies/`
