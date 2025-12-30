# NinjaTrader Script Builder - Setup Complete!

## 🎉 System Overview

You now have a complete NinjaTrader script builder system with:

1. **SQLite Database** - 10 trading skills extracted from 740.cs
2. **MCP Server** - Auto-loads relevant skills into Claude Code context
3. **Next.js UI** - Browse skills, projects, scripts, and journal
4. **Extraction Skill** - Claude Code skill to extract patterns from scripts

---

## 📁 Project Structure

```
builder-block/
├── data/
│   ├── builder.db                 ✅ SQLite database (10 skills)
│   ├── schema.sql                 ✅ Database schema
│   └── seed-skills.sql            ✅ Initial skill data
│
├── .claude/
│   ├── mcp-servers/nt-skills/     ✅ MCP server (built)
│   ├── skills/extract-nt-skills.md ✅ Extraction skill
│   └── settings.local.json        ✅ Claude Code config
│
├── .mcp.json                      ✅ MCP server registration
│
├── ui/                            ✅ Next.js application
│   ├── app/
│   │   ├── page.tsx               ✅ Dashboard
│   │   ├── skills/                ✅ Skills library
│   │   ├── projects/              ✅ Projects browser
│   │   └── journal/               ✅ Trading journal
│   ├── components/
│   │   └── code-viewer.tsx        ✅ C# syntax highlighting
│   └── lib/
│       ├── db.ts                  ✅ Database client
│       └── utils.ts               ✅ Utility functions
│
└── scripts-output/
    └── 740.cs                     ✅ Original script
```

---

## 🚀 Quick Start

### 1. View the UI

The Next.js dev server is already running:

**🌐 Open in browser:** http://localhost:3000

You'll see:
- **Dashboard** - Stats and recent skills
- **Skills Library** - All 10 extracted skills with search
- **Projects** - Will populate when you create projects
- **Journal** - Trading journal (empty for now)

### 2. Use in Claude Code

The MCP server is registered and ready. In your next Claude Code session:

```
User: "I want to build a sweep pattern strategy"

Claude: [Automatically searches skills database]
"I found these relevant skills from your library:
  - Liquidity Sweep Detection (Entry Patterns)
  - CISD Pattern (Confirmation)

Here's how we can combine them..."
```

### 3. Extract Skills from New Scripts

When you build a new script:

```
User: "Extract skills from scripts-output/my-new-strategy.cs"

Claude: [Uses extract-nt-skills skill]
1. Reads the script
2. Identifies reusable patterns
3. Saves each pattern to database via MCP
4. Confirms: "✅ Extracted 5 skills. View at http://localhost:3000/skills"
```

---

## 🔧 MCP Server Tools

The `nt-skills` MCP server provides 3 tools:

### `get_relevant_skills`
Searches skills database using full-text search.

**Example:**
```typescript
{
  query: "sweep pattern",
  limit: 10
}
```

### `save_skill`
Saves a new skill to the database.

**Example:**
```typescript
{
  name: "VWAP Reversal Pattern",
  category: "Entry Patterns",
  description: "Buys VWAP bounces during uptrends",
  code_snippet: "// C# code here",
  keywords: ["vwap", "reversal", "bounce"]
}
```

### `list_skills_by_category`
Lists all skills, optionally filtered by category.

---

## 📊 Database

**Location:** `data/builder.db`

**Tables:**
- `skills` - 10 trading patterns (FTS5 searchable)
- `projects` - Organize scripts by project
- `scripts` - Generated strategies
- `journal_entries` - Trading journal
- `attachments` - Charts, screenshots

**Query the database:**
```bash
sqlite3 data/builder.db "SELECT name, category FROM skills;"
```

**Current skills:**
1. Pre-market Bias Calculation (VWAP-POC)
2. Range Building (Opening Range)
3. Liquidity Sweep Detection
4. CISD Pattern (Change in State of Delivery)
5. Range Breakout Detection
6. Breakout Pullback Pattern
7. Automatic Breakeven Stop
8. Time-based Session Windows
9. Fixed Stop Loss & Take Profit
10. Daily State Reset

