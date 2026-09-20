# Licenses and provenance

FlyFork original code is [MIT](../LICENSE), Copyright (c) 2026 Görkem İnanç Özdemir. This grant does not relicense third-party code, data or assets.

## Runtime dependencies

Pinned runtime closure: React 19.3.0, React DOM 19.3.0, scheduler 0.28.0, Three.js 0.186.0, Zod 4.6.5 and Dexie 4.4.6. Full texts were copied without alteration from those installed versions:

- [React MIT](../public/licenses/react-LICENSE.txt), [React DOM MIT](../public/licenses/react-dom-LICENSE.txt), [scheduler MIT](../public/licenses/scheduler-LICENSE.txt).
- [Three.js MIT](../public/licenses/three-LICENSE.txt), [Zod MIT](../public/licenses/zod-LICENSE.txt).
- [Dexie Apache-2.0](../public/licenses/dexie-LICENSE.txt) and [NOTICE](../public/licenses/dexie-NOTICE.txt).

The [locked inventory](dependency-inventory.json) distinguishes development/build/test packages. Dependency implementations are not copied into this source archive; frozen installation obtains them. Uninstalled platform packages are marked unreviewed. The inventory is not an advisory audit or legal certification.

## Referenced and adapted source

LIF equations/parameters reference Philip Shiu and Nico Spiller's Drosophila_brain_model at commit `91bdd1e7dcf193f3e7ca5a8933497fcef63b7960`. Its MIT text remains in [notices](../public/third-party-notices.txt). FlyFork's TypeScript engine has independent timestep ordering, refractory handling, sensory encoding and an engineered decoder. A whole Brian2 port is not claimed; concepts/parameters and actual code adaptation must remain separate in final rights review.

[randomStream](../src/simulation/prng.ts) adapts xoshiro128**1.1, by David Blackman and Sebastiano Vigna. The retrieved C reference SHA256 is `2e3e540e15e1b1edf6144509ba3a71bc4611e3676d52e03d567a0f230a141a67`. Its public-domain dedication and explicit permission are preserved verbatim in [the versioned current notice](../public/licenses/provenance-bd644bc73482.txt). They are not renamed CC0 or MIT.

`seedStreams` separately uses a32-bit Weyl sequence and TheIronBorn/hash-prospector xmxmx mixer constants; `seedCellStreams` uses FNV-1a source identity hashing and project-local stream orchestration. The mathematical reference, scope and limits of the recorded acquisition evidence are described in that notice. No absent source/attribution is invented. Numerical source bytes are unchanged.

## Data and assets

MaleCNS is CC BY 4.0; [model/provenance](model.md) and the unchanged [prepared manifest](../data/prepared/male-cns-dm1.manifest.json) retain attribution and transformations.

Three 512px floor maps derive from Rob Tuytel's Poly Haven Concrete Floor 02 under CC0. [License](../public/assets/lab/concrete-floor-02/LICENSE.txt) and [public provenance](../public/assets/lab/concrete-floor-02/provenance.json) include source URLs, hashes and transformations. Original downloads/private conversion evidence are excluded. No institutional endorsement or unrelated branding rights are implied.

Fly/arena geometry is procedural project code. Fonts use the system stack; no font files are redistributed. Graphify/Addy/Impeccable development materials are excluded and are not runtime dependencies.

The required round-trip fixture retains original numeric payload/metadata. It is generated test data, not a production user record. The release review checks its generated name/UUID/date/user-agent fields and retains the original bytes; it is not a private user export. Hashes are integrity identifiers, not signatures or rights clearance.
