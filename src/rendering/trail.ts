import * as THREE from 'three';
import type { Pose } from '../simulation/state';

const CAPACITY = 12001;
const vertexShader = `
attribute vec3 previous;
attribute vec3 next;
attribute float side;
attribute float distance;
uniform vec2 resolution;
uniform float width;
varying float vSide;
varying float vDistance;
vec2 safeDirection(vec2 v) { return length(v) > .00001 ? normalize(v) : vec2(0., 1.); }
void main() {
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  vec4 a = projectionMatrix * modelViewMatrix * vec4(previous, 1.);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(next, 1.);
  vec2 before = (p.xy/p.w - a.xy/a.w) * resolution;
  vec2 after = (b.xy/b.w - p.xy/p.w) * resolution;
  if(length(before) < .00001) before = after;
  if(length(after) < .00001) after = before;
  vec2 tangent = safeDirection(safeDirection(before) + safeDirection(after));
  vec2 normal = vec2(-tangent.y, tangent.x);
  vec2 incoming = safeDirection(before);
  float miter = min(1.6, 1. / max(.625, abs(dot(normal, vec2(-incoming.y, incoming.x)))));
  p.xy += normal * side * width * miter / resolution * p.w;
  gl_Position = p;
  vSide = side;
  vDistance = distance;
}`;
const fragmentShader = `
uniform vec3 color;
uniform float opacity;
uniform float dash;
uniform float gap;
uniform float pixelsPerUnit;
varying float vSide;
varying float vDistance;
void main() {
  float edge = 1. - smoothstep(.62, 1., abs(vSide));
  float ink = 1.;
  if(gap > 0.) {
    float d = mod(vDistance * pixelsPerUnit, dash + gap);
    ink = 1. - smoothstep(dash - .65, dash + .65, d);
  }
  gl_FragColor = vec4(color, opacity * edge * ink);
}`;

/** Two strokes share one bounded geometry. Samples remain exact; there is no spline. */
export function createRibbon(color: string, pattern: number) {
    const geometry = new THREE.BufferGeometry();
    const attributes = {
        position: new THREE.BufferAttribute(new Float32Array(CAPACITY * 6), 3),
        previous: new THREE.BufferAttribute(new Float32Array(CAPACITY * 6), 3),
        next: new THREE.BufferAttribute(new Float32Array(CAPACITY * 6), 3),
        side: new THREE.BufferAttribute(new Float32Array(CAPACITY * 2), 1),
        distance: new THREE.BufferAttribute(new Float32Array(CAPACITY * 2), 1),
    };
    const distances = new Float64Array(CAPACITY), ticks = new Float64Array(CAPACITY);
    const indices = new Uint32Array((CAPACITY - 1) * 6);
    for (let i = 0; i < CAPACITY; i++) {
        attributes.side.setX(i * 2, -1); attributes.side.setX(i * 2 + 1, 1);
        if (i < CAPACITY - 1) indices.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3], i * 6);
    }
    for (const [name, attribute] of Object.entries(attributes)) { attribute.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(name, attribute); }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    const group = new THREE.Group();
    const materials = [4, 1.4].map((width, i) => {
        const material = new THREE.ShaderMaterial({
            vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
            uniforms: { color: { value: new THREE.Color(color).multiplyScalar(i ? 1.65 : 1) }, opacity: { value: i ? .96 : .085 },
                resolution: { value: new THREE.Vector2(1, 1) }, width: { value: width },
                dash: { value: pattern === 2 ? 2 : 7 }, gap: { value: pattern === 0 ? 0 : pattern === 1 ? 4 : 5 }, pixelsPerUnit: { value: 7 } },
        });
        const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 2 + i; group.add(mesh);
        return material;
    });
    let count = 0, key = '', lastTick = -1;
    function update(trail: readonly Pose[], tick: number, session: string) {
        if (session === key && tick === lastTick) return;
        let length = Math.min(CAPACITY, trail.length);
        while (length && trail[length - 1].tick > tick) length--;
        // Past samples are immutable within a session. Rewrites are bounded after seek/load.
        const start = session === key && tick > lastTick && length >= count ? Math.max(0, count - 1) : 0;
        for (let i = start; i < length; i++) {
            const p = trail[i], prev = trail[Math.max(0, i - 1)], next = trail[Math.min(length - 1, i + 1)];
            distances[i] = i ? distances[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
            ticks[i] = p.tick;
            for (let side = 0; side < 2; side++) {
                const j = i * 2 + side;
                attributes.position.setXYZ(j, p.x, .095, p.y);
                attributes.previous.setXYZ(j, prev.x, .095, prev.y);
                attributes.next.setXYZ(j, next.x, .095, next.y);
                attributes.distance.setX(j, distances[i]);
            }
        }
        for (const name of ['position', 'previous', 'next', 'distance'] as const) {
            const a = attributes[name]; a.clearUpdateRanges();
            if (length > start) { a.addUpdateRange(start * 2 * a.itemSize, (length - start) * 2 * a.itemSize); a.needsUpdate = true; }
        }
        count = length; key = session; lastTick = tick;
        geometry.setDrawRange(0, Math.max(0, length - 1) * 6);
    }
    return { group, geometry, update, get sampleCount() { return count; },
        distanceAt(tick: number) { let i = count - 1; while (i > 0 && ticks[i] > tick) i--; return i >= 0 ? distances[i] : 0; },
        viewport(width: number, height: number, span: number) { for (const m of materials) { m.uniforms.resolution.value.set(width, height); m.uniforms.pixelsPerUnit.value = height / span; } },
        dispose() { geometry.dispose(); materials.forEach(m => m.dispose()); } };
}