---

## 🎯 Workflow

### Building New Strategies

1. **Start Claude Code session**
   - MCP server auto-loads
   - Relevant skills appear in context

2. **Describe your strategy**
   ```
   User: "Build a strategy that:
   - Uses pre-market bias
   - Trades sweep reversals
   - Manages risk with breakeven"
   ```

3. **Claude uses skills**
   - Searches for "premarket bias sweep breakeven"
   - Finds 3 relevant skills
   - Combines them into a new script

4. **Extract new patterns**
   ```
   User: "Extract skills from the script we just built"
   ```

5. **Browse in UI**
   - Open http://localhost:3000/skills
   - See newly extracted skills
   - Reference them in future sessions

---

## 🔍 Searching Skills

### In Claude Code (via MCP)
Skills are automatically searched when you mention trading concepts.

### In UI (Future Enhancement)
Currently browsable by category. Search UI can be added.

### In Database
```bash
sqlite3 data/builder.db "
  SELECT s.name FROM skills s
  JOIN skills_fts fts ON s.id = fts.rowid
  WHERE skills_fts MATCH 'sweep'
  ORDER BY rank;
"
```

---

## 📝 Adding Projects & Journal Entries

Currently, the UI shows empty states for projects and journal. These will be populated as you:

1. **Create projects** (via database INSERT or future UI form)
2. **Link scripts to projects**
3. **Add journal entries** with trading analysis
4. **Upload charts** as attachments

---

## 🛠 Development Commands

### UI Development
```bash
cd ui

# Dev server (already running)
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

### MCP Server Development
```bash
cd .claude/mcp-servers/nt-skills

# Watch mode (auto-rebuild)
npm run dev

# Build
npm run build
```

### Database Management
```bash
# View schema
sqlite3 data/builder.db ".schema"

# Count skills
sqlite3 data/builder.db "SELECT COUNT(*) FROM skills;"

# Full-text search test
sqlite3 data/builder.db "
  SELECT name FROM skills s
  JOIN skills_fts fts ON s.id = fts.rowid
  WHERE skills_fts MATCH 'risk management'
  ORDER BY rank;
"
```

---

## 🎨 Customization

### Add More Skills
```bash
# Method 1: Via Claude Code
User: "Extract skills from my-script.cs"

# Method 2: Via SQL
sqlite3 data/builder.db < my-skills.sql
```

### Modify UI Styles
- Edit `ui/app/globals.css` for theme colors
- Uses Tailwind CSS utility classes
- Dark mode supported via CSS variables

### Add New Database Tables
1. Edit `data/schema.sql`
2. Add new queries to `ui/lib/db.ts`
3. Create UI pages

---

## 🐛 Troubleshooting

### MCP Server Not Working
```bash
# Check it's registered
cat .mcp.json

# Test manually
cd .claude/mcp-servers/nt-skills
echo '{"method":"tools/list"}' | node dist/index.js
```

### UI Not Loading
```bash
# Check dev server logs
tail -f /tmp/claude/-home-satvik-repos-builder-block/tasks/b9cba03.output

# Restart server
cd ui && npm run dev
```

### Database Issues
```bash
# Verify database exists
ls -lh data/builder.db

# Check table count
sqlite3 data/builder.db ".tables"

# Re-run schema
sqlite3 data/builder.db < data/schema.sql
```

---

## 📚 Next Steps

1. **Build more scripts** - Extract more skills to grow your library
2. **Create projects** - Organize scripts by trading style
3. **Add journal entries** - Document your trading ideas
4. **Search functionality** - Add search UI to skills page
5. **Script comparison** - Compare different versions of strategies
6. **Backtest integration** - Link backtest results to scripts

---

## 🙏 Credits

Built with:
- **Next.js 15** - React framework
- **SQLite** - Database with FTS5 full-text search
- **Shiki** - C# syntax highlighting
- **Tailwind CSS** - Styling
- **Model Context Protocol** - Claude Code integration
- **better-sqlite3** - Node.js SQLite driver

---

**You're all set! 🚀**

Open http://localhost:3000 to start browsing your skills library.
