// xoshiro128** (public domain reference): https://prng.di.unimi.it/xoshiro128starstar.c
const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));
export function seedStreams(seed: number): Uint32Array<ArrayBuffer> {
    const state = new Uint32Array(8);
    let x = seed >>> 0;
    for (let i = 0; i < 8; i++) {
        x = (x + 0x9e3779b9) >>> 0;
        let z = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
        z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
        state[i] = (z ^ (z >>> 15)) >>> 0;
    }
    return state;
}
export function randomStream(s: Uint32Array, channel: number): number {
    const i = channel * 4;
    const result = Math.imul(rotl(Math.imul(s[i + 1], 5), 7), 9) >>> 0;
    const t = s[i + 1] << 9;
    s[i + 2] ^= s[i];
    s[i + 3] ^= s[i + 1];
    s[i + 1] ^= s[i + 2];
    s[i] ^= s[i + 3];
    s[i + 2] ^= t;
    s[i + 3] = rotl(s[i + 3], 11);
    return result / 4294967296;
}
// FNV-1a of the exact source ID + channel, mixed with the experiment seed.
// Stream identity is independent of array position and branch name.
export function seedCellStreams(seed: number, keys: readonly string[]): Uint32Array<ArrayBuffer> {
    const state = new Uint32Array(keys.length * 4), seen = new Set<number>();
    keys.forEach((key, i) => {
        let hash = 2166136261;
        for (let j = 0; j < key.length; j++)
            hash = Math.imul(hash ^ key.charCodeAt(j), 16777619) >>> 0;
        if (seen.has(hash))
            throw new Error('Input identity hash collision');
        seen.add(hash);
        state.set(seedStreams((seed ^ hash) >>> 0).slice(0, 4), i * 4);
    });
    return state;
}
