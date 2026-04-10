/**
 * DELETE /api/maintenance/[id] — admin only
 */

import { requireAdmin, errorResponse, jsonResponse, requireTrustedOriginForMutation } from "@/lib/api-helpers";
import { deleteMaintenanceEvent } from "@/lib/maintenance";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireAdmin();
  if ("response" in out) return out.response;
  const { id } = await params;
  const result = await deleteMaintenanceEvent(out.session.companyId, id);
  if (!result) return errorResponse("Not found", 404);
  return jsonResponse({ ok: true });
}
