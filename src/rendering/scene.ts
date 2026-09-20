import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WORLD, WALLS } from '../simulation/world';
import { floorMaps, floorMarkings, wallMaps, labelTexture, softContactTexture, wallContactTexture, brushedMetalRoughness } from './materials';
import { createFly, FLY_VISUAL_SCALE } from './fly';
import { createRibbon } from './trail';
import { createStandardPipeline } from './pipeline';
import { gaitPose } from './presentation';

export const CAMERA_POSITION = [20, 110, 70] as const;
export const CAMERA_TARGET = [20, 0, 40] as const;
export const EXPOSURE = 1.12;
// A fixed visual section; the immutable WORLD collision footprint is unchanged.
export const WALL_CUT_HEIGHT = .30;
const colors = ['#ffd184', '#4de4ec', '#bc86ff'];

export function createArena(container: HTMLDivElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = EXPOSURE; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false; renderer.info.autoReset = false;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.domElement.setAttribute('aria-label', 'Three real branch arenas, Standard visual quality');
    container.appendChild(renderer.domElement);
    const pipeline = createStandardPipeline(renderer);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#0a1219');
    const camera = new THREE.OrthographicCamera(-22, 22, 44, -44, .1, 250);
    camera.position.set(...CAMERA_POSITION); camera.lookAt(...CAMERA_TARGET);
    // Small authored softbox environment. Generated once; no downloaded HDRI or inferred real environment.
    const studio = new THREE.Scene(); studio.background = new THREE.Color('#525962');
    const studioGeometry = new THREE.PlaneGeometry(8, 5), studioMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dbe8ed').multiplyScalar(3), side: THREE.DoubleSide });
    for (const [x, y, z] of [[-6, 4, 0], [4, 7, 5], [0, 4, -7]]) { const p = new THREE.Mesh(studioGeometry, studioMaterial); p.position.set(x, y, z); p.lookAt(0, 0, 0); studio.add(p); }
    const generator = new THREE.PMREMGenerator(renderer), environment = generator.fromScene(studio, .05, .1, 100, { size: 128 });
    generator.dispose(); studioGeometry.dispose(); studioMaterial.dispose(); scene.environment = environment.texture; scene.environmentIntensity = .28;
    scene.add(new THREE.HemisphereLight('#bfd8ed', '#1c2630', .45));
    const key = new THREE.DirectionalLight('#e7eced', 2.2); key.position.set(-12, 65, 20); key.target.position.set(20, 0, 40); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -45, right: 45, top: 55, bottom: -55, near: 1, far: 160 }); key.shadow.bias = -.00015; key.shadow.normalBias = .035;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#7aa9c5', .4); fill.position.set(40, 18, 80); scene.add(fill);
    let assetRevision = 0;
    const coating = wallMaps();
    const paint = new THREE.MeshStandardMaterial({ ...coating, roughness: .55, metalness: .16 });
    const edge = new THREE.MeshStandardMaterial({ color: '#a1adb3', roughnessMap: brushedMetalRoughness(), roughness: .48, metalness: .82 });
    const dark = new THREE.MeshStandardMaterial({ color: '#15252f', roughness: .82, metalness: .1 });
    const inset = new THREE.MeshStandardMaterial({ ...coating, color: '#c3cdd1', roughness: .64, metalness: .12 });
    const amber = new THREE.MeshStandardMaterial({ color: '#ffc13d', emissive: '#ff970c', emissiveIntensity: 4.8, roughness: .43, metalness: .22 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(52, 94), new THREE.MeshStandardMaterial({ ...floorMaps(() => { assetRevision++; }), color: '#67717a', roughness: .84, metalness: 0, normalScale: new THREE.Vector2(.14, .14) }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(20, 0, 40); floor.receiveShadow = true; scene.add(floor);
    const markings = new THREE.Mesh(floor.geometry, new THREE.MeshBasicMaterial({ map: floorMarkings(), transparent: true, depthWrite: false })); markings.rotation.copy(floor.rotation); markings.position.set(20, .018, 40); scene.add(markings);
    function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, bevel = .16) {
        const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, w / 3, h / 3, d / 3)), material);
        mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
    }
    const contactTexture = softContactTexture();
    const contactMaterial = new THREE.MeshBasicMaterial({ map: wallContactTexture(), transparent: true, depthWrite: false, opacity: .5 });
    const contactGeometry = new THREE.PlaneGeometry(1, 1);
    for (const wall of WALLS) {
        const contact = new THREE.Mesh(contactGeometry, contactMaterial); contact.rotation.x = -Math.PI / 2; contact.position.set(wall.x, .035, wall.y); contact.scale.set(wall.w + .8, wall.h + .8, 1); scene.add(contact);
        box(wall.x, .11, wall.y, wall.w, .22, wall.h, paint, .055).userData.wall = true;
        box(wall.x, .245, wall.y, wall.w - .04, .05, wall.h - .04, edge, .015).userData.wall = true;
        box(wall.x, .285, wall.y, Math.max(.5, wall.w - .24), .03, Math.max(.5, wall.h - .24), inset, .009).userData.wall = true;
    }
    // Static wall geometry shares one draw per material. Exact transforms and footprints survive.
    for (const [index, material] of [paint, edge, inset].entries()) {
        const meshes = scene.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.userData.wall && o.material === material);
        const parts = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
        const merged = new THREE.Mesh(mergeGeometries(parts), material); merged.name = `static-wall-${index}`;
        merged.castShadow = true; merged.receiveShadow = true; scene.add(merged);
        parts.forEach(g => g.dispose()); meshes.forEach(mesh => { scene.remove(mesh); mesh.geometry.dispose(); });
    }
    // Small repeated details are instanced, and all remain on wall caps / outside the world.
    const screwGeometry = new THREE.CylinderGeometry(.075, .075, .035, 8), screws = new THREE.InstancedMesh(screwGeometry, dark, WALLS.length * 4);
    const transform = new THREE.Object3D(); let index = 0;
    for (const wall of WALLS) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        transform.position.set(wall.x + sx * (wall.w / 2 - .32), WALL_CUT_HEIGHT + .018, wall.y + sz * (wall.h / 2 - .32)); transform.updateMatrix(); screws.setMatrixAt(index++, transform.matrix);
    }
    scene.add(screws);
    const ventGeometry = new THREE.BoxGeometry(.23, .12, 5.7), vents = new THREE.InstancedMesh(ventGeometry, dark, 64); index = 0;
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
        const x = side < 0 ? -3.2 : 43.2, z = 11 + k * 20;
        box(x, .55, z, 3.7, 1.1, 10, paint, .15);
        for (let i = 0; i < 8; i++) { transform.position.set(x - 1.25 + i * .35, 1.23, z); transform.updateMatrix(); vents.setMatrixAt(index++, transform.matrix); }
    }
    scene.add(vents);
    // A cable spine rests on the existing centre wall, never across a passage.
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 11, 8), dark); cable.rotation.x = Math.PI / 2; cable.position.set(28, .36, 43); scene.add(cable);
    for (const z of [38, 42, 46, 48]) box(28, .40, z, .8, .1, .22, edge, .02);
    function label(text: string, x: number, z: number, width: number, color?: string) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: labelTexture(text, color), transparent: true, depthWrite: false, opacity: .58 })); m.rotation.x = -Math.PI / 2; m.position.set(x, .055, z); scene.add(m);
    }
    label('LAB / 01', 9.5, 56, 9); label('MODEL UNITS', 20, 75.5, 11); label('GOAL', WORLD.goalX, WORLD.goalY + 5.6, 5.8, '#d0af6a');
    // The target is a flush floor inlay, not a new physical pedestal.
    const goalPad = new THREE.Mesh(new THREE.CircleGeometry(WORLD.goalRadius + .65, 48), dark); goalPad.rotation.x = -Math.PI / 2; goalPad.position.set(WORLD.goalX, .025, WORLD.goalY); scene.add(goalPad);
    for (const [radius, tube] of [[WORLD.goalRadius, .16], [3.5, .045]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 96), amber); ring.rotation.x = -Math.PI / 2; ring.position.set(WORLD.goalX, .12, WORLD.goalY); scene.add(ring);
    }
    const goalLight = new THREE.PointLight('#ffb044', 520, 25, 2); goalLight.position.set(WORLD.goalX, 3.2, WORLD.goalY); scene.add(goalLight);
    for (const [x, z] of [[1, 24], [39, 59], [20, 1]]) {
        box(x, .14, z, .72, .22, 1.15, dark, .05); box(x, .295, z, .4, .09, .65, amber, .03);
        const lamp = new THREE.PointLight('#ffc371', 45, 13, 2); lamp.position.set(x, 1.8, z); scene.add(lamp);
    }
    const firstFly = createFly();
    // Sharing geometry/materials keeps identical anatomy and bounded resources across branches.
    const flies = [firstFly, ...[1, 2].map(() => {
        const group = firstFly.group.clone(true), legs = firstFly.legs.map(leg => group.children[firstFly.group.children.indexOf(leg)] as THREE.Group);
        return { group, legs, animate(pathLength: number, reduced = false) { const angles = gaitPose(pathLength, reduced); legs.forEach((leg, i) => { leg.rotation.y = angles[i]; leg.rotation.z = Math.max(0, angles[i]) * (i < 3 ? -1 : 1) * .35; }); } };
    })];
    const trails = colors.map(createRibbon);
    const flyContact = new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, opacity: .64 });
    const contacts = flies.map(() => { const m = new THREE.Mesh(contactGeometry, flyContact); m.rotation.x = -Math.PI / 2; m.scale.set(3.2, 4.8, 1); scene.add(m); return m; });
    flies.forEach(f => scene.add(f.group)); trails.forEach(t => scene.add(t.group));
    let width = 1, height = 1, dpr = 1;
    function resize(narrow: boolean) {
        const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight), ratio = Math.min(window.devicePixelRatio, narrow ? 1 : 1.25);
        if (w === width && h === height && ratio === dpr) return false;
        width = w; height = h; dpr = ratio; renderer.setPixelRatio(ratio); renderer.setSize(width, height); return true;
    }
    function viewport(rect: { width: number; height: number }) {
        const span = Math.max(83, 43 * rect.height / rect.width);
        camera.left = -span * rect.width / rect.height / 2; camera.right = -camera.left; camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix();
        return span;
    }
    function dispose() {
        pipeline.dispose(); environment.dispose();
        const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
        scene.traverse(obj => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
                geometries.add(obj.geometry);
                for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) { materials.add(m); for (const v of Object.values(m)) if (v instanceof THREE.Texture && v !== environment.texture) textures.add(v); }
            }
        });
        geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
        key.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    }
    return { renderer, scene, camera, pipeline, flies, trails, contacts, resize, viewport, dispose,
        get assetRevision() { return assetRevision; },
        invalidateShadow() { renderer.shadowMap.needsUpdate = true; },
        presentation: { camera: CAMERA_POSITION, cameraTarget: CAMERA_TARGET, exposure: EXPOSURE, flyScale: FLY_VISUAL_SCALE, shadow: 1024, pmrem: 128, quality: 'Standard', assetVersion: 'stage45c-1', wallCutHeight: WALL_CUT_HEIGHT } };
}
