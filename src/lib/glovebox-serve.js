/**
 * Stream glovebox RCA document (PDF / image) from DB stored value.
 */

import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { DRIVING_LICENCE_PRIVATE_PREFIX } from "@/lib/driving-licence-ref";
import { resolveBlobReadWriteToken } from "@/lib/blob-env";

const LOCAL_PREFIX = "/uploads/glovebox/";

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * @param {string} stored - rcaDocumentUrl from DB
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 */
export async function gloveboxDocumentResponse(stored, request) {
  const ifNoneMatch = request.headers.get("if-none-match") ?? undefined;
  const baseHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  };

  if (stored.startsWith(LOCAL_PREFIX)) {
    const rel = stored.slice(LOCAL_PREFIX.length);
    if (!rel || rel.includes("..") || rel.startsWith("/") || rel.includes("\\")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const parts = rel.split("/");
    if (parts.length !== 3) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [companyId, carIdPart, basename] = parts;
    if (!basename || basename.includes("..")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const baseDir = path.join(process.cwd(), "public", "uploads", "glovebox", companyId, carIdPart);
    const filepath = path.join(baseDir, basename);
    const resolvedFile = path.resolve(filepath);
    const resolvedBase = path.resolve(baseDir);
    if (!resolvedFile.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ext = path.extname(basename).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      const buffer = await readFile(filepath);
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Type": mime,
        },
      });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (stored.startsWith(DRIVING_LICENCE_PRIVATE_PREFIX)) {
    const pathname = stored.slice(DRIVING_LICENCE_PRIVATE_PREFIX.length);
    if (!pathname || pathname.includes("..")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const token = resolveBlobReadWriteToken();
    if (!token) {
      return NextResponse.json({ error: "Blob storage not configured" }, { status: 503 });
    }
    const result = await get(pathname, {
      access: "private",
      token,
      ifNoneMatch,
    });
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ...baseHeaders,
          ETag: result.blob.etag,
        },
      });
    }
    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": result.blob.contentType || "application/octet-stream",
        ETag: result.blob.etag,
      },
    });
  }

  if (stored.startsWith("https://") || stored.startsWith("http://")) {
    const isPrivate = stored.includes(".private.blob.vercel-storage.com");
    const access = isPrivate ? "private" : "public";
    const token = resolveBlobReadWriteToken();
    const result = await get(stored, {
      access,
      ...(token ? { token } : {}),
      ifNoneMatch,
    });
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ...baseHeaders,
          ETag: result.blob.etag,
        },
      });
    }
    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": result.blob.contentType || "application/octet-stream",
        ETag: result.blob.etag,
      },
    });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
