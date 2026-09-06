export function escapeRegExp(literal) {
  return String(literal).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseUrlMatcher(input) {
  const raw = String(input || "").trim();
  if (!raw) return { mode: "none", source: "" };

  if (raw.startsWith("re:")) {
    return { mode: "regex", source: raw.slice(3).trim() };
  }
  if (raw.startsWith("lit:")) {
    return { mode: "literal", source: raw.slice(4).trim() };
  }
  if (/^https?:\/\//i.test(raw)) {
    return { mode: "literal", source: raw };
  }
  return { mode: "regex", source: raw };
}

export function compileMatcherPattern(matcher) {
  if (!matcher || matcher.mode === "none" || !matcher.source) return null;
  if (matcher.mode === "literal") {
    return `^${escapeRegExp(matcher.source)}$`;
  }
  return matcher.source;
}

export function validateEnabledRuleMatcher(rule) {
  if (!rule || !rule.enabled) return null;
  const urlRegex = String(rule.urlRegex || "").trim();
  if (!urlRegex) return "Enabled rule missing URL regex";
  if (rule.urlIncluded) return null;
  const matcher = parseUrlMatcher(urlRegex);
  if (matcher.mode === "none" || !matcher.source) {
    return "Enabled rule missing URL matcher";
  }
  const pattern = compileMatcherPattern(matcher);
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
  } catch (e) {
    return e?.message || String(e);
  }
  return null;
}

export function matchRule(rules, url) {
  for (const rule of rules) {
    if (!rule || !rule.enabled) continue;
    try {
      if (rule.urlIncluded) {
        const needle = String(rule.urlRegex || "").trim();
        if (!needle) continue;
        if (url.includes(needle)) return rule;
        continue;
      }
      const matcher = parseUrlMatcher(rule.urlRegex);
      if (matcher.mode === "none") continue;
      const source = compileMatcherPattern(matcher);
      if (!source) continue;
      const re = new RegExp(source);
      if (re.test(url)) return rule;
    } catch {
      // invalid regex -> ignore
    }
  }
  return null;
}
