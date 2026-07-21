# YouTube Extraction Skill Context

Memory integration for video extraction workflow.

## Reference Files

- **Workflow:** `.claude/skills/youtube.md` - Full 10-checkpoint extraction workflow
- **Reference Guide:** `.claude/rules/video-extraction.md` - Stable patterns and thresholds
- **QA Rules:** `.claude/rules/youtube-extraction-qa.md` - Mandatory checkpoints

---

## Before Extraction (AUTOMATIC - Silent)

1. **Read reference guide:** `.claude/rules/video-extraction.md`
2. **Auto-recall past extractions:** Query claude-mem silently for relevant patterns
3. **Check processed_videos table:** Prevent duplicate processing

### Memory Recall Protocol

Before extracting from any video, silently search for relevant learnings:

```bash
# Search for patterns related to video topic/creator
mcp__plugin_claude-mem_mcp-search__search query="extraction [topic] OR model [strategy-type]"

# Apply relevant patterns automatically - no user prompt needed
```

**Auto-recall searches:**
- Video creator name (if known)
- Trading concept keywords (sweep, CISD, OB, etc.)
- Previous extraction issues

---

## Memory Storage Protocol (HYBRID)

### Successful Extraction (AUTO-STORE - Silent)

After successful extraction, automatically store summary:

**Tags:** `extraction`, `skills`, `[model-name-if-applicable]`

**Content template:**
```
Video: [title]
URL: [url]
Skills extracted: [N new, M matched]
Model captured: [yes/no]
Key concepts: [list]
```

**No user prompt - just store silently.**

### Failed/Problematic Extraction (PROMPT TO STORE)

If extraction encounters issues, ask user:

> "Store this issue pattern for future avoidance? The learning would help prevent similar problems."

**If user approves, store with:**
- Tags: `extraction`, `extraction-issue`, `[issue-type]`
- Content: What went wrong + How it was fixed + Pattern to avoid

### Issue Types for Tagging

| Issue Type | When to Use |
|------------|-------------|
| `transcript-mismatch` | Visual evidence contradicted transcript |
| `skill-ambiguity` | Hard to decide existing vs new skill |
| `model-incomplete` | Missing trade flow elements |
| `frame-quality` | Visual analysis hindered by frame quality |
| `parameter-uncertainty` | Couldn't determine exact values |

---

## Tags Reference

| Tag | When to Use |
|-----|-------------|
| `extraction` | All video extraction learnings |
| `skills` | Skill matching patterns and decisions |
| `model-context` | Complete model extraction patterns |
| `visual-analysis` | Frame analysis and trade mining learnings |
| `extraction-issue` | Problems encountered and solutions |
| `[creator-name]` | Creator-specific patterns (e.g., `ttrades`, `lumi`, `tcm`) |

---

## What to Recall

Before extraction, look for learnings about:

1. **Creator patterns** - How this creator explains concepts
2. **Similar concepts** - Past extractions of same trading concepts
3. **Issue patterns** - Problems to watch for with this type of video
4. **Model structures** - Templates from successful model extractions

---

## What to Store

After extraction, capture:

### For Successful Extractions (Auto)
- Video metadata (title, URL, duration)
- Extraction outcome (skills count, model captured)
- Key decisions made (skill matching, model structure)

### For Issues/Learnings (Prompted)
- What the problem was
- Why it happened
- How it was resolved
- Pattern to recognize/avoid

---

## Example Memory Queries

```bash
# Before extracting TTrades video
search: "extraction ttrades OR fractal model"

# Before extracting sweep-based strategy
search: "extraction sweep liquidity"

# After encountering stop reference issue
search: "extraction-issue stop reference"
```

---

## Integration with Workflow

The youtube.md skill workflow should:

1. **Start:** Silently recall relevant learnings
2. **Checkpoint 1a:** Apply past model detection patterns
3. **Checkpoint 2:** Use past skill matching decisions
4. **End (success):** Auto-store extraction summary
5. **End (issues):** Prompt to store issue pattern

This creates a learning loop without adding friction to successful extractions.
