# Local Share Stack

This folder gives you a simple way to publish the local `ui/` app for limited sharing windows:

- Next.js keeps running on `http://127.0.0.1:3000`
- Nginx reverse-proxies it on `http://127.0.0.1:8080`
- Cloudflare Tunnel can expose the Nginx port to the internet only when you want

## Files

- `docker-compose.yml` runs Nginx and Cloudflare Tunnel in Docker
- `nginx/default.conf` reverse-proxies to the local Next.js app with WebSocket and long-lived connection support
- `start-share.ps1` starts Next.js, Nginx, and an optional tunnel
- `stop-share.ps1` tears the stack down
- `register-share-schedule.ps1` creates Windows Scheduled Tasks for start/stop windows
- `.env.share.example` shows the optional stable tunnel settings

## Quick Start

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\share\start-share.ps1
```

That will:

1. Build and start the Next.js app in production mode on port `3000`
2. Start Nginx in Docker on port `8080`
3. Start a Cloudflare quick tunnel if you have not configured a named tunnel token

To stop sharing:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\share\stop-share.ps1
```

## Modes

### Production app mode

Use the default production mode when the branch already builds cleanly:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\share\start-share.ps1 -AppMode prod
```

### Development app mode

Use this when the current branch is still in progress and `next build` is failing:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\share\start-share.ps1 -AppMode dev
```

## Tunnel Options

### Auto mode

`-TunnelMode auto` is the default:

- uses a named tunnel if `TUNNEL_TOKEN` is available
- otherwise falls back to a temporary quick tunnel

### Quick tunnel

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\share\start-share.ps1 -TunnelMode quick
```

Best for:

- temporary view-only demos
- one-off sharing
- cases where a random `trycloudflare.com` URL is fine

Limitations:

- the public URL changes every time
- the app uses Server-Sent Events and streaming endpoints, and Cloudflare documents that quick tunnels do not support SSE

### Named tunnel

1. Copy `.env.share.example` to `.env.share`
2. Put your Cloudflare tunnel token in `TUNNEL_TOKEN=...`
3. Optionally set `PUBLIC_HOSTNAME=your-subdomain.example.com`
4. Start the share stack:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\share\start-share.ps1 -TunnelMode named
```

Notes:

- named tunnels are the better choice for this app because they are stable and work better with long-lived connections
- if you manage the tunnel in the Cloudflare dashboard, point the public hostname to `http://host.docker.internal:8080`

## Scheduling Sharing Windows

Example: share every weekday from `09:00` to `17:00`:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\share\register-share-schedule.ps1 `
  -StartTime (Get-Date '09:00') `
  -StopTime (Get-Date '17:00') `
  -Days Monday,Tuesday,Wednesday,Thursday,Friday `
  -AppMode prod `
  -TunnelMode auto
```

This creates two Windows Scheduled Tasks:

- `builder-block-share-start`
- `builder-block-share-stop`

## Security Notes

- The app is no longer limited to localhost once the tunnel is up, so anything reachable in the current branch becomes internet reachable.
- This repo currently has local secrets in `ui/.env.local`. Do not share admin or billing workflows over a public tunnel until those secrets and public routes are reviewed.
- `NEXT_PUBLIC_APP_URL` and email-generated links still point at localhost unless you set them for the hostname you plan to share.
- Stop the stack when you are done so the public URL disappears.
