import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { INCIDENT_PRIVATE_PREFIX } from "@/lib/incident-ref";
import { resolveBlobReadWriteToken } from "@/lib/blob-env";

const LOCAL_PREFIX = "/uploads/incidents/";

export async function incidentAttachmentResponse(stored, request) {
  const ifNoneMatch = request.headers.get("if-none-match") ?? undefined;
  const baseHeaders = { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" };

  if (stored.startsWith(LOCAL_PREFIX)) {
    // /uploads/incidents/<incidentId>/<file>
    const rel = stored.slice(LOCAL_PREFIX.length);
    if (!rel || rel.includes("..") || rel.includes("\\\\")) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parts = rel.split("/").filter(Boolean);
    if (parts.length < 2) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const incidentId = parts[0];
    const filename = parts.slice(1).join("/");
    try {
      const filepath = path.join(process.cwd(), "public", "uploads", "incidents", incidentId, filename);
      const buffer = await readFile(filepath);
      return new NextResponse(buffer, { status: 200, headers: { ...baseHeaders, "Content-Type": "application/octet-stream" } });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (stored.startsWith(INCIDENT_PRIVATE_PREFIX)) {
    const pathname = stored.slice(INCIDENT_PRIVATE_PREFIX.length);
    if (!pathname || pathname.includes("..")) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const token = resolveBlobReadWriteToken();
    if (!token) return NextResponse.json({ error: "Blob storage not configured" }, { status: 503 });
    const result = await get(pathname, { access: "private", token, ifNoneMatch });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ...baseHeaders, ETag: result.blob.etag } });
    return new NextResponse(result.stream, {
      status: 200,
      headers: { ...baseHeaders, "Content-Type": result.blob.contentType, ETag: result.blob.etag },
    });
  }

  if (stored.startsWith("https://") || stored.startsWith("http://")) {
    const isPrivate = stored.includes(".private.blob.vercel-storage.com");
    const access = isPrivate ? "private" : "public";
    const token = resolveBlobReadWriteToken();
    const result = await get(stored, { access, ...(token ? { token } : {}), ifNoneMatch });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ...baseHeaders, ETag: result.blob.etag } });
    return new NextResponse(result.stream, {
      status: 200,
      headers: { ...baseHeaders, "Content-Type": result.blob.contentType, ETag: result.blob.etag },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

