/**
 * GET /api/companies/current – current user's company
 * PATCH /api/companies/current – (admin) update company name/domain
 */

import { z } from "zod";
import { getCompanyById, updateCompany } from "@/lib/companies";
import {
  requireSession,
  requireAdmin,
  jsonResponse,
  errorResponse,
  requireTrustedOriginForMutation,
} from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  const out = await requireSession();
  if ("response" in out) return out.response;
  if (!out.session.companyId) {
    return jsonResponse({ company: null });
  }
  try {
    const company = await getCompanyById(out.session.companyId);
    if (!company) return jsonResponse({ company: null });
    return jsonResponse({
      company: {
        id: company.id,
        name: company.name,
        domain: company.domain,
        joinCode: company.joinCode,
        defaultKmUsage: company.defaultKmUsage ?? 100,
        averageFuelPricePerLiter: company.averageFuelPricePerLiter ?? null,
        defaultConsumptionL100km: company.defaultConsumptionL100km ?? 7.5,
        priceBenzinePerLiter: company.priceBenzinePerLiter ?? null,
        priceDieselPerLiter: company.priceDieselPerLiter ?? null,
        priceHybridPerLiter: company.priceHybridPerLiter ?? null,
        priceElectricityPerKwh: company.priceElectricityPerKwh ?? null,
        _count: company._count ?? { members: 0, cars: 0 },
      },
    });
  } catch (err) {
    console.error("GET /api/companies/current error:", err);
    return errorResponse(err?.message || "Failed to load company", 500);
  }
}

const optionalNum = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return null;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}, z.union([z.number().min(0).max(999), z.null()]).optional());

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  domain: z.string().max(100).nullable().optional(),
  defaultKmUsage: z.number().int().min(1).max(99999).optional(),
  averageFuelPricePerLiter: optionalNum,
  defaultConsumptionL100km: z.union([z.number().min(0).max(30), z.null()]).optional(),
  priceBenzinePerLiter: optionalNum,
  priceDieselPerLiter: optionalNum,
  priceHybridPerLiter: optionalNum,
  priceElectricityPerKwh: optionalNum,
});

export async function PATCH(request) {
  const denied = requireTrustedOriginForMutation(request);
  if (denied) return denied;
  const out = await requireAdmin();
  if ("response" in out) return out.response;
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    let msg = "Invalid input";
    try {
      const err = parsed.error;
      if (err?.errors?.length) msg = err.errors.map((e) => e.message).filter(Boolean).join("; ");
    } catch (_) {}
    return errorResponse(msg, 422);
  }
  const data = {};
  if (parsed.data.defaultKmUsage !== undefined) data.defaultKmUsage = parsed.data.defaultKmUsage;
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.domain !== undefined) data.domain = parsed.data.domain;
  if (parsed.data.averageFuelPricePerLiter !== undefined) {
    const v = parsed.data.averageFuelPricePerLiter;
    data.averageFuelPricePerLiter = v === null || (typeof v === "number" && !Number.isNaN(v)) ? v : null;
  }
  if (parsed.data.defaultConsumptionL100km !== undefined) {
    const v = parsed.data.defaultConsumptionL100km;
    data.defaultConsumptionL100km = v === null || (typeof v === "number" && !Number.isNaN(v)) ? v : null;
  }
  if (parsed.data.priceBenzinePerLiter !== undefined) {
    const v = parsed.data.priceBenzinePerLiter;
    data.priceBenzinePerLiter = v === null || (typeof v === "number" && !Number.isNaN(v)) ? v : null;
  }
  if (parsed.data.priceDieselPerLiter !== undefined) {
    const v = parsed.data.priceDieselPerLiter;
    data.priceDieselPerLiter = v === null || (typeof v === "number" && !Number.isNaN(v)) ? v : null;
  }
  if (parsed.data.priceHybridPerLiter !== undefined) {
    const v = parsed.data.priceHybridPerLiter;
    data.priceHybridPerLiter = v === null || (typeof v === "number" && !Number.isNaN(v)) ? v : null;
  }
  if (parsed.data.priceElectricityPerKwh !== undefined) {
    const v = parsed.data.priceElectricityPerKwh;
    data.priceElectricityPerKwh = v === null || (typeof v === "number" && !Number.isNaN(v)) ? v : null;
  }
  // Determine if this is a pricing change or a general settings change
  const PRICE_FIELDS = ["averageFuelPricePerLiter", "priceBenzinePerLiter", "priceDieselPerLiter", "priceHybridPerLiter", "priceElectricityPerKwh"];
  const changedFields = Object.keys(data);
  const isPricingChange = changedFields.some((f) => PRICE_FIELDS.includes(f));

  // Snapshot the company before update for before/after comparison
  let companyBefore = null;
  try {
    companyBefore = await getCompanyById(out.session.companyId);
  } catch (_) {}

  try {
    const company = await updateCompany(out.session.companyId, data);
    const action = isPricingChange ? "PRICING_CHANGED" : "COMPANY_SETTINGS_CHANGED";
    const before = {};
    const after = {};
    for (const f of changedFields) {
      before[f] = companyBefore?.[f] ?? null;
      after[f] = company[f] ?? null;
    }
    await writeAuditLog({
      companyId: out.session.companyId,
      actorId: out.session.userId,
      action,
      entityType: "COMPANY",
      entityId: out.session.companyId,
      meta: { before, after },
    });
    return jsonResponse({
      id: company.id,
      name: company.name,
      domain: company.domain,
      joinCode: company.joinCode,
      defaultKmUsage: company.defaultKmUsage ?? 100,
      averageFuelPricePerLiter: company.averageFuelPricePerLiter ?? null,
      defaultConsumptionL100km: company.defaultConsumptionL100km ?? 7.5,
      priceBenzinePerLiter: company.priceBenzinePerLiter ?? null,
      priceDieselPerLiter: company.priceDieselPerLiter ?? null,
      priceHybridPerLiter: company.priceHybridPerLiter ?? null,
      priceElectricityPerKwh: company.priceElectricityPerKwh ?? null,
    });
  } catch (err) {
    console.error("PATCH /api/companies/current error:", err);
    return errorResponse(err?.message || "Failed to update company", 500);
  }
}
