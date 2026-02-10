# UI Verification Skill

Quick visual verification of UI components using Playwright MCP.

## When to Use
- After implementing any UI → backend feature
- When debugging visual issues
- Before committing UI changes

## Prerequisites
- Dev server running: `cd ui && npm run dev`
- Playwright MCP enabled (already configured)

## Workflow

### Step 1: Start Verification
```
/verify-ui <page-path> [--elements <selectors>]
```

Examples:
- `/verify-ui /tcm` - Verify TCM chat page
- `/verify-ui /tcm/library` - Verify library page
- `/verify-ui /tcm --elements video,[data-testid="video-controls"]`

### Step 2: Execute Checks

1. **Navigate** - Use `playwright_navigate` to the page
2. **Screenshot** - Use `playwright_screenshot`, save to `.playwright-mcp/verify-<page>-<timestamp>.png`
3. **Console Check** - Use `playwright_evaluate` to check for errors:
   ```javascript
   (() => {
     const errors = [];
     // Check for React errors
     if (window.__NEXT_DATA__?.err) errors.push(window.__NEXT_DATA__.err);
     // Check console errors (if captured)
     return errors;
   })()
   ```
4. **Element Verification** - Use `playwright_snapshot` to verify DOM structure
5. **Dev Tools Network** - Check for failed API calls

### Step 3: Report Results

Present to user:
- Screenshot (shown inline)
- Console errors (if any)
- Missing elements (if any)
- Network failures (if any)
- PASS/FAIL status

## Page-Specific Checks

### TCM Chat (/tcm)
```yaml
elements:
  - textarea                    # Chat input
  - video                       # Video player (after response)
  - [data-testid="video-controls"]  # Player controls
actions:
  - fill: "What is a liquidity sweep?"
  - press: Enter
  - wait: video visible (30s timeout)
```

### TCM Library (/tcm/library)
```yaml
elements:
  - [data-testid="video-list"]  # Video grid
  - video                       # Video player
```

### Admin Panel (/tcm/admin)
```yaml
elements:
  - [data-testid="upload-zone"] # Upload area
  - table                       # Video list
```

## Quick Commands

**Full verification:**
```
/verify-ui /tcm --full
```
Runs: navigate → screenshot → console → elements → network

**Screenshot only:**
```
/verify-ui /tcm --screenshot
```
Just captures current state for visual review.

**After chat interaction:**
```
/verify-ui /tcm --action "ask:What is CISD?"
```
Types question, waits for response, then verifies.

## Playwright MCP Tool Reference

### Navigation
```
playwright_navigate(url="http://localhost:3000/tcm")
```

### Screenshot
```
playwright_screenshot(name="verify-tcm", fullPage=true)
```
Saves to `.playwright-mcp/verify-tcm.png`

### DOM Snapshot
```
playwright_snapshot()
```
Returns accessibility tree - use to verify element presence.

### JavaScript Evaluation
```
playwright_evaluate(script="document.querySelector('video') !== null")
```

### Element Interaction
```
playwright_fill(selector="textarea", value="Test question")
playwright_click(selector="button[type=submit]")
```

## Integration with /build Workflow

After implementing UI changes, the workflow should:

1. **Detect UI changes** - If files in `ui/components/` or `ui/app/` were modified
2. **Determine affected pages** - Map component to page routes
3. **Run verification** - Execute `/verify-ui` on affected pages
4. **Checkpoint** - Show screenshot and results before proceeding

**Example flow:**
```
/build brownfield Add video timestamp display

[After implementation phase]

Verification Phase:
- Detected UI changes in: ui/components/tcm/video-player.tsx
- Affected page: /tcm

Running /verify-ui /tcm...

[Screenshot displayed]

Results:
✓ Page loaded successfully
✓ Video element visible
✓ Controls visible
✓ No console errors
✓ API call /api/tcm/chat succeeded

Proceed to commit? [Y/n]
```

## Component → Page Mapping

| Component Path | Page Route |
|----------------|------------|
| `ui/components/tcm/chat-*.tsx` | `/tcm` |
| `ui/components/tcm/video-*.tsx` | `/tcm`, `/tcm/library` |
| `ui/components/tcm/library-*.tsx` | `/tcm/library` |
| `ui/components/admin/*.tsx` | `/tcm/admin` |
| `ui/app/tcm/page.tsx` | `/tcm` |
| `ui/app/tcm/library/page.tsx` | `/tcm/library` |

## Verification Checklist

After implementing any UI → backend feature:

1. [ ] Dev server running (`npm run dev`)
2. [ ] Run `/verify-ui <page>` with Playwright MCP
3. [ ] Check screenshot for visual correctness
4. [ ] Check console for errors (F12 → Console)
5. [ ] Check Network tab for failed requests
6. [ ] Verify expected elements are present
7. [ ] Test the actual user flow manually

## Troubleshooting

### "Page not loading"
- Ensure `npm run dev` is running in `ui/` directory
- Check terminal for build errors

### "Element not found"
- Verify selector is correct
- Check if element is conditionally rendered
- Increase wait timeout if element loads async

### "Screenshot blank"
- Page may still be loading
- Add wait: `playwright_evaluate(script="document.readyState === 'complete'")`

### "Console errors"
- Check Next.js terminal for server errors
- Check browser console for client errors
- API routes may be failing - check Network tab
