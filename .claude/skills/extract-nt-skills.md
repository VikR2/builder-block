---
name: extract-nt-skills
description: Extract reusable skills from a NinjaTrader script
---

# Extract NinjaTrader Skills

After building a NinjaTrader script, use this skill to extract reusable trading patterns and save them to the skills knowledge base.

## When to Use

- After completing a new NinjaTrader strategy script
- When you identify a reusable pattern in existing code
- To build up the skills library for future reference

## Process

1. **Read the script**: Load the complete NinjaTrader C# file
2. **Identify distinct patterns**:
   - Entry/exit logic (sweeps, breakouts, CISD, pullbacks)
   - Market analysis (bias calculation, range building, structure)
   - Risk management (stop loss, take profit, breakeven)
   - State management (daily reset, session windows)
   - Position management (order handling, execution)

3. **For each reusable pattern**:
   - Extract the code snippet (method or code block)
   - Write a clear description (what it does, when to use it)
   - Identify required variables
   - List dependencies on other skills
   - Generate search keywords
   - Determine complexity level (simple, medium, complex)

4. **Save to database**: Use the MCP tool `save_skill` for each pattern

5. **Organize by category**:
   - **Market Analysis**: Bias calculation, market structure
   - **Entry Patterns**: Sweeps, breakouts, CISD, pullbacks
   - **Risk Management**: Stop loss, take profit, breakeven
   - **Trade Management**: Session windows, state reset
   - **Position Management**: Order execution, fills

## Example Usage

```
User: "Extract skills from scripts-output/740.cs"

Claude:
1. Reads scripts-output/740.cs (738 lines)
2. Identifies 10 distinct patterns:
   - Pre-market Bias Calculation (lines 183-224)
   - Range Building (lines 229-251)
   - Sweep Detection (lines 308-336)
   - CISD Pattern (lines 338-404)
   - Breakout Detection (lines 410-434)
   - Pullback After Breakout (lines 437-458)
   - Breakeven Management (lines 529-562)
   - Time-based Session Management (lines 175-179)
   - Fixed Stop Loss & Take Profit (lines 573-590)
   - Daily State Reset (lines 609-651)

3. For each pattern, calls save_skill:
   - name: "Pre-market Bias Calculation (VWAP-POC)"
   - category: "Market Analysis"
   - subcategory: "Directional Bias"
   - description: "Calculates market directional bias..."
   - code_snippet: [extracted code]
   - variables: ["pmHigh", "pmLow", "pmPOC", ...]
   - keywords: ["premarket", "bias", "vwap", "poc"]
   - complexity: "medium"

4. Confirms: "✅ Extracted 10 skills from 740.cs. View in UI at http://localhost:3000/skills"
```

## Guidelines

### What Makes a Good Skill?

**DO extract**:
- Self-contained logic that can be reused
- Patterns that appear in multiple strategies
- Well-defined entry/exit conditions
- Reusable risk management techniques
- Market structure analysis methods

**DON'T extract**:
- Strategy-specific variable declarations
- One-off custom calculations
- Debug/logging statements
- Boilerplate NinjaTrader code
- Overly coupled code that needs refactoring

### Naming Conventions

- **Name**: Descriptive, specific (e.g., "CISD Pattern (Change in State of Delivery)")
- **Category**: Broad grouping (e.g., "Entry Patterns", "Risk Management")
- **Subcategory**: Specific type (e.g., "Reversal", "Continuation")
- **Keywords**: Search terms (lowercase, ["sweep", "liquidity", "ict"])

### Code Snippet Guidelines

- Include only the essential logic
- Remove strategy-specific customizations
- Keep variable names generic where possible
- Include key comments for clarity
- Show the pattern clearly (200-400 lines max)

## MCP Tool Reference

Use these MCP tools from the `nt-skills` server:

### save_skill
```typescript
{
  name: "Pre-market Bias Calculation",
  category: "Market Analysis",
  subcategory: "Directional Bias",
  description: "Calculates market bias based on...",
  code_snippet: "// C# code here",
  variables: ["pmHigh", "pmLow", "pmPOC"],
  keywords: ["premarket", "bias", "vwap"],
  complexity: "medium",
  dependencies: [] // Optional: ["range-building"]
}
```

### get_relevant_skills
Use this to check if a similar skill already exists:
```typescript
{
  query: "premarket bias vwap",
  limit: 5
}
```

## After Extraction

Once skills are extracted:
1. They become searchable via FTS (full-text search)
2. The MCP server auto-loads relevant skills in future sessions
3. You can browse them in the UI at `/skills`
4. They're linked to the source script for reference

## Tips

- **Start broad, then refine**: Extract more skills initially, merge similar ones later
- **Document dependencies**: If a skill relies on another, note it
- **Test searchability**: Use good keywords so skills are found when needed
- **Iterate**: As you build more scripts, patterns will emerge
- **Link to projects**: Associate skills with the projects/scripts they came from

---

**Remember**: The goal is to build a reusable knowledge base that accelerates future strategy development!
