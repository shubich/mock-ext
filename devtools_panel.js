/* global chrome */

const MAX_CAPTURED = 200;

let inspectedTabId = null;
let captured = [];
let rulesCache = [];
let matchByUrl = new Map();
let _renderTimer = null;
let filterCaptured = "";
let filterRules = "";
let editingRuleId = null;

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
    try {
      if (JSON.stringify(r.headers || {}).toLowerCase().includes(f)) return true;
    } catch (e) {
      /* ignore */
    }
    return false;
  });
}

function harEntryToCaptured(entry) {
  if (!entry || !entry.request) return null;
  return {
    method: (entry.request.method || "GET").toUpperCase(),
    url: String(entry.request.url || ""),
    status: entry.response && entry.response.status != null ? entry.response.status : 0
  };
}

function requestFinishedToCaptured(req) {
  if (!req) return null;
  const inner = req.request || req;
  const method = (inner.method || req.method || "GET").toString().toUpperCase();
  const url = String((inner && inner.url) || req.url || "");
  const response = req.response || inner.response;
  const status = response && response.status != null ? response.status : 0;
  if (!url) return null;
  return { method, url, status };
}

function addCapturedEntry(entry) {
  if (!entry || !entry.url) return;
  const key = `${entry.method} ${entry.url}`;
  const others = captured.filter((e) => e._key !== key);
  const next = {
    _key: key,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    t: Date.now()
  };
  others.unshift(next);
  captured = others.slice(0, MAX_CAPTURED);
  scheduleRender();
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

function openRuleEditor(rule) {
  if (!rule) return;
  editingRuleId = rule.id;
  const modal = document.getElementById("ruleModal");
  const edUrl = document.getElementById("edUrl");
  const edStatus = document.getElementById("edStatus");
  const edHeaders = document.getElementById("edHeaders");
  const edBody = document.getElementById("edBody");
  if (!modal || !edUrl || !edStatus || !edHeaders || !edBody) return;
  const full = findRuleById(rule.id) || rule;
  edUrl.value = full.urlRegex || "";
  edStatus.value = String(full.status != null ? full.status : 200);
  const h = full.headers && typeof full.headers === "object" ? full.headers : {};
  const prettyH = Object.keys(h).length ? JSON.stringify(h, null, 2) : "";
  edHeaders.value = prettyH;
  edBody.value = full.body != null ? String(full.body) : "";
  modal.hidden = false;
  setTimeout(() => edBody.focus(), 50);
}

function closeRuleEditor() {
  editingRuleId = null;
  const modal = document.getElementById("ruleModal");
  if (modal) modal.hidden = true;
}

function renderRulesTable() {
  const body = document.getElementById("rulesBody");
  if (!body) return;
  const list = getFilteredRules();
  if (!rulesCache.length) {
    body.innerHTML = `<tr><td colspan="4" class="muted">No rules yet. Mock a request above or add rules in the extension popup.</td></tr>`;
    return;
  }
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="4" class="muted">No rules match the filter. Clear the search or change the query.</td></tr>`;
    return;
  }
  body.innerHTML = "";
  for (const r of list) {
    if (!r) continue;
    const tr = document.createElement("tr");
    const short = (r.urlRegex || "").length > 100 ? (r.urlRegex || "").slice(0, 100) + "…" : r.urlRegex || "";
    tr.innerHTML = `
      <td><input class="ruleOn" data-id="${escapeAttr(r.id)}" type="checkbox" ${r.enabled ? "checked" : ""} /></td>
      <td><input class="statusField statusIn" data-id="${escapeAttr(
        r.id
      )}" type="number" min="100" max="599" value="${Number(
      r.status
    ) || 200}" title="Click away or Enter to apply" aria-label="HTTP status" /></td>
      <td class="urlCell" title="${escapeAttr(r.urlRegex || "")}">${escapeHtml(short || "(empty)")}</td>
      <td>
        <div class="btnRow">
          <button type="button" class="btn sm editRule" data-id="${escapeAttr(r.id)}">Edit</button>
          <button type="button" class="btn danger sm delRule" data-id="${escapeAttr(r.id)}">Delete</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  }
  for (const cb of body.querySelectorAll("input.ruleOn")) {
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
    const apply = async (e) => {
      const id = e.target.getAttribute("data-id");
      const n = Number(e.target.value);
      if (!id || n < 100 || n > 599) {
        e.target.value = String(findRuleById(id)?.status || 200);
        return;
      }
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
  for (const b of body.querySelectorAll("button.editRule")) {
    b.addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-id");
      const rule = findRuleById(id);
      if (rule) openRuleEditor(rule);
    });
  }
  for (const b of body.querySelectorAll("button.delRule")) {
    b.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      const res = await sendToBg({ type: "DELETE_RULE", id });
      if (res?.ok) {
        rulesCache = res.rules || [];
        if (editingRuleId === id) closeRuleEditor();
        renderRulesTable();
        await refreshMatchMap();
        renderCapturedTable();
        setStatus("Rule deleted", "ok");
      } else {
        setStatus(res?.error || "Delete failed", "warn");
      }
    });
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
    body.innerHTML = `<tr><td colspan="4" class="muted">No requests captured yet. Trigger API calls, or hard-reload the page with DevTools open (Network: disable cache) to capture more.</td></tr>`;
    return;
  }
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="4" class="muted">No requests match the URL filter.</td></tr>`;
    return;
  }
  body.innerHTML = "";
  for (const c of shown) {
    const rule = matchByUrl.get(c.url) || null;
    const tr = document.createElement("tr");
    const actionCell = rule
      ? `<div class="btnRow"><span class="tag">Mocked</span><button type="button" class="btn sm editFromCap" data-rule-id="${escapeAttr(
          rule.id
        )}">Edit</button></div>`
      : `<button type="button" class="btn sm mockBtn" data-url="${escapeAttr(c.url)}">Mock</button>`;
    tr.innerHTML = `
      <td>${escapeHtml(c.method)}</td>
      <td>${c.status != null && c.status !== 0 ? escapeHtml(String(c.status)) : "—"}</td>
      <td class="urlCell" title="${escapeAttr(c.url)}">${escapeHtml(c.url)}</td>
      <td class="thActions">${actionCell}</td>
    `;
    body.appendChild(tr);
  }
  for (const b of body.querySelectorAll("button.mockBtn")) {
    b.addEventListener("click", async (e) => {
      const url = e.target.getAttribute("data-url");
      const res = await sendToBg({
        type: "ADD_RULE",
        rule: {
          urlRegex: url,
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: '{\n  "mocked": true\n}\n',
          enabled: true
        }
      });
      if (res?.ok) {
        rulesCache = res.rules || rulesCache;
        setStatus("Mock rule added for this URL", "ok");
        await refreshMatchMap();
        renderRulesTable();
        renderCapturedTable();
      } else {
        setStatus(res?.error || "Add rule failed", "warn");
      }
    });
  }
  for (const b of body.querySelectorAll("button.editFromCap")) {
    b.addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-rule-id");
      const rule = findRuleById(id);
      if (rule) openRuleEditor(rule);
    });
  }
}

