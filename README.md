# frontend

This repository is expected to contain the Next.js SSR frontend for Opening Wiki.

CI/CD assumptions:

- `package.json` and `package-lock.json` exist at the repository root
- `npm run build` produces a Next.js standalone server bundle
- the container serves the app on `:3000`
- images are published to `ghcr.io/<owner>/frontend`
- downstream deployment is triggered via `repository_dispatch`

The Dockerfile is aligned with the Obsidian architecture decision: Next.js SSR in a Node runtime, not a static SPA served by nginx.
