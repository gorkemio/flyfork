import * as THREE from 'three';

function canvas(width: number, height = width) {
    const image = document.createElement('canvas'); image.width = width; image.height = height;
    const ctx = image.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    return { image, ctx };
}
function texture(image: HTMLCanvasElement, color = true) {
    const t = new THREE.CanvasTexture(image); t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4; return t;
}
/** Fixed decorative noise, separate from simulation PRNG. */
const noise = (i: number) => ((Math.sin(i * 127.1 + 17.7) * 43758.5453) % 1 + 1) % 1;
/** One CC0 concrete material, coherent color/roughness/OpenGL normal maps. */
export function floorMaps(onLoad: () => void) {
    const loader = new THREE.TextureLoader();
    const load = (channel: string, color = false) => {
        const t = loader.load(`/assets/lab/concrete-floor-02/epoxy_${channel}_512.jpg`, onLoad);
        t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.6, 4.7); t.anisotropy = 4;
        return t;
    };
    return { map: load('diff', true), roughnessMap: load('rough'), normalMap: load('nor_gl') };
}
/** Quiet slab joints and local wheel scuffs, independent of the material microstructure. */
export function floorMarkings() {
    const { image, ctx } = canvas(512, 1024);
    ctx.strokeStyle = '#050e1640'; ctx.lineWidth = 1;
    for (const x of [128, 256, 384]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke(); }
    for (let y = 128; y < 1024; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    ctx.strokeStyle = '#c4c4b411'; ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const x = 160 + noise(i) * 110, y = 100 + noise(i + 50) * 700; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y + 8 + noise(i + 90) * 20); ctx.stroke(); }
    return texture(image);
}
/** Authored coating wear; one reusable map, with no added world geometry. */
export function wallMaps() {
    const { image, ctx } = canvas(256);
    ctx.fillStyle = '#304253'; ctx.fillRect(0, 0, 256, 256);
    const shade = ctx.createLinearGradient(0, 0, 256, 180);
    shade.addColorStop(0, '#a5bbc222'); shade.addColorStop(.4, '#08141a08'); shade.addColorStop(1, '#04101a50');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#0c1c28'; ctx.lineWidth = 2; ctx.strokeRect(5, 5, 246, 246);
    ctx.strokeStyle = '#7d92944a'; ctx.lineWidth = 1; ctx.strokeRect(8, 8, 240, 240);
    // Wear follows the panel edges, rather than coating every face with dots.
    ctx.strokeStyle = '#aebbc04d'; ctx.lineWidth = .7;
    for (const [x, y, w] of [[12, 9, 52], [184, 9, 26], [35, 247, 22], [201, 247, 37]]) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    }
    return { map: texture(image) };
}
export function labelTexture(text: string, color = '#a1b2ba'): THREE.CanvasTexture {
    const { image, ctx } = canvas(512, 128);
    ctx.font = '600 58px sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 64);
    return texture(image);
}
export function softContactTexture() {
    const { image, ctx } = canvas(128);
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 61); g.addColorStop(0, '#000000b8'); g.addColorStop(.5, '#0000006a'); g.addColorStop(1, '#00000000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); return texture(image);
}
export function wingTexture() {
    const { image, ctx } = canvas(256, 512);
    const wash = ctx.createLinearGradient(0, 0, 256, 512); wash.addColorStop(0, '#d7e5ed55'); wash.addColorStop(.5, '#c4dce922'); wash.addColorStop(1, '#d7e9f040');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = '#74929e99'; ctx.lineWidth = 1.4;
    for (const [x, end] of [[34, 50], [48, 125], [67, 188], [90, 235]]) {
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.bezierCurveTo(x, 100, end, 260, end - 8, 500); ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(73, 195); ctx.lineTo(142, 212); ctx.moveTo(103, 335); ctx.lineTo(199, 347); ctx.stroke();
    return texture(image);
}

/** Authored abdomen pigmentation, separate from geometry and simulation state. */
export function abdomenTexture() {
    const { image, ctx } = canvas(128, 256);
    ctx.fillStyle = '#c9a46b'; ctx.fillRect(0, 0, 128, 256);
    for (const [y, h] of [[22, 15], [61, 13], [105, 11], [149, 9]]) {
        const shade = ctx.createLinearGradient(0, y, 0, y + h);
        shade.addColorStop(0, '#7b5936'); shade.addColorStop(.75, '#4d3825'); shade.addColorStop(1, '#a38152');
        ctx.fillStyle = shade; ctx.fillRect(0, y, 128, h);
    }
    return texture(image);
}

/** Broad material response with fine directional grain, never a screen-space effect. */
export function brushedMetalRoughness() {
    const { image, ctx } = canvas(128);
    ctx.fillStyle = '#b7b7b7'; ctx.fillRect(0, 0, 128, 128);
    ctx.lineWidth = 1;
    for (let y = 0; y < 128; y += 2) {
        const v = Math.round(155 + noise(y) * 48);
        ctx.strokeStyle = `rgb(${v},${v},${v})`; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
    }
    return texture(image, false);
}
/** Rectangular contact for the wall section, distinct from the fly's soft oval contact. */
export function wallContactTexture() {
    const { image, ctx } = canvas(128);
    ctx.shadowColor = '#000000'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#000000'; ctx.fillRect(12, 12, 104, 104);
    return texture(image);
}
/** Restrained compound-eye facets. Grayscale bump data, not albedo. */
export function eyeFacets() {
    const { image, ctx } = canvas(64);
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 64, 64);
    for (let y = -4; y < 68; y += 8) for (let x = -4; x < 68; x += 8) {
        const cx = x + (y % 16 === 4 ? 4 : 0);
        const g = ctx.createRadialGradient(cx, y, 0, cx, y, 4);
        g.addColorStop(0, '#b0b0b0'); g.addColorStop(1, '#808080');
        ctx.fillStyle = g; ctx.fillRect(cx - 4, y - 4, 8, 8);
    }
    return texture(image, false);
}
