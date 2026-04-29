# Deploy the WaveMusic backend to Google Cloud Run

This deploys the FastAPI backend plus the C++ audio engine. The frontend can then call it from GitHub Pages.

## Prerequisites

- A Google Cloud project with billing enabled.
- `gcloud` installed and authenticated.
- The repo checked out locally.

## Deploy

Set your project and region:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud config set run/region europe-west2
```

Enable required APIs:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Deploy from the repo root.

PowerShell:

```powershell
gcloud run deploy wavemusic-api `
  --source . `
  --allow-unauthenticated `
  --set-env-vars "^|^WAVEMUSIC_CORS_ORIGINS=https://jizhang495.github.io,http://127.0.0.1:5173"
```

Bash:

```bash
gcloud run deploy wavemusic-api \
  --source . \
  --allow-unauthenticated \
  --set-env-vars '^|^WAVEMUSIC_CORS_ORIGINS=https://jizhang495.github.io,http://127.0.0.1:5173'
```

The `^|^` prefix tells `gcloud` to use `|` as the separator between environment variables, so the comma stays inside the `WAVEMUSIC_CORS_ORIGINS` value.

If you use a custom GitHub Pages domain, set `WAVEMUSIC_CORS_ORIGINS` to that origin instead.

Cloud Run will print a service URL like:

```text
https://wavemusic-api-xxxxx-ew.a.run.app
```

Use that URL as the GitHub repository variable `WAVEMUSIC_API_BASE_URL`.

## Test the backend

```bash
curl https://YOUR_CLOUD_RUN_URL/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Environment variables

`WAVEMUSIC_CORS_ORIGINS`

Comma-separated browser origins allowed to call the API. For GitHub Pages this is usually `https://YOUR_GITHUB_USERNAME.github.io`. Add `http://127.0.0.1:5173` if you want local Vite development to call the deployed Cloud Run API.

`WAVEMUSIC_GENERATED_DIR`

Directory used for generated score and WAV files. The Docker image defaults this to `/tmp/wavemusic`, which is appropriate for Cloud Run.

`WAVEMUSIC_GENERATED_TTL_SECONDS`

How long generated `.wmusic` and `.wav` files are kept before cleanup. Defaults to `3600`.

`WAVEMUSIC_GENERATED_CLEANUP_INTERVAL_SECONDS`

Minimum time between cleanup scans. Defaults to `300`.

## Notes

Cloud Run filesystem writes are ephemeral. That is fine for this app because generated files are temporary preview/download artifacts.

The sample `.wmusic` files are copied into the container image from `sheets/`. To update public sample scores, commit the sheet changes and redeploy the backend.

Server-side score saving is disabled. The API reads sample scores from `sheets/`, but user-created scores are saved locally by the browser.

Rendering uses temporary backend files:

- `/tmp/wavemusic/render-<timestamp>-<id>.wmusic`
- `/tmp/wavemusic/render-<timestamp>-<id>.wav`

Those files are unique per preview/render request. Old generated files are cleaned up automatically, and all generated files disappear when the Cloud Run instance is recycled.
