const DEBUGGER_PROTOCOL_VERSION = "1.3";

const STORAGE_KEYS = {
  rules: "rules",
  enabledTabIds: "enabledTabIds"
};

/**
 * Rule shape (stored in chrome.storage.local):
 * {
 *   id: string,
 *   enabled: boolean,
 *   urlRegex: string, // JS RegExp source
 *   status: number,
 *   headers: Record<string, string>,
 *   body: string
 * }
 */

function toDebuggerTarget(tabId) {
  return { tabId };
}

async function getFromStorage(keys) {
  return await chrome.storage.local.get(keys);
}

async function setInStorage(obj) {
  await chrome.storage.local.set(obj);
}

async function getRules() {
  const { [STORAGE_KEYS.rules]: rules } = await getFromStorage([STORAGE_KEYS.rules]);
  return Array.isArray(rules) ? rules : [];
}

async function getEnabledTabIds() {
  const { [STORAGE_KEYS.enabledTabIds]: enabledTabIds } = await getFromStorage([
    STORAGE_KEYS.enabledTabIds
  ]);
  return Array.isArray(enabledTabIds) ? enabledTabIds : [];
}

async function setEnabledTabIds(tabIds) {
  await setInStorage({ [STORAGE_KEYS.enabledTabIds]: tabIds });
}

async function isTabEnabled(tabId) {
  const tabIds = await getEnabledTabIds();
  return tabIds.includes(tabId);
}

async function enableForTab(tabId) {
  const target = toDebuggerTarget(tabId);
  try {
    await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION);
  } catch (e) {
    // If already attached by us, attach will throw. Treat as enabled.
  }

  await chrome.debugger.sendCommand(target, "Fetch.enable", {
    patterns: [{ urlPattern: "*" }]
  });

  const tabIds = await getEnabledTabIds();
  if (!tabIds.includes(tabId)) {
    tabIds.push(tabId);
    await setEnabledTabIds(tabIds);
  }
}

async function disableForTab(tabId) {
  const target = toDebuggerTarget(tabId);
  try {
    await chrome.debugger.sendCommand(target, "Fetch.disable");
  } catch (e) {
    // ignore
  }
  try {
    await chrome.debugger.detach(target);
  } catch (e) {
    // ignore
  }
  const tabIds = await getEnabledTabIds();
  const next = tabIds.filter((id) => id !== tabId);
  await setEnabledTabIds(next);
}

function normalizeHeaders(headersObj) {
  const out = [];
  for (const [name, value] of Object.entries(headersObj || {})) {
    out.push({ name, value: String(value) });
  }
  return out;
}

function hasHeader(headersObj, headerName) {
  const target = String(headerName).toLowerCase();
  return Object.keys(headersObj || {}).some((k) => String(k).toLowerCase() === target);
}

/**
 * Request headers in Fetch.requestPaused are usually an array of { name, value }.
 * Build a lowercase-key map for CORS/special handling.
 */
function getRequestHeaderMap(request) {
  const raw = request?.headers;
  const map = {};
  if (Array.isArray(raw)) {
    for (const h of raw) {
      if (h && h.name) map[String(h.name).toLowerCase()] = h.value;
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      map[String(k).toLowerCase()] = v;
    }
  }
  return map;
}

/**
 * CORS: credentialed fetches (cookies / credentials: "include") reject
 * `Access-Control-Allow-Origin: *` — the response must echo the request `Origin`
 * and include `Access-Control-Allow-Credentials: true`.
 */
