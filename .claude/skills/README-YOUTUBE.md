# YouTube MCP Integration - Quick Start Guide

## Overview

Generate NinjaTrader Indicators and Strategies from YouTube trading tutorial videos.

## Setup Complete ✅

1. **MCP Server Added:** `youtube-transcript` configured in `.mcp.json`
2. **Skill Created:** `/generate-from-youtube` skill ready to use
3. **Directories Created:**
   - `scripts-output/Indicators/` - For reusable calculation components
   - `scripts-output/Strategies/` - For trading logic

## How to Use

### Basic Usage

```bash
# In Claude Code session
/generate-from-youtube https://www.youtube.com/watch?v=VIDEO_ID
```

### What Happens

1. **Fetches** video transcript via MCP
2. **Analyzes** trading concepts in the transcript
3. **Classifies** content:
   - General concept (e.g., "how to detect sweeps") → Generates **Indicator**
   - Full strategy (e.g., "complete 7:40 system") → Generates **Indicators + Strategy**
4. **Matches** concepts to existing skills in your database
5. **Generates** valid NinjaTrader C# code
6. **Saves** to appropriate directories with metadata

### Output Types

#### Indicator Only
For videos explaining a single concept:
- File: `scripts-output/Indicators/ConceptNameIndicator.cs`
- Database: `deployment_status='library'`
- Reusable across multiple strategies

#### Indicator + Strategy
For videos explaining complete trading systems:
- Files:
  - `scripts-output/Indicators/Concept1Indicator.cs`
  - `scripts-output/Indicators/Concept2Indicator.cs`
  - `scripts-output/Strategies/StrategyName.cs`
- Strategy references the indicators
- Database: Indicators marked as `'library'`, Strategy as `'draft'`

## Example Workflows

### Example 1: General Concept Video

```
User: /generate-from-youtube https://youtube.com/watch?v=ABC123

Video: "ICT Liquidity Sweep Explained"
Result:
  ✅ Generated: LiquiditySweepDetector.cs (Indicator)
  📁 Location: scripts-output/Indicators/
  🎯 Use in strategies: AddChartIndicator(LiquiditySweepDetector())
```

### Example 2: Full Strategy Video

```
User: /generate-from-youtube https://youtube.com/watch?v=XYZ789

Video: "Complete 7:40 Bias Strategy Tutorial"
Result:
  ✅ Generated:
     1. BiasCalculator.cs (Indicator)
     2. SweepDetector.cs (Indicator)
     3. SevenFortyBiasStrategy.cs (Strategy)
  📁 Locations:
     - scripts-output/Indicators/BiasCalculator.cs
     - scripts-output/Indicators/SweepDetector.cs
     - scripts-output/Strategies/SevenFortyBiasStrategy.cs
```

## Next Steps After Generation

1. **Compile Indicators FIRST** in NinjaTrader (F5 or Tools → Compile)
2. **Then compile Strategies** that reference those indicators
3. **Test on charts** - Add indicators to visualize signals
4. **Backtest strategies** using Strategy Analyzer
5. **Refine parameters** based on your instrument and timeframe

## Tips

- **Video quality matters:** Clear explanations = better code generation
- **Captions required:** Video must have captions/transcript enabled
- **Specific is better:** Videos with concrete entry/exit rules work best
- **Iterative refinement:** Generated code is scaffolding - adjust parameters for your needs
- **Save patterns:** After generating, run `/extract-nt-skills` to add new patterns to your library

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No transcript available" | Video has captions disabled - provide text description instead |
| "Could not identify concepts" | Video may be too general - describe the key trading idea |
| Generated code won't compile | Check NinjaTrader version compatibility, adjust syntax |
| Indicators not found in Strategy | Compile indicators first, then strategies |

## File Organization

```
scripts-output/
├── Indicators/           ← Reusable calculations
│   ├── LiquiditySweepDetector.cs
│   ├── OrderBlockIdentifier.cs
│   └── BiasCalculator.cs
└── Strategies/           ← Trading logic
    ├── LiquiditySweepStrategy.cs
    └── SevenFortyBiasStrategy.cs
```

## Database Tracking

All generated files are tracked in the `scripts` table:

- **Indicators:** `deployment_status='library'`
- **Strategies:** `deployment_status='draft'`
- **Source:** `generation_prompt` contains YouTube URL and concepts
- **Dependencies:** Strategies link to indicators via `skills_used` field

## Requirements

- YouTube video with captions/transcript enabled
- Claude Code with MCP support
- NinjaTrader 8 (for compilation and testing)
