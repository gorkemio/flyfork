# Intervention matrix: English transcription of the original preregistration

This is an English transcription and relocation of the Stage 3 behavior preregistration, not a newly preregistered study. The original document was written after the independent suppression RK4 checks (.75±1e−10/.75/.2/.999), a→1, full clamp, identity and earlier Synthetic golden tests passed, and before the real intervention matrix was run. The model, source package, default arena, odor and decoder remained the same as Stage 2.

The exact original is retained privately. Its SHA-256 is `ea9b5b7803bb1eba43e6c26510e3c7e00506e0deec40bc6fc84551d69b1e0457`. This is the original provenance hash, not the hash of this English file. The English file has its own frozen hash in [the source allowlist](../../scripts/source-allowlist.json); new matrix reports record both identities. Historical reports retain their original hashes.

## Fixed conditions and windows

Seeds: **1, 42, 2026**. Each seed advances from initialization to S₀ at **2 s**. Every condition advances from S₀ to **12 s**, a **10 s comparison window**. The intervention interval is **[3 s, 8 s)**, with an exclusive end.

Eight conditions per seed, in fixed order:

1. No-op.
2. Left-soma `DM1_lPN` suppression, a=0.
3. Left-soma `DM1_lPN` suppression, a=.5.
4. Left-soma `DM1_lPN` suppression, a=1.
5. Shared odor gain=0.
6. Shared odor gain=.5.
7. Shared odor gain=1.
8. Shared odor gain=2.

Left PN source IDs come from the actual dataset selection. There is no new seed, group or parameter search. All **24 results** are reported.

## Measurements and invariants

Measurements: window PN mean and difference; raw ratio/speed; commanded speed; cap fraction/time; turn; displacement/path/net; collision stall fraction/time; A–Original position divergence; exploration; goal proximity/entry; intervention game cost. PN means projection neuron. The implementation and measurement definitions are in [the matrix test](../../src/experiments/matrix.test.ts) and [metrics](../../src/metrics/metrics.ts).

No-op, a=0 and gain=1 are expected to have complete numerical identity. An effective intervention need not produce a different route or success. Replay against each branch's own history must match exactly; differences between branches are an independent question. No hidden decoder or odor corrections are allowed.

The 10 s horizon is a feasibility scope. It establishes neither biological validation nor a general behavioral claim.
