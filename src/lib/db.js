/**
 * Prisma client singleton for the application.
 * Reuses a single instance per isolate (dev HMR / serverless).
 *
 * Cloudflare Workers (OpenNext): the default Prisma TCP engine is not available — use Neon’s
 * serverless driver via @prisma/adapter-neon when DATABASE_URL points at Neon (or PRISMA_NEON_ADAPTER=1).
 */

import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis;

function shouldUseNeonAdapter() {
  const url = process.env.DATABASE_URL || "";
  if (process.env.PRISMA_NEON_ADAPTER === "0") return false;
  if (process.env.PRISMA_NEON_ADAPTER === "1") return Boolean(url);
  return /neon\.tech/i.test(url);
}

function configureNeonDriver() {
  if (typeof globalThis.WebSocket !== "undefined") return;
  try {
    const require = createRequire(import.meta.url);
    const ws = require("ws");
    neonConfig.webSocketConstructor = ws;
  } catch {
    /* Worker runtimes provide WebSocket; some bundles omit import.meta / node:module */
  }
}

function createPrismaClient() {
  const log = process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"];
  const url = process.env.DATABASE_URL;

  if (shouldUseNeonAdapter() && url) {
    configureNeonDriver();
    const adapter = new PrismaNeon({ connectionString: url });
    return new PrismaClient({ adapter, log });
  }

  return new PrismaClient({ log });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
