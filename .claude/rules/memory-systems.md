# Memory Systems Guide

This project uses two complementary memory systems. Use the right one for the job.

---

## Quick Reference

```
SERENA = Workflows, procedures, templates (manual, stable)
claude-mem = Learnings, errors, decisions (auto, searchable)
CLAUDE.md = Directory entry context (immediate, local)
```

---

## Two Systems, Two Purposes

| System | Best For | How to Use |
|--------|----------|------------|
| **Serena memories** | Workflows, templates, procedures | `mcp__plugin_serena_serena__write_memory`, `read_memory` |
| **claude-mem** | Learnings, errors, decisions | Auto-captured via hooks, search with `mcp__plugin_claude-mem_mcp-search__search` |

---

## When to Use Serena Memories

Store in Serena when documenting **stable, reusable procedures**:

- New workflow discovered/refined
- Code pattern that should be reused
- Project convention established
- Reference material for future sessions

**Available memories:**
- `multimodal-youtube-workflow` - Video extraction procedure
- `strategy-composition-engine` - Strategy building workflow

**Commands:**
```
mcp__plugin_serena_serena__list_memories
mcp__plugin_serena_serena__read_memory(memory_file_name)
mcp__plugin_serena_serena__write_memory(memory_file_name, content)
mcp__plugin_serena_serena__edit_memory(memory_file_name, needle, repl, mode)
```

---

## When to Use claude-mem

Learnings are **auto-captured** as observations. Search when needed:

- Error encountered and how it was fixed
- Decision made with rationale
- Something that worked/failed
- Approach that should be avoided

**Commands:**
```
mcp__plugin_claude-mem_mcp-search__search(query, limit)
mcp__plugin_claude-mem_mcp-search__timeline(anchor, depth_before, depth_after)
mcp__plugin_claude-mem_mcp-search__get_observations(ids)
```

**Useful queries:**
- `"extraction error"` - Past extraction issues
- `"pine script"` - Pine Script learnings
- `"decision [topic]"` - Past decisions on topic

---

## CLAUDE.md Files

These provide **immediate context** when entering a directory:

- What to read first
- Memory recall protocols
- Links to related files

**Example:** `.claude/skills/youtube/CLAUDE.md` tells future sessions to:
1. Read the reference guide
2. Auto-recall from claude-mem
3. Where to store learnings

---

## Example Scenario

**Situation:** Extracted video, discovered visual analysis more accurate than transcript for stop references.

**Where to store:**

| Storage | Content | Why |
|---------|---------|-----|
| **Serena** | Update `multimodal-youtube-workflow` if procedure changes | Stable workflow update |
| **claude-mem** | Auto-captured as observation with context | Searchable learning |
| **CLAUDE.md** | No update needed | Just entry context |

---

## Serena Tool Usage

When to prefer Serena's semantic tools vs Claude Code native tools:

| Task | Prefer Serena | Prefer Native |
|------|---------------|---------------|
| Navigate code | `get_symbols_overview` | `Read` if you know the file |
| Find function | `find_symbol` | `Grep` for text patterns |
| Edit function | `replace_symbol_body` | `Edit` for config/text |
| Refactor name | `rename_symbol` (cross-file) | `Edit` (single file) |
| Search code | `search_for_pattern` | `Grep` for simple matches |

**Key benefit:** Serena's `find_symbol` and `replace_symbol_body` work at the semantic level - safer for code changes than string matching.

---

## Activation

Serena requires project activation at session start:

```
mcp__plugin_serena_serena__activate_project("C:/Users/satvi/Repos/builder-block-C")
```

This enables access to project memories and language-aware tools.
