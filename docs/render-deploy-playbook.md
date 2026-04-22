# Render Deployment Playbook

This is the fastest safe path to deploy this repo to Render **right now**.

Use this playbook for the current production shape:

- one Render web service
- Docker deploy
- persistent disk mounted at `/app/data`
- SQLite stored on that disk
- auto-deploy from git

Primary repo artifacts:

- [render.yaml](../render.yaml)
- [Dockerfile](../Dockerfile)
- [ui/package.json](../ui/package.json)
- [ui/app/api/health/route.ts](../ui/app/api/health/route.ts)

For runtime data migration, also use:

- [Render Data Migration](./render-data-migration.md)

## 1. Preflight Locally

From the repo root:

```powershell
cd ui
npm run check
```

Expected result:

- the build completes successfully
- dynamic route messages about `cookies` are acceptable
- the command exits successfully

If it fails, stop here and fix locally first.

## 2. Commit And Push

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\render\stage-code-release.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File .\ops\render\push-code-release.ps1 `
  -CommitMessage "deploy: prepare render release"
```

This repo is set up for the simplest release path:

- push the current branch
- Render deploys production automatically

## 3. Create The Render Service

In the Render dashboard:

1. Click `New +`
2. Choose `Web Service`
3. Connect your GitHub repo
4. Select this repository
5. Choose the `main` branch
6. Choose `Docker` as the runtime

Match these settings to [render.yaml](../render.yaml):

- Name: `builder-block-ui`
- Plan: `standard`
- Auto Deploy: `On`
- Health Check Path: `/api/health`

## 4. Add The Persistent Disk

In Render service setup:

1. Add a disk
2. Name it `app-data`
3. Mount path: `/app/data`
4. Size: `10 GB`

This is required because the app stores runtime artifacts under `/app/data`, including:

- `builder.db`
- uploaded video metadata
- transcript artifacts
- FAISS indexes

Do not skip this step.

## 5. Set Environment Variables

Use [render.yaml](../render.yaml) as the source of truth.

Set these required values in the Render dashboard:

### Required app URLs

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BASE_URL`

Set both to your real Render hostname first, then update later if you attach a custom domain.

Example:

```text
https://builder-block-ui.onrender.com
```

### Email

- `EMAIL_FROM`
- `RESEND_API_KEY`

### Stripe

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

### LLM / chat

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY` or `GEMINI_API_KEY`
- `TCM_LLM_PROVIDER`
- `TCM_CHAT_MODEL`
- `TCM_CHAT_TIMEOUT_MS`
- `TCM_LESSON_MODEL`

### Retrieval / embeddings

- `TCM_EMBEDDING_PROVIDER`
- `TCM_EMBEDDING_MODEL`

Recommended current production values:

- `TCM_EMBEDDING_PROVIDER=google-gemini-api`
- `TCM_EMBEDDING_MODEL=gemini-embedding-2-preview`

### Audio cleanup / transcription

- `ELEVENLABS_API_KEY`

### Safe defaults

Also confirm:

- `NODE_ENV=production`
- `NEXT_TELEMETRY_DISABLED=1`

These are already defined in [render.yaml](../render.yaml).

## 6. Trigger The First Deploy

If the service is newly created, Render should start building automatically.

If not:

1. Open the service
2. Click `Manual Deploy`
3. Choose `Deploy latest commit`

Watch the logs for:

- Docker image build
- Python dependency install from `requirements.render.txt`
- Next.js production build
- service starting on port `3000`

## 7. Wait For Health Check

Render should mark the deploy healthy once:

```text
/api/health
```

returns a successful response.

Open:

```text
https://YOUR-RENDER-HOST/api/health
```

You want:

- `ok: true`
- `dbFilePresent: true`
- `databaseReady: true`

## 8. First Smoke Test

Run these in order:

1. Open `/`
2. Open `/pricing`
3. Open `/login`
4. Log in with a real account
5. Open `/tcm`
6. Send one Knowledge Bot question
7. Confirm the response returns
8. Confirm sources and clips are present
9. Open `/account`
10. Open `/account/subscription`
11. Open `/tcm/admin/users`
12. Open `/tcm/admin/videos`

If uploads matter for today’s release:

1. Upload one test video
2. Confirm processing starts
3. Confirm video detail page loads
4. Confirm transcript/lesson artifacts complete

## 9. Stripe Webhook Setup

After the app is live, add the real Render production URL to Stripe.

Create a webhook endpoint in Stripe:

```text
https://YOUR-RENDER-HOST/api/stripe/webhooks
```

Subscribe it to the relevant subscription events already handled by the app.

Then copy the webhook signing secret into:

- `STRIPE_WEBHOOK_SECRET`

## 10. Custom Domain

If you attach a custom domain later:

1. Add the domain in Render
2. Update DNS
3. Change:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BASE_URL`

to the final domain

4. Re-deploy

## 11. Fast Push Workflow After Today

For quick production pushes:

1. Make the change locally
2. Run:

   ```powershell
   cd ui
   npm run check
   ```

3. Commit
4. Push to `main`
5. Wait for Render auto-deploy
6. Re-run the smoke test

## 12. Rollback If Something Breaks

### Code-only rollback

From local:

```powershell
git revert <bad_commit_sha>
git push origin main
```

Render will auto-deploy the revert.

### Data-sensitive rollback

If the release changed:

- schema
- embeddings
- uploaded artifact paths
- SQLite data assumptions

then code rollback may not be enough.

For those cases:

1. revert the code
2. restore the database backup if needed
3. restore any file artifacts under `/app/data` if needed

## 13. What To Back Up Before High-Risk Releases

Before migrations, embedding rebuilds, or upload pipeline changes, back up:

- `/app/data/builder.db`
- any critical processed video directories under `/app/data`

Because this app uses SQLite on a mounted Render disk, treat the service as a
single-instance stateful app.

## 14. Recommended Next Step After First Deploy

After production is live, create a second Render service for staging:

- staging service from `develop`
- production service from `main`

That gives you:

- quick local -> staging pushes
- safer production promotion
- same Docker/runtime model

## 15. Short Version

If you just want the shortest possible path:

1. `cd ui`
2. `npm run check`
3. `git push origin main`
4. Create Render web service from this repo using [render.yaml](../render.yaml)
5. Add the `/app/data` disk
6. Set all env vars
7. Wait for `/api/health`
8. Smoke test login, pricing, chat, admin
