# Strategy Composition Engine

## Overview
The strategy composition engine (`scripts/strategy_composer.py`) generates fully functional NinjaTrader strategies by composing code snippets from the skills database.

## Key Files
- `scripts/strategy_composer.py` - Main composition engine module
- `scripts/generate_from_youtube.py` - Integration point (imports and uses composer)

## How It Works

### 1. Component Mapping
`STRATEGY_COMPONENTS` dict maps skill names to code components:
- `bias` → Pre-market Bias Calculation (VWAP-POC)
- `range` → Range Building (Opening Range)
- `sweep` → Liquidity Sweep Detection
- `cisd` → CISD Pattern (Change in State of Delivery)
- `breakout` → Breakout Pullback Pattern, Range Breakout Detection
- `fvg` → Fair Value Gap
- `order_block` → Order Block
- `breakeven` → Automatic Breakeven Stop
- `position` → Core position management (always included)
- `time_windows` → Time-based Session Windows

### 2. Key Functions

```python
get_skills_with_code(skill_ids: list) -> dict
```
Fetches skills from database with their `code_snippet` column.

```python
analyze_strategy_gaps(matched_skills: list, concepts: dict) -> dict
```
Returns: `{'present': [...], 'missing': [...], 'recommended': [...], 'is_complete': bool}`

```python
compose_strategy_from_skills(name, description, matched_skills, concepts, url) -> str
```
Main function that composes complete C# strategy code.

### 3. Composition Process
1. Determine components to include based on matched skills
2. Fetch code snippets from skills database
3. Collect: variables, defaults, properties, reset code
4. Build entry logic from sweep/CISD and breakout patterns
5. Assemble into complete NinjaTrader strategy class

## Usage in Pipeline

In `generate_from_youtube.py`, when `is_complete_strategy` is True:
1. Call `analyze_strategy_gaps()` to check completeness
2. Call `print_gap_analysis()` to show what's present/missing
3. If incomplete, prompt user for confirmation
4. Call `compose_strategy_from_skills()` to generate code

## Generated Strategy Structure
- ~597 lines (vs 194 line template)
- BiasType enum
- All state variables for each component
- OnStateChange with configurable properties
- OnBarUpdate with:
  - Pre-market bias calculation
  - Range building
  - Scenario A: Sweep + CISD (reversal)
  - Scenario B: Breakout + Pullback (continuation)
- ManageBreakeven() method
- OnExecutionUpdate and OnPositionUpdate handlers
- ResetDailyState() method
- Full properties region with NinjaScriptProperty attributes

## Database Schema (skills table)
```sql
code_snippet TEXT  -- C# code snippet for this skill
```

Skills with code snippets can be composed into strategies.
