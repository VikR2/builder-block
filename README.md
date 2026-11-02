# builder-block

Next.js app for the TCM (The Currency Merchant) video library and AI tutor. Admins upload coaching videos; a Python pipeline transcribes them, extracts frames, builds embeddings and generates lessons; members browse the library and ask the tutor questions grounded in the video evidence.

## Run locally

```bash
cd ui
npm install
npm run dev
```

Open http://localhost:3000. Copy `ui/.env.example` to `ui/.env.local` first.

Python dependencies for the video pipeline are in `requirements.render.txt`.

## Layout

| Path | What it holds |
|------|---------------|
| `ui/` | Next.js 15 + React 19 app: library, tutor chat, lessons, admin, auth, Whop billing |
| `scripts/` | Python video pipeline (`process_local_mp4.py`, `embed_transcripts.py`, `generate_video_lesson.py`, `generate_shorts_brief.py`), FAISS search worker in `scripts/lib/`, Render data bundle tools |
| `data/` | SQLite schema and migrations, architecture docs used for tutor retrieval. Runtime data (`builder.db`, `local-videos/`) is not tracked in git |
| `scripts-output/TradingView/` | TCM Pine Script indicators |
| `ops/render/` | Render deploy and data-release PowerShell tools |
| `docs/` | Deployment and video-training guides |

## Checks

```bash
cd ui
npm run check   # production build
npm test        # Playwright
```

## Deployment

Production runs on Render (`render.yaml`, `Dockerfile`). Runtime data lives on the Render disk at `/app/data` and is moved with data bundles, not git.

- [Render Deployment Plan](docs/render-deployment.md): release strategy, risk levels, rollback
- [Render Deployment Playbook](docs/render-deploy-playbook.md): step-by-step first deploy
- [Render Data Migration](docs/render-data-migration.md): moving runtime data to the Render disk
- [TCM Video Training](docs/tcm-video-training.md): adding videos to the tutor
