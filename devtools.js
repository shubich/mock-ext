// Top-level DevTools tab (same row as Elements, Console, Network, Redux, …).
chrome.devtools.panels.create(
  "MockWeave",
  "icons/icon16.png",
  "devtools_panel.html",
  () => {}
);
