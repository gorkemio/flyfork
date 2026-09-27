# Research overview

FlyFork currently supports reproducible **within-model** experiments. The summaries below come from completed, retained local reports; publication of this page did not rerun the studies. Anatomical counts, simulated neural responses, decoder commands and biological measurements are different quantities.

The studies used the selected MaleCNS dataset (80 neurons, 4,011 directed neuron-pair edges, 30,636 internal synapses). Source baseline: `94983af18f2b7ea5ea98582f857ec760aaf162ad`. Prepared dataset SHA-256: `38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d`. These are provenance/integrity identities, not validation certificates. [Model and source attribution](../model.md) explains the selection and assumptions.

## B0: static connectivity inventory

Run `b0-20260926T195122Z-2f32034d` independently counted the prepared graph without running a simulation. It confirmed 74 ORN_DM1 cells (35 left, 39 right), two DM1_lPN cells and four lLN2F_b cells. There were no self-edges in this selection.

| Source → target | Directed pairs | Internal synapses |
| --- | ---: | ---: |
| ORN_DM1 → ORN_DM1 | 3,195 | 8,409 |
| ORN_DM1 → DM1_lPN | 145 | 13,384 |
| ORN_DM1 → lLN2F_b | 289 | 4,030 |
| DM1_lPN → ORN_DM1 | 80 | 173 |
| DM1_lPN → DM1_lPN | 0 | 0 |
| DM1_lPN → lLN2F_b | 4 | 68 |
| lLN2F_b → ORN_DM1 | 290 | 3,744 |
| lLN2F_b → DM1_lPN | 4 | 326 |
| lLN2F_b → lLN2F_b | 4 | 502 |

This establishes inventory, not firing rate, physiological connection strength or biological validation. ORN `rootSide` and PN `somaSide` describe different anatomical attributes; a matching label is not proof of ipsilateral physiology. Unequal ORN counts also make raw side totals unsuitable for direct per-cell comparison.

## R01: input, suppression and decoder sensitivity

Run `r01-20260921-002`, final apparatus revision A03, retained **280 scientific trajectories** across eight prespecified model seeds: 200 fixed-input suppression cases, 32 additional gain cases and 48 native arena cases. Eight gain-one identity cases were technical checks, not additional scientific samples. Forty-eight unique prefixes were independently initialized twice; all 288 saved-state tails (280 science + 8 identity) recomputed exactly in the same engine/runtime. Offline decoder analysis reused these signals rather than generating alternative routes.

The primary spike-count window was 3–8 s in a 12 s horizon. Full local-neuron clamp increased two-PN mean rate in all 40 input/seed pairs, but partial suppression did not invariably increase it: among 160 treated input/seed/magnitude cases, 143 changes were positive, nine negative and eight zero. This is descriptive model sensitivity, not an inferential biological result.

Decoder masking was substantial. At fixed input C≥0.2, all native E1 conditions reached the 6 model-units/s cap at every primary-window observation despite neural differences. In the native arena, full local-neuron clamp changed mean PN rate by +20.863 Hz while commanded speed stayed capped and path length stayed 30 model units. Equal path length does not establish identical routes. Offline divisor changes did not feed back into the engine and cannot establish better closed-loop behavior.

Same-runtime recomputation demonstrates consistency of the implementation and recorded history. It is not an independent solver, cross-runtime equality or biological validation. Two seconds of initialization were not demonstrated to be steady state. The final report preserves an initial pilot index-write failure and its authorized harness-only repeat; neither pilot selected scientific outcomes.

## R02-B: sided PN response within the model

Run `r02b-20260927T094949Z`, analysis `analyze-20260927T100035660052Z`, retained **32 valid conditions**, with no missing or invalid scientific cases. Seeds 1–8 each had left/right fixed input ([0.2,0] or [0,0.2]), with pulse and gain-zero sham. Gain was zero during [0,2) s, one during the pulse [2,2.5) s, then zero to 3 s; sham stayed zero throughout. This gates external event intensity, not physical odor arrival or antennal ablation.

Primary rates use counter differences over [2.1,2.6) s, divided by 0.5 s; baseline uses [1.5,2.0) s. For each direction, d is the pulse matched-minus-opposite PN rate minus the sham matched-minus-opposite rate. D is (dLeft+dRight)/2. “Matched” here compares ORN root-side and PN soma-side labels.

| Model seed | dLeft (spikes/s) | dRight (spikes/s) | D (spikes/s) |
| --- | ---: | ---: | ---: |
| 1 | 46 | 40 | 43 |
| 2 | 38 | 40 | 39 |
| 3 | 36 | 44 | 40 |
| 4 | 38 | 40 | 39 |
| 5 | 40 | 36 | 38 |
| 6 | 46 | 34 | 40 |
| 7 | 36 | 46 | 41 |
| 8 | 38 | 38 | 38 |

D has **mean 39.75, median 39.5, range 38–43 spikes/s**. All 16 direction effects were positive; the method would also retain zero or reversed effects. Equal left/right means do not establish general symmetry. All 32 tails and 16 independently generated prefix pairs matched in the tested runtime. Eight model seeds are not eight animals; no p-values, biological acceptance thresholds or causal attribution to a specific anatomical feature follow.

## R02-C: anatomical and external-data mapping

Run `r02c-20260927T102631Z` was a source review, not a new simulation. PN 10208 and PN 10176 each received **partial anatomical support**: source body IDs, DM1_lPN type and L/R soma annotation were verified. Two native morphology files were inspected, but available files lacked the postsynaptic region distribution needed to establish DM1 dendritic side. Absence of contradiction did not fill that gap.

The report selected the paired DM1 PN sided-response measurement in Gaudry et al. (2013), Figure 2g, as a relevant external target. The current disposition is **qualitative comparison only**. That figure's regression is not R02-B's sham-subtracted direction-average D. Paired trial-level spikes/counts, baseline/window definitions, intact-antenna side and a defensible physical-stimulus-to-model-input mapping remain unresolved. Bhandawat (2007) and Olsen (2010) were reviewed but not selected as ready benchmarks or independent holdouts.

A same-release anatomical mapping and a versioned stimulus/measurement contract are prerequisites for quantitative comparison. Arbitrarily converting model C to a physical dose, or taking a ratio, does not resolve these differences. No neuPrint query, data request or new model calibration was executed in that review.

## What is public and reproducible today?

The repository provides the product engine, frozen prepared dataset, focused numerical tests, [24-condition intervention specification](../testing/intervention-matrix.md) and [portable-record fixture](../evidence/stage-4/round-trip.flyfork.json). This page publishes only a sanitized summary and small existing tables.

The dedicated B0/R01/R02 research runners, full private reports and raw Node/V8 archives are **not public**. The complete studies cannot currently be reproduced from this repository alone; their binary archives are not app-importable recordings. No new research campaign was performed for this publication. [The roadmap](../../ROADMAP.md) treats reusable research apparatus and an external benchmark as future deliverables, with explicit evidence conditions.
