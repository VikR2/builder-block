# Skills Library System - Continuity Ledger

**Session:** skills-library
**Last Updated:** 2025-12-29
**Auto-loaded on SessionStart**

---

## Goal

Build a self-improving NinjaTrader skills library that:
1. Extracts NEW skills from YouTube videos automatically
2. Tracks skill dependencies (which skills work together)
3. Generates code intelligently by composing skills
4. Compounds knowledge over time (library gets smarter)

**Success Criteria:**
- [x] Process a YouTube video and extract skills automatically
- [x] Generated code includes proper skill dependencies
- [x] Duplicate videos are detected and skipped
- [x] Skills library grows with each video processed

---

## Constraints

- Database: `data/builder.db` (SQLite)
- MCP Server: `nt-skills` for skill operations
- Output: `scripts-output/Indicators/` and `scripts-output/Strategies/`
- Skill extraction confidence threshold: 0.6

---

## Key Decisions

1. **Duplicate Detection:** Multi-layer scoring (name 0.5 + name_contains 0.3 + keywords 0.25 + FTS 0.25)
2. **Score Thresholds:** >0.70 skip/update, 0.35-0.70 ask, <0.35 create
3. **Abbreviation Filtering:** Skip terms <3 chars or in abbreviations list (be, ll, sl, etc.)
4. **Dependency Order:** Depth-first, dependencies before main skill
5. **Source Tracking:** Separate `skill_sources` table for provenance
6. **Video Tracking:** `processed_videos` table with unique URL constraint
7. **MCP Path Fix:** DB path = `../../../../data/builder.db` (4 levels from dist/)

---

## State

- Done:
  - [x] Phase 1: Database schema (skill_sources, skill_combinations, processed_videos)
  - [x] Phase 2: MCP tools (check_skill_exists, get_skill_with_dependencies, suggest_complementary_skills, save_skill_with_source)
  - [x] Phase 3: YouTube script enhancement (10-step workflow with skill extraction)
  - [x] Phase 4: Continuity system (ledger + SessionStart hook)
  - [x] Phase 5: yt-dlp fallback for auto-generated captions
  - [x] Phase 6: Fixed MCP DB path issue (was 3 levels, needed 4)
  - [x] Phase 7: Improved skill comparison (name priority, abbreviation filtering)
  - [x] Phase 8: Full workflow tested successfully
- Now: [→] System working end-to-end
- Next: Test with more videos, refine skill extraction quality

---

## Working Set

**Key Files:**
- `scripts/generate_from_youtube.py` - Main pipeline (enhanced)
- `.claude/mcp-servers/nt-skills/src/index.ts` - MCP server with 7 tools
- `data/schema.sql` - Database schema
- `data/builder.db` - SQLite database

**Commands:**
```bash
# Test skill extraction from YouTube
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://youtube.com/watch?v=..." \
    --project-id 1

# Extract skills only (no code gen)
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://youtube.com/watch?v=..." \
    --project-id 1 \
    --skip-generation

# Check database stats
sqlite3 data/builder.db "SELECT COUNT(*) FROM skills; SELECT COUNT(*) FROM processed_videos;"
```

**Branch:** main

---

## Open Questions

- RESOLVED: MCP server DB path fixed (needed 4 levels not 3 from dist/)
- RESOLVED: Full pipeline tested with real video (w-JekHg6Ldk)

---

## Library Stats

_Updated by SessionStart hook_

- **Skills Count:** (query on load)
- **Videos Processed:** (query on load)
- **Last Skill Added:** (query on load)

---

## Recent Activity

- 2025-12-30: Fixed MCP DB path (../../../ -> ../../../../)
- 2025-12-30: Improved skill comparison - name priority, abbreviation filtering
- 2025-12-30: Full workflow tested successfully - 6 skills extracted, strategy generated
- 2025-12-29: Added yt-dlp fallback for auto-generated YouTube captions
- 2025-12-29: Tested with real video (w-JekHg6Ldk) - fetched 7,611 chars of transcript
- 2025-12-29: Completed Phases 1-4, system ready for testing
