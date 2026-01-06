---
name: strategy-iterator
description: Run full iteration loop on a strategy - analyze backtest, identify problems, apply skill fixes, document in SAD
---

# Strategy Iterator Skill

Analyze backtest results, identify performance issues, match problems to skills, and implement fixes.

## Usage

```
/iterate <csv-path> [--strategy <name>] [--sad <path>] [--cs <path>]
```

Examples:
```
/iterate results/ES-Lumi/v4-lumi.csv
/iterate results/ES-Lumi/v4.csv --strategy LumiLiquiditySweep --sad docs/strategies/Lumi-SAD.md
/iterate results/backtest.csv --cs scripts-output/Strategies/MyStrategy.cs
```

## What It Does

### PHASE 1: ANALYZE
Parse backtest CSV using `scripts/backtest_analyzer.py`, identify top 3 problems:
- **MFE reversals** - Trades that reached profit but exited at loss
- **Time clusters** - Hours with consistent losses (e.g., 11 AM)
- **Session issues** - AM vs PM performance disparities
- **Loss streaks** - Consecutive losing trades indicating systemic issues

### Debug Output Analysis (V19+)

If debug output file exists in results folder, parse for state transition bottlenecks:

| Metric | How to Calculate | Healthy Threshold |
|--------|------------------|-------------------|
| POI detection rate | POI detected / Days with bias | > 50% |
| POI invalidation rate | POI invalidated / POI detected | < 50% |
| CISD confirmation rate | CISD confirmed / H1 confirmed | > 20% |
| Entry skip rate (stop wide) | Skipped / CISD confirmed | < 30% |

**Debug Signature Patterns:**

| Problem Pattern | Debug Signature | Root Cause |
|-----------------|-----------------|------------|
| POI starvation | "bias is set but POI never detected" | Detection only on HTF |
| Confirmation gap | Many H1 CONFIRMED, few CISD | State race condition |
| Filter rejection | Many "SKIP - stop too wide" | Zone sizing too large / wrong stop reference |
| State dead-end | State X reached but never exits | Missing transition logic |
| Invalidation churn | High POI invalidated count | Cooldown too short |

### PHASE 2: MATCH
Query skills database for solutions:
- Rank by relevance and expected impact
- Check dependencies between solutions
- Present options with dollar impact estimates

| Problem Pattern | Recommended Skills | Expected Impact |
|-----------------|-------------------|-----------------|
| MFE Reversal | partial-profits, trailing-stop-protected-swings | Lock in profits at 1R |
| Time Cluster (11 AM) | 11am-fade-strategy, time-based-filters | Skip or fade window |
| Session Losses (PM) | session-exit-filter | Exit before PM |
| Streak > 5 | daily-loss-limit, max-trades-per-day | Stop after N losses |
| Direction Bias | htf-bias-filter, sma-bias-confirmation | Trade with trend |

### PHASE 3: DESIGN
Propose changes:
- State machine modifications
- New parameters with defaults
- **[APPROVAL GATE]** - User must approve before implementation

### PHASE 4: IMPLEMENT
Apply changes:
- Update strategy .cs file
- Increment version (e.g., V4 -> V5)
- Delegate to code-reviewer for pre/post checks

### PHASE 5: DOCUMENT
Update Strategy Architecture Document:
- Add version history entry
- Add problem/solution section with code blocks
- Log expected impact

### PHASE 6: VALIDATE
Risk checks:
- Delegate to risk-manager agent
- Verify risk coverage
- Check for new edge cases

### PHASE 7: LEARN
Capture insights for model intelligence:
- Update `iteration_log` in skill_combinations
- Create `model_iterations` record via `nt-skills__update_model_after_iteration`
- Apply trader self-reflection framework
- Suggest variants if pattern persists (3+ iterations)

## Professional Trader Self-Reflection

For every problem, ask:

**MODEL issue?** Did I understand the setup? Was entry criteria clear?

**EXECUTION issue?** Did I enter at the right location? Was timing correct?

**CONTEXT issue?** Did I check HTF? Was I trading against trend?

**RISK issue?** Was stop too tight/wide? Did I take profits correctly?

## Minimum Requirements

- At least 20 trades in backtest for statistical relevance
- Strategy file (.cs) path for implementation
- SAD path for documentation (optional but recommended)

## Files It Uses

- `scripts/backtest_analyzer.py` - Problem detection
- `scripts/dependency_graph.py` - Skill dependency analysis
- `nt-skills MCP` - Skill matching and model updates

## Agents It Delegates To

- `code-reviewer` - Pre/post implementation checks
- `risk-manager` - Risk validation
- `docs-writer` - SAD updates (optional)

## Example Output

