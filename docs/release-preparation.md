# Experimental release decisions

FlyFork original code is MIT, Copyright (c) 2026 Görkem İnanç Özdemir. The public source repository is [gorkemio/flyfork](https://github.com/gorkemio/flyfork). Package version 0.1.0 uses unique preview identifiers. The initial release was `v0.1.0-preview.1`; the R1 interface and English-source publication uses `v0.1.0-preview.2`, with a separately verified image pair before manual deployment. Third-party licenses remain separate; see [licenses and provenance](licenses.md).

Görkem İnanç Özdemir monitors [Private Vulnerability Reporting](https://github.com/gorkemio/flyfork/security/advisories/new). Normal bugs use Issues. Support is best-effort with no response SLA. PVR activation, repository-specific notifications and public runtime checks must be verified during launch; writing this document is not evidence of those settings.

This is an experimental source release with limited physical desktop testing. Primary physical interaction evidence is Google Chrome on M4 Pro/macOS. Other hardware performance is not guaranteed. Physical Safari/VoiceOver and phone/tablet remain NOT_CONFIRMED. The historical Linux headless Firefox graphics issue is not a claim that all Firefox installations fail. Old WebKit/Guide/import/Checking observations are retained as historical uncertainty.

Coverage120s historically **FAIL**:112/113,144825.611ms >120000ms. Two later R3 passes do not erase that failure. This first experimental release explicitly accepts the instrumentation/deadline limitation; the coverage command, failure exit, provider, timeout and24 conditions remain unchanged. CI runs the normal full unit/golden suite and required packaging checks; it does not imply coverage passed. Broad/stable support requires a separate measured runner/deadline decision.

Previous narrow long-Save measurements observed about71ms frame spacing and300–360ms commits. These are observations, not universal ceilings. No performance or serializer optimization accompanies this release. The120 model-second experiment limit is distinct from the120 wall-clock-second coverage deadline.

A public pair retains the current and previous own-generation. The previous assets stay at least24hours after activating the new generation. Main pushes verify source; they never deploy production. Image publication is manual. The [release gate and rollback procedure](deployment.md) stores activation state outside the checkout and checks the24-hour window. Same-pair rollback retains both generations. Very old tabs outside the window should export and reload; no user data is cleared remotely.

Source builds and native AMD64 assembly run in GitHub Actions; the VPS only pulls prebuilt digests. There is no server experiment database, login, cloud sync or new backend. Browser-local Library data requires local export; a server backup is not a Library backup.

The current source excludes private authoring documents. Ordinary removal from main does not erase historical commit/tag copies or earlier immutable release assets. The public testing specification is an English transcription with distinct provenance and file hashes; prior evidence remains unchanged.
