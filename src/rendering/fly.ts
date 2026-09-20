import * as THREE from 'three';
import { wingTexture, abdomenTexture, eyeFacets } from './materials';
import { gaitPose } from './presentation';

export const FLY_VISUAL_SCALE = 1.55; // Deliberate display enlargement, not a biological unit conversion.
/** Authored tapered profile, unlike the previous stacked ellipsoid abdomen. */
function abdomenGeometry() {
    const points = [new THREE.Vector2(0, 0), new THREE.Vector2(.28, .08), new THREE.Vector2(.48, .35), new THREE.Vector2(.51, .7), new THREE.Vector2(.43, 1.12), new THREE.Vector2(.29, 1.5), new THREE.Vector2(.1, 1.76), new THREE.Vector2(0, 1.84)];
    const geo = new THREE.LatheGeometry(points, 24); geo.rotateX(Math.PI / 2); geo.scale(1, .7, 1); return geo;
}
export function createFly() {
    const group = new THREE.Group(); group.name = 'Drosophila visual proxy'; group.scale.setScalar(FLY_VISUAL_SCALE);
    const shell = new THREE.MeshStandardMaterial({ color: '#b99557', metalness: .06, roughness: .58 });
    const head = new THREE.MeshStandardMaterial({ color: '#67573d', roughness: .66 });
    const band = new THREE.MeshStandardMaterial({ color: '#493625', roughness: .62 });
    const legMaterial = new THREE.MeshStandardMaterial({ color: '#c2ad80', roughness: .56, metalness: .02 });
    const eyes = new THREE.MeshStandardMaterial({ color: '#a94024', roughness: .36, metalness: .03, bumpMap: eyeFacets(), bumpScale: .025 });
    const wing = new THREE.MeshPhysicalMaterial({ map: wingTexture(), color: '#d3e6ef', transparent: true, opacity: .64, roughness: .3, metalness: 0, transmission: 0, iridescence: 0, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true });
    const sphere = new THREE.SphereGeometry(1, 20, 12);
    function part(mat: THREE.Material, pos: number[], scale: number[]) {
        const mesh = new THREE.Mesh(sphere, mat); mesh.position.set(pos[0], pos[1], pos[2]); mesh.scale.set(scale[0], scale[1], scale[2]); group.add(mesh); return mesh;
    }
    part(shell, [0, .68, -.2], [.46, .48, .60]).name = 'thorax';
    part(head, [0, .62, -.89], [.46, .35, .34]).name = 'head';
    const abdomen = new THREE.Mesh(abdomenGeometry(), new THREE.MeshStandardMaterial({ map: abdomenTexture(), roughness: .59 })); abdomen.position.set(0, .56, .22); abdomen.name = 'abdomen'; group.add(abdomen);
    part(shell, [0, .8, .38], [.29, .18, .27]); // Scutellum.
    const legs: THREE.Group[] = [];
    const cylinder = new THREE.CylinderGeometry(1, .68, 1, 5);
    function segment(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, mat = legMaterial) {
        const mesh = new THREE.Mesh(cylinder, mat); mesh.position.copy(a).add(b).multiplyScalar(.5);
        mesh.scale.set(radius, a.distanceTo(b), radius); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); parent.add(mesh);
    }
    for (const side of [-1, 1]) {
        part(eyes, [side * .345, .7, -1.025], [.24, .3, .23]);
        part(shell, [side * .51, .67, .5], [.055, .06, .055]); // Haltere knob.
        const antenna = new THREE.Group(); group.add(antenna);
        segment(antenna, new THREE.Vector3(side * .15, .7, -1.18), new THREE.Vector3(side * .28, .64, -1.51), .035);
        segment(antenna, new THREE.Vector3(side * .28, .64, -1.45), new THREE.Vector3(side * .54, .78, -1.61), .012, band);
        for (let i = 0; i < 3; i++) {
            const rig = new THREE.Group(); rig.position.set(side * .28, .54, -.55 + i * .46); group.add(rig); legs.push(rig);
            const knee = new THREE.Vector3(side * .51, -.02, (i - 1) * .35), ankle = new THREE.Vector3(side * .87, -.43, (i - 1) * .65 + .1);
            segment(rig, new THREE.Vector3(), knee, .042); segment(rig, knee, ankle, .024);
            segment(rig, ankle, ankle.clone().add(new THREE.Vector3(side * .18, -.03, .11)), .013);
        }
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(.65, .03, 1.17, .6, 1.08, 1.39); shape.bezierCurveTo(1.04, 2.06, .75, 2.4, .43, 2.38); shape.bezierCurveTo(.12, 2.2, .09, 1.32, 0, 0);
        const geometry = new THREE.ShapeGeometry(shape, 18), attr = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
        for (let i = 0; i < attr.count; i++) {
            const x = attr.getX(i), z = attr.getY(i); uv.setXY(i, x / 1.17, 1 - z / 2.4);
            attr.setXYZ(i, side * (.16 + x * .72 + z * .15), .93 - z * .05, -.25 + z);
        }
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, wing); mesh.renderOrder = 5; group.add(mesh);
        // A restrained leading edge makes a thin membrane legible at the normal comparison scale.
        const edgePoints = shape.getPoints(32).map(p => new THREE.Vector3(side * (.16 + p.x * .72 + p.y * .15), .935 - p.y * .05, -.25 + p.y));
        const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePoints), new THREE.LineBasicMaterial({ color: '#c8e0e9', transparent: true, opacity: .36 })); outline.renderOrder = 6; group.add(outline);
    }
    // Thoracic sutures and a sparse set of macrochaetae share one static line buffer.
    // No clock-based idle motion: all animated joints still derive from actual path length.
    const bristles: THREE.Vector3[] = [];
    const dorsalY = (x: number, z: number) => .68 + .48 * Math.sqrt(Math.max(0, 1 - (x / .46) ** 2 - ((z + .2) / .6) ** 2));
    for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
            const z = -.62 + i * .085, x = side * .13;
            bristles.push(new THREE.Vector3(x, dorsalY(x, z) + .005, z), new THREE.Vector3(x, dorsalY(x, z + .085) + .005, z + .085));
        }
        for (const z of [-.48, -.22, .05]) for (const x of [.22, .31]) {
            const root = new THREE.Vector3(side * x, dorsalY(x, z), z);
            bristles.push(root, root.clone().add(new THREE.Vector3(side * .07, .16, .08)));
        }
    }
    const setae = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bristles), new THREE.LineBasicMaterial({ color: '#59452d', transparent: true, opacity: .8 }));
    setae.name = 'Thoracic sutures and bristles'; group.add(setae);
    return { group, legs, animate(pathLength: number, reduced = false) {
        const angles = gaitPose(pathLength, reduced);
        for (let i = 0; i < legs.length; i++) { legs[i].rotation.y = angles[i]; legs[i].rotation.z = Math.max(0, angles[i]) * (i < 3 ? -1 : 1) * .35; }
    } };
}
