# Deploy the WaveMusic frontend to GitHub Pages

This deploys only the static TypeScript frontend. The frontend calls the backend deployed to Google Cloud Run.

## Prerequisites

- The backend is deployed and reachable.
- The repository has GitHub Actions enabled.
- The repository contains `.github/workflows/pages.yml`.

## Configure GitHub Pages

In the GitHub repository:

1. Open `Settings`.
2. Open `Pages`.
3. Set `Source` to `GitHub Actions`.

## Configure the backend URL

In the GitHub repository:

1. Open `Settings`.
2. Open `Secrets and variables`.
3. Open `Actions`.
4. Open the `Variables` tab.
5. Add a repository variable:

```text
Name: WAVEMUSIC_API_BASE_URL
Value: https://YOUR_CLOUD_RUN_URL
```

Do not include a trailing slash.

## Deploy

Push to `main`, or run the `Deploy GitHub Pages` workflow manually from the Actions tab.

The workflow runs:

```bash
cd webapp
npm ci
npm run build
```

It injects:

```text
VITE_API_BASE_URL=https://YOUR_CLOUD_RUN_URL
VITE_BASE_PATH=/YOUR_REPOSITORY_NAME/
```

## GitHub Pages URL

For a normal project repository, the frontend URL is usually:

```text
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/
```

For a user site repository named `YOUR_GITHUB_USERNAME.github.io`, change `VITE_BASE_PATH` in `.github/workflows/pages.yml` from:

```yaml
VITE_BASE_PATH: /${{ github.event.repository.name }}/
```

to:

```yaml
VITE_BASE_PATH: /
```

## Local frontend development against Cloud Run

To test the frontend locally against the deployed backend:

```bash
cd webapp
VITE_API_BASE_URL=https://YOUR_CLOUD_RUN_URL npm run dev
```

Open `http://127.0.0.1:5173`.

## Local frontend development against local API

To keep everything local:

```bash
uv run uvicorn scripts.web_api:app --host 127.0.0.1 --port 8000 --reload
cd webapp
npm run dev
```

Open `http://127.0.0.1:5173`.
