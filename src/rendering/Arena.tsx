import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { RenderFeed } from '../app/use-lab';
import type { BranchId } from '../experiments/events';
import { createArena } from './scene';
import { PoseBuffer } from './pose-buffer';
import type { ArenaRect } from './pipeline';
const names: BranchId[] = ['original', 'A', 'B'];

export function Arena({ feed, branch, showTrail, enabled }: {
    feed: RefObject<RenderFeed | null>; branch: BranchId; showTrail: boolean; enabled: boolean;
}) {
    const container = useRef<HTMLDivElement>(null), options = useRef({ branch, showTrail, enabled });
    const [error, setError] = useState<string | null>(null), [contextGeneration, setContextGeneration] = useState(0);
    useEffect(() => { options.current = { branch, showTrail, enabled }; }, [branch, showTrail, enabled]);
    useEffect(() => {
        const element = container.current;
        if (!element) return;
        let arena: ReturnType<typeof createArena>;
        try { arena = createArena(element); }
        catch { setError('WebGL2 could not start. Simulation controls remain available.'); return; }
        if (arena.pipeline.mode.includes('compatibility')) setError(arena.pipeline.mode);
        else setError(null);
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const buffers = names.map(() => new PoseBuffer());
        let sequence = -1, poseKey = '', renderKey = '', frame = 0, lastDraw = 0, drawnFrames = 0, lastReport = 0, contextLost = false;
        const intervals: number[] = [], cpuTimes: number[] = [];
        const rects: ArenaRect[] = [];
        let layoutDirty = true;
        const observer = new ResizeObserver(() => { layoutDirty = true; }); observer.observe(element);
        const invalidateLayout = () => { layoutDirty = true; };
        window.addEventListener('resize', invalidateLayout); motionQuery.addEventListener('change', invalidateLayout);
        const render = (now: number) => {
            frame = requestAnimationFrame(render);
            if (document.hidden || contextLost) return;
            const f = feed.current, o = options.current, narrow = window.innerWidth < 1280;
            if (!f) return;
            const resized = arena.resize(narrow);
            const nextKey = `${f.sessionId}:${f.revision}:${f.sequence}:${narrow}:${o.branch}:${o.showTrail}:${o.enabled}:${motionQuery.matches}:${arena.assetRevision}`;
            const newPoseKey = `${f.sessionId}:${f.revision}:${f.view.running}:${f.view.job?.type ?? ''}`;
            const views = [f.view.original, f.view.branch, f.view.branchB];
            if (f.sequence !== sequence || poseKey !== newPoseKey) {
                views.forEach((t, i) => { if (t) buffers[i].push({ tick: t.tick, ...t.body }, newPoseKey, now); });
                sequence = f.sequence; poseKey = newPoseKey;
            }
            const dirty = resized || layoutDirty || renderKey !== nextKey;
            if (!dirty && !f.view.running) { lastDraw = 0; return; }
            if (dirty) {
                rects.length = 0;
                const canvas = element.getBoundingClientRect();
                const windows = element.closest('.arenas')?.querySelectorAll<HTMLElement>('.branch-window');
                names.forEach((_, i) => {
                    const box = windows?.[i]?.getBoundingClientRect();
                    rects.push(box && box.width ? { x: box.left - canvas.left + 1, y: 0, width: box.width - 2, height: canvas.height } : { x: 0, y: 0, width: 0, height: 0 });
                });
                const activeRect = rects.find(r => r.width > 0);
                if (activeRect) arena.pipeline.resize(activeRect.width, activeRect.height, window.devicePixelRatio, narrow);
                layoutDirty = false; renderKey = nextKey;
            }
            const renderer = arena.renderer, bindings = [];
            if (!o.enabled) { renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.clear(); renderer.domElement.dataset.bindings = '[]'; return; }
            const start = performance.now(); renderer.info.reset();
            renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, element.clientWidth, element.clientHeight); renderer.clear(true, true, true);
            for (let i = 0; i < names.length; i++) {
                const t = views[i], rect = rects[i];
                if (!t || !rect?.width || (narrow && names[i] !== o.branch)) continue;
                const p = buffers[i].sample(motionQuery.matches || !f.view.running ? now + 50 : now);
                if (!p) continue;
                for (let j = 0; j < 3; j++) { arena.flies[j].group.visible = j === i; arena.contacts[j].visible = j === i; arena.trails[j].group.visible = j === i && o.showTrail; }
                const fly = arena.flies[i]; fly.group.position.set(p.x, .07, p.y); fly.group.rotation.y = -p.heading - Math.PI / 2; fly.animate(t.body.pathLength, motionQuery.matches);
                arena.contacts[i].position.set(p.x, .065, p.y); arena.contacts[i].rotation.z = -p.heading - Math.PI / 2;
                arena.trails[i].update(t.trail, t.tick, `${f.sessionId}:${f.revision}`);
                const span = arena.viewport(rect); arena.trails[i].viewport(rect.width, rect.height, span);
                arena.pipeline.render(arena.scene, arena.camera, rect);
                bindings.push({ branch: names[i], tick: t.tick, x: p.x, y: p.y, heading: p.heading, pathLength: t.body.pathLength, gait: fly.legs.map(l => l.rotation.y), trailPoints: arena.trails[i].sampleCount, rect, exposure: renderer.toneMappingExposure });
            }
            renderer.setRenderTarget(null); renderer.setScissorTest(false);
            const cpu = performance.now() - start; drawnFrames++;
            if (lastDraw && f.view.running) intervals.push(now - lastDraw); lastDraw = now; cpuTimes.push(cpu);
            if (intervals.length > 240) intervals.shift(); if (cpuTimes.length > 240) cpuTimes.shift();
            renderer.domElement.dataset.bindings = JSON.stringify(bindings);
            if (dirty || now - lastReport > 1000) {
                const sorted = [...intervals].sort((a, b) => a - b), sortedCPU = [...cpuTimes].sort((a, b) => a - b);
                renderer.domElement.dataset.renderStats = JSON.stringify({ samples: intervals.length, drawnFrames, meanMs: intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length), p95Ms: sorted[Math.floor(sorted.length * .95)] ?? 0,
                    cpuMeanMs: cpuTimes.reduce((a, b) => a + b, 0) / Math.max(1, cpuTimes.length), cpuP95Ms: sortedCPU[Math.floor(sortedCPU.length * .95)] ?? 0,
                    timingScope: 'rAF interval and CPU submission; not physical GPU timing', geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length,
                    drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, viewports: bindings.length, target: arena.pipeline.stats, ...arena.presentation });
                lastReport = now;
            }
        };
        arena.invalidateShadow();
        const lost = (event: Event) => { event.preventDefault(); contextLost = true; setError('WebGL context lost. Simulation and save/export remain available; waiting for graphics recovery.'); };
        const restored = () => { setContextGeneration(n => n + 1); };
        arena.renderer.domElement.addEventListener('webglcontextlost', lost); arena.renderer.domElement.addEventListener('webglcontextrestored', restored);
        frame = requestAnimationFrame(render);
        return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', invalidateLayout); motionQuery.removeEventListener('change', invalidateLayout); arena.renderer.domElement.removeEventListener('webglcontextlost', lost); arena.renderer.domElement.removeEventListener('webglcontextrestored', restored); arena.dispose(); };
    }, [feed, contextGeneration]);
    return <><div className="arena-canvas" ref={container} data-testid="arena"/><span className="cutaway-note">Walls in visual cutaway · collisions unchanged</span>{(!enabled || error) && <div className="render-notice" role="status">{error ?? 'Rendering paused · simulation continues independently'}</div>}</>;
}