async function renderAll() {
  await refreshMatchMap();
  renderRulesTable();
  renderCapturedTable();
}

function seedFromHar() {
  try {
    chrome.devtools.network.getHAR((har) => {
      if (!har || !har.log || !Array.isArray(har.log.entries)) return;
      const entries = har.log.entries.slice(-MAX_CAPTURED);
      for (const e of entries) {
        const c = harEntryToCaptured(e);
        if (c) addCapturedEntry(c);
      }
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

function wireModal() {
  const modal = document.getElementById("ruleModal");
  const cancel = document.getElementById("edCancel");
  const save = document.getElementById("edSave");
  cancel?.addEventListener("click", () => closeRuleEditor());
  save?.addEventListener("click", async () => {
    if (!editingRuleId) return;
    const edUrl = document.getElementById("edUrl");
    const edStatus = document.getElementById("edStatus");
    const edHeaders = document.getElementById("edHeaders");
    const edBody = document.getElementById("edBody");
    if (!edUrl || !edStatus || !edHeaders || !edBody) return;
    let headersObj;
    if (edHeaders.value.trim()) {
      try {
        headersObj = parseHeadersJsonFromPanel(edHeaders.value);
      } catch (err) {
        setStatus(err?.message || String(err), "warn");
        return;
      }
    }
    const res = await sendToBg({
      type: "PATCH_RULE",
      id: editingRuleId,
      urlRegex: edUrl.value.trim(),
      status: Number(edStatus.value) || 200,
      body: edBody.value,
      ...(headersObj !== undefined ? { headers: headersObj } : {})
    });
    if (res?.ok) {
      rulesCache = res.rules || rulesCache;
      setStatus("Rule saved", "ok");
      closeRuleEditor();
      await refreshMatchMap();
      renderRulesTable();
      renderCapturedTable();
    } else {
      setStatus(res?.error || "Save failed", "warn");
    }
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeRuleEditor();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.hidden) {
      e.preventDefault();
      closeRuleEditor();
    }
  });
}

async function main() {
  wireFilterInputs();
  wireModal();
  inspectedTabId = getInspectedTabId();
  const line = document.getElementById("tabIdLine");
  if (line) {
    line.textContent =
      inspectedTabId != null
        ? `Inspected tab id: ${inspectedTabId} — enable mocking here or in the popup.`
        : "Could not read inspected tab id. Update Chrome, or re-open DevTools on a normal page tab.";
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
      const c = requestFinishedToCaptured(req);
      if (c) addCapturedEntry(c);
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