```
╔═══════════════════════════════════════════════════════════════╗
║           ITERATION DESIGN REVIEW: V4.1 → V5                  ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  PROBLEMS IDENTIFIED:                                         ║
║  1. MFE Reversals: 4 trades lost $5,200 after reaching 1R+   ║
║  2. 11 AM Cluster: 6 trades at 11 AM lost $8,200 (16% WR)    ║
║                                                               ║
║  PROPOSED SOLUTION: "11 AM Fade + Partial Profits"           ║
║                                                               ║
║  NEW PARAMETERS:                                              ║
║  - UsePartialProfits = true                                   ║
║  - PartialPercent = 50                                        ║
║  - Use11AMFade = true                                         ║
║                                                               ║
║  EXPECTED IMPACT: +$19,000                                    ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  OPTIONS:                                                     ║
║  [1] Approve - Implement V5 with both solutions               ║
║  [2] Partial - Only partial profits                           ║
║  [3] Partial - Only 11 AM fade                                ║
║  [4] Modify - Adjust parameters                               ║
║  [5] Reject - Cancel iteration                                ║
╚═══════════════════════════════════════════════════════════════╝
```

## Quality Gates

1. **Analysis Validity** - Min 20 trades, at least one problem > $1,000 impact
2. **Solution Available** - Relevant skill exists, dependencies satisfiable
3. **User Approval** - MANDATORY explicit approval before implementation
4. **Code Review** - Integration score >= 70%, no critical issues
5. **Risk Validation** - All mandatory checks pass

## When to Use

Invoke this skill when you need to:
- Analyze backtest results for problems
- Find skill-based solutions for trading issues
- Iterate a strategy from V(n) to V(n+1)
- Document iteration changes in SAD
- Capture learnings for future reference

---

## Video Analysis Process for Stop/Entry Logic

When backtest analysis shows consistent losses despite "correct" patterns, the implementation may misinterpret the original video's intent. Use this process to verify entry/stop logic against actual trades shown in source videos.

### Step 1: Extract Video Frames

```bash
# Download video and extract frames every 2 seconds
yt-dlp -f best "https://youtu.be/VIDEO_ID" -o "data/video-frames/VIDEO_ID/video.mp4"
cd data/video-frames/VIDEO_ID
ffmpeg -i video.mp4 -vf "fps=0.5" -q:v 2 frame_%04d.jpg
```

### Step 2: Find Frames with Actual Trades

Look for frames showing:
- Position info boxes (Entry, Stop, Target values)
- Order execution markers
- Highlighted zones with price levels visible

Key data to extract:
- Entry price (e.g., 6480.00)
- Stop price (e.g., 6476.75)
- Stop distance in ticks (e.g., 13 ticks)

### Step 3: Calculate Stop Reference

Given Entry and Stop, calculate the difference:
```
Stop Distance = |Entry - Stop| / TickSize
Example: |6480.00 - 6476.75| / 0.25 = 13 ticks
```

This tells you the stop SIZE. Now identify the REFERENCE:

### Step 4: Identify Stop Reference Point

Check each possibility and match to the measured stop:

| Reference | Calculate | Does It Match Stop? |
|-----------|-----------|---------------------|
| FVG Bottom | FVG zone bottom price | Usually too far |
| OB Wick Low | Lowest price of OB candle | Common but wider |
| **OB Body Low** | Lower of Open/Close | **Often correct - tighter** |
| Sweep Low | The liquidity sweep low | Usually too far |
| Protected Swing | Prior swing low | Variable |

### Step 5: Cross-Reference with SAD Document

Check the Strategy Architecture Document for stop rules:
- "Place beyond protected swing (body high/low of entry candle)"
- "Below M5 order block body (for longs)"

Match the video measurement to the documented rule.

### Step 6: Verify with Visual Diagram

Draw the trade setup to confirm:

```
EXAMPLE from TTFM Video Analysis:

Given:
- Entry: ~6480
- Stop: ~6476.75 (13 ticks below entry)
- Yellow FVG zone: 6475-6478
- OB candle body: ~6477-6480

Analysis:
- Stop (6476.75) is NOT at FVG bottom (6475) ❌
- Stop (6476.75) IS just below OB body (6477) ✅
- Conclusion: Stop reference = OB BODY low, not FVG
```

### Key Lesson

**Don't assume stop placement from zone names. MEASURE the actual stop distance from video trades and identify which price level it corresponds to.**

Common mistakes to avoid:
- Assuming stop is below FVG (often too wide)
- Using OB wick instead of OB body (different by 5-10 ticks)
- Entering at OB 50% when video shows entry at OB close
- Skipping the "price must enter FVG" gate check

### When to Apply This Process

Use video analysis when:
1. Backtest shows consistent losses despite matching "patterns"
2. Stop distances seem too wide compared to video examples
3. Win rate is below expected (34%+ for 2R system)
4. Multiple iterations haven't improved performance
5. User reports "strategy doesn't match what I see in videos"
