/**
 * MockWeave rules export/import helpers (ES module; also attach to global for classic scripts).
 */
export const RULES_EXPORT_VERSION = 1;

export function normalizeRule(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `rule-import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
  const mockKind = raw.mockKind === "request" ? "request" : "response";
  const rule = {
    id,
    enabled: raw.enabled !== false,
    urlRegex: String(raw.urlRegex || ""),
    mockKind
  };
  if (raw.urlIncluded) rule.urlIncluded = true;
  if (mockKind === "request") {
    rule.status = 0;
    rule.headers = {};
    rule.body = "";
    if (raw.requestMethod != null && String(raw.requestMethod).trim()) {
      rule.requestMethod = String(raw.requestMethod).trim();
    }
    if (raw.requestUrl != null && String(raw.requestUrl).trim()) {
      rule.requestUrl = String(raw.requestUrl).trim();
    }
    if (raw.requestHeaders && typeof raw.requestHeaders === "object" && !Array.isArray(raw.requestHeaders)) {
      const rh = {};
      for (const [k, v] of Object.entries(raw.requestHeaders)) rh[String(k)] = String(v);
      if (Object.keys(rh).length) rule.requestHeaders = rh;
    }
    if (Object.prototype.hasOwnProperty.call(raw, "requestBody")) {
      rule.requestBody = raw.requestBody == null ? null : String(raw.requestBody);
    }
  } else {
    rule.status = Number(raw.status) || 200;
    rule.body = raw.body != null ? String(raw.body) : "";
    const headers =
      raw.headers && typeof raw.headers === "object" && !Array.isArray(raw.headers) ? raw.headers : {};
    rule.headers = {};
    for (const [k, v] of Object.entries(headers)) rule.headers[String(k)] = String(v);
    if (!Object.keys(rule.headers).length) {
      rule.headers = { "Content-Type": "application/json" };
    }
  }
  return rule;
}

export function normalizeRulesList(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const rule = normalizeRule(list[i], i);
    if (rule) out.push(rule);
  }
  return out;
}

export function parseRulesImportJson(text) {
  const parsed = JSON.parse(String(text || ""));
  if (Array.isArray(parsed)) {
    return { rules: normalizeRulesList(parsed) };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.rules)) {
    return { rules: normalizeRulesList(parsed.rules) };
  }
  throw new Error("Invalid rules file: expected an array or { rules: [...] }");
}

export function buildRulesExportDocument(rules) {
  return {
    mockweave: "rules",
    version: RULES_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    rules: normalizeRulesList(rules)
  };
}

export function mergeRulesById(existing, imported) {
  const map = new Map();
  for (const r of normalizeRulesList(existing)) map.set(r.id, r);
  for (const r of normalizeRulesList(imported)) map.set(r.id, r);
  return Array.from(map.values());
}
