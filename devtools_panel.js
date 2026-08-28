/* global chrome */

const MAX_CAPTURED = 200;
/** Truncate very large response bodies in memory to avoid OOM. */
const MAX_RESPONSE_BODY = 1_000_000;

const STRIP_RESPONSE_HEADER_NAMES = new Set([
  "content-encoding",
  "transfer-encoding",
  "content-length",
  "connection",
  "keep-alive",
  "trailer",
  "x-http2-pushed"
]);

function newCaptureCid() {
  return `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function harHeadersArrayToObject(headers) {
  const o = {};
  if (!headers) return o;
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && h.name) o[String(h.name)] = h.value != null ? String(h.value) : "";
    }
  } else if (typeof headers === "object") {
    for (const [k, v] of Object.entries(headers)) {
      o[String(k)] = v != null ? String(v) : "";
    }
  }
  return o;
}

/**
 * Drop hop-by-hop and framing headers so our fulfilled body matches what we show.
 */
function stripResponseHeadersForMock(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (STRIP_RESPONSE_HEADER_NAMES.has(String(k).toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

function decodeGetContentBody(content, encoding) {
  if (content == null) return "";
  if (String(content) === "") return "";
  if (encoding === "base64") {
    const binary = atob(String(content).replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  return String(content);
}

let inspectedTabId = null;
let captured = [];
let rulesCache = [];
let matchByUrl = new Map();
let _renderTimer = null;
let filterCaptured = "";
let filterRules = "";
let editingRuleId = null;
let activeView = "captured";
let selectedCapturedCid = null;
let selectedRuleId = null;

function sendToBg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res);
    });
  });
}

function getInspectedTabId() {
  const id = chrome.devtools?.inspectedWindow?.tabId;
  return typeof id === "number" ? id : null;
}

function setStatus(text, kind = "muted") {
  const el = document.getElementById("statusLine");
  if (!el) return;
  el.textContent = text;
  el.style.color =
    kind === "ok" ? "var(--ok)" : kind === "warn" ? "var(--warn)" : "var(--muted)";
}

function findRuleById(id) {
  return rulesCache.find((r) => r && r.id === id) || null;
}

function getFilteredCaptured() {
  const f = (filterCaptured || "").trim().toLowerCase();
  if (!f) return captured;
  return captured.filter((c) => c.url && c.url.toLowerCase().includes(f));
}

function getFilteredRules() {
  const f = (filterRules || "").trim().toLowerCase();
  if (!f) return rulesCache.filter(Boolean);
  return rulesCache.filter((r) => {
    if (!r) return false;
    if ((r.urlRegex || "").toLowerCase().includes(f)) return true;
    if (String(r.status || "").includes(f)) return true;
    if ((r.body || "").toLowerCase().includes(f)) return true;
    if ((r.requestUrl || "").toLowerCase().includes(f)) return true;
    if ((r.requestMethod || "").toLowerCase().includes(f)) return true;
    if ((r.requestBody || "").toLowerCase().includes(f)) return true;
    try {
      if (JSON.stringify(r.headers || {}).toLowerCase().includes(f)) return true;
      if (JSON.stringify(r.requestHeaders || {}).toLowerCase().includes(f)) return true;
    } catch (e) {
      /* ignore */
    }
    return false;
  });
}

/**
 * Full capture record for a finished network request (used when creating a mock from real data).
 * @typedef {{
 *  cid: string,
 *  _key: string,
 *  method: string,
 *  url: string,
 *  status: number,
 *  resHeaders: Record<string, string>,
 *  resBody: string | null,
 *  bodyLoadState: "loading" | "ok" | "empty" | "none" | "error",
 *  t: number
 * }} CapturedItem
 */

function pushCapturedItem(partial) {
  if (!partial || !partial.url) return;
  const method = (partial.method || "GET").toString().toUpperCase();
  const key = `${method} ${partial.url}`;
  const others = captured.filter((e) => e._key !== key);
  const item = {
    cid: partial.cid || newCaptureCid(),
    _key: key,
    method,
    url: String(partial.url),
    status: Number(partial.status) || 0,
    resHeaders: partial.resHeaders && typeof partial.resHeaders === "object" ? partial.resHeaders : {},
    resBody: partial.resBody != null ? String(partial.resBody) : null,
    bodyLoadState: partial.bodyLoadState || (partial.resBody != null ? "ok" : "empty"),
    t: Date.now()
  };
  others.unshift(item);
  captured = others.slice(0, MAX_CAPTURED);
  return item;
}

/**
 * HAR from getHAR: often includes response.content.text and headers.
 */
function harEntryToCapturePayload(entry) {
  if (!entry || !entry.request) return null;
  const res = entry.response;
  if (!res) return null;
  const method = (entry.request.method || "GET").toUpperCase();
  const url = String(entry.request.url || "");
  if (!url) return null;
  const status = res.status != null ? res.status : 0;
  const resHeaders = stripResponseHeadersForMock(
    harHeadersArrayToObject(res.headers)
  );
  const content = res.content;
  let resBody = null;
  let bodyLoadState = "empty";
  if (content && content.text) {
    try {
      resBody = decodeGetContentBody(content.text, content.encoding);
      if (resBody.length > MAX_RESPONSE_BODY) {
        resBody = resBody.slice(0, MAX_RESPONSE_BODY) + "\n\n... [response truncated] ...";
      }
      bodyLoadState = resBody.length > 0 ? "ok" : "empty";
    } catch (e) {
      resBody = "";
      bodyLoadState = "error";
    }
  }
  return { method, url, status, resHeaders, resBody, bodyLoadState };
}

/**
 * Live request from chrome.devtools.network.onRequestFinished
 */
function devtoolsRequestToCaptureBase(req) {
  if (!req) return null;
  const inner = req.request || req;
  const method = (inner.method || "GET").toString().toUpperCase();
  const url = String((inner && inner.url) || req.url || "");
  if (!url) return null;
  const response = req.response;
  if (!response) {
    return {
      method,
      url,
      status: 0,
      resHeaders: {}
    };
  }
  const status = response.status != null ? response.status : 0;
  const resHeaders = stripResponseHeadersForMock(harHeadersArrayToObject(response.headers));
  return { method, url, status, resHeaders };
}

/**
 * Ingests a new finished request, async-fetches response body via getContent.
 */
function ingestDevToolsRequestFinished(req) {
  const base = devtoolsRequestToCaptureBase(req);
  if (!base) return;
  const item = pushCapturedItem({
    ...base,
    resBody: null,
    bodyLoadState: "loading"
  });
  if (!item) return;
  scheduleRender();

  if (typeof req.getContent !== "function") {
    item.bodyLoadState = "none";
    scheduleRender();
    return;
  }
  try {
    req.getContent((content, encoding) => {
      const ent = captured.find((x) => x.cid === item.cid);
      if (!ent) return;
      try {
        const raw = decodeGetContentBody(content, encoding);
        let body = raw;
        if (body.length > MAX_RESPONSE_BODY) {
          body = body.slice(0, MAX_RESPONSE_BODY) + "\n\n... [response truncated] ...";
        }
        ent.resBody = body;
        ent.bodyLoadState = body && body.length > 0 ? "ok" : "empty";
      } catch (e) {
        ent.resBody = "";
        ent.bodyLoadState = "error";
      }
      scheduleRender();
    });
  } catch (e) {
    item.bodyLoadState = "error";
    scheduleRender();
  }
}

function scheduleRender() {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => {
    _renderTimer = null;
    void renderAll();
  }, 80);
}

async function refreshMatchMap() {
  const urls = [...new Set(captured.map((c) => c.url).filter(Boolean))];
  if (urls.length === 0) {
    matchByUrl = new Map();
    return;
  }
  const res = await sendToBg({ type: "MATCH_URLS", urls });
  if (!res?.ok) {
    setStatus(res?.error || "Could not match URLs", "warn");
    matchByUrl = new Map();
    return;
  }
  const m = new Map();
  for (const row of res.results || []) {
    m.set(row.url, row.rule || null);
  }
  matchByUrl = m;
}

async function loadState() {
  if (inspectedTabId == null) {
    setStatus("This panel needs an inspected page tab (open DevTools on a real tab).", "warn");
    return;
  }
  const res = await sendToBg({ type: "GET_STATE", tabId: inspectedTabId });
  if (!res?.ok) {
    setStatus(res?.error || "Failed to load state", "warn");
    return;
  }
  rulesCache = Array.isArray(res.rules) ? res.rules : [];
  const t = document.getElementById("enabledToggle");
  if (t) t.checked = !!res.enabled;
}

function setActiveView(view) {
  activeView = view === "rules" ? "rules" : "captured";
  for (const btn of document.querySelectorAll(".navTab")) {
    const on = btn.getAttribute("data-view") === activeView;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }
  const capPane = document.getElementById("capturedPane");
  const rulesPane = document.getElementById("rulesPane");
  const capTools = document.getElementById("capturedTools");
  const rulesTools = document.getElementById("rulesTools");
  if (capPane) capPane.hidden = activeView !== "captured";
  if (rulesPane) rulesPane.hidden = activeView !== "rules";
  if (capTools) capTools.hidden = activeView !== "captured";
  if (rulesTools) rulesTools.hidden = activeView !== "rules";
}

function showDetailEmpty() {
  editingRuleId = null;
  selectedRuleId = null;
  selectedCapturedCid = null;
  const empty = document.getElementById("detailEmpty");
  const editor = document.getElementById("detailEditor");
  if (empty) empty.hidden = false;
  if (editor) editor.hidden = true;
  for (const tr of document.querySelectorAll("tbody tr.selected")) {
    tr.classList.remove("selected");
  }
}

function showCapturePreview(item) {
  if (!item) return;
  selectedCapturedCid = item.cid;
  selectedRuleId = null;
  editingRuleId = null;
  const empty = document.getElementById("detailEmpty");
  const editor = document.getElementById("detailEditor");
  const title = document.getElementById("editRuleTitle");
  const delBtn = document.getElementById("edDelete");
  const saveBtn = document.getElementById("edSave");
  const cancelBtn = document.getElementById("edCancel");
  if (!editor || !title) return;
  if (empty) empty.hidden = true;
  editor.hidden = false;
  if (delBtn) delBtn.hidden = true;
  if (saveBtn) saveBtn.hidden = true;
  if (cancelBtn) cancelBtn.textContent = "Close";

  const rule = matchByUrl.get(item.url) || null;
  title.textContent = rule ? "Captured request (mocked)" : "Captured request";

  const edUrl = document.getElementById("edUrl");
  const edKind = document.getElementById("edKind");
  const edStatus = document.getElementById("edStatus");
  const edHeaders = document.getElementById("edHeaders");
  const edBody = document.getElementById("edBody");
  const edReqMethod = document.getElementById("edReqMethod");
  const edReqUrl = document.getElementById("edReqUrl");
  const edReqHeaders = document.getElementById("edReqHeaders");
  const edReqBody = document.getElementById("edReqBody");
  const edUrlIncluded = document.getElementById("edUrlIncluded");
  if (!edUrl || !edKind || !edStatus || !edHeaders || !edBody) return;

  if (rule) {
    openRuleEditor(rule, { keepSelection: true });
    return;
  }

  edKind.value = "response";
  edUrl.value = item.url;
  if (edUrlIncluded) edUrlIncluded.checked = false;
  edStatus.value = String(item.status > 0 ? item.status : 200);
  const h = item.resHeaders && typeof item.resHeaders === "object" ? item.resHeaders : {};
  edHeaders.value = Object.keys(h).length ? JSON.stringify(h, null, 2) : '{\n  "Content-Type": "application/json"\n}';
  edBody.value = item.resBody != null ? String(item.resBody) : "";
  if (edReqMethod) edReqMethod.value = "";
  if (edReqUrl) edReqUrl.value = "";
  if (edReqHeaders) edReqHeaders.value = "";
  if (edReqBody) edReqBody.value = "";
  syncEdModalMode();

  for (const id of ["edUrl", "edKind", "edStatus", "edHeaders", "edBody", "edUrlIncluded"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  }
  for (const id of ["edReqMethod", "edReqUrl", "edReqHeaders", "edReqBody"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  }

  if (saveBtn) {
    saveBtn.hidden = false;
    saveBtn.textContent = item.bodyLoadState === "loading" ? "Waiting for body…" : "Create mock";
    saveBtn.disabled = item.bodyLoadState === "loading";
  }
  highlightSelectedRows();
}

function enableEditorFields() {
  for (const id of [
    "edUrl",
    "edKind",
    "edStatus",
    "edHeaders",
    "edBody",
    "edUrlIncluded",
    "edReqMethod",
    "edReqUrl",
    "edReqHeaders",
    "edReqBody"
  ]) {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  }
  const saveBtn = document.getElementById("edSave");
  if (saveBtn) {
    saveBtn.textContent = "Save";
    saveBtn.disabled = false;
  }
  const cancelBtn = document.getElementById("edCancel");
  if (cancelBtn) cancelBtn.textContent = "Close";
}

async function createMockFromCapture(cid) {
  let ent = captured.find((x) => x.cid === cid);
  if (!ent) return;
  if (ent.bodyLoadState === "loading") {
    setStatus("Waiting for response body…", "muted");
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      ent = captured.find((x) => x.cid === cid);
      if (!ent) return;
      if (ent.bodyLoadState !== "loading") break;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  ent = captured.find((x) => x.cid === cid);
  if (!ent) return;
  const status = ent.status > 0 ? ent.status : 200;
  const headers = { ...ent.resHeaders };
  if (Object.keys(headers).length === 0) {
    headers["Content-Type"] = "text/plain; charset=utf-8";
  }
  const resBody = ent.resBody != null ? ent.resBody : "";
  const res = await sendToBg({
    type: "ADD_RULE",
    rule: {
      urlRegex: ent.url,
      status,
      headers,
      body: resBody,
      enabled: true
    }
  });
  if (res?.ok) {
    rulesCache = res.rules || rulesCache;
    setStatus("Mock created — edit on the right", "ok");
    setActiveView("rules");
    await refreshMatchMap();
    renderRulesTable();
    renderCapturedTable();
    if (res.rule) openRuleEditor(res.rule);
  } else {
    setStatus(res?.error || "Add rule failed", "warn");
  }
}
function parseHeadersJsonFromPanel(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers must be a JSON object");
  }
  const out = {};
  for (const [k, v] of Object.entries(parsed)) out[String(k)] = String(v);
  return out;
}

function syncEdModalMode() {
  const kind = document.getElementById("edKind")?.value || "response";
  const res = document.getElementById("edResBlock");
  const req = document.getElementById("edReqBlock");
  if (res) res.hidden = kind === "request";
  if (req) req.hidden = kind !== "request";
}

function openRuleEditor(rule, opts = {}) {
  if (!rule) return;
  enableEditorFields();
  editingRuleId = rule.id;
  selectedRuleId = rule.id;
  if (!opts.keepSelection) selectedCapturedCid = null;

  const empty = document.getElementById("detailEmpty");
  const editor = document.getElementById("detailEditor");
  const title = document.getElementById("editRuleTitle");
  const delBtn = document.getElementById("edDelete");
  const saveBtn = document.getElementById("edSave");
  const edUrl = document.getElementById("edUrl");
  const edKind = document.getElementById("edKind");
  const edStatus = document.getElementById("edStatus");
  const edHeaders = document.getElementById("edHeaders");
  const edBody = document.getElementById("edBody");
  const edReqMethod = document.getElementById("edReqMethod");
  const edReqUrl = document.getElementById("edReqUrl");
  const edReqHeaders = document.getElementById("edReqHeaders");
  const edReqBody = document.getElementById("edReqBody");
  const edUrlIncluded = document.getElementById("edUrlIncluded");
  if (!editor || !edUrl || !edKind || !edStatus || !edHeaders || !edBody) return;

  if (empty) empty.hidden = true;
  editor.hidden = false;
  if (title) title.textContent = "Edit rule";
  if (delBtn) delBtn.hidden = false;
  if (saveBtn) {
    saveBtn.hidden = false;
    saveBtn.textContent = "Save";
    saveBtn.disabled = false;
  }

  const full = findRuleById(rule.id) || rule;
  const kind = full.mockKind === "request" ? "request" : "response";
  edKind.value = kind;
  edUrl.value = full.urlRegex || "";
  if (edUrlIncluded) edUrlIncluded.checked = !!full.urlIncluded;
  edStatus.value = String(full.status != null && full.status > 0 ? full.status : 200);
  const h = full.headers && typeof full.headers === "object" ? full.headers : {};
  edHeaders.value = Object.keys(h).length ? JSON.stringify(h, null, 2) : "";
  edBody.value = full.body != null ? String(full.body) : "";
  if (edReqMethod) edReqMethod.value = full.requestMethod || "";
  if (edReqUrl) edReqUrl.value = full.requestUrl || "";
  if (edReqHeaders) {
    const rh = full.requestHeaders && typeof full.requestHeaders === "object" ? full.requestHeaders : {};
    const pr = JSON.stringify(rh, null, 2);
    edReqHeaders.value = pr === "{}" ? "" : pr;
  }
  if (edReqBody) {
    edReqBody.value = Object.prototype.hasOwnProperty.call(full, "requestBody")
      ? full.requestBody != null
        ? String(full.requestBody)
        : ""
      : "";
  }
  syncEdModalMode();
  highlightSelectedRows();
  setActiveView("rules");
  setTimeout(() => {
    if (kind === "request" && edReqBody) edReqBody.focus();
    else if (edBody) edBody.focus();
  }, 50);
}

function closeRuleEditor() {
  showDetailEmpty();
}

function highlightSelectedRows() {
  for (const tr of document.querySelectorAll("#capturedBody tr")) {
    tr.classList.toggle("selected", tr.getAttribute("data-cid") === selectedCapturedCid);
  }
  for (const tr of document.querySelectorAll("#rulesBody tr")) {
    tr.classList.toggle("selected", tr.getAttribute("data-id") === selectedRuleId);
  }
}

function renderRulesTable() {
  const body = document.getElementById("rulesBody");
  if (!body) return;
  const list = getFilteredRules();
  if (!rulesCache.length) {
    body.innerHTML = `<tr><td colspan="3" class="muted">No rules yet. Select a captured request and click Create mock, or add rules in the toolbar popup.</td></tr>`;
    return;
  }
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="3" class="muted">No rules match the filter. Clear the search or change the query.</td></tr>`;
    return;
  }
  body.innerHTML = "";
  for (const r of list) {
    if (!r) continue;
    const isReq = r.mockKind === "request";
    const kindTag = isReq
      ? `<span class="tag kindReq" title="Outgoing request is overridden; response is real">REQ</span> `
      : `<span class="tag kindRes" title="Response is faked in the app">RES</span> `;
    const incTag = r.urlIncluded
      ? `<span class="kindInc" title="URL must contain this pattern (substring)">INC</span> `
      : "";
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", r.id);
    if (selectedRuleId === r.id) tr.classList.add("selected");
    const short = (r.urlRegex || "").length > 100 ? (r.urlRegex || "").slice(0, 100) + "…" : r.urlRegex || "";
    const statusCell = isReq
      ? `<td class="muted" title="Not used in request-override mode">—</td>`
      : `<td><input class="statusField statusIn" data-id="${escapeAttr(
          r.id
        )}" type="number" min="100" max="599" value="${Number(
        r.status
      ) || 200}" title="Click away or Enter to apply" aria-label="HTTP status" /></td>`;
    tr.innerHTML = `
      <td><input class="ruleOn" data-id="${escapeAttr(r.id)}" type="checkbox" ${r.enabled ? "checked" : ""} /></td>
      ${statusCell}
      <td class="urlCell" title="${escapeAttr(r.urlRegex || "")}">${kindTag}${incTag}${escapeHtml(short || "(empty)")}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("input")) return;
      openRuleEditor(r);
    });
    body.appendChild(tr);
  }
  for (const cb of body.querySelectorAll("input.ruleOn")) {
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      const res = await sendToBg({ type: "PATCH_RULE", id, enabled: e.target.checked });
      if (res?.ok) {
        rulesCache = res.rules || rulesCache;
        setStatus("Updated", "ok");
      } else {
        e.target.checked = !e.target.checked;
        setStatus(res?.error || "Patch failed", "warn");
      }
    });
  }
  for (const inp of body.querySelectorAll("input.statusIn")) {
    inp.addEventListener("click", (e) => e.stopPropagation());
    const apply = async (e) => {
      const id = e.target.getAttribute("data-id");
      const n = Number(e.target.value);
      if (!id || n < 100 || n > 599) {
        e.target.value = String(findRuleById(id)?.status || 200);
        return;
      }
      if (findRuleById(id)?.mockKind === "request") return;
      const res = await sendToBg({ type: "PATCH_RULE", id, status: n });
      if (res?.ok) {
        rulesCache = res.rules || rulesCache;
        setStatus("Status saved", "ok");
        await refreshMatchMap();
        renderCapturedTable();
      } else {
        setStatus(res?.error || "Failed to save status", "warn");
      }
    };
    inp.addEventListener("change", apply);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function renderCapturedTable() {
  const body = document.getElementById("capturedBody");
  if (!body) return;
  const shown = getFilteredCaptured();
  if (!captured.length) {
    body.innerHTML = `<tr><td colspan="3" class="muted">No requests captured yet. Trigger API calls, or hard-reload the page with DevTools open (Network: disable cache).</td></tr>`;
    return;
  }
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="3" class="muted">No requests match the URL filter.</td></tr>`;
    return;
  }
  body.innerHTML = "";
  for (const c of shown) {
    const rule = matchByUrl.get(c.url) || null;
    const tr = document.createElement("tr");
    tr.setAttribute("data-cid", c.cid);
    if (selectedCapturedCid === c.cid) tr.classList.add("selected");
    const bodyLabel =
      c.bodyLoadState === "loading"
        ? " ⏳"
        : c.bodyLoadState === "error"
          ? " ⚠"
          : "";
    const mockLabel = rule
      ? `<span class="mockBadge ${rule.mockKind === "request" ? "tagReq" : "tag"}">${rule.mockKind === "request" ? "REQ" : "RES"}</span>`
      : "";
    tr.innerHTML = `
      <td>${escapeHtml(c.method)}</td>
      <td>${c.status != null && c.status !== 0 ? escapeHtml(String(c.status)) : "—"}${bodyLabel ? `<span class="bodyHint" title="Response body capture">${bodyLabel}</span>` : ""}</td>
      <td class="urlCell" title="${escapeAttr(c.url)}">${mockLabel}${escapeHtml(c.url)}</td>
    `;
    tr.addEventListener("click", () => {
      setActiveView("captured");
      showCapturePreview(c);
      highlightSelectedRows();
    });
    body.appendChild(tr);
  }
}

