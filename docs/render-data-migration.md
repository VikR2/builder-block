# Render Data Migration

This repo should **not** use git to transport runtime data to Render.

Use git for:

- app code
- scripts
- docs
- migrations
- Docker and Render config

Use the data bundle flow for:

- `data/builder.db`
- `data/local-videos/**`
- FAISS indexes
- transcript artifacts

## 1. Stage Only Repo-Safe Files

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\render\stage-code-release.ps1 -DryRun
```

Review the output.

When it looks correct:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\render\stage-code-release.ps1 -ResetStaging
```

To commit and push the staged repo-safe files:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\render\push-code-release.ps1 `
  -CommitMessage "feat: prepare render deployment migration"
```

## 2. Create The Runtime Data Bundle

From the repo root:

```powershell
python .\scripts\render_create_data_bundle.py
```

Default output:

```text
.runtime/render-data/render-data-bundle.zip
```

This bundle includes:

- a safe SQLite snapshot of `data/builder.db`
- `data/local-videos/**`

If you also want legacy local videos:

```powershell
python .\scripts\render_create_data_bundle.py --include-legacy
```

## 3. Upload The Bundle Somewhere Reachable

Render shell cannot pull files directly from your laptop.

Use one of these:

- GitHub Release asset
- private S3 object
- temporary signed URL
- private file host with a direct download link

You only need the bundle reachable long enough for the first migration.

## 4. Deploy Code To Render First

Follow:

- [Render Deployment Playbook](./render-deploy-playbook.md)

Create the Render service, disk, and env vars first.

Do the first code deploy before the data import.

## 5. Open Render Shell

In the Render dashboard for the deployed service:

1. open the service
2. open the shell

Confirm the scripts are present:

```bash
ls /app/scripts
```

## 6. Download The Data Bundle To The Render Shell

Example:

```bash
curl -L "https://YOUR-DOWNLOAD-URL/render-data-bundle.zip" -o /tmp/render-data-bundle.zip
```

## 7. Restore The Data Into `/app/data`

In Render shell:

```bash
python /app/scripts/render_restore_data_bundle.py \
  --bundle /tmp/render-data-bundle.zip \
  --dest /app/data \
  --replace
```

This restores:

- `/app/data/builder.db`
- `/app/data/local-videos/**`

## 8. Restart The Render Service

After restore:

1. restart the service from the Render dashboard
2. wait for `/api/health`

## 9. Verify The Migration

Check:

```text
/api/health
```

Then test:

1. login
2. `/tcm`
3. one bot query
4. `/tcm/library`
5. `/tcm/admin/videos`

If retrieval matters for the release, verify one known query returns the expected lesson/video.

## 10. Important Notes

- Do not rely on `.gitignore` alone. Some runtime files may already be tracked in your current branch history.
- The code staging script is conservative on purpose. It excludes local state, agent state, screenshots, local video corpora, and DB files.
- For future releases, keep using:
  - git for code
  - bundle restore for runtime data
