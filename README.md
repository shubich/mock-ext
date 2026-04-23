# Response Mocker (Chrome Extension)

Chrome extension that can **mock HTTP responses** by matching request URL with a RegExp and overriding:

- status code
- response headers
- response body

It uses Chrome DevTools Protocol (`Fetch.fulfillRequest`) via the `chrome.debugger` permission, so mocking is enabled **per-tab**.

## Install (dev)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `mock-ext/`

## Use

1. Open the tab you want to mock
2. Click the extension icon, **or** open **DevTools** and select the **Response Mocker** tab (same level as **Network** / **Console**).
3. Toggle **Mock responses for the inspected page tab** (Chrome will ask you to allow debugging)
4. Add a rule:
   - **URL**: paste a **full** `https://...` URL to match it literally, or a regex; prefix with `re:` for a regex, or `lit:` to force a literal.
   - **Status**: e.g. `200`, `404`, `500`
   - **Headers**: JSON object, e.g.

```json
{
  "Content-Type": "application/json",
  "X-Mocked-By": "ResponseMocker"
}
```

   - **Body**: any text (JSON, HTML, etc.)

Rules are saved automatically into `chrome.storage.local`.

### DevTools panel (pick requests to mock)

With DevTools open on the page, open the **Response Mocker** tab. **Captured requests** are collected while that DevTools window is open. Use the **Filter** field to search URLs. Click **Mock** to add a full-URL rule: it copies the **real response status, headers (framing fields stripped), and body** (loaded asynchronously from DevTools; a short ⏳ next to the status means the body is still loading). The editor opens so you can adjust the data. For **Edit** on an already mocked request, behavior is the same. Leaving response headers empty in the editor keeps the existing headers; paste a JSON object to replace them.

**Reload** the extension on `chrome://extensions` after code changes, then close and reopen DevTools if the new tab does not appear.

## Notes / limitations

- Works only while enabled for the current tab (because CDP attaches to a tab).
- For `Content-Type` there is a convenience input that mirrors into headers.
- If a rule has invalid regex, it will be ignored by the background script.
- Cross-origin requests may require CORS headers. The extension adds permissive CORS headers by default for mocked responses, and answers `OPTIONS` preflight with `204`.

