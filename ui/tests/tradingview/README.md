# TradingView Playwright Sync

This folder contains manual or opt-in Playwright automation for TradingView.

## Files

- `smt-range-ob-sync.spec.ts`
  - Local verification that the Pine source exposes a configurable SMT comparison symbol.
  - Optional live TradingView editor sync that edits the currently open Pine editor instead of creating a new script tab.

## Local verification

From `ui/`:

```powershell
npx playwright test tests/tradingview/smt-range-ob-sync.spec.ts
```

## Live TradingView sync

This mode is intentionally opt-in because it targets a real TradingView session.

From `ui/`:

```powershell
$env:PLAYWRIGHT_EXTERNAL_ONLY=1
$env:TRADINGVIEW_SYNC_ENABLED=1
$env:TRADINGVIEW_CHART_URL="https://www.tradingview.com/chart/wwgrhNUG/"
npx playwright test tests/tradingview/smt-range-ob-sync.spec.ts
```

Notes:

- The sync test assumes the Pine editor is already open in the TradingView tab.
- It replaces and saves the current editor contents instead of opening a new script or pressing `Add to chart`.
- The Pine source used for sync lives at `../scripts-output/TradingView/SMT-Range-OB-Continuation.pine`.
