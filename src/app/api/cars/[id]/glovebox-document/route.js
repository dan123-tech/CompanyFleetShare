/**
 * GET /api/cars/[id]/glovebox-document — stream RCA / glovebox file (private Blob, local disk, or legacy public URL).
 * Admin (company) or user with an active reservation on this car.
 */
import { requireCompany, errorResponse } from "@/lib/api-helpers";
import { getCarById } from "@/lib/cars";
import { getTenantPrisma } from "@/lib/tenant-db";
import { getProvider, LAYERS, PROVIDERS } from "@/lib/data-source-manager";
import { gloveboxDocumentResponse } from "@/lib/glovebox-serve";
import { rcaStoredMatchesCar } from "@/lib/glovebox-ref";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  const out = await requireCompany();
  if ("response" in out) return out.response;

  try {
    const provider = await getProvider(out.session.companyId, LAYERS.CARS);
    if (provider !== PROVIDERS.LOCAL) return errorResponse("Not available for this data source", 503);
  } catch (err) {
    console.error("[glovebox-document] data source:", err);
    return errorResponse(err?.message || "Failed to verify data source", 500);
  }

  const { id: carId } = await params;
  const car = await getCarById(carId, out.session.companyId);
  if (!car?.rcaDocumentUrl) return errorResponse("Not found", 404);

  if (!rcaStoredMatchesCar(car.rcaDocumentUrl, out.session.companyId, carId)) {
    return errorResponse("Not found", 404);
  }

  const isAdmin = out.session.role === "ADMIN";
  if (!isAdmin) {
    const tenant = await getTenantPrisma(out.session.companyId);
    const active = await tenant.reservation.findFirst({
      where: {
        userId: out.session.userId,
        status: "ACTIVE",
        carId,
        car: { companyId: out.session.companyId },
      },
      select: { id: true },
    });
    if (!active) return errorResponse("Forbidden", 403);
  }

  try {
    return await gloveboxDocumentResponse(car.rcaDocumentUrl, request);
  } catch (e) {
    console.error("[glovebox-document] serve failed:", e?.message || e);
    return errorResponse("Failed to load document", 500);
  }
}
