# Connectivity, model and provenance

FlyFork uses MaleCNS v1.0 (June 8, 2026), attributed to the MaleCNS collaboration: FlyEM/HHMI Janelia, University of Cambridge, MRC Laboratory of Molecular Biology and Google Research. Data is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see [official downloads](https://male-cns.janelia.org/download/) and the [prepared manifest](../data/prepared/male-cns-dm1.manifest.json).

Selection includes all ORN_DM1, DM1_lPN and lLN2F_b cells in the documented min-confidence 0.5 input, with positive internal connections. The induced subgraph has **80 neurons, 4,011 directed edges and 30,636 internal synapses**. It retains source identifiers, side/NT mapping and raw counts; it does not invent missing connections or sample arbitrary cells.

The selection cuts **184,078 of 214,714 incoming** and **323,986 of 354,622 outgoing** synapses incident to these cells. Missing external drive is a limitation. Prepared JSON is 61,177 bytes, SHA-256 `38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d`. Source hashes, release, transport MD5 and transformation identity remain in the manifest. Local hashes are not publisher signatures.

LIF dynamics, the fixed 0.1 ms Float64 timestep, refractory handling, odor field, stochastic streams, world and PN-to-body decoder are engineering assumptions. PN means projection neuron, not motor neuron. The decoder divisor 400 and 6 units/s speed cap can dominate movement. This is not a whole brain, validated animal behavior, biological control success or institutional endorsement.

The [engine](../src/simulation/engine.ts), [parameters](../src/simulation/config.ts), [PRNG](../src/simulation/prng.ts) and [dataset adapter](../src/datasets/adapter.ts) are the implementation. [The intervention specification](testing/intervention-matrix.md) is a faithful English transcription of the original preregistration, with separate original and transcription hashes. Compare and own-history replay test different properties; neither establishes biology or cross-runtime bit equality.

## Optional data tools

[download.py](../scripts/data/download.py), [prepare.py](../scripts/data/prepare.py), [test_prepare.py](../scripts/data/test_prepare.py) and [requirements.lock.txt](../scripts/data/requirements.lock.txt) are included. Preparation needs Python 3.12 and pinned PyArrow. The six historical data tests use small inline fixtures. Normal app build needs no Python.

Raw inputs total 1,109,008,094 bytes. The downloader validates complete files; partial downloads are not consumed. Raw data stays outside public assets. The unchanged preparation entry point writes the prepared dataset and a Stage 2 report path. It is provenance source, not a safe in-place regeneration command. Rebuild only in an explicitly authorized disposable copy after reviewing paths. No raw data or private report archive accompanies this candidate.
