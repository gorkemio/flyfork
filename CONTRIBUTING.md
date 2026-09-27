# Contributing to FlyFork

Contribute through [gorkemio/flyfork](https://github.com/gorkemio/flyfork). Original project code is MIT; preserve all third-party notices. This first release is an experimental preview.

Use the toolchain and frozen installation in [README](README.md). Start with a narrow change and explain observable behavior and evidence. Keep model changes separate from UI, packaging and documentation.

```sh
pnpm typecheck
pnpm lint
pnpm test:tooling
pnpm build
```

These commands use the protected runner. Small tooling tests exercise real reporters and negative controls, not the full numerical matrix. Simulation/recording changes also need separately scoped unit/coverage and relevant browser acceptance described in README. Do not weaken assertions, tolerances, timeouts or coverage thresholds, skip tests, or regenerate a worse visual baseline to obtain a pass.

Preserve the fixed 0.1 ms engine, complete snapshots, fork isolation, same-tick comparison, recorded future, own-history replay, atomic storage and explicit recovery limits. Scripts must not require a maintainer's filesystem, browser profile or private archive.

New files are not automatically packaged: add an explicit path and purpose to [the allowlist](scripts/source-allowlist.json). Frozen hashes require review, not silent regeneration. Keep old evidence read-only. Never publish generated traces, user recordings, secrets, stores or private archives by default.

Python data sources are for inspection and separately scoped data work, not normal app build. Dataset selection, model parameters and fixture bytes require their own reviewed evidence.

For ordinary bugs, include steps, candidate/build identity, actual browser/OS and expected versus observed behavior. Review attachments for personal data. Report security issues privately as described in [SECURITY](SECURITY.md). No CI badge, response deadline or support SLA is claimed.

## Documentation and research contributions

Public first-party prose is English. Preserve proper names, scientific IDs, original licenses and frozen data. The [public roadmap](ROADMAP.md) identifies scoped opportunities; the [research overview](docs/research/overview.md) separates model evidence from unresolved biological mapping. Label AI-assisted development or review honestly if described; model agreement is not scientific evidence.

Keep private plans, prompts, agent instructions, review archives and design references outside the public tree and Docker context. The [intervention specification](docs/testing/intervention-matrix.md) is a relocated English transcription, not a new preregistration. Its original provenance hash differs from its frozen English-file hash. Preserve the 24 conditions and historical evidence identities.
