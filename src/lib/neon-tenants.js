function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for tenant provisioning`);
  return value;
}

async function neonFetch(path, init = {}) {
  const apiKey = required("NEON_API_KEY");
  const res = await fetch(`https://console.neon.tech/api/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    throw new Error(`Neon API ${res.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms, pct = 0.25) {
  const delta = Math.max(1, Math.floor(ms * pct));
  const min = Math.max(1, ms - delta);
  const max = ms + delta;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isConflictErrorMessage(msg) {
  return msg.includes("Neon API 423") || msg.includes("running conflicting operations");
}

function isBranchesLimitExceededMessage(msg) {
  return (
    msg.includes("BRANCHES_LIMIT_EXCEEDED") ||
    (msg.includes("Neon API 422") && msg.toLowerCase().includes("branches limit exceeded"))
  );
}

async function neonFetchWithRetry(path, init = {}, retries = 9) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      return await neonFetch(path, init);
    } catch (e) {
      const msg = String(e?.message || "");
      lastErr = e;
      if (!isConflictErrorMessage(msg)) throw e;
      if (i === retries) throw e;
      // Exponential backoff (1.2s, 2.4s, 4.8s...) with jitter for Neon project-level operation locks.
      const baseDelay = Math.min(30000, 1200 * Math.pow(2, i));
      await sleep(jitter(baseDelay));
    }
  }
  throw lastErr || new Error("Neon request failed");
}

async function getBranchByName(projectId, branchName) {
  const list = await neonFetchWithRetry(`/projects/${projectId}/branches`);
  const branches = Array.isArray(list?.branches) ? list.branches : [];
  return branches.find((b) => b?.name === branchName) || null;
}

async function ensureReadWriteEndpoint(projectId, branchId) {
  try {
    await neonFetchWithRetry(`/projects/${projectId}/endpoints`, {
      method: "POST",
      body: JSON.stringify({
        endpoint: {
          branch_id: branchId,
          type: "read_write",
        },
      }),
    });
  } catch (e) {
    const msg = String(e?.message || "");
    // Endpoint may already exist; keep flow idempotent.
    if (msg.includes("already exists") || msg.includes("409")) return;
    throw e;
  }
}

function normalizeDatabaseName(input) {
  return `tenant_${String(input || "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)}`;
}

function parseDatabaseNameFromUrl(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    return (u.pathname || "").replace(/^\/+/, "").trim() || null;
  } catch {
    return null;
  }
}

function parseRoleFromUrl(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    return decodeURIComponent((u.username || "").trim()) || null;
  } catch {
    return null;
  }
}

async function ensureDatabaseOnBranch(projectId, branchId, databaseName, roleName) {
  try {
    await neonFetchWithRetry(`/projects/${projectId}/branches/${branchId}/databases`, {
      method: "POST",
      body: JSON.stringify({
        database: {
          name: databaseName,
          owner_name: roleName,
        },
      }),
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("already exists") || msg.includes("Neon API 409")) return;
    if (msg.includes("could not apply config without read-write endpoint")) {
      await ensureReadWriteEndpoint(projectId, branchId);
      await neonFetchWithRetry(`/projects/${projectId}/branches/${branchId}/databases`, {
        method: "POST",
        body: JSON.stringify({
          database: {
            name: databaseName,
            owner_name: roleName,
          },
        }),
      });
      return;
    }
    throw e;
  }
}

export async function ensureNeonTenantDatabase({
  companyId,
  branchId,
  databaseName,
  roleName,
  existingDatabaseUrl,
}) {
  const projectId = required("NEON_PROJECT_ID");
  const rootBranchId = process.env.NEON_ROOT_BRANCH_ID?.trim() || "br-main";
  const resolvedRole =
    roleName ||
    parseRoleFromUrl(existingDatabaseUrl) ||
    process.env.NEON_ROLE_NAME?.trim() ||
    required("NEON_ROLE_NAME");
  // Always place tenant databases on production/root branch (no per-company Neon branches).
  const resolvedBranchId = branchId || rootBranchId;
  const resolvedDbName =
    databaseName || parseDatabaseNameFromUrl(existingDatabaseUrl) || normalizeDatabaseName(companyId);

  await ensureDatabaseOnBranch(projectId, resolvedBranchId, resolvedDbName, resolvedRole);
  const conn = await neonFetchWithRetry(
    `/projects/${projectId}/connection_uri?database_name=${encodeURIComponent(resolvedDbName)}&role_name=${encodeURIComponent(resolvedRole)}&branch_id=${encodeURIComponent(resolvedBranchId)}`
  );

  return {
    branchId: resolvedBranchId,
    databaseName: resolvedDbName,
    databaseUrl: conn.uri,
  };
}

export async function provisionNeonTenant({ companyId, companyName }) {
  const projectId = required("NEON_PROJECT_ID");
  const rootBranchId = process.env.NEON_ROOT_BRANCH_ID?.trim() || "br-main";
  const databaseName = normalizeDatabaseName(companyName || companyId);
  const roleName = required("NEON_ROLE_NAME");
  const branchId = rootBranchId;
  await ensureDatabaseOnBranch(projectId, branchId, databaseName, roleName);

  const conn = await neonFetchWithRetry(
    `/projects/${projectId}/connection_uri?database_name=${encodeURIComponent(databaseName)}&role_name=${encodeURIComponent(roleName)}&branch_id=${encodeURIComponent(branchId)}`
  );

  return {
    provider: "neon",
    branchId,
    branchName: `root-${rootBranchId}`,
    databaseName,
    databaseUrl: conn.uri,
  };
}
