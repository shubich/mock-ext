/**
 * MockWeave UI i18n (en / ru). Load before popup.js or devtools_panel.js.
 */
(function (global) {
  const STORAGE_KEY = "locale";

  const MESSAGES = {
    en: {
      langEn: "EN",
      langRu: "RU",
      langAria: "Language",
      themeAria: "Theme",
      themeDark: "Dark",
      themeLight: "Light",
      themeDarkTitle: "Dark theme",
      themeLightTitle: "Light theme",
      intercept: "Intercept HTTP for the inspected page",
      tabCaptured: "Captured",
      tabRules: "Rules",
      tabSend: "Send",
      filterCaptured: "Filter by URL",
      filterRules: "Filter URL, status, body",
      clear: "Clear",
      refresh: "Refresh",
      exportRules: "Export",
      importRules: "Import",
      addRule: "Add rule",
      thOrder: "Order",
      duplicateRule: "Duplicate",
      rulesOrderHint: "First matching rule wins — use ↑↓ to change priority.",
      ruleMoveUp: "Move up",
      ruleMoveDown: "Move down",
      statusRuleDuplicated: "Rule duplicated",
      statusRuleMoved: "Rule order updated",
      thMethod: "Method",
      thStatus: "Status",
      thUrl: "URL",
      thOn: "On",
      thUrlPattern: "URL / pattern",
      detailEmptyHint:
        "Select a captured request or rule on the left, click <strong>Add rule</strong> on Rules, or use <strong>Send</strong> to replay HTTP manually. Edit response body and headers here with full panel height.",
      detailCaptured: "<strong>Captured</strong> — traffic while DevTools is open",
      detailRules: "<strong>Rules</strong> — active mocks (same storage as the toolbar popup)",
      detailSend: "<strong>Send</strong> — Postman-style replay (direct or via page for mocks)",
      editRule: "Edit rule",
      newRule: "New rule",
      capturedRequest: "Captured request",
      capturedRequestMocked: "Captured request (mocked)",
      replayInSend: "Replay in Send",
      close: "Close",
      save: "Save",
      create: "Create",
      delete: "Delete",
      labelMatchUrl: "Match (URL or pattern)",
      included: "Included",
      includedTitle:
        "Match when the request URL contains this text as a substring (e.g. hello/world matches …/hello/world/123).",
      labelMode: "Mode",
      modeResponse: "Fake response to the app",
      modeRequest: "Override outgoing request (server returns real response)",
      labelResStatus: "Response HTTP status",
      labelResHeaders: "Response headers (JSON object)",
      labelResBody: "Response body",
      labelReqMethod: "Override method (empty = keep)",
      labelReqUrl: "Override URL (empty = keep)",
      labelReqHeaders: "Request header overrides (JSON, merged on top of the live request)",
      labelReqBody: "Request body (replace; clear and save to use the browser’s original body)",
      sendSaved: "Saved",
      sendNew: "New",
      sendSavedHint: "Click a saved request to load it. Save stores method, URL, headers, body, and send mode.",
      sendNoSaved: "No saved requests yet.",
      sendRequest: "Request",
      sendResponse: "Response",
      sendSave: "Save",
      sendSaveAs: "Save as…",
      sendDelete: "Delete",
      sendBtn: "Send",
      sending: "Sending…",
      sendSaveTitle: "Save or update the current request",
      sendSaveAsTitle: "Save as a new named request",
      sendDeleteTitle: "Delete selected saved request",
      sendNewTitle: "Clear form for a new request",
      curlImport: "Import from curl",
      curlImportLabel: "Paste a curl command (from DevTools → Copy as cURL)",
      curlPaste: "Paste",
      curlPasteTitle: "Paste curl from clipboard (or press ⌘V / Ctrl+V in the box below)",
      curlImportBtn: "Import",
      curlImportSend: "Import & Send",
      labelMethod: "Method",
      labelUrl: "URL",
      sendVia: "Send via",
      sendDirect: "<strong>Direct</strong> — extension calls the real API (mocks do not apply)",
      sendViaPage: "<strong>Via page</strong> — fetch in the inspected tab (mocks & cookies apply)",
      labelSendReqHeaders: "Request headers (JSON object)",
      labelSendReqBody: "Request body",
      labelSendResHeaders: "Response headers (JSON)",
      labelSendResBody: "Response body",
      sendMetaEmpty: "Send a request to see status, timing, and body.",
      createMockFromResponse: "Create mock from response",
      createMock: "Create mock",
      waitingBody: "Waiting for body…",
      tagResTitle: "Response is faked in the app",
      tagReqTitle: "Outgoing request is overridden; response is real",
      tagIncTitle: "URL must contain this pattern (substring)",
      statusNotUsed: "—",
      rulesEmpty:
        "No rules yet. Click <strong>Add rule</strong> above, mock a captured request, or use the toolbar popup.",
      rulesNoFilter: "No rules match the filter. Clear the search or change the query.",
      capturedEmpty:
        "No requests captured yet. Trigger API calls, or hard-reload the page with DevTools open (Network: disable cache).",
      capturedNoFilter: "No requests match the URL filter.",
      savedEmptyHint: "No saved requests yet. Fill the form and click Save.",
      tabIdLine: "Inspected tab id: {id} — enable mocking above.",
      tabIdMissing: "Could not read inspected tab id. Re-open DevTools on a normal page tab.",
      noInspectedTab: "This panel needs an inspected page tab (open DevTools on a real tab).",
      statusLoadFailed: "Failed to load state",
      statusMatchFailed: "Could not match URLs",
      statusUpdated: "Updated",
      statusPatchFailed: "Patch failed",
      statusStatusSaved: "Status saved",
      statusSaveStatusFailed: "Failed to save status",
      statusMockCreated: "Mock created — edit on the right",
      statusAddRuleFailed: "Add rule failed",
      statusNewRuleHint: "New rule — fill URL/pattern and response, then Create",
      statusRuleCreated: "Rule created",
      statusCreateFailed: "Create failed",
      statusRuleSaved: "Rule saved",
      statusSaveFailed: "Save failed",
      statusRuleDeleted: "Rule deleted",
      statusDeleteFailed: "Delete failed",
      statusUrlRequired: "URL is required",
      statusUrlPatternRequired: "URL / pattern is required",
      statusEnabling: "Enabling…",
      statusDisabling: "Disabling…",
      statusEnabled: "Mocking enabled for this tab",
      statusDisabled: "Mocking disabled for this tab",
      statusToggleFailed: "Failed to toggle",
      statusRefreshed: "Refreshed",
      statusNetworkUnavailable: "Network API not available in this context.",
      statusFixTabId: "Fix tab id to use this panel (see the line above).",
      statusLoadedCapture: "Loaded captured request into Send",
      statusLoadedSaved: "Loaded “{name}”",
      statusNewRequest: "New request",
      statusUrlRequiredSave: "URL is required to save",
      statusNameRequired: "Name is required",
      statusRequestSaved: "Request saved",
      statusRequestUpdated: "Request updated",
      statusSavedDeleted: "Saved request deleted",
      statusSendingPage: "Sending via page…",
      statusSendingDirect: "Sending direct…",
      statusResponseReceived: "Response received",
      statusRequestFailed: "Request failed",
      statusMockFromSend: "Mock rule created from Send response",
      statusCreateMockFailed: "Create mock failed",
      statusCurlImported: "Imported curl into form",
      statusCurlImportedSending: "Imported curl — sending…",
      statusPasted: "Pasted from clipboard",
      statusPastedPage: "Pasted from clipboard (via inspected page)",
      statusPasteHint: "DevTools cannot read clipboard — press ⌘V / Ctrl+V here",
      statusPastedCurl: "Pasted — click Import or Import & Send",
      statusNoInspectedSend: "No inspected tab — open DevTools on a normal page tab.",
      promptSaveAs: "Save as (name):",
      promptNameRequest: "Name this request:",
      confirmDeleteSaved: "Delete saved request “{name}”?",
      popupRules: "Rules",
      popupAdd: "Add",
      popupEnabled: "Enabled",
      popupDelete: "Delete",
      popupShowDetails: "Show rule details",
      popupHideDetails: "Hide rule details",
      popupLabelUrl: "URL (paste full URL or use regex with re:)",
      popupUrlPlaceholder: "paste full URL, or: re:https://api\\.example\\.com/v1/items\\?regionId=\\d+",
      popupLabelMode: "Mode",
      popupModeResponse: "Fake response to the app (no real server for this call)",
      popupModeRequest:
        "Override outgoing request (URL / method / headers / body; real response from server)",
      popupLabelStatus: "Status",
      popupLabelContentType: "Content-Type (optional)",
      popupLabelResHeaders: "Response headers (JSON object)",
      popupLabelResBody: "Response body",
      popupLabelReqMethod: "Override method (empty = as sent by the page)",
      popupLabelReqUrl: "Override URL (empty = original request URL)",
      popupLabelReqHeaders: "Request header overrides (JSON object, merged on top of the actual request)",
      popupLabelReqBody: "Request body (replace; leave empty to keep the browser’s original body)",
      popupModeFake: "Fake response",
      popupModeRequestShort: "Request override",
      popupNoUrl: "(no URL)",
      popupIncludePrefix: "Include · ",
      popupOpenTab: "Open a normal tab to use mocking.",
      popupSaved: "Saved",
      popupEnabledTab: "Enabled for this tab",
      popupDisabledTab: "Disabled for this tab",
      popupTabLine: "Active tab id: {id} — mocking applies to this tab only.",
      popupTabHint: "Open DevTools MockWeave panel to control the inspected tab instead.",
      errHeadersObject: "Headers must be a JSON object",
      errEnabledNoUrl: "Enabled rule missing URL regex",
      errEnabledNoMatcher: "Enabled rule missing URL matcher",
      errInvalidRegex: "Invalid regex: {detail}",
      errSaveRulesFailed: "Failed to save rules",
      errCurlEmpty: "Paste a curl command first",
      errCurlMustStart: 'Command must start with "curl"',
      errCurlNoUrl: "Could not find URL in curl command",
      errCurlFile: "curl file references (@file) are not supported — paste the body directly",
      promptSaveRequest: "Name this request:",
      viaPage: "via page",
      viaDirect: "direct",
      sendMetaError: "Error ({via}{ms}): {error}",
      statusNotUsedReqMode: "Not used in request-override mode",
      statusClickApply: "Click away or Enter to apply",
      statusAriaHttp: "HTTP status",
      urlEmpty: "(empty)",
      savedUnnamed: "(unnamed)",
      deleteSavedDefault: "this request",
      resBodyCaptureTitle: "Response body capture",
      errPageEvalFailed: "Page eval failed",
      errPageEmptyResult: "Empty result from page",
      statusRulesExported: "Rules exported",
      statusRulesExportedClipboard: "Rules JSON copied to clipboard (download unavailable)",
      statusRulesImported: "Imported {count} rule(s)",
      statusRulesImportFailed: "Import failed",
      confirmImportReplace: "Replace all existing rules with the imported file? (Cancel = merge by id)",
    },
    ru: {
      langEn: "EN",
      langRu: "RU",
      langAria: "Язык",
      themeAria: "Тема",
      themeDark: "Тёмная",
      themeLight: "Светлая",
      themeDarkTitle: "Тёмная тема",
      themeLightTitle: "Светлая тема",
      intercept: "Перехватывать HTTP на проверяемой странице",
      tabCaptured: "Захват",
      tabRules: "Правила",
      tabSend: "Отправка",
      filterCaptured: "Фильтр по URL",
      filterRules: "Фильтр: URL, статус, body",
      clear: "Очистить",
      refresh: "Обновить",
      exportRules: "Экспорт",
      importRules: "Импорт",
      addRule: "Добавить правило",
      thOrder: "Порядок",
      duplicateRule: "Дублировать",
      rulesOrderHint: "Срабатывает первое подходящее правило — ↑↓ меняют приоритет.",
      ruleMoveUp: "Выше",
      ruleMoveDown: "Ниже",
      statusRuleDuplicated: "Правило продублировано",
      statusRuleMoved: "Порядок правил обновлён",
      thMethod: "Метод",
      thStatus: "Статус",
      thUrl: "URL",
      thOn: "Вкл",
      thUrlPattern: "URL / шаблон",
      detailEmptyHint:
        "Выберите запрос или правило слева, нажмите <strong>Добавить правило</strong> на вкладке Правила или используйте <strong>Отправка</strong> для ручного replay. Редактируйте body и headers справа на всю высоту панели.",
      detailCaptured: "<strong>Захват</strong> — трафик, пока открыты DevTools",
      detailRules: "<strong>Правила</strong> — активные моки (то же хранилище, что в popup)",
      detailSend: "<strong>Отправка</strong> — replay в стиле Postman (напрямую или через страницу для моков)",
      editRule: "Редактировать правило",
      newRule: "Новое правило",
      capturedRequest: "Захваченный запрос",
      capturedRequestMocked: "Захваченный запрос (замокан)",
      replayInSend: "Replay в Отправку",
      close: "Закрыть",
      save: "Сохранить",
      create: "Создать",
      delete: "Удалить",
      labelMatchUrl: "Совпадение (URL или шаблон)",
      included: "Included",
      includedTitle:
        "Совпадение, если URL запроса содержит этот текст как подстроку (например hello/world совпадёт с …/hello/world/123).",
      labelMode: "Режим",
      modeResponse: "Подмена ответа приложению",
      modeRequest: "Переопределение запроса (ответ от реального сервера)",
      labelResStatus: "HTTP-статус ответа",
      labelResHeaders: "Заголовки ответа (JSON)",
      labelResBody: "Тело ответа",
      labelReqMethod: "Метод (пусто = не менять)",
      labelReqUrl: "URL (пусто = не менять)",
      labelReqHeaders: "Заголовки запроса (JSON, поверх реального запроса)",
      labelReqBody: "Тело запроса (очистите и сохраните, чтобы оставить оригинал браузера)",
      sendSaved: "Сохранённые",
      sendNew: "Новый",
      sendSavedHint: "Клик по сохранённому — загрузка. Сохраняются method, URL, headers, body и режим отправки.",
      sendNoSaved: "Сохранённых запросов пока нет.",
      sendRequest: "Запрос",
      sendResponse: "Ответ",
      sendSave: "Сохранить",
      sendSaveAs: "Сохранить как…",
      sendDelete: "Удалить",
      sendBtn: "Отправить",
      sending: "Отправка…",
      sendSaveTitle: "Сохранить или обновить текущий запрос",
      sendSaveAsTitle: "Сохранить как новый запрос",
      sendDeleteTitle: "Удалить выбранный сохранённый запрос",
      sendNewTitle: "Очистить форму для нового запроса",
      curlImport: "Импорт из curl",
      curlImportLabel: "Вставьте curl (DevTools → Copy as cURL)",
      curlPaste: "Вставить",
      curlPasteTitle: "Вставить curl из буфера (или ⌘V / Ctrl+V в поле ниже)",
      curlImportBtn: "Импорт",
      curlImportSend: "Импорт и отправить",
      labelMethod: "Метод",
      labelUrl: "URL",
      sendVia: "Отправка через",
      sendDirect: "<strong>Напрямую</strong> — расширение вызывает API (моки не применяются)",
      sendViaPage: "<strong>Через страницу</strong> — fetch во вкладке (моки и cookies работают)",
      labelSendReqHeaders: "Заголовки запроса (JSON)",
      labelSendReqBody: "Тело запроса",
      labelSendResHeaders: "Заголовки ответа (JSON)",
      labelSendResBody: "Тело ответа",
      sendMetaEmpty: "Отправьте запрос, чтобы увидеть статус, время и body.",
      createMockFromResponse: "Создать mock из ответа",
      createMock: "Создать mock",
      waitingBody: "Ожидание body…",
      tagResTitle: "Ответ подменяется в приложении",
      tagReqTitle: "Исходящий запрос изменён; ответ реальный",
      tagIncTitle: "URL должен содержать этот шаблон (подстрока)",
      statusNotUsed: "—",
      rulesEmpty:
        "Правил пока нет. Нажмите <strong>Добавить правило</strong>, создайте mock из захвата или используйте popup.",
      rulesNoFilter: "Нет правил по фильтру. Очистите поиск или измените запрос.",
      capturedEmpty:
        "Запросов пока нет. Вызовите API или перезагрузите страницу с открытыми DevTools (Network: disable cache).",
      capturedNoFilter: "Нет запросов по фильтру URL.",
      savedEmptyHint: "Сохранённых запросов нет. Заполните форму и нажмите Сохранить.",
      tabIdLine: "ID вкладки: {id} — включите перехват выше.",
      tabIdMissing: "Не удалось получить ID вкладки. Переоткройте DevTools на обычной странице.",
      noInspectedTab: "Нужна вкладка с проверяемой страницей (откройте DevTools на обычном сайте).",
      statusLoadFailed: "Не удалось загрузить состояние",
      statusMatchFailed: "Не удалось сопоставить URL",
      statusUpdated: "Обновлено",
      statusPatchFailed: "Ошибка обновления",
      statusStatusSaved: "Статус сохранён",
      statusSaveStatusFailed: "Не удалось сохранить статус",
      statusMockCreated: "Mock создан — редактируйте справа",
      statusAddRuleFailed: "Не удалось добавить правило",
      statusNewRuleHint: "Новое правило — заполните URL/шаблон и ответ, затем Создать",
      statusRuleCreated: "Правило создано",
      statusCreateFailed: "Ошибка создания",
      statusRuleSaved: "Правило сохранено",
      statusSaveFailed: "Ошибка сохранения",
      statusRuleDeleted: "Правило удалено",
      statusDeleteFailed: "Ошибка удаления",
      statusUrlRequired: "Нужен URL",
      statusUrlPatternRequired: "Нужен URL / шаблон",
      statusEnabling: "Включение…",
      statusDisabling: "Отключение…",
      statusEnabled: "Перехват включён для этой вкладки",
      statusDisabled: "Перехват отключён для этой вкладки",
      statusToggleFailed: "Не удалось переключить",
      statusRefreshed: "Обновлено",
      statusNetworkUnavailable: "Network API недоступен в этом контексте.",
      statusFixTabId: "Исправьте ID вкладки (см. строку выше).",
      statusLoadedCapture: "Захваченный запрос загружен в Отправку",
      statusLoadedSaved: "Загружено «{name}»",
      statusNewRequest: "Новый запрос",
      statusUrlRequiredSave: "Для сохранения нужен URL",
      statusNameRequired: "Нужно имя",
      statusRequestSaved: "Запрос сохранён",
      statusRequestUpdated: "Запрос обновлён",
      statusSavedDeleted: "Сохранённый запрос удалён",
      statusSendingPage: "Отправка через страницу…",
      statusSendingDirect: "Прямая отправка…",
      statusResponseReceived: "Ответ получен",
      statusRequestFailed: "Запрос не удался",
      statusMockFromSend: "Mock создан из ответа Send",
      statusCreateMockFailed: "Не удалось создать mock",
      statusCurlImported: "curl импортирован в форму",
      statusCurlImportedSending: "curl импортирован — отправка…",
      statusPasted: "Вставлено из буфера",
      statusPastedPage: "Вставлено из буфера (через страницу)",
      statusPasteHint: "DevTools не читает буфер — нажмите ⌘V / Ctrl+V здесь",
      statusPastedCurl: "Вставлено — нажмите Импорт или Импорт и отправить",
      statusNoInspectedSend: "Нет inspected tab — откройте DevTools на обычной странице.",
      promptSaveAs: "Сохранить как (имя):",
      promptNameRequest: "Имя запроса:",
      confirmDeleteSaved: "Удалить сохранённый запрос «{name}»?",
      popupRules: "Правила",
      popupAdd: "Добавить",
      popupEnabled: "Включено",
      popupDelete: "Удалить",
      popupShowDetails: "Показать детали",
      popupHideDetails: "Скрыть детали",
      popupLabelUrl: "URL (полный адрес или regex с re:)",
      popupUrlPlaceholder: "полный URL или: re:https://api\\.example\\.com/v1/items\\?regionId=\\d+",
      popupLabelMode: "Режим",
      popupModeResponse: "Подмена ответа (без реального сервера)",
      popupModeRequest:
        "Переопределение запроса (URL / method / headers / body; ответ от сервера)",
      popupLabelStatus: "Статус",
      popupLabelContentType: "Content-Type (необязательно)",
      popupLabelResHeaders: "Заголовки ответа (JSON)",
      popupLabelResBody: "Тело ответа",
      popupLabelReqMethod: "Метод (пусто = как на странице)",
      popupLabelReqUrl: "URL (пусто = оригинальный URL)",
      popupLabelReqHeaders: "Заголовки запроса (JSON, поверх реального)",
      popupLabelReqBody: "Тело запроса (пусто = оригинал браузера)",
      popupModeFake: "Подмена ответа",
      popupModeRequestShort: "Переопределение запроса",
      popupNoUrl: "(нет URL)",
      popupIncludePrefix: "Include · ",
      popupOpenTab: "Откройте обычную вкладку для моков.",
      popupSaved: "Сохранено",
      popupEnabledTab: "Включено для этой вкладки",
      popupDisabledTab: "Отключено для этой вкладки",
      popupTabLine: "ID активной вкладки: {id} — моки только для неё.",
      popupTabHint: "Для inspected tab используйте панель MockWeave в DevTools.",
      errHeadersObject: "Заголовки должны быть JSON-объектом",
      errEnabledNoUrl: "У включённого правила нет URL",
      errEnabledNoMatcher: "У включённого правила нет шаблона URL",
      errInvalidRegex: "Невалидный regex: {detail}",
      errSaveRulesFailed: "Не удалось сохранить правила",
      errCurlEmpty: "Сначала вставьте curl",
      errCurlMustStart: 'Команда должна начинаться с "curl"',
      errCurlNoUrl: "URL не найден в curl",
      errCurlFile: "Ссылки @file не поддерживаются — вставьте body напрямую",
      promptSaveRequest: "Имя запроса:",
      viaPage: "через страницу",
      viaDirect: "напрямую",
      sendMetaError: "Ошибка ({via}{ms}): {error}",
      statusNotUsedReqMode: "Не используется в режиме переопределения запроса",
      statusClickApply: "Клик вне поля или Enter для применения",
      statusAriaHttp: "HTTP-статус",
      urlEmpty: "(пусто)",
      savedUnnamed: "(без имени)",
      deleteSavedDefault: "этот запрос",
      resBodyCaptureTitle: "Захват body ответа",
      errPageEvalFailed: "Ошибка eval на странице",
      errPageEmptyResult: "Пустой результат со страницы",
      statusRulesExported: "Правила экспортированы",
      statusRulesExportedClipboard: "JSON правил скопирован в буфер (скачивание недоступно)",
      statusRulesImported: "Импортировано правил: {count}",
      statusRulesImportFailed: "Ошибка импорта",
      confirmImportReplace: "Заменить все правила импортом? (Отмена = объединить по id)",
    }
  };

  let locale = "en";

  function t(key, vars) {
    const bag = MESSAGES[locale] || MESSAGES.en;
    let msg = bag[key] ?? MESSAGES.en[key] ?? key;
    if (vars && typeof vars === "object") {
      for (const [k, v] of Object.entries(vars)) {
        msg = msg.replaceAll(`{${k}}`, String(v));
      }
    }
    return msg;
  }

  function getLocale() {
    return locale;
  }

  function updateLangButtons(root) {
    const scope = root || document;
    for (const btn of scope.querySelectorAll("[data-lang]")) {
      const lang = btn.getAttribute("data-lang");
      btn.classList.toggle("active", lang === locale);
      btn.setAttribute("aria-pressed", lang === locale ? "true" : "false");
    }
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const attr = el.getAttribute("data-i18n-attr");
      if (attr) el.setAttribute(attr, t(key));
      else el.textContent = t(key);
    });
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    scope.querySelectorAll("option[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    if (!root || root === document) {
      document.documentElement.lang = locale;
      updateLangButtons(document);
    }
  }

  async function init() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      locale = stored[STORAGE_KEY] === "ru" ? "ru" : "en";
    } catch {
      locale = "en";
    }
  }

  async function setLocale(lang) {
    locale = lang === "ru" ? "ru" : "en";
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: locale });
    } catch {
      /* ignore */
    }
    apply(document);
    global.dispatchEvent(new CustomEvent("mockweave-locale-change"));
  }

  function wireLangSwitch(root) {
    const scope = root || document;
    for (const btn of scope.querySelectorAll("[data-lang]")) {
      if (btn.dataset.i18nWired) continue;
      btn.dataset.i18nWired = "1";
      btn.addEventListener("click", () => {
        void setLocale(btn.getAttribute("data-lang"));
      });
    }
    updateLangButtons(scope);
  }

  global.MockWeaveI18n = { init, setLocale, t, apply, getLocale, wireLangSwitch };
})(typeof globalThis !== "undefined" ? globalThis : window);