function withDefaultCorsHeaders(headersObj, requestHeaderMap) {
  const headers = { ...(headersObj || {}) };
  const origin = (requestHeaderMap?.["origin"] || "").toString().trim();
  const preflightWantedMethod = (requestHeaderMap?.["access-control-request-method"] || "").trim();
  const preflightWantedHeaders = (requestHeaderMap?.["access-control-request-headers"] || "").trim();
  const credentialedRequest =
    !!requestHeaderMap?.["cookie"]?.toString().trim().length ||
    !!requestHeaderMap?.["authorization"]?.toString().trim().length;

  // If user already set CORS headers, only fill gaps (reflect Origin, credentials).
  if (!hasHeader(headers, "access-control-allow-origin")) {
    if (origin) {
      // Echo request Origin — required when `Access-Control-Allow-Origin: *` is invalid
      // (e.g. fetch with credentials, or cookies on cross-origin XHR).
      headers["Access-Control-Allow-Origin"] = origin;
      if (!hasHeader(headers, "access-control-allow-credentials")) {
        headers["Access-Control-Allow-Credentials"] = "true";
      }
    } else {
      headers["Access-Control-Allow-Origin"] = "*";
    }
  } else if (!hasHeader(headers, "access-control-allow-credentials") && credentialedRequest) {
    const uao = getHeaderValueCi(headers, "Access-Control-Allow-Origin");
    if (uao && uao !== "*") {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }

  if (!hasHeader(headers, "access-control-allow-headers")) {
    if (preflightWantedHeaders) {
      // Echo requested client headers; wildcards on preflight are inconsistent across clients.
      headers["Access-Control-Allow-Headers"] = preflightWantedHeaders;
    } else {
      headers["Access-Control-Allow-Headers"] = "*";
    }
  }
  if (!hasHeader(headers, "access-control-allow-methods")) {
    if (preflightWantedMethod) {
      const base = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";
      if (!base.split(", ").map((m) => m.toUpperCase()).includes(preflightWantedMethod.toUpperCase())) {
        headers["Access-Control-Allow-Methods"] = `${base}, ${preflightWantedMethod.toUpperCase()}`;
      } else {
        headers["Access-Control-Allow-Methods"] = base;
      }
    } else {
      headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";
    }
  }
  if (!hasHeader(headers, "access-control-max-age")) {
    headers["Access-Control-Max-Age"] = "86400";
  }
  if (!hasHeader(headers, "cache-control")) {
    headers["Cache-Control"] = "no-store";
  }
  if (origin && !hasHeader(headers, "vary")) {
    headers["Vary"] = "Origin";
  }
  return headers;
}

function getHeaderValueCi(headersObj, headerName) {
  const target = String(headerName).toLowerCase();
  for (const [k, v] of Object.entries(headersObj || {})) {
    if (String(k).toLowerCase() === target) return String(v);
  }
  return undefined;
}

function base64EncodeUtf8(str) {
  // btoa expects latin1; convert via UTF-8.
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

function escapeRegExp(literal) {
  return String(literal).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseUrlMatcher(input) {
  const raw = String(input || "").trim();
  if (!raw) return { mode: "none", source: "" };

  if (raw.startsWith("re:")) {
    return { mode: "regex", source: raw.slice(3).trim() };
  }
  if (raw.startsWith("lit:")) {
    return { mode: "literal", source: raw.slice(4).trim() };
  }

  // Smart default: if user pasted full URL, treat it as literal.
  if (/^https?:\/\//i.test(raw)) {
    return { mode: "literal", source: raw };
  }

  return { mode: "regex", source: raw };
}

function matchRule(rules, url) {
  for (const rule of rules) {
    if (!rule || !rule.enabled) continue;
    try {
      const matcher = parseUrlMatcher(rule.urlRegex);
      if (matcher.mode === "none") continue;
      const source =
        matcher.mode === "literal" ? `^${escapeRegExp(matcher.source)}$` : matcher.source;

      const re = new RegExp(source);
      if (re.test(url)) return rule;
    } catch (e) {
      // invalid regex -> ignore
    }
  }
  return null;
}

chrome.debugger.onEvent.addListener(async (source, method, params) => {
  if (method !== "Fetch.requestPaused") return;
  const tabId = source?.tabId;
  if (typeof tabId !== "number") return;

  if (!(await isTabEnabled(tabId))) {
    // Shouldn't happen often, but just continue.
    try {
      await chrome.debugger.sendCommand(source, "Fetch.continueRequest", {
        requestId: params.requestId
      });
    } catch {}
    return;
  }

  const url = params?.request?.url || "";
  const reqMethod = (params?.request?.method || "GET").toUpperCase();
  const requestHeaderMap = getRequestHeaderMap(params.request);
  const rules = await getRules();
  const rule = matchRule(rules, url);

  if (!rule) {
    try {
      await chrome.debugger.sendCommand(source, "Fetch.continueRequest", {
        requestId: params.requestId
      });
    } catch {}
    return;
  }

  // Preflight: answer OPTIONS with permissive CORS so real request can proceed.
  if (reqMethod === "OPTIONS") {
    const preflightHeaders = normalizeHeaders(
      withDefaultCorsHeaders(rule.headers, requestHeaderMap)
    );
    try {
      await chrome.debugger.sendCommand(source, "Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 204,
        responseHeaders: preflightHeaders,
        body: base64EncodeUtf8("")
      });
      return;
    } catch (e) {
      // fall through to continueRequest
    }
  }

  const body = rule.body ?? "";
  const responseHeaders = normalizeHeaders(withDefaultCorsHeaders(rule.headers, requestHeaderMap));

  try {
    await chrome.debugger.sendCommand(source, "Fetch.fulfillRequest", {
      requestId: params.requestId,
      responseCode: Number(rule.status) || 200,
      responseHeaders,
      body: base64EncodeUtf8(body)
    });
  } catch (e) {
    // If fulfill fails, just let it pass.
    try {
      await chrome.debugger.sendCommand(source, "Fetch.continueRequest", {
        requestId: params.requestId
      });
    } catch {}
  }
});

chrome.debugger.onDetach.addListener(async (source) => {
  const tabId = source?.tabId;
  if (typeof tabId !== "number") return;
  const tabIds = await getEnabledTabIds();
  if (tabIds.includes(tabId)) {
    await setEnabledTabIds(tabIds.filter((id) => id !== tabId));
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || typeof msg !== "object") return sendResponse({ ok: false });
    const { type } = msg;

    if (type === "GET_STATE") {
      const tabId = msg.tabId;
      const [rules, enabled] = await Promise.all([getRules(), isTabEnabled(tabId)]);
      return sendResponse({ ok: true, rules, enabled });
    }

    if (type === "SET_ENABLED") {
      const tabId = msg.tabId;
      const enabled = !!msg.enabled;
      if (enabled) await enableForTab(tabId);
      else await disableForTab(tabId);
      return sendResponse({ ok: true });
    }

    if (type === "UPSERT_RULES") {
      const rules = Array.isArray(msg.rules) ? msg.rules : [];
      await setInStorage({ [STORAGE_KEYS.rules]: rules });
      return sendResponse({ ok: true });
    }

    if (type === "FIND_MATCHING_RULE") {
      const url = String(msg.url || "");
      const rules = await getRules();
      return sendResponse({ ok: true, rule: matchRule(rules, url) || null });
    }

    if (type === "MATCH_URLS") {
      const urls = Array.isArray(msg.urls) ? msg.urls : [];
      const rules = await getRules();
      const results = urls.map((url) => ({
        url,
        rule: matchRule(rules, String(url)) || null
      }));
      return sendResponse({ ok: true, results });
    }

    if (type === "ADD_RULE") {
      const partial = msg.rule && typeof msg.rule === "object" ? msg.rule : {};
      const id = partial.id || `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newRule = {
        id,
        enabled: partial.enabled !== false,
        urlRegex: String(partial.urlRegex || ""),
        status: Number(partial.status) || 200,
        headers: partial.headers && typeof partial.headers === "object" ? partial.headers : {},
        body: partial.body != null ? String(partial.body) : '{\n  "mocked": true\n}\n'
      };
      if (!newRule.headers || Object.keys(newRule.headers).length === 0) {
        newRule.headers = { "Content-Type": "application/json" };
      }
      const rules = await getRules();
      rules.unshift(newRule);
      await setInStorage({ [STORAGE_KEYS.rules]: rules });
      return sendResponse({ ok: true, rule: newRule, rules });
    }

    if (type === "DELETE_RULE") {
      const { id } = msg;
      const rules = await getRules();
      const next = rules.filter((r) => r && r.id !== id);
      await setInStorage({ [STORAGE_KEYS.rules]: next });
      return sendResponse({ ok: true, rules: next });
    }

    if (type === "PATCH_RULE") {
      const { id, enabled, status, body, urlRegex, headers } = msg;
      const rules = await getRules();
      const rule = rules.find((r) => r && r.id === id);
      if (!rule) {
        return sendResponse({ ok: false, error: "Rule not found" });
      }
      if (typeof enabled === "boolean") rule.enabled = enabled;
      if (status != null) rule.status = Number(status) || 200;
      if (body != null) rule.body = String(body);
      if (urlRegex != null) {
        const s = String(urlRegex).trim();
        if (!s) {
          return sendResponse({ ok: false, error: "URL / pattern cannot be empty" });
        }
        rule.urlRegex = s;
      }
      if (headers != null) {
        if (typeof headers !== "object" || Array.isArray(headers) || headers === null) {
          return sendResponse({ ok: false, error: "headers must be a JSON object" });
        }
        const next = {};
        for (const [k, v] of Object.entries(headers)) {
          next[String(k)] = String(v);
        }
        rule.headers = next;
      }
      await setInStorage({ [STORAGE_KEYS.rules]: rules });
      return sendResponse({ ok: true, rules: await getRules() });
    }

    return sendResponse({ ok: false, error: "Unknown message type" });
  })();

  // Keep message channel open for async response.
  return true;
});

