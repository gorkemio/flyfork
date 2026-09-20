# Manual experimental deployment

The supported path is GitHub source → manually published GHCR AMD64 pair → Dokploy-managed Compose. `deploy/compose.yml` uses the existing `dokploy-network` and `letsencrypt` HTTP-challenge resolver. These names were verified for the initial target; another installation must verify its own configuration first. No build runs on the VPS.

Required source CI packages the explicit allowlist and performs a frozen install, typecheck, lint, full normal unit/golden suite, build, tooling and package checks in the digest-pinned Node24.19.0/pnpm11.25.0 Linux environment. Coverage is deliberately not a required successful release job; its documented historical FAIL remains unchanged. The manual publication workflow accepts only a successful official main verification run for its exact commit, reuses that built payload, verifies previous-generation/native-notice archives against committed SHA256, checks the combined F01 budget, assembles both images natively on AMD64, then pushes unique tags. It does not deploy.

The initial previous own-generation keeps its historical source/build-info identities. A new assembly commit is not retroactive evidence for those older product bytes. Native corresponding sources and notices accompany the release; see [native redistribution](native-redistribution.md). Public package visibility and anonymous digest pull must be confirmed separately from repository visibility.

## Operate one service

In the existing FlyFork production environment, use a Compose service sourced from the public repository, branch `main`, path `./deploy/compose.yml`, automatic deployment disabled. Set `FLYFORK_IMAGE` to the selected immutable GHCR digest. First use `FLYFORK_PUBLIC=false` for internal readiness, then `true` for the authorized launch. Never publish port8080 directly. Compose requires non-root101:101, read-only, dropped capabilities, no-new-privileges, bounded16MiB tmpfs,64PIDs,1CPU/256MiB and rotated logs. Check actual container inspect and HTTP readiness; a web healthcheck does not validate model state.

## One update / rollback route

Download the release's `registry-identities.json`. With an already verified SSH alias, run:

```sh
python3 scripts/release-gate.py prepare --ssh YOUR_VERIFIED_ALIAS --identities registry-identities.json --variant forward
```

The helper connects with strict existing host-key verification and stores pending/active state plus history in the SSH user's `~/.local/state/flyfork/`, outside Dokploy checkout cleanup. It rejects a third generation before24hours, requires the prior current own-generation in the new pair and blocks ambiguous unfinished activations. After a successful prepare, paste its exact digest into the FlyFork service's `FLYFORK_IMAGE` field, save and deploy in Dokploy. Then run the same command with `confirm` instead of `prepare`; it verifies the real HTTPS build-info SHA before recording activation UTC and the earliest next activation. Inspect with `status --ssh YOUR_VERIFIED_ALIAS`.

For rollback, use the **same release identity file** and `--variant rollback` in both commands. It selects the pair rollback image, retaining the same two generations and original retention deadline. Restore with `--variant forward`. Do not deploy an old single-generation image. A failed confirmation leaves pending state intact for investigation; do not delete it to bypass a failure.

This is a checked manual operating path, not a Dokploy admission plugin: an administrator can bypass it through direct UI or Docker access. Such bypass is outside the supported normal release procedure. No automatic webhook, general release controller, privileged helper or newly issued account-wide API key is installed.

Cloudflare uses proxied apex/www records and Full(strict); origin and edge certificates must both validate. Entry/build-info remain no-store, hashed assets immutable, missing Worker URLs404 without HTML fallback. www HTTPS permanently redirects to the canonical apex, preserving path/query. Do not add client script injection/analytics or relax CSP. Record each launch's real identities, activation times and bounded public smoke/rollback result in its release notes. Never copy private evidence or origin addresses into this repository.
