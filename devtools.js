// Registers a top-level tab in DevTools (same area as Network, Console, …).
chrome.devtools.panels.create(
  "MockWeave",
  "",
  "devtools_panel.html",
  () => {}
);
