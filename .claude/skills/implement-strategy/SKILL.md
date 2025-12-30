---
name: implement-strategy
description: Load Strategy Architecture Document and generate NinjaTrader code with changelog
---

# Implement Strategy Skill

Generate high-quality NinjaTrader code from a Strategy Architecture Document (SAD).

## Usage

```
/implement-strategy <sad-name>
```

Example:
```
/implement-strategy seven-forty-reversal
```

## Prerequisites

1. SAD file exists at `data/architectures/<sad-name>.md`
2. SAD has been reviewed and approved (or user accepts as-is)
3. Referenced skills exist in the skills library

## Workflow

### Step 1: Load and Parse SAD

1. Read `data/architectures/<sad-name>.md`
2. Extract metadata (name, type, complexity)
3. Parse skill references and their usage types
4. Identify any novel synthesis requirements
5. Show summary to user:

```
Loading SAD: seven-forty-reversal

Type: Strategy
Complexity: Complex
Skills to compose: 8
  - 6 direct use
  - 1 adaptation needed
  - 1 novel synthesis

Proceed with code generation? [Y/n]
```

### Step 2: Compose Skills

For each skill reference in the SAD:

**Direct use (score > 0.85):**
- Copy code snippet from skill library
- Adapt variable names to match SAD naming
- Place in appropriate section of strategy

**Adaptation needed (0.7-0.85):**
- Start with skill snippet as base
- Modify logic per SAD requirements
- Document changes in changelog

**Novel synthesis (< 0.7):**
- Pause and ask user:
```
The SAD requires "Multi-timeframe POC bias" which isn't in the skill library.

Please provide:
a) Example code you've used before, OR
b) Detailed description of the logic

[User input]
```
- Generate code following 740.cs patterns
- Document synthesis in changelog

### Step 3: Generate Full Draft

Use template at `scripts/templates/strategy_template.cs`.

Fill sections in order:
1. `#region Enums` - State enums from SAD
2. `#region Variables` - All state variables from composed skills
3. `OnStateChange()` - Default parameters from SAD
4. `OnBarUpdate()` - Main logic:
   - Time window calculations
   - Bias logic (from SAD section 2)
   - Setup logic (from SAD section 3)
   - Entry scenarios (from SAD section 4)
5. Helper methods:
   - Risk management (from SAD section 5)
   - Daily reset (from SAD section 8)
6. `#region Properties` - All configurable parameters

### Step 4: Quality Check

Before outputting, verify:
- [ ] No placeholder conditions (`longCondition = false`)
- [ ] All state variables declared
- [ ] All time windows functional
- [ ] Entry conditions complete
- [ ] Exit conditions cover all scenarios
- [ ] Daily reset clears all state

### Step 5: Output

Write two files:

**1. Strategy Code:**
`scripts-output/Strategies/<ClassName>.cs`

**2. Changelog:**
`scripts-output/Strategies/<ClassName>_changelog.md`

```markdown
# <ClassName> - Generation Changelog

**Source:** data/architectures/<sad-name>.md
**Generated:** <date>
**LOC:** <line count>

## Composed Skills (direct)
- `skill-slug` -> Lines X-Y
...

## Adapted Skills
- `skill-slug` -> Modified for <reason> (Lines X-Y)
...

## Novel Synthesis
- `concept-name` -> Based on user input: "<summary>"
  - Lines X-Y
...

## User Refinements
(Added during iteration)
...
```

### Step 6: Insert into Database

After generating the code, insert into the database so it appears in the web UI.

**Ask user for project:**
```
Strategy generated! Which project should this belong to?

Existing projects:
1. SevenFortyBias V6 (slug: sevenforten-bias-v6)
2. Daily Framework (slug: daily-framework)
3. [Create new project]

Enter project slug or name for new project:
```

**SQL to execute:**
```sql
-- If creating new project:
INSERT INTO projects (name, slug, description, status)
VALUES ('<name>', '<slug>', '<description from SAD>', 'active');

-- Insert the strategy:
INSERT INTO scripts (project_id, name, file_path, description)
VALUES (
  (SELECT id FROM projects WHERE slug='<project-slug>'),
  '<ClassName>',
  '<absolute-path-to-cs-file>',
  '<description from SAD>'
);
```

**Execute with:**
```bash
sqlite3 /home/satvik/repos/builder-block/data/builder.db "<SQL>"
```

## Checkpoints

Only pause for user input when:
- Novel synthesis needed (ask for examples)
- Ambiguous SAD instruction found
- Multiple valid interpretations possible
- Choosing project for DB insert

Otherwise: Generate -> Output -> Insert -> Let user request changes

## Iteration

After initial output, user can request refinements:
- "Change breakeven from 80 to 60 ticks"
- "Add a second entry scenario for breakouts"
- "Make the stop loss dynamic based on ATR"

Each refinement:
1. Apply change to code
2. Add entry to changelog under "User Refinements"
3. Re-output updated file

## Quality Reference

All generated code should match `scripts-output/740.cs` patterns:
- State machine architecture
- Time window awareness
- Complete entry/exit logic
- Proper risk management
- Debug output option

## Files

- Template: `scripts/templates/strategy_template.cs`
- SAD location: `data/architectures/`
- Output: `scripts-output/Strategies/`
