/**
 * GET /api/maintenance — list maintenance events (company). ?carId= optional
 * POST /api/maintenance — create (admin only)
 */

import { z } from "zod";
import { requireCompany, jsonResponse, errorResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { listMaintenanceEvents, createMaintenanceEvent } from "@/lib/maintenance";

export const runtime = "nodejs";

const postSchema = z.object({
  carId: z.string().min(1),
  performedAt: z.string().datetime(),
  mileageKm: z.number().int().min(0).optional().nullable(),
  serviceType: z.string().min(1).max(120),
  cost: z.number().min(0).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export async function GET(request) {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  const carId = request.nextUrl.searchParams.get("carId")?.trim() || undefined;
  const list = await listMaintenanceEvents(out.session.companyId, carId ? { carId } : {});
  return jsonResponse(list);
}

export async function POST(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireCompany();
  if ("response" in out) return out.response;
  if (out.session.role !== "ADMIN") return errorResponse("Forbidden", 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 422);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const { carId, performedAt, mileageKm, serviceType, cost, notes } = parsed.data;
  try {
    const row = await createMaintenanceEvent(out.session.companyId, carId, {
      performedAt: new Date(performedAt),
      mileageKm,
      serviceType,
      cost,
      notes,
    });
    return jsonResponse(row, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    return errorResponse(msg, 404);
  }
}
