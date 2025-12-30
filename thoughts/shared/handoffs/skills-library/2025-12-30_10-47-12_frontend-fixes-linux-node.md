---
date: 2025-12-30T10:47:12-05:00
session_name: skills-library
researcher: Claude
git_commit: 18da0a1
branch: main
repository: builder-block
topic: "Frontend Bug Fixes & Linux Node Setup"
tags: [frontend, nextjs, wsl, node, bug-fix]
status: complete
last_updated: 2025-12-30
last_updated_by: Claude
type: implementation_strategy
root_span_id:
turn_span_id:
---

# Handoff: Frontend bug fixes and Linux Node installation for WSL

## Task(s)

1. **Fix Download API 404** - COMPLETED
   - Script detail page was passing absolute path `?path=/home/satvik/...` but API couldn't read it
   - Changed to use `?id=${script.id}` parameter instead

2. **Fix Source Code Not Loading** - COMPLETED
   - Root cause: Windows Node.js (via WSL path `/mnt/c/Program Files/nodejs/`) cannot read Linux file paths
   - Solution: Installed Linux Node via nvm, reinstalled node_modules with Linux Node
   - Server now runs on `http://localhost:3000` with Linux Node

3. **Add DB Auto-Insert to implement-strategy skill** - COMPLETED
   - Updated `.claude/skills/implement-strategy/SKILL.md` with Step 6 for database insertion
   - When generating strategies, skill now prompts for project and inserts into DB

## Critical References

- `.claude/skills/implement-strategy/SKILL.md` - Strategy implementation workflow with DB insert
- `ui/app/projects/[slug]/scripts/[scriptId]/page.tsx` - Script detail page (fixed download link)

## Recent changes

- `ui/app/projects/[slug]/scripts/[scriptId]/page.tsx:157` - Changed download href from `?path=` to `?id=`
- `.claude/skills/implement-strategy/SKILL.md:141-177` - Added Step 6: Insert into Database

## Learnings

1. **WSL + Windows Node Issue**: When running Next.js dev server in WSL but Node.js is installed on Windows side (`/mnt/c/Program Files/nodejs/`), the server binds correctly but `readFileSync()` cannot access Linux paths like `/home/satvik/...`. The Windows Node process sees Windows paths only.

2. **Solution Pattern**: Install Node.js natively in WSL using nvm:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   nvm install 20
   ```

3. **Node Module Mismatch**: After installing Linux Node, must reinstall node_modules:
   ```bash
   mv node_modules node_modules_old  # Can't rm due to Windows binary locks
   npm install
   ```

4. **Port 3000 Caching**: Next.js 15 can cache port assignments incorrectly. Using `-p PORT` flag directly with `npx next dev -p 4000` can help.

## Post-Mortem (Required for Artifact Index)

### What Worked
- Using `?id=` parameter for download API instead of `?path=` - cleaner and more secure
- Installing Node via nvm in WSL - clean separation from Windows Node
- Moving node_modules instead of deleting (avoids Windows file locks in WSL)

### What Failed
- Tried: Killing Windows processes holding port 3000 → Failed because: Next.js cached the port info somewhere
- Tried: `rm -rf node_modules` → Failed because: Windows binary files (.node) had I/O locks
- Tried: Multiple port specifications → Failed because: Next.js kept trying port 3010 regardless of PORT env

### Key Decisions
- Decision: Install Linux Node via nvm rather than fix Windows path issues
  - Alternatives considered: Convert DB paths to Windows format, use Windows Node with UNC paths
  - Reason: Cleaner long-term solution, avoids path translation issues everywhere

## Artifacts

- `ui/app/projects/[slug]/scripts/[scriptId]/page.tsx` - Fixed download link
- `.claude/skills/implement-strategy/SKILL.md` - Added DB insert step
- `~/.nvm/` - Node Version Manager installed
- `ui/node_modules/` - Fresh install with Linux Node binaries

## Action Items & Next Steps

1. **Clean up old node_modules**: `rm -rf ui/node_modules_old` (may need to do from Windows)
2. **Always start dev server with Linux Node**:
   ```bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   npm run dev
   ```
3. **Consider adding nvm to shell profile** for automatic loading

## Other Notes

**Dev Server Status**: Running on `http://localhost:3000` via background task `bd973a3`

**Database State**:
- Projects: SevenFortyBias V6 (5 scripts), Daily Framework (1 script)
- DailyFrameworkStrategy correctly linked and source code loads

**Frontend Pages Created This Session** (from previous context):
- `/journal/[id]` - Journal entry detail
- `/architectures` - SAD listing
- `/architectures/[name]` - SAD detail viewer
- `/api/download-script` - Download endpoint with `?id=` and `?path=` support
- Skills search component integrated

**To Resume Dev Server**:
```bash
cd /home/satvik/repos/builder-block/ui
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm run dev
```
