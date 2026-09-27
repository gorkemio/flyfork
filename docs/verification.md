# Verification status and evidence boundaries

Verification results describe a particular source, runtime and test scope. This page summarizes retained private evidence without publishing host paths, traces, user records or private archive links. The required generated [round-trip fixture](evidence/stage-4/round-trip.flyfork.json) is a test input, not a user's Library export.

## Current source and interface

UI Refinement01-R1 preserves the experiment model and reorganizes existing controls/results. Its accepted local appearance is separate from production deployment. Historical R1 checks on **Node 24.21.0** passed 62 focused unit tests and 51 UI tests; they are not Node 24.19.0 reruns. The original tooling run passed 37 of 39 and failed two exact-runtime checks on 24.21.0; that failure remains retained.

A later isolated **Node 24.19.0 / pnpm 11.25.0** run passed 39/39 tooling checks, typecheck, lint and build. Runtime acquisition used official HTTPS downloads and full SHA-256 comparison; PGP signature verification was not performed. Its first build-smoke launch inherited the wrong server configuration and working directory, exited before test execution and collected zero tests. That is a preserved **SETUP FAIL**, not application acceptance or a product failure.

The public source now uses an [English transcription of the intervention preregistration](testing/intervention-matrix.md), with separate original and transcription hashes. All 24 numerical conditions, seeds, windows, assertions and the 120000 ms matrix timeout remain unchanged. Packaging rejects private plans, prompts and agent instructions while retaining the frozen data and round-trip fixture. New source-publication results are recorded separately below; earlier evidence is never relabelled.

At 390×844, the accepted arena begins approximately 1,046 px down the page, outside the first viewport. This remains a known usability limit. The existing 800 kB chunk-size warning is also retained; no bundle/renderer optimization accompanies this publication.

## Historical numerical and coverage results

The 4.5D-R3 baseline had two preregistered instrumented passes, each 113/113: matrix durations 113561.239 ms and 113910.442 ms against 120000 ms. Coverage was lines 95.40%, branches 93.34%, functions 98.46%, statements 95.87%; thresholds remain 90/85/90/90. Two samples provide only narrow evidence: the closest margin was about 6.090 s (5.07%). The unique cause of an earlier 142911 ms timeout remains only partially understood.

A later clean Linux ARM64 coverage campaign **failed: 112/113, 144825.611 ms > 120000 ms**. All 24 numerical/replay rows matched, but that does not override its timeout. The experimental release accepts this instrumentation/deadline limitation; it does not turn coverage green. The coverage command, provider, timeout, conditions and thresholds remain protected. Required source CI runs the normal unit/golden suite, not a new instrumented coverage campaign.

R2 Chrome 54, WebKit 42, legacy smoke 2 and Python 6 results were inherited into R3 by hash, not executed again there. Lost R2 coverage HTML/JSON remains a documented incident; later output guards did not restore the originals. Historical source fingerprints describe those old inventories, not the current candidate or Git commit.

## Browser, storage and device history

Historical R2 production-preview checks used macOS/M4 Pro, Chrome 153.0.8010.53 and Playwright WebKit 26.6 with Playwright 1.63.0. These versions describe those runs, not every later machine.

Earlier isolated WebKit Save and Guide observations remain **OPEN_NOT_REPRODUCED**. The first WebKit Save trace records a Saved expectation timing out while Unsaved history remained visible; the first Guide observation lacks equivalent trace/state capture. Neither a later pass nor a missing trace proves the cause fixed.

WP3 Chrome passed 54 tests. Its first WebKit run passed 41/42 with a transaction-origin CSP failure, followed by a distinct 1/1 harness check. Firefox retained 40/42 with import/load and unavailable-WebGL failures. A separate production-CSP 5/12 record smoke passed all three engines while excluding Firefox rendering. These scopes must not be combined into universal browser acceptance.

Physical Safari/VoiceOver remains **NOT_RUN**; iPhone, Android and iPad access is **NOT_CONFIRMED**, physical acceptance **NOT_RUN**. Browser engines and CSS viewport emulation do not substitute for those checks. Automated accessibility checks do not certify full WCAG or screen-reader usability.

Named-Save frame samples of 66.1/66.7 ms and later roughly 71 ms spacing remain observations, not total Save duration or universal ceilings. Earlier 300–360 ms commit observations are also bounded samples. Controlled physical performance remains open. The 120 model-second record limit differs from a 120 wall-clock-second test deadline.

## Interpreting a new release

Each protected command records input identity, output destinations and exit status in a fresh evidence directory. A source candidate is identified by its manifest and archive hashes; a build-info hash, Git commit and registry digest are distinct identities. Source-package verification checks membership, bytes, permissions and relative links in an independently extracted candidate.

[Required source CI](../.github/workflows/verify.yml) performs exact Linux-toolchain installation, typecheck, lint, normal unit/golden tests, build, tooling and package checks. Only its result for the exact pushed commit applies. [Manual image publication](../.github/workflows/publish.yml) reuses that build; it does not deploy. A local build smoke is not Dokploy, container, TLS or CDN acceptance. Public launch and rollback observations belong to the particular release's notes and identities. See [deployment](deployment.md) and [release decisions](release-preparation.md).

## R1 source-publication local checks (2026-09-27)

The isolated Node 24.19.0 / existing pnpm 11.25.0 run passed **40/40 tooling tests**, typecheck, lint and build. The affected normal matrix test passed once with all **24 conditions** and exact own-history replay, in about 34 s; this was not instrumented coverage or a repeat of B0/R01/R02.

After a separate resolved-config/test-list inspection, **one corrected Chrome build smoke passed (1/1, retries=0)** against a separately served verified production build. It exercised a genuine record viewed at 5 s with a 12 s frontier, Save, reload, Library load, export/import into a fresh context and fresh Replay at 5 and 12 s. The inherited development web server was entirely omitted. The earlier zero-test SETUP FAIL remains preserved. This pass establishes local build behavior, not public TLS/CDN/container or physical-device acceptance.

Accepted R1 source bytes remain unchanged during publication. Only matrix document identity/report prose and source-packaging/documentation metadata changed beyond that accepted interface. Final source-candidate and exact-commit CI identities are recorded in the release evidence, separately from these local runs.
