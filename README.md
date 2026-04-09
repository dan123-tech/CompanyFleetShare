# FleetShare — Company Car Sharing (Web Edition)

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=for-the-badge&logo=postgresql)
![Vercel](https://img.shields.io/badge/Vercel-Deployment-000000?style=for-the-badge&logo=vercel)
![Cloudflare](https://img.shields.io/badge/Cloudflare-AI_Backend-F38020?style=for-the-badge&logo=cloudflare)

PostgreSQL-first Next.js app for company fleet booking, licence validation, and admin management.

## Tech Architecture

| Layer | Platform |
|---|---|
| Web app + API routes | Next.js (App Router) |
| Auth/session | Cookie-based auth |
| Database | PostgreSQL via Prisma (control-plane + per-company tenant DB) |
| Recommended production hosting | Vercel + Neon |
| AI backend (driving licence / identity) | `ai-driving-licence-llm-cloudflare` |

## What’s Included

- User and admin dashboards
- Driving licence upload and AI validation flow
- Identity anti-impersonation flow (live scan + face match)
- Reservation lifecycle (create, release, history, approvals)
- Maintenance log + ITP expiry tracking + analytics exports
- Incident reporting (users can submit reports with photos/documents; admins can review)
- i18n (EN/RO), mobile-friendly UI, API docs endpoint

## Quick Start (Local)

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Local URLs:
- App: `http://localhost:3100`
- API docs: `http://localhost:3100/api-docs`

## Required Environment Variables

Core:
- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXTAUTH_URL`

AI backend (recommended on Vercel):
- `AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL=https://<your-cloudflare-ai-backend>`
- `AI_FACE_RECOGNITION_URL=https://ai-face-recognition-nine.vercel.app`
- `AI_FACE_RECOGNITION_VERIFY_PATH=/verify`

Legacy/local fallback (kept for Docker/dev compatibility):
- `AI_VERIFICATION_URL=http://localhost:8080`
- `AI_VERIFY_PATH=/validate`
- `AI_VERIFY_FORM_FIELD=file` (optional)

Identity face-match tuning:
- `AI_FACE_MATCH_PATH=/face-match` (optional)
- `AI_FACE_MATCH_THRESHOLD=0.35` (optional)
- `AI_FACE_MATCH_TIMEOUT_MS=30000` (optional)

Booking enforcement toggle:
- `ENFORCE_IDENTITY_VERIFICATION=true`

Tenant provisioning (Neon, database-per-company):
- `NEON_API_KEY`
- `NEON_PROJECT_ID`
- `NEON_ROLE_NAME`
- `NEON_ROOT_BRANCH_ID` (optional, default `br-main`)

## Deployment (Recommended)

### Vercel + Neon + Cloudflare domain

1. Create Neon database and copy pooled/direct URLs.
2. Import repo in Vercel.
3. Set env vars in Vercel (including `AI_DRIVING_LICENCE_LLM_CLOUDFLARE_URL`).
4. Point your domain from Cloudflare DNS to Vercel.
5. Redeploy after env changes.

Detailed guides:
- [`docs/WEB_HOSTING_GUIDE.md`](docs/WEB_HOSTING_GUIDE.md)
- [`docs/DEPLOY_CLOUDFLARE_VERCEL_NEON.md`](docs/DEPLOY_CLOUDFLARE_VERCEL_NEON.md)

## Identity Verification Flow

The current anti-impersonation implementation includes:
- licence image upload (`/api/users/me/driving-licence`)
- live camera scan capture in dashboard
- AI face match (`/api/users/me/identity/verify`)
- admin approve/reject controls in user management
- optional reservation block until verified (`ENFORCE_IDENTITY_VERIFICATION=true`)

## Multi-Tenant Databases

- Each company is provisioned with a dedicated Neon database/branch.
- Shared control-plane DB stores auth/session + company-to-tenant mapping.
- Company-scoped operations resolve `companyId` to tenant connection and execute on that tenant DB.

## Documentation Index

| Document | Purpose |
|---|---|
| [`docs/IMPLEMENTATION_LOG.md`](docs/IMPLEMENTATION_LOG.md) | Full implementation and hardening history |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security posture and controls |
| [`docs/DATABASE.md`](docs/DATABASE.md) | PostgreSQL/Neon connection details |
| [`docs/FAVICON_AND_SEARCH.md`](docs/FAVICON_AND_SEARCH.md) | Favicon + search appearance notes |
| [`docs/DEPLOY_CLOUDFLARE_VERCEL_NEON.md`](docs/DEPLOY_CLOUDFLARE_VERCEL_NEON.md) | Cloudflare + Vercel topology |
| [`docs/ITP_AND_INCIDENTS.md`](docs/ITP_AND_INCIDENTS.md) | ITP expiry cron/auto-block + incident reporting/attachments |

## Related Repository

The full thesis/server edition (orchestrator + extended integrations) is available at:
- [dan123-tech/Licenta](https://github.com/dan123-tech/Licenta)
