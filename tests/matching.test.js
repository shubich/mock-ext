import test from "node:test";
import assert from "node:assert/strict";
import { matchRule, parseUrlMatcher, validateEnabledRuleMatcher } from "../lib/matching.js";
import {
  buildRulesExportDocument,
  mergeRulesById,
  normalizeRulesList,
  parseRulesImportJson
} from "../lib/rules-io.js";

test("parseUrlMatcher treats https URL as literal", () => {
  const m = parseUrlMatcher("https://api.example.com/v1/foo");
  assert.equal(m.mode, "literal");
  assert.equal(m.source, "https://api.example.com/v1/foo");
});

test("parseUrlMatcher supports re: prefix", () => {
  const m = parseUrlMatcher("re:foo\\d+");
  assert.equal(m.mode, "regex");
  assert.equal(m.source, "foo\\d+");
});

test("matchRule uses included substring", () => {
  const rules = [{ id: "1", enabled: true, urlRegex: "hello/world", urlIncluded: true, mockKind: "response" }];
  assert.equal(matchRule(rules, "https://x/hello/world/1")?.id, "1");
  assert.equal(matchRule(rules, "https://x/other")?.id, undefined);
});

test("matchRule returns first enabled match", () => {
  const rules = [
    { id: "a", enabled: true, urlRegex: "api.example", urlIncluded: true, mockKind: "response" },
    { id: "b", enabled: true, urlRegex: "api.example/v2", urlIncluded: true, mockKind: "response" }
  ];
  assert.equal(matchRule(rules, "https://api.example/v2/x")?.id, "a");
});

test("validateEnabledRuleMatcher rejects invalid regex", () => {
  const err = validateEnabledRuleMatcher({
    enabled: true,
    urlRegex: "re:[unclosed",
    urlIncluded: false
  });
  assert.ok(err);
});

test("parseRulesImportJson accepts array and document", () => {
  const fromArray = parseRulesImportJson('[{"urlRegex":"x","mockKind":"response"}]');
  assert.equal(fromArray.rules.length, 1);
  const fromDoc = parseRulesImportJson(
    JSON.stringify(buildRulesExportDocument([{ urlRegex: "y", mockKind: "response" }]))
  );
  assert.equal(fromDoc.rules.length, 1);
});

test("mergeRulesById overwrites same id", () => {
  const merged = mergeRulesById(
    [{ id: "1", enabled: true, urlRegex: "old", mockKind: "response" }],
    [{ id: "1", enabled: false, urlRegex: "new", mockKind: "response" }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].urlRegex, "new");
  assert.equal(merged[0].enabled, false);
});
