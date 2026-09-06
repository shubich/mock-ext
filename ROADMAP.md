**English** | [Русский](ROADMAP.ru.md)

# MockWeave roadmap

This document tracks what is **done**, what is **planned**, and what is **out of scope** for MockWeave. The core product vision is implemented; the items below are polish, reliability, and parity with tools like Requestly / Postman interceptors.

**Current version:** `0.2.0` (see `manifest.json`)

---

## Status: MVP complete

The following is implemented and documented in [README.md](README.md):

| Area | Status |
|------|--------|
| CDP `Fetch` intercept (`fulfillRequest` / `continueRequest`) | Done |
| Fake response + request override modes | Done |
| URL matching (`https://…`, `re:`, `lit:`, regex, **Included**) | Done |
| First-match rule order (array in `chrome.storage.local`) | Done |
| Per-tab enable via `chrome.debugger` | Done |
| CORS headers + OPTIONS → 204 for response mocks | Done |
| Toolbar popup (rules list, enable toggle) | Done |
| DevTools panel: **Captured** / **Rules** / **Send** | Done |
| Traffic capture (`onRequestFinished` + HAR seed, max 200) | Done |
| Create mock from captured request | Done |
| Send: direct + via page (mocks apply) | Done |
| Saved requests (Send tab) | Done |
| Import from curl (Send tab) | Done |
| i18n: English / Russian | Done |
| Theme: dark / light | Done |

---

## Phase 1 — Must-have (daily use)

These items matter most once you use MockWeave regularly or share configs with a team.

### 1. Rules export / import (JSON)

**Why:** Rules live only in `chrome.storage.local` for one browser profile. No backup, sharing, or migration.

**Scope:**

- Export all rules to a `.json` file
- Import from file (merge or replace — decide in UI)
- Reuse the rule shape already stored by `service_worker.js`
- Entry points: DevTools **Rules** toolbar (and optionally popup)

### 2. Rule reorder + duplicate

**Why:** First match wins. New rules are added to the top (`unshift`), but there is no way to change priority when you have many rules.

**Scope:**

- Move up / move down (or drag-and-drop) in the Rules table
- Optional: **Duplicate rule** action in the editor
- Short UI hint: “First matching rule wins — order matters”

### 3. Popup ↔ DevTools sync and tab targeting

**Why:** Two UIs edit the same storage but behave differently.

**Known issues:**

- Popup enables mocking for the **active tab**; DevTools for the **inspected tab** — easy to toggle the wrong tab.
- Popup does not listen to `chrome.storage.onChanged` for `rules`; DevTools does. Popup autosave via `UPSERT_RULES` can overwrite DevTools edits if both are open.

**Scope:**

- Popup reloads rules when `rules` change in storage
- Safer save: merge by rule `id` instead of blind full replace (or warn before overwrite)
- Show which tab is controlled (“Tab id: …”) in popup; warn when it differs from inspected tab

### 4. Rule validation in DevTools editor

**Why:** Popup validates regex on save; DevTools editor does not. Invalid regex is skipped silently at runtime (`matchRule` in `service_worker.js`).

**Scope:**

- Compile-check regex on Create / Save in DevTools
- Status message for enabled rules with invalid patterns
- Optional: tooltip on Captured row with matched rule id / pattern

### 5. Minimal tests + CI

**Why:** No safety net for matching, curl parsing, or CORS logic.

**Scope:**

- Extract testable pure functions (`matchRule`, `parseUrlMatcher`, `parseCurlCommand`, `withDefaultCorsHeaders`)
- Node unit tests
- GitHub Action: lint + test on push/PR

---

## Phase 2 — Nice-to-have (competitive parity)

Not required for solo local dev, but common in similar tools.

| Feature | Benefit |
|---------|---------|
| Match by HTTP method | Same URL, different mocks for GET vs POST |
| Match by headers / query | Finer rules without over-specific URLs |
| Response delay (ms) per rule | Simulate slow APIs |
| Named rules / tags | Easier to find rules in a long list |
| Toolbar badge when intercept is on | Visible without opening popup |
| HAR → rules bulk import | Bootstrap mocks from a recording |
| Variables (`{{baseUrl}}`, `{{token}}`) | Less copy-paste in URLs and bodies |
| JSON format / validate in textareas | Fewer save-time parse errors |
| Replace `prompt` / `confirm` with in-panel dialogs | More reliable in extension contexts |
| `chrome.storage.sync` or git-friendly export workflow | Multi-machine / team setups |

---

## Phase 3 — Release & docs polish

For Chrome Web Store or open-source contributors.

| Item | Notes |
|------|--------|
| `LICENSE` | Required for public repo / store |
| `CHANGELOG.md` | Track 0.1 → 0.2+ (Send, curl, i18n, theme, …) |
| English README: debugger yellow bar | Already in [README.ru.md](README.ru.md); add to English |
| Screenshots / GIF | Captured → Create mock → Rules flow |
| Documented rule JSON schema | Formal shape for export/import |
| Privacy policy | Needed for Web Store (`host_permissions`, `debugger`) |
| `CONTRIBUTING.md` | If others will contribute |

---

## Explicitly out of scope (for now)

These are CDP or product limits — not planned unless requirements change.

| Topic | Reason |
|-------|--------|
| Hide mocked requests from Network tab | CDP does not remove Network rows; documented in README |
| Full Postman replacement | Send covers replay; not a full API client |
| WebSocket / SSE mocking | HTTP `Fetch` domain only |
| Binary / image mocks as first-class | Text/UTF-8 oriented today |
| Cloud sync / team workspaces | Local-first tool; export/import is enough for v1 |
| Firefox / other browsers | Chrome MV3 only |

---

## Known limitations (documented, not roadmap bugs)

- Captured traffic is in-memory only (max 200, deduped by method + URL)
- Response bodies truncated around ~1 MB (capture, Send, direct HTTP)
- Network **Response** tab often empty for faked responses — expected with CDP mocks
- `chrome.debugger` shows the yellow “started debugging” bar (dev workaround: `--silent-debugger-extension-api`)
- Saved requests capped at 100 in `service_worker.js`
- curl import: no `@file` body references

---

## Suggested order of work

```
Phase 1.1  Export / import rules
Phase 1.2  Rule reorder (+ duplicate)
Phase 1.3  Popup ↔ DevTools sync + tab clarity
Phase 1.4  DevTools validation + match feedback
Phase 1.5  Tests + CI
Phase 2      Pick from nice-to-have table as needed
Phase 3      Store / OSS polish when publishing
```

---

## How to use this doc

- Check off items in PR descriptions or link issues when you start work.
- Update **Status: MVP complete** when major features ship.
- Bump version in `manifest.json` and add a `CHANGELOG.md` entry when releasing.

Questions or priorities changed? Edit this file and [ROADMAP.ru.md](ROADMAP.ru.md) together.
