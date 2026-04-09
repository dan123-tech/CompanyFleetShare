# Company Car Sharing – API documentation

Base URL: same origin as the app (e.g. `http://localhost:3000`).  
Authentication: session cookie set by `POST /api/auth/login`. All other endpoints (except login, register, set-password) require a valid session.

---

## Auth

### POST /api/auth/login

Log in with email and password. Sets session cookie.

**Request body**

| Field    | Type   | Required | Description |
|----------|--------|----------|-------------|
| email    | string | Yes      | User email  |
| password | string | Yes      | Password    |

**Example request**

```json
{
  "email": "user@company.com",
  "password": "your-password"
}
```

**Success (200)**

```json
{
  "user": {
    "id": "clxx...",
    "email": "user@company.com",
    "name": "John Doe",
    "role": "USER",
    "companyId": "clxx..."
  },
  "company": {
    "id": "clxx...",
    "name": "Acme Corp",
    "domain": "acme.com"
  }
}
```

**Error (401)**

```json
{ "error": "Invalid credentials" }
```

---

### POST /api/auth/logout

Clear session cookie.

**Success (200)**

```json
{ "ok": true }
```

---

### GET /api/auth/session

Return current user and company from session.

**Success (200)**

```json
{
  "user": {
    "id": "clxx...",
    "email": "user@company.com",
    "name": "John Doe",
    "role": "USER",
    "companyId": "clxx..."
  },
  "company": {
    "id": "clxx...",
    "name": "Acme Corp",
    "domain": "acme.com"
  }
}
```

**Error (401)**

```json
{ "error": "Unauthorized" }
```

---

### POST /api/auth/register

Register a new user (self-signup). No company or invite – just creates the account. To join a company, an admin must invite the user by email; the user then uses **POST /api/auth/set-password** with the token they received.

**Request body**

| Field    | Type   | Required | Description      |
|----------|--------|----------|------------------|
| email    | string | Yes      | Email            |
| password | string | Yes      | Min 8 characters|
| name     | string | Yes      | Display name     |

**Success (201)**

```json
{
  "user": {
    "id": "clxx...",
    "email": "user@company.com",
    "name": "John Doe"
  }
}
```

**Error (409)**

```json
{ "error": "Email already registered" }
```

---

### POST /api/auth/set-password

Set password using an invite token (and enroll if not already a user).

**Request body**

| Field       | Type   | Required | Description     |
|-------------|--------|----------|-----------------|
| token       | string | Yes      | Invite token    |
| newPassword | string | Yes      | Min 8 characters|

**Success (200)**

```json
{
  "user": { "id": "...", "email": "...", "name": "...", "role": "USER", "companyId": "..." },
  "company": { "id": "...", "name": "..." }
}
```

---

## Companies

### POST /api/companies

Create a new company (logged-in user becomes ADMIN). Returns a **joinCode** to share so others can join.

**Request body**

| Field  | Type   | Required | Description   |
|--------|--------|----------|---------------|
| name   | string | Yes      | Company name  |
| domain | string | No       | Optional domain |

**Success (201)**

```json
{
  "company": {
    "id": "clxx...",
    "name": "Acme Corp",
    "domain": "acme.com",
    "joinCode": "ABC12XYZ"
  },
  "message": "Share the join code so others can join your company."
}
```

### POST /api/companies/join

Join a company by **join code** (shared by the company admin).

**Request body**

| Field    | Type   | Required | Description        |
|----------|--------|----------|--------------------|
| joinCode | string | Yes      | Company join code  |

**Success (200)**

```json
{
  "company": { "id": "...", "name": "...", "domain": "...", "joinCode": "..." },
  "role": "USER",
  "message": "You have joined the company."
}
```

**Error (400)** – invalid code or already a member

```json
{ "error": "Invalid join code or you are already a member" }
```

### GET /api/companies/current

Get current user’s company. Returns **company: null** if the user has not joined or created a company yet.

**Success (200)** – with company

```json
{
  "company": {
    "id": "clxx...",
    "name": "Acme Corp",
    "domain": "acme.com",
    "joinCode": "ABC12XYZ",
    "_count": { "members": 5, "cars": 10 }
  }
}
```

**Success (200)** – no company yet

```json
{ "company": null }
```

### PATCH /api/companies/current

Update company (admin only).

**Request body**

| Field  | Type            | Required | Description   |
|--------|-----------------|----------|---------------|
| name   | string          | No       | Company name  |
| domain | string \| null | No       | Domain        |

---

## Users (company members)

### GET /api/users

List company members. Query: `?status=ENROLLED` or `?status=PENDING_INVITE`.

**Success (200)**

```json
[
  {
    "id": "clxx...",
    "userId": "clxx...",
    "email": "user@company.com",
    "name": "John Doe",
    "role": "USER",
    "status": "ENROLLED",
    "createdAt": "2025-02-11T..."
  }
]
```

### POST /api/users/invite

Create invite (admin only).

**Request body**

| Field | Type   | Required | Description      |
|-------|--------|----------|------------------|
| email | string | Yes      | Invitee email    |
| name  | string | No       | Display name     |
| role  | string | No       | `ADMIN` or `USER` (default `USER`) |

**Success (201)**

