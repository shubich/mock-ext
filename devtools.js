// Top-level DevTools tab (same row as Elements, Console, Network, Redux, …).
chrome.devtools.panels.create(
  "MockWeave",
  "icons/panel.svg",
  "devtools_panel.html",
  () => {}
);
