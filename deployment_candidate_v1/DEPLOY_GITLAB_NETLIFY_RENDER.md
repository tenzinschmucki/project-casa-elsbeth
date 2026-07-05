# Deploy `deployment_candidate_v1` with GitLab + Netlify + Render

This folder is the deployment-safe copy of the project.

Use it when you want to publish without touching the local working redesign.

## Architecture

- `deployment_candidate_v1/frontend`
  - deploy to Netlify
  - static site
- `deployment_candidate_v1/external_backend`
  - deploy to Render
  - FastAPI API

## Deployment helper files in this folder

- `deployment_candidate_v1/netlify.toml`
- `deployment_candidate_v1/render.yaml`
- `deployment_candidate_v1/.env.netlify.example`
- `deployment_candidate_v1/.env.render.example`
- `deployment_candidate_v1/.gitlab-ci.yml`

These are all safe to use only for the deployment candidate copy.

## 1. Push to GitLab

Push the whole repository to GitLab.

You can keep `smartphone_redesign-v2` as the local design sandbox and treat `deployment_candidate_v1` as the hosted candidate.

## 2. Deploy backend to Render

Render can read the included blueprint file:

- `deployment_candidate_v1/render.yaml`

It configures:

- Python web service
- root directory: `deployment_candidate_v1/external_backend`
- `uvicorn` start command
- persistent disk for SQLite
- health check path: `/healthz`

### Important Render environment variables

Set these in Render:

- `APP_ENV=prod`
- `DATA_DIR=/var/data/project-casa-elsbeth`
- `CORS_ALLOW_ORIGINS=https://your-netlify-site.netlify.app`

You can start from:

- `deployment_candidate_v1/.env.render.example`

If you later add a custom domain on Netlify, update `CORS_ALLOW_ORIGINS` to that domain too.

Example:

```text
https://your-site.netlify.app,https://bookings.example.com
```

### Important note about the database

This backend still uses SQLite.

That is acceptable for a first hosted MVP if:

- only one deployed backend instance writes to it
- the Render disk stays attached

For more serious production use, move to Postgres later.

## 3. Deploy frontend to Netlify

Netlify should deploy from the GitLab repository, using:

- config file: `deployment_candidate_v1/netlify.toml`
- build command:
  - `node deployment_candidate_v1/build-netlify.mjs`
- publish directory:
  - `deployment_candidate_v1/frontend/dist`

### Important Netlify environment variable

Set:

- `NETLIFY_API_BASE_URL=https://api.schmucki.io/casa-elsbeth`

The build script generates `frontend/dist/config.js` from this value.

You can start from:

- `deployment_candidate_v1/.env.netlify.example`

## 4. What the Netlify build does

The build script:

- copies `deployment_candidate_v1/frontend/*`
- creates `deployment_candidate_v1/frontend/dist`
- writes a deploy-time `config.js`

That means the frontend can stay static while still using the correct backend URL.

## 5. Admin page

The admin page is part of the same frontend deployment:

- `/admin.html`

It uses the same generated `config.js`, so it talks to the same Render API automatically.

## 6. Suggested rollout flow

1. Deploy backend on Render first.
2. Copy the final Render URL.
3. Set `NETLIFY_API_BASE_URL` on Netlify to the backend base path, including `/casa-elsbeth`.
4. Deploy frontend on Netlify.
5. Add the Netlify domain to `CORS_ALLOW_ORIGINS` on Render.
6. Test:
   - guest browsing
   - login
   - booking creation
   - approvals
   - admin page

## 7. If deployment fails

The safest rollback is simple:

- stop using `deployment_candidate_v1`
- deploy a different project copy instead

This is exactly why this folder exists separately from your local working redesign.

## Optional GitLab validation

If you push this project to GitLab, the deployment candidate includes:

- `deployment_candidate_v1/.gitlab-ci.yml`

That pipeline only validates the candidate:

- frontend Netlify build
- backend Python syntax

It does not deploy automatically. Netlify and Render can still pull directly from GitLab.
