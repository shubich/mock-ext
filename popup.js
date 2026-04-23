async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") throw new Error("No active tab");
  return tab.id;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}

function setStatus(text, kind = "muted") {
  const el = byId("statusLine");
  el.textContent = text;
  el.style.color =
    kind === "ok" ? "var(--ok)" : kind === "warn" ? "var(--warn)" : "var(--muted)";
}

async function callBackground(message) {
  return await chrome.runtime.sendMessage(message);
}

function parseHeadersJson(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Headers JSON must be an object");
  }
  const out = {};
  for (const [k, v] of Object.entries(parsed)) out[String(k)] = String(v);
  return out;
}

function parseUrlMatcherInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { mode: "none", source: "" };
  if (raw.startsWith("re:")) return { mode: "regex", source: raw.slice(3).trim() };
  if (raw.startsWith("lit:")) return { mode: "literal", source: raw.slice(4).trim() };
  if (/^https?:\/\//i.test(raw)) return { mode: "literal", source: raw };
  return { mode: "regex", source: raw };
}

function syncRuleKindInNode(node) {
  const kindEl = node.querySelector(".ruleKind");
  const resBlock = node.querySelector(".ruleResponseFields");
  const reqBlock = node.querySelector(".ruleRequestFields");
  if (!kindEl || !resBlock || !reqBlock) return;
  const isReq = kindEl.value === "request";
  resBlock.toggleAttribute("hidden", isReq);
  reqBlock.toggleAttribute("hidden", !isReq);
}

function renderRules(rules, onChange) {
  const list = byId("rulesList");
  list.innerHTML = "";

  const tpl = byId("ruleTemplate");
  for (const rule of rules) {
    const node = tpl.content.firstElementChild.cloneNode(true);

    const enabledEl = node.querySelector(".ruleEnabled");
    const regexEl = node.querySelector(".ruleRegex");
    const kindEl = node.querySelector(".ruleKind");
    const statusEl = node.querySelector(".ruleStatus");
    const contentTypeEl = node.querySelector(".ruleContentType");
    const headersEl = node.querySelector(".ruleHeaders");
    const bodyEl = node.querySelector(".ruleBody");
    const reqMethodEl = node.querySelector(".ruleRequestMethod");
    const reqUrlEl = node.querySelector(".ruleRequestUrl");
    const reqHeadersEl = node.querySelector(".ruleRequestHeaders");
    const reqBodyEl = node.querySelector(".ruleRequestBody");
    const delBtn = node.querySelector(".ruleDelete");

    const kind = rule.mockKind === "request" ? "request" : "response";
    if (kindEl) kindEl.value = kind;

    enabledEl.checked = !!rule.enabled;
    regexEl.value = rule.urlRegex || "";
    statusEl.value = String(rule.status != null && rule.status > 0 ? rule.status : 200);
    bodyEl.value = rule.body ?? "";

    const headers = rule.headers && typeof rule.headers === "object" ? rule.headers : {};
    const prettyHeaders = JSON.stringify(headers, null, 2);
    headersEl.value = prettyHeaders === "{}" ? "" : prettyHeaders;
    contentTypeEl.value = headers["Content-Type"] || headers["content-type"] || "";

    reqMethodEl.value = rule.requestMethod || "";
    reqUrlEl.value = rule.requestUrl || "";
    const rrh = rule.requestHeaders && typeof rule.requestHeaders === "object" ? rule.requestHeaders : {};
    const pRh = JSON.stringify(rrh, null, 2);
    reqHeadersEl.value = pRh === "{}" ? "" : pRh;
    if (Object.prototype.hasOwnProperty.call(rule, "requestBody")) {
      reqBodyEl.value = rule.requestBody != null ? String(rule.requestBody) : "";
    } else {
      reqBodyEl.value = "";
    }

    syncRuleKindInNode(node);

    const emit = () => onChange();
    enabledEl.addEventListener("change", emit);
    regexEl.addEventListener("input", emit);
    kindEl.addEventListener("change", () => {
      syncRuleKindInNode(node);
      emit();
    });
    statusEl.addEventListener("input", emit);
    headersEl.addEventListener("input", emit);
    bodyEl.addEventListener("input", emit);
    contentTypeEl.addEventListener("input", () => {
      // Keep Content-Type mirrored into headers JSON for convenience.
      emit();
    });
    reqMethodEl.addEventListener("input", emit);
    reqUrlEl.addEventListener("input", emit);
    reqHeadersEl.addEventListener("input", emit);
    reqBodyEl.addEventListener("input", emit);

    delBtn.addEventListener("click", () => {
      const idx = rules.findIndex((r) => r.id === rule.id);
      if (idx >= 0) {
        rules.splice(idx, 1);
        renderRules(rules, onChange);
        onChange();
      }
    });

    list.appendChild(node);
  }
}

