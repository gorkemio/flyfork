# Record and replay contract

The [format implementation](../src/persistence/format.ts) and [tests](../src/persistence/format.test.ts) define portable file version 1: `{format: "FlyFork", version: 1, sha256, content}`. Content includes metadata, seed, playhead, frontier, fork tick, revision, event histories and complete snapshots. Buffers specify Float64/Uint32, length, little-endian encoding and canonical Base64.

Import is bounded to 16 MiB file size, 12 MiB decoded buffers, depth 24, 16 snapshots, three branches, 120 model seconds and 256 events. Strict schema, finite values, prototype-key rejection, integrity and bundled dataset/config identity are checked before replacing the experiment. SHA-256 is not sender authentication.

SimState v2, BranchSnapshot v3, Worker protocol v4, IndexedDB v1 and portable file v1 are distinct boundaries. Unsupported versions are rejected without guessed migration. The authoritative Worker validates commands and rejects stale replies/conflicting work. [Library](../src/persistence/library.ts) provides atomic writes and revision-conflict handling.

A 12 s record viewed at 5 s retains both times. Loading is paused with Replay **Not checked**. **Matched** requires actual recomputation from each branch's own start/events through the selected time. See the [original generated fixture](evidence/stage-4/round-trip.flyfork.json) and [recovery guide](usage.md).

Library allows 50 named records and 128 MiB, subject to browser quota. A separate recovery slot uses Web Locks where available, with eligibility intervals of at least 5 seconds paused and 30 seconds running. This is bounded recovery, not a lossless crash guarantee. Origin storage and server backups are separate.
