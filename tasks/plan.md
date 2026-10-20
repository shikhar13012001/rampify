# Rampcut production-readiness plan

The canonical implementation plan is [the dated production-readiness plan](../docs/superpowers/plans/2026-10-17-production-readiness.md). It defines scope, shared interfaces, files, regressions, dependencies, release gates and rollback.

Execution state lives only in [todo.md](todo.md). Evidence and current findings remain in [STATUS.md](../docs/validation/STATUS.md).

Start with Task00 (verification baseline) and Task17 (real browser export harness), then execute the milestone order in the canonical plan. Billing tasks13-15 are an independently verifiable track. Do not mark a task complete without its required evidence.

The original planning pass was documentation only. A subsequent local repair phase is recorded in STATUS.md and progress.md. Unchecked checklist entries remain unfinished; a plan or local test does not authorize deployment, provider changes, production migration or outreach.
