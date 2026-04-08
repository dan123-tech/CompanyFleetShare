import { z } from "zod";
import { requireAdmin, requireCompany, jsonResponse, errorResponse } from "@/lib/api-helpers";
import { getCompanyById, updateCompany } from "@/lib/companies";
import {
  getAiValidationSettings,
  buildCompanyDataSourceConfigWithAiValidation,
} from "@/lib/ai-validation-settings";

const patchSchema = z
  .object({
    drivingEnabled: z.boolean().optional(),
    faceEnabled: z.boolean().optional(),
  })
  .refine((v) => v.drivingEnabled !== undefined || v.faceEnabled !== undefined, {
    message: "At least one field is required",
  });

export async function GET() {
  const out = await requireCompany();
  if ("response" in out) return out.response;
  const company = await getCompanyById(out.session.companyId);
  if (!company) return errorResponse("Company not found", 404);
  return jsonResponse(getAiValidationSettings(company));
}

export async function PATCH(request) {
  const out = await requireAdmin();
  if ("response" in out) return out.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid input", 422);

  const company = await getCompanyById(out.session.companyId);
  if (!company) return errorResponse("Company not found", 404);

  const dataSourceConfig = buildCompanyDataSourceConfigWithAiValidation(company, parsed.data);
  const updated = await updateCompany(out.session.companyId, { dataSourceConfig });
  return jsonResponse(getAiValidationSettings(updated));
}

