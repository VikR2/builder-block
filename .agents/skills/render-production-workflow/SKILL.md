---
name: render-production-workflow
description: "Use for The Currency Merchant Render production operations: pushing environment variables through the Render connector or repo Render API scripts, deploying or redeploying the app, checking deploy status, reading service config, verifying health, and avoiding repeated reminders about Render setup. Trigger when the user mentions Render, production env vars, pushing keys, redeploying, service status, or go-live production checks."
---

# Render Production Workflow

## Rules

- Prefer Render connector tools if they are exposed.
- If connector tools are not exposed, use the repo scripts in `ops/render/`.
- Never commit secrets or `.env.local`.
- Use `https://thecurrencymerchant.com` for production public app URLs.
- After changing env vars, trigger or wait for a Render deploy before claiming production is updated.

## Repo Render Config

The repo keeps Render runtime config outside Git:

```text
.runtime/render/service-config.json
.runtime/render/render-api.env
```

Current service config has been:

```text
serviceId: srv-d7kh8h57vvec73cvaogg
serviceName: builder-block
branch: feature/tcm-knowledge-bot
```

Do not print the Render API key.

## Push Env Vars

If Render connector has `update_environment_variables`, use it with service ID and explicit key/value pairs.

If connector tools are unavailable, create a temporary ignored env file under `.runtime/render/`, sync it, then delete it:

```powershell
$tempEnv = '.runtime/render/production-update.env'
@'
NEXT_PUBLIC_APP_URL=https://thecurrencymerchant.com
NEXT_PUBLIC_BASE_URL=https://thecurrencymerchant.com
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
'@ | Set-Content -LiteralPath $tempEnv -NoNewline
try {
  ./ops/render/sync-render-env.ps1 -LocalEnvFile $tempEnv -OnlyLocalKeys
} finally {
  Remove-Item -LiteralPath $tempEnv -Force -ErrorAction SilentlyContinue
}
```

The script should print only updated key names.

## Deploy

Trigger deploy:

```powershell
./ops/render/trigger-render-deploy.ps1
```

If that helper fails parsing the API response, check status directly because the deploy may still have been accepted:

```powershell
./ops/render/get-render-service-status.ps1
```

For deeper deploy details:

```powershell
. ./ops/render/render-common.ps1
$config = Get-RenderServiceConfig
Invoke-RenderApi -Method GET -Path "/v1/services/$($config.serviceId)/deploys"
```

## Verify

After deploy is live:

```powershell
Invoke-WebRequest https://thecurrencymerchant.com/api/health
Invoke-WebRequest https://thecurrencymerchant.com/api/stripe/webhooks -Method Post -SkipHttpErrorCheck
```

Expected:

- Health endpoint returns 200.
- Unsigned webhook POST returns 400 `Missing signature` or `Invalid signature`.

If a deploy remains queued while another commit deploy is building, wait and poll deploys rather than triggering repeated deploys.
