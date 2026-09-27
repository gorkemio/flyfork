# Using FlyFork locally

## Start and compare

The welcome screen offers a skippable guided experiment and a blank experiment. Guide remains available from the toolbar (More actions on a phone). It replaces an existing experiment only through Save / Discard / Cancel. Exit guide stops subsequent commands; the current bounded Worker job can finish before controls become available. It does not secretly execute the remaining steps.

For a manual experiment: Start → Pause → Capture snapshot → Fork A + B. The one S₀ includes neural buffers, queues, PRNG streams, filters, body and measurements. Choose a draft branch, operator, source group, magnitude and duration, then Apply intervention. Original is the control. The preview shows seconds and the exact integer tick interval (1 tick = 0.1 ms). End ticks are exclusive.

Seek uses the common recorded timeline; it never deletes the recorded future. Branches do not exist before S₀. Apply is disabled while viewing old history; return to the recorded frontier to schedule a new event. A new fork point or edited past requires New experiment. Limits: one S₀, three branches, 120 model seconds, 256 events, 64 MiB bounded checkpoint cache.

Compare states asks whether branches differ at the same tick. Replay check asks whether each branch reproduces its own recorded history. At a 5 s viewing cursor in a 12 s record, replay checks through 5 s; seek to 12 s and replay to check the full retained record. A mismatch is reported, not converted into success by re-saving. Import checks structure/integrity before load; only actual replay can produce a fresh Matched result.

## Save, move and reopen

Save writes a named Library record. Save as copy creates an independent local identity. The list reads small metadata rather than all simulation buffers. Search filters local names; Rename updates a stored record atomically; Delete asks for confirmation and preserves the live experiment, other records and recovery.

A local Library allows up to 50 named records and 128 MiB of payloads. Each file/recovery payload is limited to 16 MiB. The browser may impose a smaller quota. No records are automatically removed to make room. If another tab has saved the same record, Save reports a conflict; Save as copy preserves both versions. Close/reopen Library to obtain a fresh preview if you want to load the other version.

Export file downloads plain JSON with explicit typed-array encoding and a SHA-256 integrity hash. Transfer the file yourself, then use Library → Import .flyfork.json → review → Load experiment. The importer only supports bundled dataset/model versions, never downloads a URL from the file and never runs file code. Imported identity is replaced with a new local identity when saved. A schema/hash/size/state error or Cancel leaves the active experiment and named records intact. Names are plain text.

Storage is bound to the browser/profile/origin. A different port, hostname, protocol or domain has separate records. Local storage is not a backup guarantee; export important records. There is no account, cloud sync, remote sharing link or service worker. The app must first be served normally; local records alone do not install it offline.

## Recovery and failures

One separate recovery slot uses the same file format. A supported Web Locks API permits one tab to own it for that page lifetime. Another tab keeps Library/export but cannot silently overwrite recovery. Ownership releases when the page closes; no clock-based lease steals it from a suspended tab. If Web Locks is absent or denied, automatic recovery is explicitly unavailable. A tab that missed the lock can reload after the owning tab closes.

After you start/load an experiment, the owner saves a changed state at most once per 5 seconds while paused and at most once per 30 seconds while running. The one-second scheduler only checks eligibility; it does not advance model time. Hashing/export run before a short IndexedDB transaction. Serialization copies full bounded records and therefore may briefly postpone Worker scheduling, especially near 120 s. There is no per-frame autosave.

Last durable recovery shows both viewing cursor and recorded frontier. Review recovery previews it, then loads paused with replay Not checked. A Worker failure at 6 s with durable recovery at 5 s loses the later 1 s of computed history and any later unsaved event changes. After reload, the exact unsaved gap may be unknowable; only the stored time is guaranteed available. If no durable record exists, there is no lossless recovery claim. Starting a fresh experiment can later replace the recovery slot; named Library records remain separate.

Quota or transaction failures preserve the preceding committed record. A blocked database upgrade asks you to close other tabs. A version change closes storage access and asks for reload; the current experiment stays in memory. If storage is unavailable, the app is memory-only and Export remains available while the Worker works. A broken recovery file never triggers deletion of named records or the database. WebGL context loss affects the drawing, not the simulation state; the view can resume when the browser restores its context.

## Read the model correctly

Model & limitations provides the actual selected cell IDs, type/side groups, source NT sign and directed raw-synapse totals. This is a read-only inspector. The LIF dynamic equations, odor input and body decoder are engineered assumptions. Real connectivity does not make the display an animal-behavior validation.

PN means projection neuron. The speed cap can dominate movement even when PN activity changes. Inspect raw decoder ratio, capped command, cap duration, actual path and collision stall separately. Divergence's large number is mean distance divided by arena diagonal over the displayed window; its line is instantaneous distance using that plot's own peak scale. Neither proximity nor cost is a confidence or biological success probability.

## Keyboard, narrow screens and remaining device checks

Dialogs use labelled inputs, Tab/Shift+Tab containment, Escape and focus return. New/load/guide use the same dirty-history guard. No global simulation shortcut intercepts typing. On narrow screens the branch buttons select one arena from the same running experiment; the intervention editor and model details can collapse. Changing screen width, trail visibility or reduced motion does not change dt or numeric history.

Automated Chrome tests cover 1672×941, 1440×900, 768×1024 and 390×844 CSS viewports, keyboard/focus and 44 px primary targets. These are not physical touch or screen-reader user tests. On a real phone/Safari/M4 test: note device/OS/browser version; run the guide; navigate with keyboard/VoiceOver or touch; save at view 5 s/frontier 12 s; reload/load; export/import into a fresh context; check Not checked before replay and Matched only after completion; change orientation and restore a WebGL context; measure frame/input latency and memory. Record actual failures and lost unsaved intervals. The [verification summary](verification.md) separates historical browser results from open physical-device gates; the source-publication work does not certify those physical devices. The accepted R1 layout starts the arena at approximately 1,046 px on a 390×844 viewport, below the first viewport; this remains a known usability limit.
