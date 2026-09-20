# Verification status and evidence boundaries

This public-facing summary derives from retained private reports and selected raw results. Those archives are not distributed or assigned a fictitious public URL. The only historical evidence file included here is the required generated [round-trip fixture](evidence/stage-4/round-trip.flyfork.json).

## Historical 4.5D-R3 baseline

- Two preregistered coverage runs each passed **113/113**, exit 0. Matrix durations: **113561.239 ms** and **113910.442 ms**, against **120000 ms**.
- D-REGRESSION passed within its defined automated scope; D-COV and EVIDENCE_ROUTING passed. Coverage: lines 95.40%, branches 93.34%, functions 98.46%, statements 95.87%; thresholds stay 90/85/90/90.
- COVERAGE_STABILITY covers only two samples. The narrowest margin is about **6.090 seconds / 5.07%**, not another-host assurance. CAUSE is **PARTIAL**: sampled advance/replay work dominated, but the unique cause of the historical 142911 ms timeout is unknown.
- Twenty-three helper cases were added (38 total, 100% instrumented helper coverage). This is not React, Dexie or complete UI coverage.
- R2 Chrome54/WebKit42/legacy smoke2/Python6 were **HASH_INHERITED into R3**, not new R3 browser/Python runs. Lost R2 coverage HTML/JSON remains a **DOCUMENTED_INCIDENT**; later guards did not restore originals.

Historical product-manifest fingerprint: `b77c3f20316c5457e980865495e562deff51df5e79dea193e21c909ee43d3952`. Historical all-src fingerprint including unit tests: `119e978b50b52f684fb98d5f955f665435949962f165a3e0655888b557427fc1`. These inventories differ; neither is a Git commit or this archive's hash. Use SOURCE_MANIFEST for candidate membership and hashes.

## Browser and device limits

R2 production-preview evidence used macOS/M4 Pro, Google Chrome 153.0.8010.53 and Playwright WebKit 26.6 with Playwright 1.63.0. R3's reference Node was 24.19.0. These historical versions do not describe a later user's machine.

Closed R1/R2 command, storage, round-trip, focus and cancellation fixes retain their scoped results. **D-WKSAVE and D-GUIDE remain OPEN_NOT_REPRODUCED.** The first WebKit Save failure trace exists and records a Saved expectation timing out while Unsaved history remained visible. The first Guide failure lacks equivalent trace/state capture. This corrects a later blanket "traceless" description; it does not establish a cause or fix.

Firefox launch was **ENVIRONMENT_BLOCKED** before app acceptance; D-FF-APP is **NOT_RUN**. Real Safari and VoiceOver are **NOT_RUN**, pending user-operated M4 Pro checks. iPhone, Android and iPad access is **NOT_CONFIRMED**, physical acceptance **NOT_RUN**. WebKit and emulation do not replace those checks.

Named Save frame extremes of 66.1/66.7 ms remain **OPEN_OBSERVATION**, not total Save duration or proven CPU task duration. Controlled physical performance and separate numerical R2 pending-text contrast remain open. Axe/screenshots are not complete WCAG or VoiceOver certification.

## Source-packaging scope

Work Package 1 changes docs, notices, packaging and output routing. Product algorithms, existing assertions, data, lockfile and thresholds remain protected. Tiny real-reporter tooling tests are not numerical/browser acceptance. Routing/config differences are reported separately; old hash inheritance is not a new campaign on this candidate.

Each command records a plan, effective output destinations and exit status in a fresh artifact root. A clean host build is not Linux/container/Netcup acceptance. The local delivery report supplies actual installation/build/tooling results. Full acceptance, independent review and publication are later work packages.

## Stage 5 acceptance boundary

WP3 ran one clean Linux ARM64 coverage campaign:112/113, matrix144825.611ms against120000ms, exit1 **FAIL**. All24 numerical/replay rows matched; that does not override the timeout. R3's two historical host passes remain separate, CAUSE PARTIAL and narrow margin remain. R1 does not rerun full coverage or change its provider, timeout, scope or algorithms. Normal unit/golden/matrix results on the repaired source are a different gate.

WP3 Chrome54 passed; first WebKit41/42 had a transaction-origin CSP failure, followed by a separate1/1 harness pass. Firefox40/42 retained import/load and unavailable WebGL failures. Separate production-CSP5/12 smoke passed all three engines, excluding Firefox rendering. Normal M4 drawing passed in that bounded sample; long Save frames remained open. R1 local delivery records its own final source/image, focus fixes, test changes and generation-pair results; no old archive is labelled a new run.

Use the [release pair and runtime test instructions](release-pair.md) for current packaging. Real Safari/VoiceOver remain user-operated NOT_RUN; mobile access NOT_CONFIRMED. Independent review and publication remain separately authorized.

## First experimental public release

Coverage120s remains historical FAIL:112/113,144825.611ms >120000ms; it is an explicitly accepted exception for this narrow preview, not a green coverage gate. The current release runs full normal unit/golden and packaging checks without a new coverage/browser/performance campaign. Public HTTPS5/12 and one same-origin pair rollback are launch-specific checks; their actual results and registry identities belong to the release notes. Historical platform limitations above are not erased. See [release decisions](release-preparation.md).
