---
name: orchestrator
description: Invoke the orchestrator agent for complex multi-step NinjaTrader strategy tasks
allowed-tools: [Task, Read]
---

# Orchestrator Skill

Invoke the orchestrator agent for coordinated, high-quality strategy development.

## Usage

```
/orchestrator <your request>
```

**Examples:**
```
/orchestrator Build strategy from model 5 with quality checks
/orchestrator @Errors\image.png Fix this bug in the indicator
/orchestrator Implement feature from GitHub issue #12
```

## When to Use

Use `/orchestrator` for:
- Complex multi-step tasks (2+ modules)
- Strategy generation from models or YouTube videos
- Bug fixes that need investigation + fix + review
- Any task requiring specialist coordination

## What It Does

The orchestrator agent will:
1. **Analyze** - Understand full scope, identify affected files
2. **Plan** - Create ordered task list with TodoWrite
3. **Delegate** - Spawn specialist agents as needed:
   - `skill-selector` - Query skills database
   - `strategy-designer` - Design trade flow
   - `risk-manager` - Validate risk coverage
   - `code-reviewer` - Quality checks
   - `debugger` - Investigate issues
4. **Coordinate** - Synthesize results, resolve conflicts
5. **Deliver** - Summarize changes, create PR if needed

## Workflow

When you invoke `/orchestrator`, this skill will:

1. Parse your request
2. Spawn the orchestrator agent via Task tool
3. Pass your full request including any file references
4. Return the coordinated result

## Instructions for Claude

When this skill is invoked:

1. Extract the user's request from the skill arguments
2. Spawn the orchestrator agent:

```
Task("orchestrator", "
  User Request: {user_request}

  Follow the Strategy Generation Pipeline if building strategies.
  Use TodoWrite to track progress.
  Delegate to specialists as needed.
  Report back with summary of actions taken.
")
```

3. Wait for the agent to complete
4. Summarize the results to the user
