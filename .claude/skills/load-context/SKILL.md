# Load Context

Quickly load all data for a trading strategy into the conversation for fast iteration.

## Usage

```
/load-context <pattern> [--full]
```

## Examples

- `/load-context tcm` - Load TCM Order Fulfillment context (skills 101-108)
- `/load-context ttrades` - Load TTrades Fractal Model context
- `/load-context lumi` - Load Lumi sweep model context
- `/load-context tcm --full` - Full details with code snippets

## What It Loads

1. **Skills** - All skills from `data/builder.db` matching the pattern in name, category, or description
2. **Architecture Docs** - SAD files from `data/architectures/` matching the pattern
3. **Video Metadata** - Processed video info from `processed_local_videos` table

## When to Use

- Starting a new session and need previous extraction context
- Iterating on Pine scripts or C# strategies
- Reviewing what skills were extracted from videos
- Getting quick access to skill descriptions before code generation

## Implementation

Run the loader script and display the output:

```bash
python scripts/load_context.py --strategy <PATTERN> --format markdown
```

If `--full` is passed, add the `--full` flag to include complete descriptions and code snippets.

## Output Format

The command outputs a Markdown summary with:
- Skills table (ID, Name, Category)
- Skill descriptions (truncated unless --full)
- Architecture document previews
- Video metadata with extracted skills count

## Available Patterns

| Pattern | Description |
|---------|-------------|
| `tcm` | TCM Order Fulfillment, Submission Range, Sweep vs Run |
| `ttrades` | TTrades Fractal Model, C1/C2/C3, OB patterns |
| `lumi` | Lumi sweep model, liquidity patterns |
| `ict` | ICT concepts (FVG, OB, etc.) |
| `sweep` | All sweep-related skills |
| `entry` | Entry pattern skills |
