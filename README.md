# Opening Wiki — Frontend

Next.js (Pages Router) + React + plain CSS, server-side rendered.
Talks to the Go API described in `../obsidian/REQUIREMENTS.md`.

## Stack

- **Next.js 14** (Pages Router) — SSR via `getServerSideProps` on every page
- **React 18** + TypeScript
- **Plain CSS** in `styles/globals.css` (no Tailwind / CSS-in-JS)
- Fonts: **Inter** + **Geist Mono** (Google Fonts)
- Calls the Go API server-side; forwards the user's session cookie to `/me`

## Why Pages Router

`getServerSideProps` makes the SSR boundary explicit — every request hits Node,
reads the session cookie, and asks the Go API for fresh data. This matches the
deployment shape in `decision-tech-stack.md` (Next.js SSR service + Go API
service behind a reverse proxy).

## Layout

```
frontend/
  pages/
    _app.tsx          # global stylesheet + per-page Layout
    _document.tsx     # html shell + font preconnects
    index.tsx         # / — home / browse / search   (SSR)
    openings/[id].tsx # /openings/:id                (SSR)
    g/[slug].tsx      # /g/:slug — public group      (SSR)
    groups/index.tsx  # /groups — auth-only          (SSR redirect)
    submit.tsx        # /submit — auth-only          (SSR redirect)
    login.tsx, signup.tsx
    mod/queue.tsx     # /mod/queue — mod+
    admin/users.tsx   # /admin/users — admin
  components/
    Layout, Topbar, Rolebar, Footer
    OpeningCard, GroupsPanel, AuthCard, SubmitCard
    SortBar, Pagination, SearchHeader
  lib/
    api.ts       # Go API client (server-side fetch + cookie forwarding)
    session.ts   # loadSession() helper for getServerSideProps
    types.ts     # domain types mirroring Go API contract
    mock.ts      # in-memory fixtures used when API is unreachable
  styles/
    globals.css  # ported from frontend/Opening Wiki.html mockup
```

## Run locally

```bash
cp .env.local.example .env.local
# point API_BASE_URL at your running Go API (default http://localhost:8080)

npm install
npm run dev   # http://localhost:3000
```

If the Go API isn't running yet, the home page **falls back to fixtures from
`lib/mock.ts`** so you can see the design end-to-end. A small banner at the
bottom flags this.

## Build for production

```bash
npm run build
npm start
```

In Docker Compose (per `decision-deployment.md`), run two services side-by-side:

```yaml
services:
  api:
    build: ../api
  frontend:
    build: .
    environment:
      API_BASE_URL: http://api:8080
    depends_on: [api]
  caddy:
    image: caddy:alpine
    # routes /api/* → api:8080, everything else → frontend:3000
```

## Where the design came from

`Opening Wiki.html` in this directory is the static design mockup. Its body
markup and CSS were extracted into the React components and `globals.css` —
class names (`op-card`, `op-thumb`, `pag`, `grp-item`, `pill`, …) are kept
identical so the visual tree matches 1:1.
