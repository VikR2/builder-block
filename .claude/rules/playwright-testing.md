# Playwright Testing Rule

After implementing UI features, run Playwright tests to verify functionality before committing.

## When to Test

Run Playwright tests when:
- New UI pages are created
- Existing UI components are modified
- API routes that feed UI are changed
- Before creating commits for UI work

## Test Location

Tests live in `ui/tests/` directory:
- `ui/tests/e2e/` - End-to-end user flows
- `ui/tests/pages/` - Page-specific tests

## Running Tests

```bash
# Run all tests
cd ui && npx playwright test

# Run specific test file
cd ui && npx playwright test tests/e2e/library.spec.ts

# Run with UI mode (debugging)
cd ui && npx playwright test --ui

# Run headed (see browser)
cd ui && npx playwright test --headed
```

## Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login, navigate, etc.
  });

  test('should do expected behavior', async ({ page }) => {
    // Arrange
    await page.goto('/path');

    // Act
    await page.click('button');

    // Assert
    await expect(page.locator('selector')).toBeVisible();
  });
});
```

## Key Patterns

### Authentication
Tests requiring auth should use the test user or mock auth:
```typescript
// Set auth cookie/token before test
await page.context().addCookies([{ name: 'auth', value: 'test-token', domain: 'localhost' }]);
```

### API Mocking
For isolated tests, mock API responses:
```typescript
await page.route('/api/tcm/library/*', async route => {
  await route.fulfill({ json: { videos: [] } });
});
```

### Visual Verification
Take screenshots for visual regression:
```typescript
await expect(page).toHaveScreenshot('feature-state.png');
```

## Required Tests by Feature

| Feature | Test Coverage |
|---------|--------------|
| New page | Navigation, render, key elements |
| Form | Validation, submission, error states |
| CRUD | Create, read, update, delete flows |
| Filters | Filter application, clear, combinations |

## Pre-Commit Checklist

Before committing UI changes:
1. [ ] Tests written for new functionality
2. [ ] `npx playwright test` passes
3. [ ] No console errors in test output
4. [ ] Screenshots reviewed (if applicable)
