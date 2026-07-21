# YouTube Extraction QA Gate

When extracting skills from YouTube videos, you MUST use AskUserQuestion to get explicit user approval at these checkpoints.

**Related Files:**
- `.claude/rules/video-extraction.md` - Reference guide with thresholds and patterns
- `.claude/skills/youtube.md` - Full extraction workflow
- `.claude/skills/youtube/CLAUDE.md` - Memory integration protocols

## Trigger Phrases

This rule applies when:
- User asks to "extract from YouTube"
- User mentions "youtube extraction"
- User asks to process a youtube.com or youtu.be URL
- User invokes the `/youtube` skill (primary)
- User invokes the `/generate-from-youtube` skill (legacy)

**Recommended:** Use `/youtube <url>` for the orchestrated workflow with enforced checkpoints.

## Checkpoint 1: Video Intent Classification

After analyzing frames/transcript, STOP and ask:

```
Video Analysis Summary:
- Title: [video title]
- Duration: [X minutes]
- Intent: [skills_library | complete_strategy | educational]
- Key findings: [list 3-5 key concepts]

Proceed with this classification?
- Yes, proceed
- No, change intent to: [options]
- Cancel extraction
```

## Checkpoint 2: Skills List Review

Before writing to database, STOP and present:

```
Skills to Extract:

NEW (will create):
- [Skill Name 1] - [brief description]
- [Skill Name 2] - [brief description]

AMBIGUOUS (similar to existing):
- "[Extracted Name]" ~= existing skill #[ID] "[Existing Name]"
  → Use existing / Create new / Skip

EXISTING (already in library):
- #[ID] [Skill Name] - will link to video

Extract these skills?
- Yes, extract all
- No, let me edit the list
- Cancel
```

## Checkpoint 3: SAD/Code Generation

For complete_strategy videos only, STOP and ask:

```
Complete strategy detected. Generate artifacts?

1. Strategy Architecture Document (SAD)?
   - Yes (recommended)
   - No

2. NinjaTrader C# Strategy Code?
   - Yes, generate now
   - No, just SAD
   - No artifacts
```

## CRITICAL RULES

1. **NEVER skip these checkpoints** - even if intent seems obvious
2. **NEVER auto-generate SAD or C# code** without explicit user approval
3. **NEVER write to database** until user confirms skills list
4. **The `--confirm-skills` flag should be assumed TRUE** unless user explicitly says to auto-confirm

## Why This Matters

- User needs to verify video was understood correctly
- Ambiguous skill matches need human judgment
- Code generation is expensive and should be intentional
- Database writes should be reversible by user review
