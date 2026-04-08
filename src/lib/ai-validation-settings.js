const DEFAULT_AI_VALIDATION_SETTINGS = {
  drivingEnabled: true,
  faceEnabled: true,
};

export function getAiValidationSettings(company) {
  const cfg = company?.dataSourceConfig;
  const ai = cfg && typeof cfg === "object" ? cfg.aiValidation : null;
  return {
    drivingEnabled:
      typeof ai?.drivingEnabled === "boolean"
        ? ai.drivingEnabled
        : DEFAULT_AI_VALIDATION_SETTINGS.drivingEnabled,
    faceEnabled:
      typeof ai?.faceEnabled === "boolean"
        ? ai.faceEnabled
        : DEFAULT_AI_VALIDATION_SETTINGS.faceEnabled,
  };
}

export function buildCompanyDataSourceConfigWithAiValidation(company, patch) {
  const current = company?.dataSourceConfig && typeof company.dataSourceConfig === "object"
    ? company.dataSourceConfig
    : {};
  const prev = getAiValidationSettings(company);
  const next = {
    ...prev,
    ...(patch?.drivingEnabled !== undefined ? { drivingEnabled: Boolean(patch.drivingEnabled) } : {}),
    ...(patch?.faceEnabled !== undefined ? { faceEnabled: Boolean(patch.faceEnabled) } : {}),
  };
  return {
    ...current,
    aiValidation: next,
  };
}

