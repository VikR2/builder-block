# NinjaTrader Script Builder

A complete system for building, organizing, and learning from NinjaTrader trading strategies.

## Features

- **Skills Library** - 10+ reusable trading patterns extracted from your scripts
- **MCP Integration** - Auto-loads relevant skills into Claude Code context
- **Next.js UI** - Browse skills, projects, scripts, and trading journal
- **SQLite Database** - Fast full-text search across all skills
- **Code Highlighting** - Beautiful C# syntax highlighting with Shiki

## Quick Start

### 1. View the UI

```bash
cd ui
npm run dev
```

Open http://localhost:3000

### 2. Use in Claude Code

The MCP server is already configured. In your next Claude Code session, skills will automatically load when you mention trading concepts like "sweep", "breakout", or "risk management".

### 3. Extract Skills

```
User: "Extract skills from scripts-output/740.cs"

Claude: [Extracts patterns and saves to database]
✅ Extracted 10 skills. View at http://localhost:3000/skills
```

## Documentation

See [SETUP.md](SETUP.md) for complete documentation.

## Structure

- `data/` - SQLite database with skills, projects, scripts
- `.claude/mcp-servers/nt-skills/` - MCP server for Claude Code integration
- `.claude/skills/` - Claude Code skills (extraction)
- `ui/` - Next.js web application
- `scripts-output/` - Generated NinjaTrader scripts

## What's Included

✅ Database with 10 skills from SevenFortyBiasV6
✅ MCP server for auto-loading skills
✅ Next.js UI with skills library
✅ Code syntax highlighting
✅ Full-text search
✅ Projects & journal system
✅ Extraction skill for Claude Code

## Tech Stack

- **Database**: SQLite with FTS5
- **Backend**: better-sqlite3
- **Frontend**: Next.js 15 + React 19
- **Styling**: Tailwind CSS
- **Code Highlighting**: Shiki
- **Integration**: Model Context Protocol (MCP)