function collectRulesFromUI(rules) {
  const list = byId("rulesList");
  const nodes = Array.from(list.querySelectorAll(".rule"));

  const next = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const enabled = node.querySelector(".ruleEnabled").checked;
    const urlRegex = node.querySelector(".ruleRegex").value.trim();
    const mockKind = node.querySelector(".ruleKind")?.value === "request" ? "request" : "response";

    // Preserve stable id ordering based on original rules array index.
    const id = rules[i]?.id || uid();

    if (mockKind === "request") {
      const reqHeadersText = node.querySelector(".ruleRequestHeaders").value;
      const reqBodyText = node.querySelector(".ruleRequestBody").value;
      let requestHeaders;
      if ((reqHeadersText || "").trim()) {
        requestHeaders = parseHeadersJson(reqHeadersText);
      } else {
        requestHeaders = {};
      }
      const row = {
        id,
        enabled,
        urlRegex,
        mockKind: "request",
        status: 0,
        headers: {},
        body: ""
      };
      const rm = node.querySelector(".ruleRequestMethod").value.trim();
      const ru = node.querySelector(".ruleRequestUrl").value.trim();
      if (rm) row.requestMethod = rm;
      if (ru) row.requestUrl = ru;
      if (Object.keys(requestHeaders).length) row.requestHeaders = requestHeaders;
      if ((reqBodyText || "").trim() !== "" || findPrevHadRequestBody(rules, i)) {
        if ((reqBodyText || "").trim() === "") {
          row.requestBody = null;
        } else {
          row.requestBody = reqBodyText;
        }
      }
      next.push(row);
    } else {
      const status = Number(node.querySelector(".ruleStatus").value) || 200;
      const headersText = node.querySelector(".ruleHeaders").value;
      const contentType = node.querySelector(".ruleContentType").value.trim();
      const body = node.querySelector(".ruleBody").value;
      const headers = parseHeadersJson(headersText);
      if (contentType) headers["Content-Type"] = contentType;
      next.push({ id, enabled, urlRegex, mockKind: "response", status, headers, body });
    }
  }

  return next;
}

function findPrevHadRequestBody(rules, index) {
  const r = rules[index];
  return r && Object.prototype.hasOwnProperty.call(r, "requestBody");
}

let activeTabId = null;
let rulesModel = [];
let saveTimer = null;

async function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const nextRules = collectRulesFromUI(rulesModel);

      // Quick validation:
      // - enabled rule must have non-empty matcher
      // - if it's regex mode, it must compile
      for (const r of nextRules) {
        if (!r.enabled) continue;
        if (!r.urlRegex) throw new Error("Enabled rule missing URL regex");
        const matcher = parseUrlMatcherInput(r.urlRegex);
        if (matcher.mode === "none" || !matcher.source) {
          throw new Error("Enabled rule missing URL matcher");
        }
        if (matcher.mode === "regex") {
          // eslint-disable-next-line no-new
          new RegExp(matcher.source);
        }
      }

      rulesModel = nextRules;
      const res = await callBackground({ type: "UPSERT_RULES", rules: rulesModel });
      if (!res?.ok) throw new Error(res?.error || "Failed to save rules");
      setStatus("Saved", "ok");
    } catch (e) {
      setStatus(e?.message || String(e), "warn");
    }
  }, 350);
}

async function init() {
  try {
    activeTabId = await getActiveTabId();
  } catch (e) {
    setStatus("Open a normal tab to use mocking.", "warn");
    byId("enabledToggle").disabled = true;
    return;
  }

  const state = await callBackground({ type: "GET_STATE", tabId: activeTabId });
  if (!state?.ok) {
    setStatus("Failed to load state", "warn");
    return;
  }

  rulesModel = Array.isArray(state.rules) ? state.rules : [];
  const enabledToggle = byId("enabledToggle");
  enabledToggle.checked = !!state.enabled;

  enabledToggle.addEventListener("change", async () => {
    try {
      setStatus(enabledToggle.checked ? "Enabling…" : "Disabling…");
      const res = await callBackground({
        type: "SET_ENABLED",
        tabId: activeTabId,
        enabled: enabledToggle.checked
      });
      if (!res?.ok) throw new Error(res?.error || "Failed");
      setStatus(enabledToggle.checked ? "Enabled for this tab" : "Disabled for this tab", "ok");
    } catch (e) {
      enabledToggle.checked = !enabledToggle.checked;
      setStatus(e?.message || String(e), "warn");
    }
  });

  const addBtn = byId("addRuleBtn");
  addBtn.addEventListener("click", () => {
    rulesModel.unshift({
      id: uid(),
      enabled: true,
      urlRegex: "",
      mockKind: "response",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: "{\n  \"mocked\": true\n}\n"
    });
    renderRules(rulesModel, scheduleSave);
    scheduleSave();
  });

  renderRules(rulesModel, scheduleSave);
  setStatus(enabledToggle.checked ? "Enabled for this tab" : "Disabled for this tab");
}

init().catch((e) => setStatus(e?.message || String(e), "warn"));

