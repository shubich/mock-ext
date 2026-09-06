/* global chrome, MockWeaveI18n */

const t = (key, vars) => MockWeaveI18n.t(key, vars);

function refreshTabIdLine() {
  const line = document.getElementById("tabIdLine");
  if (!line) return;
  line.textContent =
    inspectedTabId != null ? t("tabIdLine", { id: inspectedTabId }) : t("tabIdMissing");
}

function onLocaleChanged() {
  MockWeaveI18n.apply(document);
  refreshTabIdLine();
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn && sendBtn.textContent !== t("sending")) sendBtn.textContent = t("sendBtn");
  if (isCreatingNewRule) {
    const title = document.getElementById("editRuleTitle");
    const save = document.getElementById("edSave");
    if (title) title.textContent = t("newRule");
    if (save && save.textContent !== t("waitingBody")) save.textContent = t("create");
  } else if (editingRuleId) {
    const title = document.getElementById("editRuleTitle");
    const save = document.getElementById("edSave");
    if (title) title.textContent = t("editRule");
    if (save) save.textContent = t("save");
  }
  if (!lastSendResult) clearSendResponse();
  void renderAll();
}

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
let isCreatingNewRule = false;
let activeView = "captured";
let selectedCapturedCid = null;
let selectedRuleId = null;
let lastSendResult = null;
let replayCaptureItem = null;
let savedRequestsCache = [];
let activeSavedRequestId = null;

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
 *  reqHeaders?: Record<string, string>,
 *  reqBody?: string | null,
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
    reqHeaders:
      partial.reqHeaders && typeof partial.reqHeaders === "object" ? partial.reqHeaders : {},
    reqBody: partial.reqBody != null ? String(partial.reqBody) : null,
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
  const reqHeaders = harHeadersArrayToObject(entry.request.headers);
  let reqBody = null;
  if (entry.request.postData && entry.request.postData.text) {
    reqBody = String(entry.request.postData.text);
  }
  return { method, url, status, resHeaders, resBody, bodyLoadState, reqHeaders, reqBody };
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
  const reqHeaders = harHeadersArrayToObject(inner.headers);
  let reqBody = null;
  if (inner.postData && inner.postData.text) reqBody = String(inner.postData.text);
  const response = req.response;
  if (!response) {
    return {
      method,
      url,
      status: 0,
      resHeaders: {},
      reqHeaders,
      reqBody
    };
  }
  const status = response.status != null ? response.status : 0;
  const resHeaders = stripResponseHeadersForMock(harHeadersArrayToObject(response.headers));
  return { method, url, status, resHeaders, reqHeaders, reqBody };
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
    setStatus(res?.error || t("statusMatchFailed"), "warn");
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
    setStatus(t("noInspectedTab"), "warn");
    return;
  }
  const res = await sendToBg({ type: "GET_STATE", tabId: inspectedTabId });
  if (!res?.ok) {
    setStatus(res?.error || t("statusLoadFailed"), "warn");
    return;
  }
  rulesCache = Array.isArray(res.rules) ? res.rules : [];
  const enabledEl = document.getElementById("enabledToggle");
  if (enabledEl) enabledEl.checked = !!res.enabled;
}

function setActiveView(view) {
  const views = ["captured", "rules", "send"];
  activeView = views.includes(view) ? view : "captured";
  for (const btn of document.querySelectorAll(".navTab")) {
    const on = btn.getAttribute("data-view") === activeView;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }
  const capPane = document.getElementById("capturedPane");
  const rulesPane = document.getElementById("rulesPane");
  const capTools = document.getElementById("capturedTools");
  const rulesTools = document.getElementById("rulesTools");
  const sidebar = document.getElementById("sidebar");
  const splitter = document.getElementById("splitter");
  const detailPane = document.getElementById("detailPane");
  const sendPane = document.getElementById("sendPane");
  const isSend = activeView === "send";
  if (capPane) capPane.hidden = activeView !== "captured";
  if (rulesPane) rulesPane.hidden = activeView !== "rules";
  if (capTools) capTools.hidden = activeView !== "captured";
  if (rulesTools) rulesTools.hidden = activeView !== "rules";
  if (sidebar) sidebar.hidden = isSend;
  if (splitter) splitter.hidden = isSend;
  if (detailPane) detailPane.hidden = isSend;
  if (sendPane) sendPane.hidden = !isSend;
  if (isSend) void loadSavedRequests();
}

