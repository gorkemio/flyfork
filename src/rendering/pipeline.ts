import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { standardTargetSize } from './presentation';

export interface ArenaRect { x: number; y: number; width: number; height: number }
/** One shared HDR/MSAA target. Resolve before the single ACES/sRGB conversion. */
export function createStandardPipeline(renderer: THREE.WebGLRenderer) {
    const hdr = renderer.extensions.has('EXT_color_buffer_float'), gl = renderer.getContext() as WebGL2RenderingContext;
    const supported = hdr ? Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array) : [];
    const samples = Math.max(0, ...supported.filter(n => n <= 4));
    const beauty = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, samples, resolveDepthBuffer: false });
    beauty.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const tone = new OutputPass(); tone.renderToScreen = true;
    let width = 1, height = 1, scale = 1;
    const mode = hdr ? `Standard HDR / MSAA ${samples}` : 'Standard compatibility / direct / AA off';
    return {
        mode,
        resize(cssWidth: number, cssHeight: number, dpr: number, narrow: boolean) {
            const size = standardTargetSize(cssWidth, cssHeight, dpr, narrow); scale = size.scale;
            if (size.width === width && size.height === height) return;
            width = size.width; height = size.height;
            if (hdr) beauty.setSize(width, height);
        },
        render(scene: THREE.Scene, camera: THREE.Camera, rect: ArenaRect) {
            if (hdr) {
                renderer.setRenderTarget(beauty); renderer.setScissorTest(false);
                renderer.clear(true, true, true); renderer.render(scene, camera);
            }
            // Switching targets resolves MSAA; tone mapping never runs in the beauty pass.
            renderer.setRenderTarget(null);
            renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
            renderer.setScissor(rect.x, rect.y, rect.width, rect.height); renderer.setScissorTest(true);
            renderer.clearDepth();
            if (hdr) tone.render(renderer, beauty, beauty, 0, false);
            else { renderer.clear(true, true, true); renderer.render(scene, camera); }
            renderer.setScissorTest(false);
        },
        // Conservative RGBA16F(8)+depth(4), resolved plus multisample storage.
        get stats() { return { mode: hdr ? `HDR/MSAA${samples}` : 'direct/no-AA', width, height, effectiveScale: scale, renderTargetBytes: hdr ? width * height * 12 * (1 + samples) : 0, samples, supportedSamples: supported }; },
        dispose() { beauty.dispose(); tone.dispose(); },
    };
}
