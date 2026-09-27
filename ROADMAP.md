# FlyFork public roadmap

This roadmap describes product and research directions, not a private execution plan or a delivery-date commitment. Scientific changes require a specific question and evidence; larger networks alone do not establish a better model.

## Available in the released experimental product

- The selected 80-neuron MaleCNS circuit, complete snapshots, Original/A/B branching and timed suppression/odor-gain interventions.
- Same-tick comparison, recorded-history navigation and replay against each branch's own history.
- Browser-local Library, portable export/import and bounded recovery.
- Manual static deployment with immutable image identities and a two-generation rollback policy.

These capabilities retain the [model limitations](docs/model.md), [storage boundaries](docs/usage.md) and [verification history](docs/verification.md). A repository update does not automatically update the live demo.

## Completed locally, with retained evidence

The accepted UI Refinement01-R1 reorganizes existing controls and results without changing model behavior. Its main-branch screenshot is in [README](README.md). At a 390×844 viewport the arena still starts about 1,046 px down the page; physical mobile usability remains unconfirmed.

[B0, R01, R02-B and R02-C](docs/research/overview.md) completed bounded local investigations. They establish static inventory, model sensitivity and same-runtime recomputation, with only partial anatomical support and qualitative external comparison. Research runners and full raw archives are not yet public. This is not a claim of biological validation or complete public reproducibility.

## Next priorities

| Milestone | Deliverable | Evidence needed for acceptance |
| --- | --- | --- |
| Maintainability and contributions | Clear module boundaries, contributor examples and focused regression guidance | A new contributor can run the documented setup and a scoped change; protected state/replay and packaging checks still pass |
| Usability and access | Measured keyboard, assistive-technology and physical narrow-screen findings, then separately reviewed improvements | Named device/browser results and task completion evidence; emulation alone is insufficient |
| Anatomical observation mapping | Versioned mapping of the two DM1 PNs to their relevant compartments and side annotations | Same-release cell/ROI records establish the mapping, or explicitly record unresolved fields; soma side alone is insufficient |
| External neural benchmark | A stimulus/measurement contract and accessible paired experimental data | Defined units, windows, baseline, trial identities and input mapping; an evaluation protocol fixed before fitting, with held-out evidence where justified |
| Reusable research apparatus | Sanitized runners, compact result tables and provenance instructions | An independent run reproduces specified technical outputs from public dependencies; missing data and runtime limits are explicit |

## Longer-term research directions

| Direction | Deliverable | Evidence needed before claiming progress |
| --- | --- | --- |
| Question-led circuit expansion | A documented circuit selection addressing a concrete neural question | Traceable inclusion/exclusion rules, boundary-input assumptions and comparison against the smaller circuit; no selection solely for appealing movement |
| Reusable circuit adapters | Dataset adapters with explicit IDs, signs, units and provenance | Small independent fixtures and full snapshot/event compatibility checks; unsupported semantics fail clearly |
| Profiling-led scaling | Measured compute, memory and rendering improvements | Representative workload profiles and unchanged numerical/replay outcomes within stated guarantees; no blanket performance promises |
| Broader brain and CNS models | Incrementally larger, question-specific models | Resource feasibility, defensible external inputs and neural benchmarks at each scale; biological claims evaluated separately |

Whole-brain and whole-central-nervous-system modeling are long-term goals. They are not current capabilities or a guaranteed six-month delivery. A technically reproducible run can still be a scientifically inadequate model.
