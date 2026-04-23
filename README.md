# MockWeave (Chrome extension)

**MockWeave** intercepts page traffic with the Chrome **DevTools Protocol** (`Fetch` domain) and `chrome.debugger`. It works **per tab** while the feature is on.

## Two ways to work with HTTP

1. **Fake response (default)**  
   The browser does **not** call the real server for matching URLs. You supply **status, response headers, body** (CDP: `Fetch.fulfillRequest`). Good for simulating API responses end-to-end in the app.

2. **Override outgoing request**  
   The request is **changed** (method, URL, extra/replaced headers, body) and then **sent to the real server**; the app receives the **real** response (CDP: `Fetch.continueRequest`). Good for pointing an existing UI at another path, testing header/body rewrites, or A/B the same call with different parameters.

**Match** is the same for both: URL or pattern — paste a full `https://…` URL, or a regex, or prefix `re:` / `lit:` (see below).

**Rule order** matters: the **first** enabled rule that matches a URL wins.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this `mock-ext` folder

## Enable

1. Open the target tab (and keep **DevTools** open if you use the side panel)
2. From the **toolbar icon** or the **MockWeave** DevTools tab, turn on **Mock … for this tab** (Chrome will ask to allow the debugger to attach to the page)

## Rules in the popup

- **Mode**
  - **Fake response to the app** — status, **response** headers, **response** body
  - **Override outgoing request** — optional **method**, **URL**, **request header** map (JSON, merged on top of the real request), **request body** (if you leave the body empty and the rule never stored a `requestBody` override, the original body from the page is kept; see saved rules in storage)
- **URL** — full URL, or `re:...` / `lit:...` / string patterns as before

## DevTools “MockWeave” tab

- **Captured requests** — traffic while that DevTools window is open. **Filter** by URL. **Mock** creates a **response** rule and fills it from the **captured** response (body loads asynchronously; ⏳ on the status column while waiting).
- **Active rules** — **RES** = response mock, **REQ** = request override; **Edit** opens a dialog with the same two modes. Inline “status” applies only to **RES** rules.

## URL matching (unchanged)

- Starts with `http(s)://` → treated as a **literal** full URL (so `?` and `.` are not regex pitfalls).
- Prefix **`re:`** — regex after the prefix
- Prefix **`lit:`** — force literal
- Otherwise — treated as regex

## CORS and `OPTIONS`

- For **response** mocks, the extension adds CORS headers and, when the page sends a credentialed `fetch`, echoes **`Origin`** and sets **`Access-Control-Allow-Credentials`** as needed. Preflight `OPTIONS` is answered with **204** so the real (mocked) response can be read in DevTools and in the app.
- For **request** overrides, the **real** server answers — CORS is whatever the server returns.

## After changing code

`chrome://extensions` → **Reload** the extension. Re-enable mocking on the tab; reopen DevTools if the new panel tab is missing.

## Name ideas (if you rebrand the repo)

- **MockWeave** (current) — “weave” request + response control  
- **OverWire** — override what goes on the wire  
- **CDP Tuner** — explicit about DevTools Protocol  
- **NetFork** — branch traffic without leaving DevTools  
- **ReqRes Rigger** — hook both directions  
- **TraceShift** — shift behavior while tracing in DevTools  
- **HTTP Braid** — combine multiple handlers / rules (conceptually like weaving)

## Limitations

- **Per tab**; attaching the debugger is tied to the active tab.  
- **First matching** rule only.  
- **Request** and **response** for the **same** URL: use **two** rules and **order** them (e.g. one pattern more specific) — only the first match runs. You cannot in one step both fulfill a response *and* modify the request.  
- Invalid regex in a pattern → that rule is skipped.  
- Very large response bodies in the panel are **truncated** when copying from capture (~1MB).

## Technical

- `Fetch.enable` on `*`, `Fetch.requestPaused` → `fulfillRequest` (response) or `continueRequest` (request)  
- Rules in `chrome.storage.local`