async function renderAll() {
  await refreshMatchMap();
  renderRulesTable();
  renderCapturedTable();
  if (selectedCapturedCid && !editingRuleId) {
    const item = captured.find((x) => x.cid === selectedCapturedCid);
    if (item) showCapturePreview(item);
  } else if (editingRuleId) {
    highlightSelectedRows();
  }
}

function seedFromHar() {
  try {
    chrome.devtools.network.getHAR((har) => {
      if (!har || !har.log || !Array.isArray(har.log.entries)) return;
      const entries = har.log.entries.slice(-MAX_CAPTURED);
      for (const e of entries) {
        const p = harEntryToCapturePayload(e);
        if (p) {
          p.cid = newCaptureCid();
          pushCapturedItem(p);
        }
      }
      scheduleRender();
    });
  } catch (e) {
    /* getHAR not available */
  }
}

function wireFilterInputs() {
  const cf = document.getElementById("capturedFilter");
  const rf = document.getElementById("rulesFilter");
  if (cf) {
    cf.addEventListener("input", () => {
      filterCaptured = cf.value;
      void renderAll();
    });
  }
  if (rf) {
    rf.addEventListener("input", () => {
      filterRules = rf.value;
      renderRulesTable();
    });
  }
}

function wireNavTabs() {
  for (const btn of document.querySelectorAll(".navTab")) {
    btn.addEventListener("click", () => {
      setActiveView(btn.getAttribute("data-view"));
    });
  }
}

