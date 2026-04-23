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
2. Click the extension icon
3. Toggle **Enable** (Chrome will ask you to allow debugging)
4. Add a rule:
   - **URL regex**: JS RegExp source (without `/.../`), example: `https://api\\.example\\.com/v1/items`
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

## Notes / limitations

- Works only while enabled for the current tab (because CDP attaches to a tab).
- For `Content-Type` there is a convenience input that mirrors into headers.
- If a rule has invalid regex, it will be ignored by the background script.

