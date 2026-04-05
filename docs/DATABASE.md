# Database – PostgreSQL schema and setup

This document describes the **PostgreSQL** database used by Company Car Sharing: how to create it, apply the schema, and view tables (with primary keys, foreign keys, and relationships).

---

## 1. Create and use the database

### Option A: Docker (recommended for local dev)

From the project root:

```bash
docker compose up -d
```

This starts PostgreSQL 16 with:

- **Host:** `localhost`
- **Port:** `5432`
- **Database:** `company_car_sharing`
- **User:** `postgres`
- **Password:** `postgres`

Then set in your `.env` (use the same URL for both):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/company_car_sharing?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/company_car_sharing?schema=public"
```

### Option B: Existing PostgreSQL server

1. Create the database:

```sql
CREATE DATABASE company_car_sharing
  ENCODING 'UTF8'
  LC_COLLATE 'en_US.UTF-8'
  LC_CTYPE 'en_US.UTF-8';
```

2. Set `DATABASE_URL` and `DIRECT_URL` in `.env` to the **same** connection string, for example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/company_car_sharing?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/company_car_sharing?schema=public"
```

Replace `USER`, `PASSWORD`, and `HOST` with your PostgreSQL credentials and host.

### Option C: Neon (hosted PostgreSQL, good for Vercel / production)

