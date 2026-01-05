---
name: implement-strategy
description: Generate NinjaTrader code from a Model (skill_combinations) or Strategy Architecture Document
---

# Implement Strategy Skill

Generate high-quality NinjaTrader code from a complete trading model or Strategy Architecture Document (SAD).

## Usage

**Model-first (recommended):**
```bash
python scripts/implement_strategy.py --model-id <id> --output-name <ClassName>
```

**SAD-based (legacy):**
```
/implement-strategy <sad-name>
```

## Model-First Approach (Recommended)

The model-first approach generates strategies from complete models stored in `skill_combinations`. This produces code that reflects the **model's intent**, not just concatenated skill snippets.

### Why Model-First?

| SAD-based (old) | Model-first (new) |
|-----------------|-------------------|
| Parse markdown manually | Query structured database |
| Skills as individual snippets | Skills in model context |
| Generic state machine | State machine from model spec |
| Magic number parameters | Parameters from skill_contexts |

### What's in a Model?

The `skill_combinations` table stores:
- **trade_flow_rules** - Phase sequencing (bias → setup → confirmation → entry)
- **state_machine_spec** - All states and transitions
- **skill_contexts** - How each skill fits (phase, order, required flag)
- **context_annotations** - Timeframes, sessions, constraints

### Model-First Generation

```bash
# Generate from Model #5 (TTrades 4H PO3)
python scripts/implement_strategy.py --model-id 5 --output-name TTrades4HPO3Strategy

# List available models
python scripts/implement_strategy.py --list-models
```

**Output:**
- `scripts-output/Strategies/<ClassName>.cs` - Strategy code
- `scripts-output/Strategies/<ClassName>_changelog.md` - Skills by phase

## How It Works

### Step 1: Load Complete Model

```python
# From skill_combinations
SELECT trade_flow_rules, state_machine_spec, skill_contexts, context_annotations
FROM skill_combinations WHERE id = ?
```

### Step 2: Generate State Machine from Model

The state machine comes directly from `state_machine_spec`:
- All states defined (not simplified)
- Transitions with model-defined triggers
- Guards from model constraints

### Step 3: Generate Phase Logic

For each phase in `trade_flow_rules`:
1. Identify skills for that phase from `skill_contexts`
2. Load skill code with model context applied
3. Generate phase block with proper sequencing

### Step 4: Apply Constraints as Guards

Model constraints become code guards:
- "Entry REQUIRES CISD" → `if (!cisd_confirmed) return;`
- "Don't hold past 4H close" → session close check

### Step 5: Output with Traceability

The changelog tracks:
- Model ID and name
- Skills organized by phase
- Which skills are required vs optional
- Constraints applied

## SAD-Based Workflow (Legacy)

For strategies without a model in `skill_combinations`, use the SAD approach:

### Step 1: Load and Parse SAD

```
Loading SAD: seven-forty-reversal

Type: Strategy
Skills to compose: 8
Proceed? [Y/n]
```

### Step 2: Compose Skills

- **Direct use (>85% match):** Copy snippet, adapt variable names
- **Adaptation (70-85%):** Modify per SAD requirements
- **Novel synthesis (<70%):** Ask user for examples

### Step 3: Generate Draft

Fill template sections:
1. Enums from SAD
2. Variables from composed skills
3. OnBarUpdate with bias/setup/entry logic
4. Helper methods

### Step 4: Quality Check

- [ ] No placeholder conditions
- [ ] All state variables declared
- [ ] Entry conditions complete
- [ ] Daily reset clears all state

### Step 5: Output

Files:
- `scripts-output/Strategies/<ClassName>.cs`
- `scripts-output/Strategies/<ClassName>_changelog.md`

## Quality Reference

Generated code should match production patterns:
- State machine architecture
- Time window awareness
- Complete entry/exit logic
- Proper risk management
- Debug output option

## Files

- Script: `scripts/implement_strategy.py`
- Template: `scripts/templates/strategy_template.cs`
- Models: `skill_combinations` table
- SADs: `data/architectures/`
- Output: `scripts-output/Strategies/`
