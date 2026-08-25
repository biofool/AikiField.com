# Architecture Index

| File | Domain | Key components |
|------|--------|---------------|
| `system-overview.md` | Cross-cutting | Trust boundaries, data flows, external systems |
| `frontend.md` | Static marketing + beta SPA | HTML pages, CSS, JS, i18n, beta assessment |
| `backend.md` | PHP server-side | Auth proxy, login, contact handler, dashboard, config |
| `infrastructure.md` | Deploy + CDN | sync.sh, Cloudflare, .htaccess, origin lock, DVC |
| `data.md` | Data files | Beta assessment JSON, i18n strings, audit, ratelimit |

For component-level detail, see `../components/`. For end-to-end paths,
see `../workflows/`.
