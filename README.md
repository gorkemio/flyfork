# FlyFork

FlyFork compares **Original / Fork A / Fork B** from one complete simulated state. It uses a real **MaleCNS v1.0 selected subgraph**: 80 cells, 4,011 directed edges and 30,636 internal synapses. Dynamics, sensory input, the world and the PN-to-body decoder are modeling assumptions. This is not a whole-brain model or validated animal behavior.

**Experimental preview:** [live desktop demo](https://flyfork.org) · [source and issues](https://github.com/gorkemio/flyfork). Original project code is [MIT](LICENSE), Copyright (c) 2026 Görkem İnanç Özdemir. Third-party code, data and assets retain separate terms; see [licenses and provenance](docs/licenses.md). This is a narrow desktop demo, not a stable or universally validated product.

## Run locally

The verification toolchain is **Node.js 24.19.0** and **pnpm 11.25.0**, available on PATH. The package's broader Node 24.x engine declaration is unchanged. No global installer is provided.

```sh
node scripts/verify.mjs install
pnpm dev
```

The first command checks the actual Node/pnpm entrypoints, executes frozen install with that same pnpm, then verifies the child process paths and versions. A wrong version or shell wrapper fails instead of continuing with another toolchain. It records the paths, versions, command and exit status. Open [the local app](http://127.0.0.1:5173). For a production build and local preview:

```sh
pnpm build
pnpm preview
```

Open [the preview](http://127.0.0.1:4173). Vite preview is a local check, not a production server. The prepared dataset is bundled into the Worker. Normal build needs no Codex, Graphify, skill account, Python, raw Feather downloads or API key. Runtime simulation/storage need no external service. A pin-verified Linux builder and non-root static Nginx runtime are available for [local container verification](docs/deployment.md); the public service uses a pinned AMD64 image and manual release gate.

## Your first experiment

Choose **Run guided experiment** or **Start blank experiment**. The guide computes seed 42 to 2 s, captures S₀, creates both forks, records A suppression 1 on the left DM1 PN and B odor gain 0 during [3,8) s, and computes to 12 s. Every step waits for the authoritative Worker. Paths and metrics are calculated, not prerecorded animation.

**Compare states** compares different branches at one tick. **Replay check** recomputes each branch from its own start and immutable events. **Branches differ** and **Replay Matched** can both be correct. Same-runtime replay does not promise cross-runtime bit equality or biological validity.

The editor remains a **Not applied** draft until Apply intervention. At a 5 s view of a 12 s record, Save retains both times. A fresh load is paused and **Not checked** until replay completes. Read the [user guide](docs/usage.md), [model boundaries](docs/model.md) and [record contract](docs/record-format.md).

Library belongs to one **browser, profile and origin**. Dev/preview ports have separate Libraries. Changing domain, protocol or profile also changes storage. Export `.flyfork.json` files to back up or transfer records. Server backups do not back up browser IndexedDB. Eviction/deletion can remove local data. There is no account, cloud sync or service-worker installation.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test:tooling
pnpm build
```

Every verification command reserves a new `artifacts/verification/<run-id>`. Logs, plans, JSON/coverage, screenshots and traces use recorded destinations. Existing run directories cannot be reused. Do not set reporter/output environment variables or append CLI overrides; conflicting settings fail before tests start.

The following are separate, heavier acceptance commands, not part of the source-packaging check:

```sh
pnpm test:unit
pnpm test:coverage
FLYFORK_PREVIEW=1 pnpm test:e2e
FLYFORK_PREVIEW=1 pnpm test:e2e:webkit
FLYFORK_PREVIEW=1 pnpm test:e2e:firefox
FLYFORK_PREVIEW=1 pnpm test:smoke
```

Coverage runs all unit/integration tests with one worker and the unchanged 24-condition matrix/deadline. Browser commands need separately available matching binaries and never install them. Chrome uses installed Google Chrome. WebKit is not Safari; mobile viewports are not physical devices.

[Verification status](docs/verification.md) separates historical R3/R2 results from candidate checks. The Linux Coverage120s run remains **FAIL**:112/113 tests,144825.611ms against120000ms. Two R3 PASS runs do not erase it. This experimental release explicitly accepts that instrumentation/deadline limitation; coverage is a separate manual diagnostic with its real failing exit preserved. Firefox, physical Safari/mobile, VoiceOver and controlled physical performance retain documented gaps. Helper coverage does not cover React/Dexie/UI behavior.

## Source candidate and optional data work

```sh
pnpm source:pack
```

This creates a fresh allowlisted `source/`, `SOURCE_MANIFEST.json` and `flyfork-source-candidate.tar.gz` inside the new run. It uses BSD or GNU tar, normalizes archive ownership, and omits extended metadata. It copies no node_modules, raw data, private traces, tools or personal settings. In an extracted candidate, `pnpm source:check` verifies membership, hashes, permissions and document links; generated install/build outputs are ignored explicitly. Hashes establish integrity, not authorship or rights.

Both required inputs remain: [behavior preregistration](docs/plan/stage-3-behavior-preregistration.md) and [round-trip fixture](docs/evidence/stage-4/round-trip.flyfork.json). The latter is a generated test experiment, not a supplied user Library record. Its original bytes are retained.

Python 3.12 and [pinned data requirements](scripts/data/requirements.lock.txt) are optional for data preparation/regression. See [data rebuild boundaries](docs/model.md). Raw rebuild scripts write prepared data and historical report targets; inspect them and use an explicitly authorized disposable copy before rebuilding. They are not normal verification commands.

See [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md) and [release preparation](docs/release-preparation.md). The normal update path is manual and retains the previous generation’s required assets for at least24hours; a source push does not deploy production. There is no stable support guarantee or SLA.

## Experimental support

The verified interaction path is desktop Google Chrome, with prior physical evidence on M4 Pro/macOS. Real Safari/VoiceOver and physical phones/tablets are not confirmed. A prior Linux headless Firefox graphics failure is an environment limitation, not a claim that all Firefox installations fail. Responsive layouts do not certify mobile support.

Experiments retain the120 **model-second** limit. This differs from the120 **wall-clock-second** coverage budget. Earlier long-Save samples observed about71ms frame intervals and300–360ms commits; these are not universal upper bounds. No FPS or latency guarantee is made for other hardware. Historical isolated WebKit/Guide/import/Checking events remain documented rather than retroactively marked fixed.
