import { expect, test } from "vitest";
import { automaticCompactionPolicy, estimateFixedTokens } from "../src/lib/server/runtime/compaction";

test("budgets scale to effective model windows and leave room for fixed context, summary and output", () => {
  const small = automaticCompactionPolicy({ contextWindow: 8192, maxTokens: 1024 }, 1200);
  const large = automaticCompactionPolicy({ contextWindow: 1048576, maxTokens: 32768 }, 1200);
  for (const [policy, window, output] of [[small, 8192, 1024], [large, 1048576, 32768]] as const) {
    expect(policy.enabled).toBe(true);
    expect(policy.reserveTokens).toBeGreaterThan(1200 + 2 * output);
    expect(policy.keepRecentTokens).toBeGreaterThan(0);
    expect(policy.keepRecentTokens + policy.backgroundTokens).toBeLessThan(window - policy.reserveTokens);
    expect(Object.values(policy).every(v => typeof v !== "number" || Number.isSafeInteger(v))).toBe(true);
  }
  expect(large.keepRecentTokens).toBeGreaterThan(small.keepRecentTokens);
  expect(large.backgroundTokens).toBeGreaterThan(small.backgroundTokens);
});

test.each([
  [0, 100, 0], [8192, 0, 0], [8192, 8192, 0], [8192, 9000, 0],
  [NaN, 100, 0], [8192.5, 100, 0], [8192, 100, -1], [8192, 100, Infinity],
  [8192, 1024, 8000], [8192, 4096, 0],
])("rejects unusable limits/overhead (%s, %s, %s)", (contextWindow, maxTokens, overhead) => {
  expect(() => automaticCompactionPolicy({ contextWindow, maxTokens }, overhead)).toThrow(/context|limit|overhead/i);
});

test("fixed prompt estimates account conservatively for CJK and schema structure", () => {
  expect(estimateFixedTokens("目标证据".repeat(100))).toBeGreaterThanOrEqual(400);
  expect(estimateFixedTokens("a".repeat(400))).toBeLessThan(estimateFixedTokens("证".repeat(400)));
  expect(estimateFixedTokens(JSON.stringify({ description: "证据", parameters: { type: "object" } }))).toBeGreaterThan(10);
});