function showDetailEmpty() {
  editingRuleId = null;
  isCreatingNewRule = false;
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
  if (cancelBtn) cancelBtn.textContent = t("close");

  const rule = matchByUrl.get(item.url) || null;
  title.textContent = rule ? t("capturedRequestMocked") : t("capturedRequest");

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

  replayCaptureItem = item;
  const replayBtn = document.getElementById("edReplaySend");
  if (replayBtn) replayBtn.hidden = false;

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
    saveBtn.textContent = item.bodyLoadState === "loading" ? t("waitingBody") : t("createMock");
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
    saveBtn.textContent = t("save");
    saveBtn.disabled = false;
  }
  const cancelBtn = document.getElementById("edCancel");
  if (cancelBtn) cancelBtn.textContent = t("close");
}

async function createMockFromCapture(cid) {
  let ent = captured.find((x) => x.cid === cid);
  if (!ent) return;
  if (ent.bodyLoadState === "loading") {
    setStatus(t("waitingBody"), "muted");
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
    setStatus(t("statusMockCreated"), "ok");
    setActiveView("rules");
    await refreshMatchMap();
    renderRulesTable();
    renderCapturedTable();
    if (res.rule) openRuleEditor(res.rule);
  } else {
    setStatus(res?.error || t("statusAddRuleFailed"), "warn");
  }
}
function parseHeadersJsonFromPanel(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(t("errHeadersObject"));
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
  isCreatingNewRule = false;
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
  if (title) title.textContent = t("editRule");
  if (delBtn) delBtn.hidden = false;
  if (saveBtn) {
    saveBtn.hidden = false;
    saveBtn.textContent = t("save");
    saveBtn.disabled = false;
  }
  const replayBtn = document.getElementById("edReplaySend");
  if (replayBtn) replayBtn.hidden = true;
  replayCaptureItem = null;

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

function openNewRuleEditor() {
  enableEditorFields();
  isCreatingNewRule = true;
  editingRuleId = null;
  selectedRuleId = null;
  selectedCapturedCid = null;
  replayCaptureItem = null;

  const empty = document.getElementById("detailEmpty");
  const editor = document.getElementById("detailEditor");
  const title = document.getElementById("editRuleTitle");
  const delBtn = document.getElementById("edDelete");
  const saveBtn = document.getElementById("edSave");
  const replayBtn = document.getElementById("edReplaySend");
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
  if (title) title.textContent = t("newRule");
  if (delBtn) delBtn.hidden = true;
  if (saveBtn) {
    saveBtn.hidden = false;
    saveBtn.textContent = t("create");
    saveBtn.disabled = false;
  }
  if (replayBtn) replayBtn.hidden = true;

  edKind.value = "response";
  edUrl.value = "";
  if (edUrlIncluded) edUrlIncluded.checked = false;
  edStatus.value = "200";
  edHeaders.value = '{\n  "Content-Type": "application/json"\n}';
  edBody.value = '{\n  "mocked": true\n}\n';
  if (edReqMethod) edReqMethod.value = "";
  if (edReqUrl) edReqUrl.value = "";
  if (edReqHeaders) edReqHeaders.value = "";
  if (edReqBody) edReqBody.value = "";

  syncEdModalMode();
  highlightSelectedRows();
  setActiveView("rules");
  setStatus(t("statusNewRuleHint"), "ok");
  setTimeout(() => edUrl.focus(), 50);
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
    body.innerHTML = `<tr><td colspan="3" class="muted">${t("rulesEmpty")}</td></tr>`;
    return;
  }
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="3" class="muted">${t("rulesNoFilter")}</td></tr>`;
    return;
  }
  body.innerHTML = "";
  for (const r of list) {
    if (!r) continue;
    const isReq = r.mockKind === "request";
    const kindTag = isReq
      ? `<span class="tag kindReq" title="${escapeAttr(t("tagReqTitle"))}">REQ</span> `
      : `<span class="tag kindRes" title="${escapeAttr(t("tagResTitle"))}">RES</span> `;
    const incTag = r.urlIncluded
      ? `<span class="kindInc" title="${escapeAttr(t("tagIncTitle"))}">INC</span> `
      : "";
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", r.id);
    if (selectedRuleId === r.id) tr.classList.add("selected");
    const short = (r.urlRegex || "").length > 100 ? (r.urlRegex || "").slice(0, 100) + "…" : r.urlRegex || "";
    const statusCell = isReq
      ? `<td class="muted" title="${escapeAttr(t("statusNotUsedReqMode"))}">${t("statusNotUsed")}</td>`
      : `<td><input class="statusField statusIn" data-id="${escapeAttr(
          r.id
        )}" type="number" min="100" max="599" value="${Number(
        r.status
      ) || 200}" title="${escapeAttr(t("statusClickApply"))}" aria-label="${escapeAttr(t("statusAriaHttp"))}" /></td>`;
    tr.innerHTML = `
      <td><input class="ruleOn" data-id="${escapeAttr(r.id)}" type="checkbox" ${r.enabled ? "checked" : ""} /></td>
      ${statusCell}
      <td class="urlCell" title="${escapeAttr(r.urlRegex || "")}">${kindTag}${incTag}${escapeHtml(short || t("urlEmpty"))}</td>
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
        setStatus(t("statusUpdated"), "ok");
      } else {
        e.target.checked = !e.target.checked;
        setStatus(res?.error || t("statusPatchFailed"), "warn");
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
        setStatus(t("statusStatusSaved"), "ok");
        await refreshMatchMap();
        renderCapturedTable();
      } else {
        setStatus(res?.error || t("statusSaveStatusFailed"), "warn");
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
    body.innerHTML = `<tr><td colspan="3" class="muted">${t("capturedEmpty")}</td></tr>`;
    return;
  }
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="3" class="muted">${t("capturedNoFilter")}</td></tr>`;
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
      <td>${c.status != null && c.status !== 0 ? escapeHtml(String(c.status)) : t("statusNotUsed")}${bodyLabel ? `<span class="bodyHint" title="${escapeAttr(t("resBodyCaptureTitle"))}">${bodyLabel}</span>` : ""}</td>
      <td class="urlCell" title="${escapeAttr(c.url)}">${mockLabel}${escapeHtml(c.url)}</td>
    `;
    tr.addEventListener("click", () => {
      setActiveView("captured");
      showCapturePreview(c);
      highlightSelectedRows();
    });
    tr.addEventListener("dblclick", (e) => {
      e.preventDefault();
      fillSendFromCapture(c);
    });
    body.appendChild(tr);
  }
}

async function renderAll() {
  await refreshMatchMap();
  renderRulesTable();
  renderCapturedTable();
  if (selectedCapturedCid && !editingRuleId && !isCreatingNewRule) {
    const item = captured.find((x) => x.cid === selectedCapturedCid);
    if (item) showCapturePreview(item);
  } else if (editingRuleId) {
    highlightSelectedRows();
  }
}

function getSendMode() {
  const el = document.querySelector('input[name="sendMode"]:checked');
  return el?.value === "page" ? "page" : "direct";
}

function normalizeCurlInput(raw) {
  return String(raw || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCurlCommand(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) i++;
    if (i >= input.length) break;
    const q = input[i];
    if (q === "'" || q === '"') {
      i++;
      let buf = "";
      while (i < input.length) {
        if (q === '"' && input[i] === "\\" && i + 1 < input.length) {
          buf += input[i + 1];
          i += 2;
          continue;
        }
        if (input[i] === q) {
          i++;
          break;
        }
        buf += input[i++];
      }
      tokens.push(buf);
      continue;
    }
    let buf = "";
    while (i < input.length && !/\s/.test(input[i])) buf += input[i++];
    tokens.push(buf);
  }
  return tokens;
}

const CURL_NO_ARG_FLAGS = new Set([
  "-s",
  "-S",
  "-i",
  "-I",
  "-L",
  "-k",
  "-v",
  "-g",
  "--compressed",
  "--silent",
  "--show-error",
  "--fail",
  "--location",
  "--insecure",
  "--verbose"
]);

/**
 * Parse a common `curl …` one-liner into Send form fields.
 * Supports -X, -H, -d/--data*, --json, --url, -u, -A, -b.
 */
function parseCurlCommand(raw) {
  let text = normalizeCurlInput(raw);
  if (!text) throw new Error(t("errCurlEmpty"));
  if (!/^curl\b/i.test(text)) throw new Error(t("errCurlMustStart"));
  text = text.replace(/^curl\s+/i, "");
  const tokens = tokenizeCurlCommand(text);
  let method = null;
  let url = "";
  const headers = {};
  let body = null;
  let bodyFromData = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const tl = t.toLowerCase();
    if (t.startsWith("http://") || t.startsWith("https://")) {
      url = t;
      continue;
    }
    if (CURL_NO_ARG_FLAGS.has(tl)) continue;
    if (tl === "-x" || tl === "--request") {
      method = (tokens[++i] || "GET").toUpperCase();
      continue;
    }
    if (tl === "-h" || tl === "--header") {
      const h = tokens[++i] || "";
      const colon = h.indexOf(":");
      if (colon >= 0) {
        headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
      }
      continue;
    }
    if (
      tl === "-d" ||
      tl === "--data" ||
      tl === "--data-raw" ||
      tl === "--data-binary" ||
      tl === "--data-urlencode" ||
      tl === "--json"
    ) {
      const val = tokens[++i] ?? "";
      if (val.startsWith("@")) {
        throw new Error(t("errCurlFile"));
      }
      body = val;
      bodyFromData = true;
      if (!method) method = "POST";
      continue;
    }
    if (tl === "--url") {
      url = tokens[++i] || "";
      continue;
    }
    if (tl === "-u" || tl === "--user") {
      const cred = tokens[++i] || "";
      const bytes = new TextEncoder().encode(cred);
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      headers.Authorization = "Basic " + btoa(bin);
      continue;
    }
    if (tl === "-a" || tl === "--user-agent") {
      headers["User-Agent"] = tokens[++i] || "";
      continue;
    }
    if (tl === "-b" || tl === "--cookie") {
      headers.Cookie = tokens[++i] || "";
      continue;
    }
    if (tl.startsWith("-")) {
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) i++;
      continue;
    }
  }

  if (!url) throw new Error(t("errCurlNoUrl"));
  if (!method) method = bodyFromData ? "POST" : "GET";
  return { method, url, headers, body: body != null ? body : "" };
}

function applyParsedCurl(parsed) {
  activeSavedRequestId = null;
  fillSendForm({
    method: parsed.method,
    url: parsed.url,
    headers: parsed.headers,
    body: parsed.body,
    sendMode: getSendMode(),
    savedId: null
  });
  clearSendResponse();
}

async function importCurlFromText(text, andSend = false) {
  const parsed = parseCurlCommand(text);
  applyParsedCurl(parsed);
  setStatus(andSend ? t("statusCurlImportedSending") : t("statusCurlImported"), "ok");
  if (andSend) await executeSend();
}

function readClipboardViaInspectedPage() {
  return new Promise((resolve) => {
    if (inspectedTabId == null) {
      resolve(null);
      return;
    }
    const expr = `(async function(){
      try {
        var t = await navigator.clipboard.readText();
        return { ok: true, text: t };
      } catch (e) {
        return { ok: false };
      }
    })()`;
    chrome.devtools.inspectedWindow.eval(expr, (result, exceptionInfo) => {
      if (exceptionInfo && exceptionInfo.isException) {
        resolve(null);
        return;
      }
      if (result && result.ok && typeof result.text === "string") {
        resolve(result.text);
        return;
      }
      resolve(null);
    });
  });
}

async function pasteCurlClipboard() {
  const ta = document.getElementById("sendCurlInput");
  if (!ta) return;
  ta.focus();

  const before = ta.value;
  try {
    if (document.queryCommandSupported?.("paste")) {
      document.execCommand("paste");
      if (ta.value !== before && ta.value.trim()) {
        setStatus(t("statusPasted"), "ok");
        return;
      }
    }
  } catch {
    /* execCommand paste blocked in some builds */
  }

  const fromPage = await readClipboardViaInspectedPage();
  if (fromPage != null && fromPage.trim()) {
    ta.value = fromPage;
    setStatus(t("statusPastedPage"), "ok");
    return;
  }

  ta.select();
  setStatus(t("statusPasteHint"), "muted");
}

function clearSendResponse() {
  lastSendResult = null;
  const meta = document.getElementById("sendMeta");
  const rh = document.getElementById("sendResHeaders");
  const rb = document.getElementById("sendResBody");
  const mockBtn = document.getElementById("sendMockBtn");
  if (meta) {
    meta.textContent = t("sendMetaEmpty");
    meta.className = "sendMeta muted";
  }
  if (rh) rh.value = "";
  if (rb) rb.value = "";
  if (mockBtn) mockBtn.hidden = true;
}

function setSendMode(mode) {
  const v = mode === "page" ? "page" : "direct";
  const el = document.querySelector(`input[name="sendMode"][value="${v}"]`);
  if (el) el.checked = true;
}

function updateSendDeleteButton() {
  const btn = document.getElementById("sendDeleteSavedBtn");
  if (btn) btn.hidden = !activeSavedRequestId;
}

function defaultSavedRequestName(url, method) {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").filter(Boolean).slice(-2).join("/") || u.hostname;
    return `${method} ${tail}`.slice(0, 72);
  } catch {
    return `${method} request`.slice(0, 72);
  }
}

function fillSendForm({ method, url, headers, body, sendMode, savedId = null }) {
  const methodEl = document.getElementById("sendMethod");
  const urlEl = document.getElementById("sendUrl");
  const reqHeadersEl = document.getElementById("sendReqHeaders");
  const reqBodyEl = document.getElementById("sendReqBody");
  if (methodEl) methodEl.value = method || "GET";
  if (urlEl) urlEl.value = url || "";
  const rh =
    headers && typeof headers === "object" && Object.keys(headers).length
      ? headers
      : { Accept: "application/json" };
  if (reqHeadersEl) reqHeadersEl.value = JSON.stringify(rh, null, 2);
  if (reqBodyEl) reqBodyEl.value = body != null ? String(body) : "";
  if (sendMode) setSendMode(sendMode);
  activeSavedRequestId = savedId;
  updateSendDeleteButton();
  renderSavedRequestsList();
}

function newSendForm() {
  activeSavedRequestId = null;
  fillSendForm({
    method: "GET",
    url: "",
    headers: {},
    body: "",
    sendMode: "direct",
    savedId: null
  });
  clearSendResponse();
  setStatus(t("statusNewRequest"), "ok");
}

async function loadSavedRequests() {
  const res = await sendToBg({ type: "GET_SAVED_REQUESTS" });
  if (res?.ok) {
    savedRequestsCache = Array.isArray(res.savedRequests) ? res.savedRequests : [];
    renderSavedRequestsList();
  }
}

function renderSavedRequestsList() {
  const list = document.getElementById("sendSavedList");
  if (!list) return;
  if (!savedRequestsCache.length) {
    list.innerHTML = `<div class="muted">${t("savedEmptyHint")}</div>`;
    return;
  }
  list.innerHTML = "";
  for (const item of savedRequestsCache) {
    if (!item) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sendSavedItem" + (item.id === activeSavedRequestId ? " selected" : "");
    btn.innerHTML = `<div class="sendSavedName">${escapeHtml(item.name || t("savedUnnamed"))}</div><div class="sendSavedMeta">${escapeHtml(item.method || "GET")} · ${escapeHtml(item.url || "")}</div>`;
    btn.addEventListener("click", () => {
      fillSendFromSaved(item);
      clearSendResponse();
      setStatus(t("statusLoadedSaved", { name: item.name || t("savedUnnamed") }), "ok");
    });
    list.appendChild(btn);
  }
}

function fillSendFromSaved(item) {
  if (!item) return;
  fillSendForm({
    method: item.method,
    url: item.url,
    headers: item.headers,
    body: item.body,
    sendMode: item.sendMode,
    savedId: item.id
  });
  setActiveView("send");
}

async function saveCurrentRequest(forceNew = false) {
  let req;
  try {
    req = readSendRequestFromForm();
  } catch (e) {
    setStatus(e?.message || String(e), "warn");
    return;
  }
  if (!req.url) {
    setStatus(t("statusUrlRequiredSave"), "warn");
    return;
  }
  const existing =
    !forceNew && activeSavedRequestId
      ? savedRequestsCache.find((r) => r && r.id === activeSavedRequestId)
      : null;
  let name = existing?.name || "";
  if (forceNew || !existing) {
    const suggested = defaultSavedRequestName(req.url, req.method);
    const entered = window.prompt(forceNew ? t("promptSaveAs") : t("promptNameRequest"), name || suggested);
    if (entered == null) return;
    name = entered.trim();
    if (!name) {
      setStatus(t("statusNameRequired"), "warn");
      return;
    }
  }
  const res = await sendToBg({
    type: "UPSERT_SAVED_REQUEST",
    request: {
      id: forceNew ? undefined : activeSavedRequestId || undefined,
      name,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      sendMode: getSendMode()
    }
  });
  if (res?.ok) {
    savedRequestsCache = res.savedRequests || savedRequestsCache;
    if (res.request) activeSavedRequestId = res.request.id;
    renderSavedRequestsList();
    updateSendDeleteButton();
    setStatus(forceNew || !existing ? t("statusRequestSaved") : t("statusRequestUpdated"), "ok");
  } else {
    setStatus(res?.error || t("statusSaveFailed"), "warn");
  }
}

async function deleteActiveSavedRequest() {
  if (!activeSavedRequestId) return;
  const item = savedRequestsCache.find((r) => r && r.id === activeSavedRequestId);
  const label = item?.name || t("deleteSavedDefault");
  if (!window.confirm(t("confirmDeleteSaved", { name: label }))) return;
  const res = await sendToBg({ type: "DELETE_SAVED_REQUEST", id: activeSavedRequestId });
  if (res?.ok) {
    savedRequestsCache = res.savedRequests || [];
    activeSavedRequestId = null;
    updateSendDeleteButton();
    renderSavedRequestsList();
    setStatus(t("statusSavedDeleted"), "ok");
  } else {
    setStatus(res?.error || t("statusDeleteFailed"), "warn");
  }
}

function fillSendFromCapture(item) {
  if (!item) return;
  const rh =
    item.reqHeaders && Object.keys(item.reqHeaders).length
      ? item.reqHeaders
      : { Accept: "application/json" };
  fillSendForm({
    method: item.method,
    url: item.url,
    headers: rh,
    body: item.reqBody,
    sendMode: "page",
    savedId: null
  });
  clearSendResponse();
  setActiveView("send");
  setStatus(t("statusLoadedCapture"), "ok");
}

function readSendRequestFromForm() {
  const method = (document.getElementById("sendMethod")?.value || "GET").toUpperCase();
  const url = (document.getElementById("sendUrl")?.value || "").trim();
  const headersText = document.getElementById("sendReqHeaders")?.value || "";
  const body = document.getElementById("sendReqBody")?.value ?? "";
  let headers = {};
  if (headersText.trim()) {
    headers = parseHeadersJsonFromPanel(headersText);
  }
  return { method, url, headers, body };
}

function renderSendResult(result) {
  lastSendResult = result;
  const meta = document.getElementById("sendMeta");
  const rh = document.getElementById("sendResHeaders");
  const rb = document.getElementById("sendResBody");
  const mockBtn = document.getElementById("sendMockBtn");
  if (!meta || !rh || !rb) return;

  if (!result?.ok) {
    const via = result?.via || "?";
    const ms = result?.ms != null ? `, ${result.ms} ms` : "";
    meta.textContent = t("sendMetaError", {
      via,
      ms,
      error: result?.error || t("statusRequestFailed")
    });
    meta.className = "sendMeta warn";
    rh.value = "";
    rb.value = "";
    if (mockBtn) mockBtn.hidden = true;
    return;
  }

  const viaLabel = result.via === "page" ? t("viaPage") : t("viaDirect");
  meta.textContent = `${result.status} ${result.statusText || ""} · ${result.ms} ms · ${viaLabel}`.trim();
  meta.className = result.status >= 200 && result.status < 400 ? "sendMeta ok" : "sendMeta warn";
  rh.value = JSON.stringify(result.headers || {}, null, 2);
  rb.value = result.body != null ? String(result.body) : "";
  if (mockBtn) mockBtn.hidden = false;
}

function sendViaPage({ method, url, headers, body }) {
  return new Promise((resolve) => {
    if (inspectedTabId == null) {
      resolve({ ok: false, error: t("statusNoInspectedSend"), via: "page" });
      return;
    }
    const hasBody = body && method !== "GET" && method !== "HEAD";
    const expr = `(async function(){
      const t0 = performance.now();
      try {
        const opts = { method: ${JSON.stringify(method)}, credentials: "include", headers: ${JSON.stringify(headers)} };
        ${hasBody ? `opts.body = ${JSON.stringify(body)};` : ""}
        const res = await fetch(${JSON.stringify(url)}, opts);
        const text = await res.text();
        const hdrs = {};
        res.headers.forEach(function(v, k) { hdrs[k] = v; });
        var b = text;
        if (b.length > 1000000) b = b.slice(0, 1000000) + "\\n\\n... [response truncated] ...";
        return { ok: true, status: res.status, statusText: res.statusText, headers: hdrs, body: b, ms: Math.round(performance.now() - t0), via: "page" };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e), ms: Math.round(performance.now() - t0), via: "page" };
      }
    })()`;
    chrome.devtools.inspectedWindow.eval(expr, (result, exceptionInfo) => {
      if (exceptionInfo && exceptionInfo.isException) {
        resolve({
          ok: false,
          error: String(exceptionInfo.value || exceptionInfo.description || t("errPageEvalFailed")),
          via: "page"
        });
        return;
      }
      resolve(result || { ok: false, error: t("errPageEmptyResult"), via: "page" });
    });
  });
}

async function executeSend() {
  let req;
  try {
    req = readSendRequestFromForm();
  } catch (e) {
    setStatus(e?.message || String(e), "warn");
    return;
  }
  if (!req.url) {
    setStatus(t("statusUrlRequired"), "warn");
    return;
  }

  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = t("sending");
  }
  setStatus(getSendMode() === "page" ? t("statusSendingPage") : t("statusSendingDirect"));

  try {
    let result;
    if (getSendMode() === "page") {
      result = await sendViaPage(req);
    } else {
      result = await sendToBg({
        type: "SEND_HTTP",
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
      });
    }
    renderSendResult(result);
    if (result?.ok) setStatus(t("statusResponseReceived"), "ok");
    else setStatus(result?.error || t("statusRequestFailed"), "warn");
  } catch (e) {
    renderSendResult({ ok: false, error: e?.message || String(e), via: getSendMode() });
    setStatus(e?.message || String(e), "warn");
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = t("sendBtn");
    }
  }
}

async function createMockFromSendResponse() {
  if (!lastSendResult?.ok) return;
  const req = readSendRequestFromForm();
  const headers = { ...(lastSendResult.headers || {}) };
  if (Object.keys(headers).length === 0) {
    headers["Content-Type"] = "text/plain; charset=utf-8";
  }
  const res = await sendToBg({
    type: "ADD_RULE",
    rule: {
      urlRegex: req.url,
      status: lastSendResult.status || 200,
      headers,
      body: lastSendResult.body != null ? String(lastSendResult.body) : "",
      enabled: true
    }
  });
  if (res?.ok) {
    rulesCache = res.rules || rulesCache;
    setStatus(t("statusMockFromSend"), "ok");
    setActiveView("rules");
    await refreshMatchMap();
    renderRulesTable();
    renderCapturedTable();
    if (res.rule) openRuleEditor(res.rule);
  } else {
    setStatus(res?.error || t("statusCreateMockFailed"), "warn");
  }
}

function wireSend() {
  document.getElementById("sendBtn")?.addEventListener("click", () => void executeSend());
  document.getElementById("sendMockBtn")?.addEventListener("click", () => void createMockFromSendResponse());
  document.getElementById("sendSaveBtn")?.addEventListener("click", () => void saveCurrentRequest(false));
  document.getElementById("sendSaveAsBtn")?.addEventListener("click", () => void saveCurrentRequest(true));
  document.getElementById("sendDeleteSavedBtn")?.addEventListener("click", () => void deleteActiveSavedRequest());
  document.getElementById("sendSavedNew")?.addEventListener("click", () => newSendForm());
  document.getElementById("sendCurlPaste")?.addEventListener("click", () => void pasteCurlClipboard());
  document.getElementById("sendCurlInput")?.addEventListener("paste", () => {
    setStatus(t("statusPastedCurl"), "ok");
  });
  document.getElementById("sendCurlImport")?.addEventListener("click", () => {
    const text = document.getElementById("sendCurlInput")?.value || "";
    try {
      void importCurlFromText(text, false);
    } catch (e) {
      setStatus(e?.message || String(e), "warn");
    }
  });
  document.getElementById("sendCurlImportSend")?.addEventListener("click", () => {
    const text = document.getElementById("sendCurlInput")?.value || "";
    try {
      void importCurlFromText(text, true);
    } catch (e) {
      setStatus(e?.message || String(e), "warn");
    }
  });
  document.getElementById("edReplaySend")?.addEventListener("click", () => {
    if (replayCaptureItem) fillSendFromCapture(replayCaptureItem);
  });
  document.getElementById("sendUrl")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void executeSend();
  });
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

async function buildRulePayloadFromEditor() {
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
  if (!edUrl) return null;
  const urlRegex = edUrl.value.trim();
  if (!urlRegex) {
    setStatus(t("statusUrlPatternRequired"), "warn");
    return null;
  }
  const kind = edKind?.value === "request" ? "request" : "response";
  const base = {
    urlRegex,
    mockKind: kind,
    urlIncluded: !!edUrlIncluded?.checked,
    enabled: true
  };
  if (kind === "response") {
    if (!edStatus || !edHeaders || !edBody) return null;
    let headersObj;
    if (edHeaders.value.trim()) {
      try {
        headersObj = parseHeadersJsonFromPanel(edHeaders.value);
      } catch (err) {
        setStatus(err?.message || String(err), "warn");
        return null;
      }
    }
    return {
      ...base,
      status: Number(edStatus.value) || 200,
      body: edBody.value,
      headers: headersObj ?? { "Content-Type": "application/json" }
    };
  }
  let rHeaders;
  if (edReqHeaders?.value?.trim()) {
    try {
      rHeaders = parseHeadersJsonFromPanel(edReqHeaders.value);
    } catch (err) {
      setStatus(err?.message || String(err), "warn");
      return null;
    }
  } else {
    rHeaders = {};
  }
  const prev = editingRuleId ? findRuleById(editingRuleId) : null;
  const hadBody = prev && Object.prototype.hasOwnProperty.call(prev, "requestBody");
  const rawBody = edReqBody?.value ?? "";
  const out = {
    ...base,
    requestMethod: edReqMethod?.value?.trim() || null,
    requestUrl: edReqUrl?.value?.trim() || null,
    requestHeaders: rHeaders
  };
  if (rawBody.trim() !== "" || hadBody) {
    out.requestBody = rawBody.trim() === "" ? null : rawBody;
  }
  return out;
}

async function createRuleFromEditor() {
  const rule = await buildRulePayloadFromEditor();
  if (!rule) return;
  const res = await sendToBg({ type: "ADD_RULE", rule });
  if (res?.ok) {
    isCreatingNewRule = false;
    rulesCache = res.rules || rulesCache;
    setStatus(t("statusRuleCreated"), "ok");
    await refreshMatchMap();
    renderRulesTable();
    renderCapturedTable();
    if (res.rule) openRuleEditor(res.rule, { keepSelection: true });
  } else {
    setStatus(res?.error || t("statusCreateFailed"), "warn");
  }
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
  if (!payload.urlRegex) {
    setStatus(t("statusUrlPatternRequired"), "warn");
    return;
  }
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
    setStatus(t("statusRuleSaved"), "ok");
    await refreshMatchMap();
    renderRulesTable();
    renderCapturedTable();
    const updated = findRuleById(editingRuleId);
    if (updated) openRuleEditor(updated, { keepSelection: true });
  } else {
    setStatus(res?.error || t("statusSaveFailed"), "warn");
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
    if (isCreatingNewRule) {
      await createRuleFromEditor();
      return;
    }
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
      setStatus(t("statusRuleDeleted"), "ok");
    } else {
      setStatus(res?.error || t("statusDeleteFailed"), "warn");
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
  await MockWeaveI18n.init();
  MockWeaveI18n.apply(document);
  MockWeaveI18n.wireLangSwitch(document);
  window.addEventListener("mockweave-locale-change", onLocaleChanged);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.locale) {
      void MockWeaveI18n.init().then(() => onLocaleChanged());
    }
  });

  wireFilterInputs();
  wireNavTabs();
  wireSplitter();
  wireDetailEditor();
  wireSend();
  setActiveView("captured");
  inspectedTabId = getInspectedTabId();
  refreshTabIdLine();

  if (inspectedTabId == null) {
    const enabledEl = document.getElementById("enabledToggle");
    if (enabledEl) enabledEl.disabled = true;
  }

  const enabledToggle = document.getElementById("enabledToggle");
  if (enabledToggle) {
    enabledToggle.addEventListener("change", async () => {
      if (inspectedTabId == null) return;
      setStatus(enabledToggle.checked ? t("statusEnabling") : t("statusDisabling"));
      const res = await sendToBg({
        type: "SET_ENABLED",
        tabId: inspectedTabId,
        enabled: enabledToggle.checked
      });
      if (res?.ok) {
        setStatus(enabledToggle.checked ? t("statusEnabled") : t("statusDisabled"), "ok");
      } else {
        enabledToggle.checked = !enabledToggle.checked;
        setStatus(res?.error || t("statusToggleFailed"), "warn");
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
    setStatus(t("statusRefreshed"), "ok");
  });

  document.getElementById("addRuleBtn")?.addEventListener("click", () => {
    setActiveView("rules");
    openNewRuleEditor();
  });

  if (inspectedTabId != null) {
    await loadState();
  } else {
    setStatus(t("statusFixTabId"), "warn");
  }

  seedFromHar();

  try {
    chrome.devtools.network.onRequestFinished.addListener((req) => {
      ingestDevToolsRequestFinished(req);
    });
  } catch (e) {
    setStatus(t("statusNetworkUnavailable"), "warn");
  }

  await renderAll();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.savedRequests) {
      savedRequestsCache = Array.isArray(changes.savedRequests.newValue)
        ? changes.savedRequests.newValue
        : [];
      renderSavedRequestsList();
    }
    if (area === "local" && changes.rules) {
      (async () => {
        if (inspectedTabId != null) {
          const res = await sendToBg({ type: "GET_STATE", tabId: inspectedTabId });
          if (res?.ok) {
            rulesCache = Array.isArray(res.rules) ? res.rules : [];
            const enabledEl = document.getElementById("enabledToggle");
            if (enabledEl) enabledEl.checked = !!res.enabled;
          }
        }
        await renderAll();
      })();
    }
  });
}

main().catch((e) => setStatus(e?.message || String(e), "warn"));
