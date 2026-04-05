/**
 * Prisma client for the app.
 *
 * Cloudflare Workers (OpenNext): `process.env` is filled from Worker `env` inside
 * `runWithCloudflareRequestContext` → `populateProcessEnv`, which runs when a request
 * starts — not necessarily before this module is first imported. Instantiating Prisma at
 * import time can run with an empty `DATABASE_URL`, skip the Neon adapter, and use the
 * default TCP engine (fails on Workers → 500 on `/api/auth/login`).
 *
 * So we lazily create the client on first property access.
 *
 * Neon + Workers: use `@prisma/adapter-neon` when `DATABASE_URL` contains `neon.tech`
 * (or `PRISMA_NEON_ADAPTER=1`). Optional: strip `channel_binding=require` — some stacks
 * choke on it with the serverless driver.
 */

import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis;

/** @param {string} url */
function normalizeNeonConnectionString(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return url;
  }
}

function shouldUseNeonAdapter(url) {
  if (!url) return false;
  if (process.env.PRISMA_NEON_ADAPTER === "0") return false;
  if (process.env.PRISMA_NEON_ADAPTER === "1") return true;
  return /neon\.tech/i.test(url);
}

function configureNeonDriver() {
  if (typeof globalThis.WebSocket !== "undefined") return;
  try {
    const require = createRequire(import.meta.url);
    const ws = require("ws");
    neonConfig.webSocketConstructor = ws;
  } catch {
    /* Workerd provides WebSocket; some bundles omit import.meta */
  }
}

function createPrismaClient() {
  const log = process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"];
  let url = process.env.DATABASE_URL || "";

  if (shouldUseNeonAdapter(url) && url) {
    url = normalizeNeonConnectionString(url);
    configureNeonDriver();
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({ adapter, log });
  }

  return new PrismaClient({ log });
}

function getClient() {
  globalForPrisma.__prisma_singleton ??= createPrismaClient();
  return globalForPrisma.__prisma_singleton;
}

/**
 * Lazy proxy so the real PrismaClient is created after OpenNext has populated `process.env`.
 * @type {import("@prisma/client").PrismaClient}
 */
export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      const value = Reflect.get(client, prop, client);
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
  }
);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
