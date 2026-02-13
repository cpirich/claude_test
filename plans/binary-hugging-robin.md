# Refactor CI Workflows

## Context
The `optimize-playwright-tests` branch accumulated debugging infrastructure (e2e-debug.yml, verbose diagnostic test, Fast Refresh workarounds) while hunting a ROM loading bug. Now that the root cause is fixed (`loadBytes` not writing to ROM space), we should clean up the CI workflows and split E2E into a parallel job.

## Changes

### 1. Delete `e2e-debug.yml`
Temporary debugging workflow, no longer needed.

### 2. Split `ci.yml` into parallel jobs

**Job 1: `lint-and-test`** (fast, ~2 min)
- Checkout, install, type check, lint, vitest

**Job 2: `e2e`** (parallel, ~4 min)
- Checkout, install, build, install Playwright, run E2E, upload artifacts on failure

Both jobs run in parallel with no dependency between them. The build step only runs in the `e2e` job since unit tests and lint don't need it. This avoids artifact sharing between jobs — simpler and no serial dependency.

### 3. Slim down the diagnostic test in `trs80.spec.ts`

Replace the verbose `TRS-80 ROM Loading Diagnostics` describe block with a focused smoke test that:
- Verifies route interception delivers correct ROM data (size + first byte)
- Confirms the ROM actually loads (type `PRINT 1+1` and check for ` 2` in output, distinct from the typed command)

Remove: console message capture, error dialog checks, multi-step logging. Keep it under 30 lines.

### 4. Keep `playwright.config.ts` production-build approach

The `npx serve out -l 3000` approach on CI is sound — deterministic, no HMR, fast startup. Simplify the comment to reflect that static serving is preferred for CI reliability (rather than focusing on the now-fixed Fast Refresh issue).

## Files to modify
- `.github/workflows/ci.yml` — split into 2 parallel jobs
- `.github/workflows/e2e-debug.yml` — delete
- `tests/e2e/trs80.spec.ts` — slim down diagnostic test
- `playwright.config.ts` — simplify comment

## Verification
1. `npx vitest run` — unit tests still pass
2. `npx playwright test tests/e2e/trs80.spec.ts` — TRS-80 E2E tests pass locally
3. Push to branch, verify both CI jobs run in parallel and pass
