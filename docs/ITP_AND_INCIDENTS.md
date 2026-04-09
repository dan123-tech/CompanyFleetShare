## ITP + Incidents (FleetShare)

This document describes the **new fleet safety & compliance features** added to FleetShare:

- **ITP (technical inspection) expiry tracking**
- **Daily cron reminders + auto-blocking on expired ITP**
- **Incident reports** (accident / scratches / damage) with **multi-file uploads**
- **Admin incident review** + **email notifications**
- Notes about **multi-tenant schema compatibility** (important when one company DB is behind)

---

## ITP (technical inspection)

### What it does

- Each `Car` can store an ITP expiry date.
- Admins can see an **ITP overview table** for all cars in **Admin → Maintenance**.
- A scheduled cron job emails admins about:
  - **upcoming ITP expirations** (within `ITP_REMINDER_DAYS`)
  - **expired ITPs**
- Optional: cars with **expired ITP** can be **auto-blocked**:
  - If a car is `AVAILABLE` and the ITP is expired, it is switched to `IN_MAINTENANCE`
  - Admins get an email listing which cars were blocked

### Data model

- **Car fields**
  - `itpExpiresAt: Date | null`
  - `itpLastNotifiedAt: Date | null` (prevents spamming: “at most once per day per car”)

### Admin UI

- Location: **Admin → Maintenance**
- You can:
  - open the **Add ITP** form to set expiry for a chosen car
  - use the **ITP overview** to filter by vehicle/status
  - **edit expiry inline** in the ITP table (per-row date input + save)

### Cron endpoint

- Endpoint: `POST /api/cron/itp-expiry-reminders`
- Auth: `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`)
- Behavior:
  - loops all companies
  - queries each company tenant DB for cars with `itpExpiresAt <= (today + reminderDays)`
  - sends emails to company admins (if any)
  - optionally auto-blocks expired ITP cars (`ITP_AUTO_BLOCK_EXPIRED`)
  - returns summary JSON:
    - `emailedCompanies`, `carsFlagged`, `carsAutoBlocked`
    - `errors`: per-company errors (useful if one tenant DB is behind)

### Environment variables (ITP)

- **Required to run cron**
  - `CRON_SECRET`
- **Optional**
  - `ITP_REMINDER_DAYS` (default 30)
  - `ITP_AUTO_BLOCK_EXPIRED` (default true; set to `false` to disable auto-blocking)

### Email requirements

ITP emails are sent via Resend and require the normal email configuration:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `NEXT_PUBLIC_APP_URL` (recommended for correct links/assets in emails)

---

## Incident reporting

### What it does

Users can submit an **incident report** for a car (accident, scratches, damage, etc.) and attach:

- photos (JPEG/PNG/WEBP, etc.)
- PDFs
- Word documents (`.doc`, `.docx`)

Key UX requirements implemented:

- **Create form supports multiple files**
  - Users can click **Add files** multiple times; previously selected files are kept.
- **Users can upload additional attachments later**
  - “My incident reports” list contains an **Upload files** action per incident that appends new attachments without losing the old ones.
- Admins can review all incidents across the company.

### Data model (tenant DB)

- `IncidentReport`
  - `companyId`, `carId`, `userId`, optional `reservationId`
  - `occurredAt`, `title`, `description`, `location`
  - `status` (default `SUBMITTED`)
  - `adminNotes`
- `IncidentAttachment`
  - `incidentId`, `companyId`
  - `kind` (`PHOTO` / `DOCUMENT` / `OTHER`)
  - `filename`, `contentType`, `sizeBytes`
  - `blobUrl` (stored location; can be Vercel Blob or local `/uploads/...`)

### Storage

Incident attachments are stored using:

- **Vercel Blob** (preferred)
  - can be `private` or `public` depending on `BLOB_PUT_ACCESS`
  - stored value is a URL or a private prefix like `private-incident:<pathname>`
- **Local filesystem fallback** (development)
  - `public/uploads/incidents/<incidentId>/<filename>`

### API endpoints

#### List incidents

- `GET /api/incidents`
  - Admin: all company incidents
  - User: own incidents
  - Returns incident rows including attachment links (`url`)

#### Create incident (with attachments)

- `POST /api/incidents`
  - Content-Type: `multipart/form-data`
  - Fields:
    - `carId` (required)
    - `title` (required)
    - `occurredAt` (optional, ISO datetime)
    - `location` (optional)
    - `description` (optional)
    - `files` (0..N files)
  - After create: admins are notified by email (best-effort).

#### Append attachments

- `POST /api/incidents/[id]/attachments`
  - Content-Type: `multipart/form-data`
  - Field: `files` (0..N)
  - Allowed: incident owner or admin
  - Appends attachments; does not overwrite previous uploads.

#### Admin update (status + notes)

- `PATCH /api/incidents/[id]`
  - Admin only
  - Updates `status` and `adminNotes`

### Incident admin email

When a new incident is created, admins receive a **branded** email that includes:

- company
- title, occurred date/time, car, driver
- location and description (if provided)
- attachments list (as links)

---

## Identity verification (renting behavior)

Face verification was changed to be **secondary / optional** for renting.

- **Driving licence approval** is the only blocking requirement for reservations.
- Identity verification may still be used for extra trust/anti-impersonation signals and admin workflows.

---

## Multi-tenant schema compatibility (important)

FleetShare runs company data in **tenant databases**. When new features are deployed, some tenant DBs may be behind.

What we added to prevent breakage:

- On tenant Prisma client creation, we automatically run:
  - table bootstrap (if tenant is empty)
  - compatibility migrations (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`, `CREATE TABLE IF NOT EXISTS ...`)

Why this matters:

- Without compatibility checks, Prisma queries like `tenant.car.findMany({ select: { itpExpiresAt: true }})` can throw:
  - “The column … does not exist in the current database”
- That error prevents crons (and sometimes UI pages) from running for that company.