```json
{
  "inviteId": "clxx...",
  "token": "hex-string",
  "email": "newuser@company.com",
  "expiresAt": "2025-02-18T...",
  "message": "Invite created. Send the token to the user (e.g. by email)."
}
```

### PATCH /api/users/:id

Update member role (admin only). Body: `{ "role": "ADMIN" }` or `{ "role": "USER" }`.

### DELETE /api/users/:id

Remove member from company (admin only). Cannot remove yourself.

---

## Cars

### GET /api/cars

List company cars. Query: `?status=AVAILABLE` | `RESERVED` | `IN_MAINTENANCE`.

**Success (200)**

```json
[
  {
    "id": "clxx...",
    "brand": "Toyota",
    "model": "Corolla",
    "registrationNumber": "AB-123-CD",
    "km": 50000,
    "status": "AVAILABLE",
    "_count": { "reservations": 3 }
  }
]
```

### POST /api/cars

Create car (admin only).

**Request body**

| Field              | Type   | Required | Description |
|--------------------|--------|----------|-------------|
| brand              | string | Yes      |             |
| model              | string | No       |             |
| registrationNumber | string | Yes      |             |
| km                 | number | No       | Default 0   |
| status             | string | No       | `AVAILABLE` \| `RESERVED` \| `IN_MAINTENANCE` |

### GET /api/cars/:id

Get one car. Admin sees reservation history.

### PATCH /api/cars/:id

Update car (admin only). Partial body allowed.

**Notes**

- You can update ITP expiry by sending `itpExpiresAt` as ISO datetime (or `null`).

### DELETE /api/cars/:id

Delete car (admin only).

---

## Incidents

### GET /api/incidents

List incident reports.

- **Admin**: returns all company incidents
- **User**: returns only own incidents

**Success (200)**

Returns an array of incidents. Each incident includes `attachments` where each attachment has a clickable `url`.

---

### POST /api/incidents

Create a new incident report (user).

**Content type**: `multipart/form-data`

**Fields**

| Field | Type | Required | Description |
|---|---|---:|---|
| carId | string | Yes | Car id |
| title | string | Yes | Short summary |
| occurredAt | string (ISO datetime) | No | When it happened |
| location | string | No | Where it happened |
| description | string | No | What happened |
| files | file[] | No | Photos/documents (repeat `files` field) |

**Success (201)**

```json
{ "ok": true, "id": "incident_id", "status": "SUBMITTED", "attachmentCount": 2 }
```

---

### POST /api/incidents/:id/attachments

Append more attachments to an existing incident (owner or admin).

**Content type**: `multipart/form-data`

**Fields**

| Field | Type | Required | Description |
|---|---|---:|---|
| files | file[] | Yes | Files to append (repeat `files` field) |

**Success (200)**

Returns `{ ok: true, added: number, attachments: [...] }`.

---

### PATCH /api/incidents/:id

Admin-only. Update incident `status` and `adminNotes`.

---

## Reservations

### GET /api/reservations

List reservations. User: own only. Admin: all in company. Query: `?status=ACTIVE` | `COMPLETED` | `CANCELLED`, `?carId=...`.

### POST /api/reservations

Create reservation. **Instant reserve:** omit `startDate` and `endDate` to reserve the car immediately (until released). The car’s status is set to RESERVED so no one else can reserve it.

**Request body**

| Field      | Type   | Required | Description        |
|------------|--------|----------|--------------------|
| carId      | string | Yes      |                    |
| startDate  | string | No       | ISO 8601 datetime (omit for instant) |
| endDate    | string | No       | ISO 8601 datetime (omit for instant) |
| purpose    | string | No       |                    |

**Success (201)**

```json
{
  "id": "clxx...",
  "car": { "id": "...", "brand": "...", "registrationNumber": "..." },
  "user": { "id": "...", "name": "...", "email": "..." },
  "startDate": "2025-02-12T09:00:00.000Z",
  "endDate": "2025-02-12T18:00:00.000Z",
  "purpose": "Client meeting",
  "status": "ACTIVE"
}
```

**Error (409)** – overlapping reservation

```json
{ "error": "Car is already reserved for this period" }
```

### GET /api/reservations/history

Current user’s reservation history (all statuses).

### PATCH /api/reservations/:id

Cancel, release, or extend. Body:

- Cancel: `{ "action": "cancel" }` – reservation CANCELLED, car set to AVAILABLE.
- Release: `{ "action": "release", "kmUsed": number }` – reservation COMPLETED, car set to AVAILABLE and car’s `km` increased by `kmUsed` (only for ACTIVE). `kmUsed` must be a non‑negative integer.
- Extend: `{ "action": "extend", "endDate": "2025-02-12T20:00:00.000Z" }`

**Error (409)** – extend overlaps another reservation

```json
{ "error": "New end date overlaps with another reservation" }
```

---

## Swagger UI

Interactive API docs: **[/api-docs](/api-docs)**  
OpenAPI spec: **GET /api/openapi**

---

## Cron

### POST /api/cron/itp-expiry-reminders

Email admins about upcoming/expired ITP dates and optionally auto-block cars with expired ITP.

**Auth**

- `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`)

**Success (200)**

```json
{
  "ok": true,
  "reminderDays": 30,
  "emailedCompanies": 1,
  "carsFlagged": 4,
  "carsAutoBlocked": 1,
  "autoBlock": true,
  "errors": []
}
```
