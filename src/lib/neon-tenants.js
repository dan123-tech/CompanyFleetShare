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

function normalizeDatabaseName(input) {
  return `tenant_${String(input || "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)}`;
}

export async function provisionNeonTenant({ companyId, companyName }) {
  const projectId = required("NEON_PROJECT_ID");
  const rootBranchId = process.env.NEON_ROOT_BRANCH_ID?.trim() || "br-main";
  const branchName = `tenant-${companyId}`;
  const databaseName = normalizeDatabaseName(companyName || companyId);
  const roleName = required("NEON_ROLE_NAME");

  const branch = await neonFetch(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({
      branch: {
        name: branchName,
        parent_id: rootBranchId,
      },
    }),
  });

  await neonFetch(`/projects/${projectId}/branches/${branch.branch.id}/databases`, {
    method: "POST",
    body: JSON.stringify({
      database: {
        name: databaseName,
        owner_name: roleName,
      },
    }),
  });

  const conn = await neonFetch(
    `/projects/${projectId}/connection_uri?database_name=${encodeURIComponent(databaseName)}&role_name=${encodeURIComponent(roleName)}&branch_id=${encodeURIComponent(branch.branch.id)}`
  );

  return {
    provider: "neon",
    branchId: branch.branch.id,
    branchName,
    databaseName,
    databaseUrl: conn.uri,
  };
}