1. Create a project at [Neon](https://neon.tech) and a database (Neon often names it `neondb`; that is fine—Prisma migrations create the app schema).
2. In the Neon console, open **Connect** and choose the **Prisma** snippet. You will see two connection strings:
   - **Pooled** → use as `DATABASE_URL` (fewer connections from serverless / Next.js).
   - **Direct** → use as `DIRECT_URL` (required for `prisma migrate deploy` / `prisma migrate dev`).
3. In your root `.env` (and in Vercel **Environment Variables**), set both, for example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@YOUR-POOLER-HOST/neondb?sslmode=require&schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@YOUR-DIRECT-HOST/neondb?sslmode=require&schema=public"
```

Replace the placeholders with the exact strings from Neon (password is auto-generated). If your URL already contains query parameters, append `&schema=public` instead of duplicating `?`.

**Local development** with Docker Postgres: set `DATABASE_URL` and `DIRECT_URL` to the **same** local URL (see Option A).

#### Importing an existing PostgreSQL database into Neon (then deploy on Vercel)

You usually want **all objects in `public`** (tables, data, and the **`_prisma_migrations`** table) so Prisma on Vercel does not try to recreate tables that already exist.

**1. Create a Neon project** (empty branch is fine). Copy the **direct** connection string (for `psql` / `pg_restore`).

**2. Dump your current database** (example: local Docker DB `company_car_sharing`):

```bash
# Plain SQL (simple; good for small DBs). Omits ownership so it restores cleanly on Neon.
pg_dump "postgresql://postgres:postgres@localhost:5432/company_car_sharing" \
  --no-owner --no-acl --schema=public -f neon-import.sql
```

Or from inside the container (writes `neon-import.sql` in your current directory):

```bash
docker exec -t company-car-sharing-db pg_dump -U postgres -d company_car_sharing \
  --no-owner --no-acl --schema=public > neon-import.sql
```

**3. Restore into Neon** (use the **direct** URL from Neon; add `?sslmode=require` if not already there):

```bash
psql "YOUR_NEON_DIRECT_CONNECTION_STRING" -f neon-import.sql
```

Custom format instead of SQL:

```bash
pg_dump "postgresql://postgres:postgres@localhost:5432/company_car_sharing" \
  -Fc --no-owner --no-acl --schema=public -f dump.dump
pg_restore --no-owner --no-acl -d "YOUR_NEON_DIRECT_CONNECTION_STRING" dump.dump
```

**4. Vercel environment variables** — set **`DATABASE_URL`** (pooled) and **`DIRECT_URL`** (direct) from Neon’s **Prisma** connection panel, plus **`AUTH_SECRET`**, **`NEXT_PUBLIC_APP_URL`**, **`NEXTAUTH_URL`**.

**5. Deploy** — the build runs `prisma migrate deploy`. If `_prisma_migrations` in Neon matches this repo, pending migrations apply only if your dump was behind the latest migration; if the dump is already at the latest revision, deploy should report nothing to do.

If you restored **only data** (no `_prisma_migrations`), use an **empty** Neon DB, run `npx prisma migrate deploy` locally against **`DIRECT_URL`**, then import **data-only** from the old DB (`pg_dump --data-only --schema=public`) so the schema matches exactly.

Neon’s own guide: [Import data from Postgres](https://neon.tech/docs/import/import-from-postgres).

---

## 2. Apply the schema (migrations)

From the project root:

```bash
npx prisma migrate deploy
```

For local development (creates migration files if needed):

```bash
npx prisma migrate dev --name init
```

This creates all tables, enums, indexes, and foreign keys in the `public` schema.

---

## 3. Viewing the database (tables, keys, data)

### Prisma Studio (recommended – nice UI)

```bash
npx prisma studio
```

Opens a browser UI where you can:

- See all tables and relationships
- Browse and edit data
- Follow foreign key links between tables

### Command line (psql)

```bash
# If using Docker
docker exec -it company-car-sharing-db psql -U postgres -d company_car_sharing

# Then for example:
\dt              # list tables
\d "User"        # describe User table (columns, indexes)
\d+ "User"       # same with more detail
```

### Other GUI tools

Use any PostgreSQL client (DBeaver, pgAdmin, TablePlus, etc.) with the same `DATABASE_URL` connection. You will see:

- **Schema:** `public`
- **Tables:** `User`, `Company`, `CompanyMember`, `Invite`, `Car`, `Reservation`
- **Enums:** `Role`, `MemberStatus`, `CarStatus`, `ReservationStatus`, `DrivingLicenceStatus`, `ExceededApprovalStatus`

---

## 4. Enums

PostgreSQL enums created by Prisma:

| Enum | Values |
|------|--------|
| **Role** | `ADMIN`, `USER` |
| **MemberStatus** | `ENROLLED`, `PENDING_INVITE` |
| **CarStatus** | `AVAILABLE`, `RESERVED`, `IN_MAINTENANCE` |
| **ReservationStatus** | `ACTIVE`, `COMPLETED`, `CANCELLED` |
| **DrivingLicenceStatus** | `PENDING`, `APPROVED`, `REJECTED` |
| **ExceededApprovalStatus** | `PENDING_APPROVAL`, `APPROVED`, `REJECTED` |

---

## 5. Schema reference (tables, primary keys, foreign keys)

### Entity–relationship overview

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│    User     │───┬───│  CompanyMember   │───┬───│   Company   │
└─────────────┘   │   └──────────────────┘   │   └─────────────┘
        │         │            │             │         │
        │         │            │             │         ├──────────────┐
        │         │            │             │         │              │
        ▼         │            ▼             │         ▼              ▼
┌─────────────────┐           ┌─────────────┐   ┌─────────────┐  ┌─────────────┐
│  Reservation    │───────────│    Car      │   │   Invite    │  │    Car      │
└─────────────────┘           └─────────────┘   └─────────────┘  └─────────────┘
```

### Table: **User**

Global user account (email, password, name).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| **id** | `text` (cuid) | NO | `cuid()` | **Primary key** |
| email | `text` | NO | — | Unique |
| password | `text` | NO | — | Hashed (bcrypt) |
| name | `text` | NO | — | |
| avatarUrl | `text` | YES | — | |
| drivingLicenceUrl | `text` | YES | — | Photo URL |
| drivingLicenceStatus | `DrivingLicenceStatus` | YES | — | PENDING / APPROVED / REJECTED |
| createdAt | `timestamp(3)` | NO | `now()` | |
| updatedAt | `timestamp(3)` | NO | `now()` | |

- **Primary key:** `id`
- **Unique:** `email`
- **Indexes:** `User_email_key` (unique on `email`)
- **Referenced by:** `CompanyMember.userId`, `Reservation.userId`

---

### Table: **Company**

One per tenant/organization.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| **id** | `text` (cuid) | NO | `cuid()` | **Primary key** |
| name | `text` | NO | — | |
| domain | `text` | YES | — | e.g. company.com |
| joinCode | `text` | YES | — | Unique, shareable |
| defaultKmUsage | `int4` | NO | `100` | Allowed km per reservation |
| createdAt | `timestamp(3)` | NO | `now()` | |
| updatedAt | `timestamp(3)` | NO | `now()` | |

- **Primary key:** `id`
- **Unique:** `joinCode`
- **Referenced by:** `CompanyMember.companyId`, `Invite.companyId`, `Car.companyId`

---

### Table: **CompanyMember**

Links a User to a Company with role and enrollment status.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| **id** | `text` (cuid) | NO | `cuid()` | **Primary key** |
| userId | `text` | NO | — | **FK → User.id** (on delete CASCADE) |
| companyId | `text` | NO | — | **FK → Company.id** (on delete CASCADE) |
| role | `Role` | NO | `USER` | ADMIN / USER |
| status | `MemberStatus` | NO | `PENDING_INVITE` | ENROLLED / PENDING_INVITE |
| createdAt | `timestamp(3)` | NO | `now()` | |
| updatedAt | `timestamp(3)` | NO | `now()` | |

- **Primary key:** `id`
- **Unique:** `(userId, companyId)` – one membership per user per company
- **Foreign keys:** `userId` → `User.id`, `companyId` → `Company.id` (both CASCADE)
- **Indexes:** `CompanyMember_companyId_idx`, `CompanyMember_userId_idx`

---

### Table: **Invite**

Token for inviting a user by email to join a company.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| **id** | `text` (cuid) | NO | `cuid()` | **Primary key** |
| token | `text` | NO | — | Unique |
| email | `text` | NO | — | Invitee email |
| companyId | `text` | NO | — | **FK → Company.id** (on delete CASCADE) |
| expiresAt | `timestamp(3)` | NO | — | |
| usedAt | `timestamp(3)` | YES | — | When invite was used |
| createdAt | `timestamp(3)` | NO | `now()` | |

- **Primary key:** `id`
- **Unique:** `token`
- **Foreign key:** `companyId` → `Company.id` (CASCADE)
- **Indexes:** `Invite_token_key` (unique), `Invite_companyId_idx`

---

### Table: **Car**

Company-owned vehicle.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| **id** | `text` (cuid) | NO | `cuid()` | **Primary key** |
| companyId | `text` | NO | — | **FK → Company.id** (on delete CASCADE) |
| brand | `text` | NO | — | |
| model | `text` | YES | — | |
| registrationNumber | `text` | NO | — | |
| km | `int4` | NO | `0` | Odometer |
| status | `CarStatus` | NO | `AVAILABLE` | AVAILABLE / RESERVED / IN_MAINTENANCE |
| createdAt | `timestamp(3)` | NO | `now()` | |
| updatedAt | `timestamp(3)` | NO | `now()` | |

- **Primary key:** `id`
- **Foreign key:** `companyId` → `Company.id` (CASCADE)
- **Referenced by:** `Reservation.carId`
- **Indexes:** `Car_companyId_idx`, `Car_status_idx`

---

### Table: **Reservation**

User reserves a car for a time range (or until release).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| **id** | `text` (cuid) | NO | `cuid()` | **Primary key** |
| userId | `text` | NO | — | **FK → User.id** (on delete CASCADE) |
| carId | `text` | NO | — | **FK → Car.id** (on delete CASCADE) |
| startDate | `timestamp(3)` | NO | — | |
| endDate | `timestamp(3)` | NO | — | |
| purpose | `text` | YES | — | |
| status | `ReservationStatus` | NO | `ACTIVE` | ACTIVE / COMPLETED / CANCELLED |
| releasedKmUsed | `int4` | YES | — | Km driven when released |
| releasedExceededReason | `text` | YES | — | User reason when km exceeded limit |
| releasedExceededStatus | `ExceededApprovalStatus` | YES | — | PENDING_APPROVAL / APPROVED / REJECTED |
| releasedExceededAdminComment | `text` | YES | — | Admin observations (visible to user) |
| createdAt | `timestamp(3)` | NO | `now()` | |
| updatedAt | `timestamp(3)` | NO | `now()` | |

- **Primary key:** `id`
- **Foreign keys:** `userId` → `User.id`, `carId` → `Car.id` (both CASCADE)
- **Indexes:** `Reservation_carId_idx`, `Reservation_userId_idx`, `Reservation_startDate_endDate_idx`

---

## 6. ER diagram (Mermaid)

You can paste this into [Mermaid Live](https://mermaid.live) or any Markdown viewer that supports Mermaid to see the schema with primary and foreign keys:

```mermaid
erDiagram
    User ||--o{ CompanyMember : "userId"
    Company ||--o{ CompanyMember : "companyId"
    Company ||--o{ Invite : "companyId"
    Company ||--o{ Car : "companyId"
    User ||--o{ Reservation : "userId"
    Car ||--o{ Reservation : "carId"

    User {
        text id PK "cuid"
        text email UK
        text password
        text name
        text avatarUrl
        text drivingLicenceUrl
        enum drivingLicenceStatus
        timestamp createdAt
        timestamp updatedAt
    }

    Company {
        text id PK "cuid"
        text name
        text domain
        text joinCode UK
        int defaultKmUsage
        timestamp createdAt
        timestamp updatedAt
    }

    CompanyMember {
        text id PK "cuid"
        text userId FK
        text companyId FK
        enum role
        enum status
        timestamp createdAt
        timestamp updatedAt
    }

    Invite {
        text id PK "cuid"
        text token UK
        text email
        text companyId FK
        timestamp expiresAt
        timestamp usedAt
        timestamp createdAt
    }

    Car {
        text id PK "cuid"
        text companyId FK
        text brand
        text model
        text registrationNumber
        int km
        enum status
        timestamp createdAt
        timestamp updatedAt
    }

    Reservation {
        text id PK "cuid"
        text userId FK
        text carId FK
        timestamp startDate
        timestamp endDate
        text purpose
        enum status
        int releasedKmUsed
        text releasedExceededReason
        enum releasedExceededStatus
        text releasedExceededAdminComment
        timestamp createdAt
        timestamp updatedAt
    }
```

**Legend:** PK = Primary key, UK = Unique, FK = Foreign key.

---

## 7. Quick reference

| What you need | Command or value |
|---------------|-------------------|
| Start PostgreSQL (Docker) | `docker compose up -d` |
| Connection URL | `postgresql://postgres:postgres@localhost:5432/company_car_sharing?schema=public` |
| Apply schema | `npx prisma migrate deploy` |
| Create migration (dev) | `npx prisma migrate dev --name your_name` |
| View tables / data | `npx prisma studio` |
| Regenerate Prisma client | `npx prisma generate` |

Schema source: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.
