# MockWeave (Chrome extension)

**MockWeave** intercepts page traffic with the Chrome **DevTools Protocol** (`Fetch` domain) and `chrome.debugger`. It works **per tab** while the feature is on.

## Two ways to work with HTTP

1. **Fake response (default)**  
   The browser does **not** call the real server for matching URLs. You supply **status, response headers, body** (CDP: `Fetch.fulfillRequest`). Good for simulating API responses end-to-end in the app.

2. **Override outgoing request**  
   The request is **changed** (method, URL, extra/replaced headers, body) and then **sent to the real server**; the app receives the **real** response (CDP: `Fetch.continueRequest`). Good for pointing an existing UI at another path, testing header/body rewrites, or A/B the same call with different parameters.

**Match** is the same for both: URL or pattern — paste a full `https://…` URL, or a regex, or prefix `re:` / `lit:` (see below). Enable **Included** to match when the request URL **contains** your text as a plain substring (no regex).

**Rule order** matters: the **first** enabled rule that matches a URL wins.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this `mock-ext` folder

## Enable

1. Open the target page tab
2. Open **DevTools** (F12) and select the **MockWeave** tab in the top bar — same row as **Elements**, **Console**, **Network**, **Redux**, etc. If you do not see it, click **>>** (overflow) and pin MockWeave.
3. Turn on **Intercept HTTP for the inspected page** (Chrome will ask to allow the debugger)

The toolbar popup is still available for quick rule edits; the DevTools tab uses the full panel height (split view: list on the left, editor on the right).

## Rules in the popup

- **Mode**
  - **Fake response to the app** — status, **response** headers, **response** body
  - **Override outgoing request** — optional **method**, **URL**, **request header** map (JSON, merged on top of the real request), **request body** (if you leave the body empty and the rule never stored a `requestBody` override, the original body from the page is kept; see saved rules in storage)
- **URL** — full URL, `re:` / `lit:` / regex patterns as before, or with **Included** checked: plain substring (e.g. `hello/world` matches `https://api.example/hello/world/123`)

## DevTools “MockWeave” tab

Full-height panel (like Redux DevTools): **Captured**, **Rules**, and **Send** (Replay & Send). Drag the divider to resize on Captured/Rules.

- **Captured requests** — traffic while DevTools is open. Click a row to preview; double-click or **Replay in Send** loads it into Send; **Create mock** builds a rule from the captured response.
- **Active rules** — **RES** = response mock, **REQ** = request override, **INC** = substring (“included”) match. Click a row to edit body/headers with the full panel height.
- **Send** — manual HTTP client (Postman-lite):
  - **Direct** — extension calls the real API (mocks do **not** apply; no page CORS).
  - **Via page** — `fetch` in the inspected tab (mocks and cookies apply; enable intercept first).
  - **Create mock from response** after a successful send.
  - **Saved requests** — sidebar on Send; **Save** / **Save as…** / **Delete**; stored in `chrome.storage.local` (JWT in headers is saved with the request).
  - **Import from curl** — paste **Copy as cURL** from Network; **Import** or **Import & Send** (`-H`, `-d`, `--json`, `-X`, `-u`, cookies).

## URL matching

- **Included** (checkbox) — the URL field is matched as **plain text** anywhere in the request URL (substring). `re:`, `lit:`, and regex rules are **not** used while Included is on.
- Starts with `http(s)://` → treated as a **literal** full URL (so `?` and `.` are not regex pitfalls).
- Prefix **`re:`** — regex after the prefix
- Prefix **`lit:`** — force literal
- Otherwise — treated as regex

## CORS and `OPTIONS`

- For **response** mocks, the extension adds CORS headers and, when the page sends a credentialed `fetch`, echoes **`Origin`** and sets **`Access-Control-Allow-Credentials`** as needed. Preflight `OPTIONS` is answered with **204** so the real (mocked) response can be read in DevTools and in the app.
- For **request** overrides, the **real** server answers — CORS is whatever the server returns.

## Network tab vs mocked responses

When **Fake response** is active, mocked requests **still appear** in the DevTools **Network** panel. That is normal: the page initiated the request and DevTools logged it; MockWeave only replaces the **response body** the app receives (`Fetch.fulfillRequest`), it does not hide the row.

Often the Network **Response** / **Preview** pane shows:

> Failed to load response data — No data found for resource with given identifier

That is a **Chrome DevTools limitation**, not a sign that the mock failed. Network stores bodies for real HTTP responses; a CDP-fulfilled mock has no such stored body, so DevTools cannot show it there.

| Where to check | What you see |
| --- | --- |
| **Network → Response** | Often empty or the error above |
| **Your app / UI** | Mock data (if the rule matched) |
| **MockWeave → Captured** | Request + body when capture succeeded |
| **MockWeave → Rules** | Whether the URL matched and the rule is enabled |

For **Override outgoing request** (`REQ`) rules, traffic goes to the real server — Network shows a normal request and response.

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
- **Network → Response** may be empty for **fake response** mocks (see [Network tab vs mocked responses](#network-tab-vs-mocked-responses)).

## Technical

- `Fetch.enable` on `*`, `Fetch.requestPaused` → `fulfillRequest` (response) or `continueRequest` (request)  
- Rules in `chrome.storage.local`
