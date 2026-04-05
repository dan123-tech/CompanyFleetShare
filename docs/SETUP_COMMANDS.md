# Setup commands – Company Car Sharing

Run these in order from the project root (`licenta-dani`).

---

## 1. Create the Next.js project (if starting from scratch)

If the project folder is **empty**, you can run:

```bash
npx create-next-app@latest . --yes --use-npm
```

If the folder **already has files** (e.g. `docs/`, `tmp_frontend/`, `CAR_PROJECT.txt`), create the app in a temporary folder and then move its contents to the root:

```bash
mkdir nextapp
cd nextapp
npx create-next-app@latest . --yes --use-npm
cd ..
# Move Next.js files to root (package.json, src/, public/, config files)
cp nextapp/package.json nextapp/package-lock.json nextapp/next.config.ts nextapp/tsconfig.json nextapp/eslint.config.mjs nextapp/postcss.config.mjs .
cp -r nextapp/src .
cp -r nextapp/public .
rm -rf nextapp
```

Then install Prisma:

```bash
npm install @prisma/client
npm install -D prisma
```

---

## 2. Environment and database

```bash
# Copy env example and edit with your values
cp .env.example .env

# Edit .env: set DATABASE_URL, DIRECT_URL (same as DATABASE_URL for local), and AUTH_SECRET
```

**Database with Docker (local)**

```bash
docker compose up -d
```

Then set in `.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/company_car_sharing?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/company_car_sharing?schema=public"
```

To stop the DB: `docker compose down`. Data is kept in a volume (`postgres_data`).

**Or use an existing PostgreSQL:** create the database (e.g. `CREATE DATABASE company_car_sharing;`) and set both URLs to the same connection string.

**Neon:** use pooled `DATABASE_URL` and direct `DIRECT_URL` from the Neon dashboard (see `docs/DATABASE.md`).

---

## 3. Prisma migrate and generate

```bash
# Generate Prisma client and create migration
npx prisma migrate dev --name init

# Optional: open Prisma Studio to inspect data
npx prisma studio
```

---

## 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API docs at [http://localhost:3000/api-docs](http://localhost:3000/api-docs) (when Swagger is set up).

---

## 5. Useful commands summary

| Command | Description |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma migrate dev` | Create and apply migration |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma studio` | Open DB GUI |
