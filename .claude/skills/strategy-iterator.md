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
