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

  const body = rule.body ?? "";
  const responseHeaders = normalizeHeaders(rule.headers);

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

    return sendResponse({ ok: false, error: "Unknown message type" });
  })();

  // Keep message channel open for async response.
  return true;
});

