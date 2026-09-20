# Two own-generations, one bounded public pool

`release-payload.mjs capture` reads a build's own `dist` and verifies its build-info manifest. `pair` verifies two independently trusted own-generation manifests, chooses the current entry files for forward and the previous entry files for rollback, and includes both asset sets in each context.

Both per-generation and combined served pools remain limited to1024files/32MiB. Hash/path/symlink checks and same-URL/different-content collision rejection are unchanged. The union cannot be captured as a new own-generation: recursive inheritance of older pools is rejected. Runtime MIT/provenance notices use versioned URLs so previous asset bytes remain available unchanged.

The manual publication workflow uses the successful source CI artifact for current and the release's verified previous-own-generation archive. It assembles both F01-admitted contexts before either registry push. Native runtime images are linux/amd64, not retagged ARM64 images. The source manifest, build-info body SHA, registry manifest digest and image config ID are distinct identities.

For a clean manual reproduction: create a source candidate with `createCandidate` from `scripts/source-package.mjs`; build its Dockerfile `evidence` target with the pinned Linux toolchain; capture the exported `dist`; download and hash-check the previous own-generation listed in `deploy/release-inputs.json`; invoke `pair <current> <current-manifest-sha> <previous> <previous-manifest-sha> <new-output> deploy`. The publication helper also adds the corresponding native notices to each image without changing the public pool. Full command orchestration is in [the manual workflow](../.github/workflows/publish.yml) and [its helper](../scripts/publish-pair.py).

[Deployment and24-hour retention](deployment.md) are separate from packaging. A package can be built before the retention window expires; activating a third generation through the normal release path cannot discard the previous assets early. Rollback always uses the current pair's rollback digest. No indefinite open-tab support is promised.
