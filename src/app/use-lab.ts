import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, LabView } from '../worker-protocol/protocol';
import { LabClient } from './lab-client';
import { inspectExperiment } from '../persistence/format';
export interface RenderFeed {
    view: LabView;
    revision: number;
    sequence: number;
    sessionId: string;
}
function client() { return new LabClient(new Worker(new URL('../worker-protocol/simulation.worker.ts', import.meta.url), { type: 'module' })); }
export function useLab() {
    const [view, setView] = useState<LabView | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null), [failed, setFailed] = useState(false), [generation, setGeneration] = useState(0);
    const feed = useRef<RenderFeed | null>(null), active = useRef<LabClient | null>(null), lastPaint = useRef(0);
    const install = useCallback((next: LabClient) => {
        active.current?.dispose();
        active.current = next;
        setError(null);
        setFailed(false);
        setBusy(false);
        setGeneration(n => n + 1);
        next.onBusy = busy => {
            setBusy(busy);
            if (busy && next.pendingType === 'REPLAY')
                setView(view => view ? { ...view, replay: { status: 'Checking', tick: view.original.tick, detail: 'Waiting for independent recomputation', checked: 0 } } : view);
            // Visibility may change while an export/command is pending. Pause after its ACK too.
            if (!busy)
                queueMicrotask(() => {
                    if (active.current === next && document.hidden && next.view?.running && !next.busy && !next.failed)
                        void next.request({ type: 'PAUSE', payload: {} }).catch(() => { });
                });
        };
        next.onError = (message, fatal) => {
            setError(message);
            if (fatal)
                setFailed(true);
        };
        next.onView = v => {
            if (active.current !== next)
                return;
            feed.current = { view: v, revision: next.cursor.revision, sequence: next.cursor.sequence, sessionId: next.cursor.sessionId };
            const now = performance.now();
            if (!v.running || now - lastPaint.current >= 100) {
                setView(v);
                lastPaint.current = now;
            }
        };
        if (next.view)
            next.onView(next.view);
    }, []);
    useEffect(() => {
        const first = client();
        let cancelled = false;
        void first.request({ type: 'INIT', payload: { seed: 42, dataset: new URLSearchParams(location.search).get('dataset') === 'synthetic' ? 'synthetic' : 'malecns' } }).then(() => {
            if (!cancelled)
                install(first);
        }).catch(e => {
            if (!cancelled) {
                setError(String(e));
                setFailed(true);
                setBusy(false);
            }
        });
        const visibility = () => {
            const c = active.current;
            if (document.hidden && c?.view?.running && !c.busy)
                void c.request({ type: 'PAUSE', payload: {} }).catch(() => { });
        };
        document.addEventListener('visibilitychange', visibility);
        return () => { cancelled = true; first.dispose(); active.current?.dispose(); document.removeEventListener('visibilitychange', visibility); };
    }, [install]);
    const request = useCallback((action: Action) => {
        setError(null);
        return active.current ? active.current.request(action) : Promise.reject(new Error('Worker is not ready'));
    }, []);
    const send = useCallback((action: Action) => { void request(action).catch(() => { }); }, [request]);
    const prepare = useCallback(async (dataset: 'malecns' | 'synthetic', file?: string) => {
        const next = client();
        try {
            await next.request({ type: 'INIT', payload: { seed: 42, dataset } });
            if (file)
                await next.request({ type: 'LOAD', payload: { file } });
            return next;
        }
        catch (e) {
            next.dispose();
            throw e;
        }
    }, []);
    const prepareLoad = useCallback(async (file: string) => {
        const { content } = await inspectExperiment(file);
        return { client: await prepare(content.metadata.dataset, file), metadata: content.metadata };
    }, [prepare]);
    return { view, busy, error, failed, feed, send, request, generation, prepare, prepareLoad, install, active };
}
