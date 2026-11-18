# Automatic compaction budgets (#802)

Goal: adapt Pi Durable automatic compaction to the captured effective Pi Model.
Scope: rewrite only; no second compaction engine, manual controls, usage UI or metadata settings.

1. Add a pure policy module consuming Model.contextWindow/maxTokens plus conservative fixed prompt overhead. Reserve output, summary and fixed prompt space; scale recent retention/background distance to usable space. Reject impossible combinations.
2. Test small/large windows, invalid limits, CJK estimation and oversized overhead before implementation.
3. Configure the native conversation policy on creation and before idle admission, after refreshing tools, endpoint and skills. Preserve the persisted policy during recovery. Consume endpoint.model from #801; use existing runtimeProvider fallback for old fixtures.
4. Exercise real Pi automatic compactions and restart with a deterministic HTTP fixture, inspect summary-inclusive token spend, elapsed time and external action count. Test no valid cut point and selection switches.
5. Document policy/default migration. Run Node 24 pnpm check, build, test sequentially. Review diff; leave unpublished changes.

Dependency: #801 guarantees captured endpoint.model is authoritative, custom defaults 32768/4096; old sidecars must retain compatible defaults. This branch consumes that existing shape without creating metadata settings.

## Completed verification (2026-11-16)

- Rebased onto origin/main c93e1e2 (#801 delivered through #806).
- Node 24: pnpm check (0 diagnostics), pnpm build, pnpm test (26 files, 154 tests) passed serially.
- Focused lifecycle fixture: seven native summaries, 231839 reported total tokens including summaries, one external action, about 1.8 seconds in the final suite run.
- SIGKILL during a paused summary preserves the captured policy, resumes native work, and applies the larger model policy only on next idle admission.
- Independent review found two fixture gaps; completed-action decisions now depend on successful tool output and restart coverage includes an in-flight summary. No remaining blocking findings.
- Native tokenizer estimates/cut-point behavior remain authoritative; fixtures do not establish real-model summary quality or universal fit.
