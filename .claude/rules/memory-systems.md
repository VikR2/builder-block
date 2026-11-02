# Memory Systems Guide

| System | Best For | How to Use |
|--------|----------|------------|
| **Serena memories** | Stable workflows, procedures, conventions | `mcp__plugin_serena_serena__list_memories`, `read_memory`, `write_memory` |
| **claude-mem** | Learnings, errors, decisions (auto-captured) | `mcp__plugin_claude-mem_mcp-search__search(query, limit)` |
| **CLAUDE.md** | Entry context for the project | `.claude/CLAUDE.md` only |

Serena currently has no project memories. Write one when a TCM pipeline or deployment procedure settles and should be reused.

Do not commit the auto-generated claude-mem `CLAUDE.md` stubs that appear in subdirectories; `.gitignore` excludes them.

## Activation

```
mcp__plugin_serena_serena__activate_project("C:/Users/satvi/Repos/builder-block-C")
```