function wireSplitter() {
  const splitter = document.getElementById("splitter");
  const sidebar = document.getElementById("sidebar");
  const workspace = document.getElementById("workspace");
  if (!splitter || !sidebar || !workspace) return;

  let dragging = false;
  const onMove = (clientX) => {
    const rect = workspace.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(55, Math.max(22, pct));
    document.documentElement.style.setProperty("--sidebar-w", `${clamped}%`);
  };

  splitter.addEventListener("mousedown", (e) => {
    dragging = true;
    splitter.classList.add("dragging");
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    onMove(e.clientX);
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
    splitter.classList.remove("dragging");
  });
}

async function saveCurrentRule() {
  if (!editingRuleId) return;
  const edUrl = document.getElementById("edUrl");
  const edKind = document.getElementById("edKind");
  const edStatus = document.getElementById("edStatus");
  const edHeaders = document.getElementById("edHeaders");
  const edBody = document.getElementById("edBody");
  const edReqMethod = document.getElementById("edReqMethod");
  const edReqUrl = document.getElementById("edReqUrl");
  const edReqHeaders = document.getElementById("edReqHeaders");
  const edReqBody = document.getElementById("edReqBody");
  const edUrlIncluded = document.getElementById("edUrlIncluded");
  if (!edUrl) return;
  const kind = edKind?.value === "request" ? "request" : "response";
  const payload = {
    type: "PATCH_RULE",
    id: editingRuleId,
    urlRegex: edUrl.value.trim(),
    mockKind: kind,
    urlIncluded: !!edUrlIncluded?.checked
  };
  if (kind === "response") {
    if (!edStatus || !edHeaders || !edBody) return;
    let headersObj;
    if (edHeaders.value.trim()) {
      try {
        headersObj = parseHeadersJsonFromPanel(edHeaders.value);
      } catch (err) {
        setStatus(err?.message || String(err), "warn");
        return;
      }
    }
    Object.assign(payload, {
      status: Number(edStatus.value) || 200,
      body: edBody.value,
      ...(headersObj !== undefined ? { headers: headersObj } : {})
    });
  } else {
    let rHeaders;
    if (edReqHeaders?.value?.trim()) {
      try {
        rHeaders = parseHeadersJsonFromPanel(edReqHeaders.value);
      } catch (err) {
        setStatus(err?.message || String(err), "warn");
        return;
      }
    } else {
      rHeaders = {};
    }
    const prev = findRuleById(editingRuleId);
    const hadBody = prev && Object.prototype.hasOwnProperty.call(prev, "requestBody");
    const rawBody = edReqBody?.value ?? "";
    Object.assign(payload, {
      requestMethod: edReqMethod?.value?.trim() || null,
      requestUrl: edReqUrl?.value?.trim() || null,
      requestHeaders: rHeaders
    });
    if (rawBody.trim() !== "" || hadBody) {
      payload.requestBody = rawBody.trim() === "" ? null : rawBody;
    }
  }
  const res = await sendToBg(payload);
  if (res?.ok) {
    rulesCache = res.rules || rulesCache;
    setStatus("Rule saved", "ok");
    await refreshMatchMap();
    renderRulesTable();
    renderCapturedTable();
    const updated = findRuleById(editingRuleId);
    if (updated) openRuleEditor(updated, { keepSelection: true });
  } else {
    setStatus(res?.error || "Save failed", "warn");
  }
}

