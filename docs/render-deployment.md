# Render Deployment Plan

This project's primary production host is **Render**.

If you want the exact click-by-click deployment steps, use:

- [Render Deployment Playbook](./render-deploy-playbook.md)

The current production shape is defined by:

- [render.yaml](../render.yaml)
- [Dockerfile](../Dockerfile)
- [ui/package.json](../ui/package.json)
- [ui/app/api/health/route.ts](../ui/app/api/health/route.ts)

## Deployment Topology

### Production

- Service: `builder-block-ui`
- Platform: Render web service
- Runtime: Docker
- Health check: `/api/health`
- Persistent disk: mounted at `/app/data`
- Database: SQLite file on the mounted disk

### Local Sharing

The stack under [`ops/share/`](../ops/share/README.md) is **not** the production host.

Use it only for:

- local demos
- temporary sharing windows
- branch previews from your own machine

Do not treat the Cloudflare share stack as the main deployment target.

## Release Strategy

### Recommended branch model

- `develop` -> staging Render service
- `main` -> production Render service

If staging does not exist yet, create a second Render service from the same repo and Dockerfile:

- production service tracks `main`
- staging service tracks `develop`

Both services should use the same Docker build, but staging should have its own disk and environment variables.

### Fast push path

For low-risk changes:

1. Develop locally
2. Run:

   ```bash
   cd ui
   npm run check:fast
   npm run check
   ```

3. Push to `main`
4. Let Render auto-deploy production
5. Run the smoke test checklist below

### Safer path

For medium or high-risk changes:

1. Merge to `develop`
2. Let staging deploy automatically
3. Run the smoke test checklist on staging
4. Merge `develop` into `main`
5. Let production auto-deploy

## Change Risk Levels

### Low-risk

- copy updates
- styling/UI-only changes
- non-critical page layout changes
- read-only library/search result formatting

### Medium-risk

- chat prompt changes
- retrieval ranking changes
- auth/session changes
- admin UI changes
- upload flow changes

### High-risk

- database migrations
- Whop or billing changes
- credit accounting changes
- embedding corpus rebuilds
- file layout changes under `/app/data`
- anything that changes SQLite writes or background processing behavior

High-risk changes should go through staging first.

## Required Environment Variables

Production env vars are declared in [render.yaml](../render.yaml). At minimum, validate:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BASE_URL`
- `EMAIL_FROM`
- `RESEND_API_KEY`
- `WHOP_API_KEY`
- `WHOP_PLAN_ID`
- `WHOP_COMPANY_ID`
- `WHOP_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY` or `GEMINI_API_KEY`
- `TCM_LLM_PROVIDER`
- `TCM_CHAT_MODEL`
- `TCM_CHAT_TIMEOUT_MS`
- `TCM_LESSON_MODEL`
- `TCM_EMBEDDING_PROVIDER`
- `TCM_EMBEDDING_MODEL`
- `ELEVENLABS_API_KEY`

Use separate env values for staging and production.

## Persistent Data Rules

The service stores runtime data under `/app/data`.

This includes:

- `data/builder.db`
- processed local videos
- FAISS indexes
- transcript artifacts

Because SQLite lives on a mounted disk, this deployment is intentionally **single-instance**.

Implications:

- do not scale horizontally without replacing SQLite
- do not mount the same disk into staging and production
- back up `data/builder.db` before high-risk releases

## Local Verification Before Push

### Required

```bash
cd ui
npm run check
```

### Fast feedback

```bash
cd ui
npm run check:fast
```

At the moment, `check:fast` intentionally uses the production build path.
The repository still has broader ESLint debt outside the deployment changes, so
the release gate is build-based rather than lint-clean.

## Smoke Test Checklist

After each production deploy:

1. Open `/api/health`
2. Open `/`
3. Log in with a real account
4. Open `/tcm`
5. Send one Knowledge Bot question
6. Confirm chat response, sources, and credits behavior
7. Open `/pricing`
8. Verify Whop checkout loads
9. Open `/account/subscription`
10. Open `/tcm/admin/videos`
11. Confirm the admin users page loads

For uploads or retrieval changes, also verify:

1. upload flow still completes
2. processed video detail page loads
3. transcript search still returns expected lesson/video matches
4. embeddings/search still work against the current corpus

## Rollback Plan

### Code rollback

- revert the commit on `main`
- push the revert
- let Render auto-deploy the previous behavior

### Data-sensitive rollback

If the release included:

- schema changes
- embedding rebuilds
- file migration changes

Then restore in this order:

1. code
2. database backup if necessary
3. any file-level backup artifacts

Do not assume code rollback alone is enough after a data migration.

## GitHub Validation

This repo includes a GitHub Actions workflow at:

- [`.github/workflows/ui-check.yml`](../.github/workflows/ui-check.yml)

It runs `npm run check` for pushes and pull requests to:

- `main`
- `develop`

This gives a basic release gate before Render deployment.

## Suggested Next Infrastructure Step

If you want fast pushes without blind production deploys, the next best step is:

1. create a staging Render service from the same repo
2. point it at `develop`
3. keep production on `main`

That gives you:

- quick local -> staging pushes
- low-friction promotion from staging -> production
- no change to the current Docker or runtime model
