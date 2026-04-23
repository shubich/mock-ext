// Registers a top-level tab in DevTools (same area as Network, Console, …).
chrome.devtools.panels.create(
  "Response Mocker",
  "",
  "devtools_panel.html",
  () => {}
);