function wireDetailEditor() {
  const cancel = document.getElementById("edCancel");
  const save = document.getElementById("edSave");
  const del = document.getElementById("edDelete");
  const edKind = document.getElementById("edKind");
  edKind?.addEventListener("change", () => syncEdModalMode());
  cancel?.addEventListener("click", () => closeRuleEditor());
  save?.addEventListener("click", async () => {
    if (editingRuleId) {
      await saveCurrentRule();
      return;
    }
    if (selectedCapturedCid) {
      await createMockFromCapture(selectedCapturedCid);
    }
  });
  del?.addEventListener("click", async () => {
    if (!editingRuleId) return;
    const id = editingRuleId;
    const res = await sendToBg({ type: "DELETE_RULE", id });
    if (res?.ok) {
      rulesCache = res.rules || [];
      closeRuleEditor();
      renderRulesTable();
      await refreshMatchMap();
      renderCapturedTable();
      setStatus("Rule deleted", "ok");
    } else {
      setStatus(res?.error || "Delete failed", "warn");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const editor = document.getElementById("detailEditor");
      if (editor && !editor.hidden) {
        e.preventDefault();
        closeRuleEditor();
      }
    }
  });
}

async function main() {
  wireFilterInputs();
  wireNavTabs();
  wireSplitter();
  wireDetailEditor();
  setActiveView("captured");
  inspectedTabId = getInspectedTabId();
  const line = document.getElementById("tabIdLine");
  if (line) {
    line.textContent =
      inspectedTabId != null
        ? `Inspected tab id: ${inspectedTabId} — enable mocking above. Open this tab from the DevTools bar (MockWeave).`
        : "Could not read inspected tab id. Re-open DevTools on a normal page tab.";
  }

  if (inspectedTabId == null) {
    const t = document.getElementById("enabledToggle");
    if (t) t.disabled = true;
  }

  const enabledToggle = document.getElementById("enabledToggle");
  if (enabledToggle) {
    enabledToggle.addEventListener("change", async () => {
      if (inspectedTabId == null) return;
      setStatus(enabledToggle.checked ? "Enabling…" : "Disabling…");
      const res = await sendToBg({
        type: "SET_ENABLED",
        tabId: inspectedTabId,
        enabled: enabledToggle.checked
      });
      if (res?.ok) {
        setStatus(
          enabledToggle.checked ? "Mocking enabled for this tab" : "Mocking disabled for this tab",
          "ok"
        );
      } else {
        enabledToggle.checked = !enabledToggle.checked;
        setStatus(res?.error || "Failed to toggle", "warn");
      }
    });
  }

  document.getElementById("clearCaptured")?.addEventListener("click", () => {
    captured = [];
    matchByUrl = new Map();
    const cf = document.getElementById("capturedFilter");
    if (cf) {
      filterCaptured = "";
      cf.value = "";
    }
    renderCapturedTable();
  });

  document.getElementById("refreshRules")?.addEventListener("click", async () => {
    await loadState();
    await renderAll();
    setStatus("Refreshed", "ok");
  });

  if (inspectedTabId != null) {
    await loadState();
  } else {
    setStatus("Fix tab id to use this panel (see the line above).", "warn");
  }

  seedFromHar();

  try {
    chrome.devtools.network.onRequestFinished.addListener((req) => {
      ingestDevToolsRequestFinished(req);
    });
  } catch (e) {
    setStatus("Network API not available in this context.", "warn");
  }

  await renderAll();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rules) {
      (async () => {
        if (inspectedTabId != null) {
          const res = await sendToBg({ type: "GET_STATE", tabId: inspectedTabId });
          if (res?.ok) {
            rulesCache = Array.isArray(res.rules) ? res.rules : [];
            const t = document.getElementById("enabledToggle");
            if (t) t.checked = !!res.enabled;
          }
        }
        await renderAll();
      })();
    }
  });
}

main().catch((e) => setStatus(e?.message || String(e), "warn"));
