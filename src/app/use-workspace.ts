import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Library, prepareFile, recoveryOwnership, storageError } from '../persistence/library';
import type { Entry, Recovery } from '../persistence/library';
import { readExperimentFile } from '../persistence/format';
import type { FileMetadata } from '../persistence/format';
import type { Action, LabView } from '../worker-protocol/protocol';
import type { LabClient } from './lab-client';
import type { useLab } from './use-lab';
import { guidedStep } from './guide';
import { controlAllowed, controlContext, controlLabel } from './control-intent';
export type WorkspaceModal = 'welcome' | 'library' | 'save' | 'unsaved' | 'preview' | 'delete' | 'new' | 'guide' | 'model' | null;
export function historyToken(v: LabView | null) { return v ? JSON.stringify([v.dataset.hash, v.seed, v.highWater, v.forkTick, v.snapshot?.tick, v.eventRevisions]) : ''; }
function download(file: string, name: string) {
    const url = URL.createObjectURL(new Blob([file], { type: 'application/json' })), a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[^\p{L}\p{N} _-]/gu, '_').slice(0, 80) + '.flyfork.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useWorkspace(lab: ReturnType<typeof useLab>) {
    const [modal, updateModal] = useState<WorkspaceModal>('welcome'), [io, setIO] = useState(false), [notice, setNotice] = useState(''), [problem, setProblem] = useState('');
    const opener = useRef<HTMLElement | null>(null);
    function rememberOpener() {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused !== document.body && !focused.closest('dialog'))
            opener.current = focused;
    }
    function setModal(next: WorkspaceModal) {
        searchSequence.current++;
        if (next)
            rememberOpener();
        updateModal(next);
    }
    const [storageMessage, setStorageMessage] = useState('Opening local storage…'), [available, setAvailable] = useState(false);
    const database = useRef<Library | null>(null);
    function db() {
        if (!database.current)
            throw new Error('Storage is not open. Export remains available.');
        return database.current;
    }
    const [name, setName] = useState('Untitled experiment'), [entry, setEntry] = useState<Entry | null>(null), [savedToken, setSavedToken] = useState<string | null>(null), [savedCursor, setSavedCursor] = useState<number | null>(null);
    const [rows, setRows] = useState<Entry[]>([]), [search, setSearch] = useState(''), [formName, setFormName] = useState(''), [saveCopy, setSaveCopy] = useState(false), [renameEntry, setRenameEntry] = useState<Entry | null>(null), [deleteEntry, setDeleteEntry] = useState<Entry | null>(null);
    const [preview, setPreview] = useState<{
        client: LabClient;
        metadata: FileMetadata;
        source: 'library' | 'import' | 'recovery';
        entry?: Entry;
    } | null>(null);
    const [recovery, setRecovery] = useState<Recovery | null>(null), [recoveryOwned, setRecoveryOwned] = useState(false), [started, setStarted] = useState(false);
    const [guideStep, setGuideStep] = useState(0), [guideBusy, setGuideBusy] = useState(false);
    const experimentId = useRef<string>(crypto.randomUUID()), owner = useRef(crypto.randomUUID()), claimed = useRef(false), recoverySequence = useRef(0), autoBusy = useRef(false), lastAuto = useRef(0), lastRecoveryKey = useRef(''), cancelledGuide = useRef(false);
    const pendingAction = useRef<(() => Promise<void>) | null>(null), alive = useRef(true);
    const recoveryWork = useRef<Promise<void> | null>(null), searchSequence = useRef(0);
    // Save and experiment controls reserve the same single foreground slot.
    const foregroundIntent = useRef<{ kind: 'save' | 'control'; cancelled: boolean } | null>(null);
    const [savePhase, setSavePhase] = useState<'waiting' | 'preparing' | 'saving' | null>(null);
    const [controlPhase, setControlPhase] = useState<'waiting' | 'running' | 'cancelled' | null>(null), [controlStatus, setControlStatus] = useState('');
    const controlOpener = useRef<HTMLElement | null>(null);
    const controlCancel = useRef<HTMLButtonElement | null>(null);
    const removedControlFocus = useRef<{ target: HTMLElement | null; current(): boolean } | null>(null);
    const dirty = savedToken === null ? Boolean(lab.view && (lab.view.highWater || lab.view.snapshot || lab.view.forkTick !== null)) : historyToken(lab.view) !== savedToken;
    const latest = useRef({ lab, io, name, started, available, recoveryOwned, guideBusy });
    latest.current = { lab, io, name, started, available, recoveryOwned, guideBusy };
    useEffect(() => {
        const moved = (event: FocusEvent) => {
            if (event.target !== document.body && event.target !== controlCancel.current) removedControlFocus.current = null;
        };
        document.addEventListener('focusin', moved);
        return () => { document.removeEventListener('focusin', moved); removedControlFocus.current = null; };
    }, []);
    useLayoutEffect(() => {
        const owned = removedControlFocus.current;
        if (!owned) return;
        if (!owned.current() || modal) { removedControlFocus.current = null; return; }
        if (controlPhase !== null || io || lab.busy) return;
        removedControlFocus.current = null;
        const usable = (node: HTMLElement | null): node is HTMLElement => Boolean(node?.isConnected && node.getClientRects().length && !node.matches(':disabled,[aria-disabled="true"]') && !node.closest('[inert],dialog'));
        const fallback = document.querySelector<HTMLElement>('.workspace-tools > button');
        const target = usable(owned.target) ? owned.target : usable(fallback) ? fallback : null;
        target?.focus();
    });
    useEffect(() => {
        alive.current = true;
        let release = () => { };
        let cancelled = false, opened = false;
        // StrictMode's next setup owns a different instance, including a pending open.
        const owned = new Library(message => {
            if (!cancelled) { setStorageMessage(message); setAvailable(false); }
        });
        database.current = owned;
        // Safari's IndexedDB availability check can throw before open returns a promise.
        void Promise.resolve().then(() => owned.open()).then(async () => {
            opened = true;
            if (cancelled) { owned.close(); return; }
            let stored: Recovery | null = null, recoveryError = '';
            try {
                stored = await owned.readRecovery();
            }
            catch (error) {
                recoveryError = storageError(error);
            }
            // A versionchange during the read already closed this owner and reported why.
            if (cancelled || !owned.isOpen())
                return;
            setRecovery(stored ?? null);
            setAvailable(true);
            setStorageMessage(recoveryError || 'Local Library · this browser / profile / address');
            const ownership = await recoveryOwnership();
            release = ownership.release;
            if (cancelled) {
                release();
                return;
            }
            setRecoveryOwned(ownership.owned);
        }).catch(error => {
            if (cancelled) { owned.close(); return; }
            if (!cancelled)
                setStorageMessage(storageError(error));
        });
        return () => {
            if (cancelled) return;
            cancelled = true;
            if (database.current === owned) { database.current = null; alive.current = false; }
            claimed.current = false;
            if (foregroundIntent.current) foregroundIntent.current.cancelled = true;
            searchSequence.current++;
            release();
            // Dexie cancellation can settle before the native open request. Let that
            // request finish, then the cancelled continuation closes its own handle.
            if (opened) owned.close();
        };
    }, []);
    useEffect(() => {
        if (!started || !available || !recoveryOwned || claimed.current)
            return;
        let cancelled = false;
        const owned = db();
        void owned.recovery.get('slot').then(old => {
            if (!cancelled) return owned.claimRecovery(owner.current, old?.revision ?? null);
        }).then(() => {
            if (!cancelled)
                claimed.current = true;
        }).catch(error => {
            if (!cancelled)
                setStorageMessage(storageError(error));
        });
        return () => { cancelled = true; };
    }, [started, available, recoveryOwned]);
    useEffect(() => {
        const timer = setInterval(() => {
            const current = latest.current, c = current.lab.active.current, v = c?.view;
            if (!alive.current || !current.started || !current.available || !current.recoveryOwned || !claimed.current || current.io || foregroundIntent.current || current.guideBusy || autoBusy.current || !c || c.busy || c.failed || !v)
                return;
            const key = historyToken(v) + ':' + v.original.tick + ':' + c.cursor.sessionId;
            if (key === lastRecoveryKey.current || Date.now() - lastAuto.current < (v.running ? 30000 : 5000))
                return;
            autoBusy.current = true;
            lastAuto.current = Date.now();
            const id = experimentId.current, seq = ++recoverySequence.current, owned = db();
            const isCurrent = () => alive.current && database.current === owned && current.lab.active.current === c && experimentId.current === id;
            const work = c.request({ type: 'EXPORT_STATE', payload: { id, name: current.name, savedAt: new Date().toISOString(), runtime: navigator.userAgent.slice(0, 200), dataset: v.dataset.kind } })
                .then(reply => {
                if (!reply.file)
                    throw new Error('Worker returned no recovery file');
                return prepareFile(reply.file);
            })
                .then(prepared => owned.saveRecovery(prepared, owner.current, seq, isCurrent))
                .then(saved => {
                if (isCurrent()) {
                    setRecovery(saved);
                    lastRecoveryKey.current = key;
                }
            })
                .catch(error => {
                if (isCurrent())
                    setStorageMessage(storageError(error));
            })
                .finally(() => {
                    if (recoveryWork.current === work) { autoBusy.current = false; recoveryWork.current = null; }
                });
            recoveryWork.current = work;
        }, 1000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        const listener = (event: BeforeUnloadEvent) => {
            if (dirty)
                event.preventDefault();
        };
        window.addEventListener('beforeunload', listener);
        return () => window.removeEventListener('beforeunload', listener);
    }, [dirty]);
    async function perform(action: () => Promise<void>) {
        rememberOpener();
        setIO(true);
        setProblem('');
        try {
            await action();
        }
        catch (error) {
            setProblem(storageError(error));
        }
        finally {
            if (alive.current)
                setIO(false);
        }
    }
    async function pause() {
        const c = lab.active.current;
        if (c?.view?.running && !c.failed)
            await c.request({ type: 'PAUSE', payload: {} });
    }
    async function guard(action: () => Promise<void>) {
        await pause();
        if (dirty) {
            pendingAction.current = action;
            setModal('unsaved');
        }
        else
            await action();
    }
    function close() {
        if (guideBusy) {
            cancelledGuide.current = true;
            setNotice('Finishing the current bounded step; no further guide commands will run.');
            setModal(null);
            return;
        }
        if (io) {
            if (savePhase !== 'waiting' || foregroundIntent.current?.kind !== 'save') return;
            foregroundIntent.current.cancelled = true;
            setNotice('Save cancelled. Finishing the current recovery record.');
        }
        preview?.client.dispose();
        setPreview(null);
        pendingAction.current = null;
        setProblem('');
        setModal(null);
    }
    function openSave(copy = false, trigger?: HTMLElement) {
        if (foregroundIntent.current || io) return;
        setSaveCopy(copy); setRenameEntry(null); setFormName(copy ? name + ' copy' : name); setModal('save');
        // Safari mouse activation need not focus a button. Retain the actual
        // native toolbar trigger rather than guessing from document.activeElement.
        if (trigger) opener.current = trigger;
    }
    async function capture(id: string, title: string) {
        const c = lab.active.current, v = c?.view;
        if (!c || !v)
            throw new Error('Worker is unavailable. Recover the last durable record.');
        const reply = await c.request({ type: 'EXPORT_STATE', payload: { id, name: title, savedAt: new Date().toISOString(), runtime: navigator.userAgent.slice(0, 200), dataset: v.dataset.kind } });
        if (!reply.file)
            throw new Error('Worker returned no file');
        return { prepared: await prepareFile(reply.file), client: c, view: reply.view! };
    }
    async function save() {
        // One foreground intent, registered synchronously before any await or React paint.
        if (foregroundIntent.current || io) return;
        const intent = { kind: 'save' as const, cancelled: false }, client = lab.active.current, identity = experimentId.current;
        const session = client?.cursor.sessionId, epoch = client?.cursor.epoch, owned = database.current;
        const isCurrent = () => !intent.cancelled && alive.current && foregroundIntent.current === intent && database.current === owned && lab.active.current === client && experimentId.current === identity && client?.cursor.sessionId === session && client?.cursor.epoch === epoch && !client?.closed && !client?.failed;
        foregroundIntent.current = intent;
        setSavePhase(recoveryWork.current ? 'waiting' : 'preparing');
        try { await perform(async () => {
            if (!available)
                throw new Error('Memory-only: Library save is unavailable. Use Export file.');
            const title = formName.trim();
            if (!title || title.length > 100)
                throw new Error('Use a name between 1 and 100 characters.');
            const id = renameEntry?.id ?? (saveCopy ? crypto.randomUUID() : experimentId.current);
            const old = renameEntry ?? (saveCopy ? null : entry);
            // Wait for the entire recovery transaction, not just its Worker ACK.
            await recoveryWork.current;
            if (!isCurrent()) return;
            setSavePhase('preparing');
            let captured: Awaited<ReturnType<typeof capture>>;
            if (renameEntry) {
                const stored = await owned!.read(renameEntry.id), candidate = await lab.prepareLoad(stored.file);
                try {
                    const reply = await candidate.client.request({ type: 'EXPORT_STATE', payload: { ...candidate.metadata, name: title, savedAt: new Date().toISOString() } });
                    captured = { prepared: await prepareFile(reply.file!), client: candidate.client, view: reply.view! };
                }
                finally {
                    candidate.client.dispose();
                }
            }
            else
                captured = await capture(id, title);
            if (!isCurrent()) return;
            setSavePhase('saving');
            const saved = await owned!.save(captured.prepared, old?.revision ?? null, isCurrent);
            if (!isCurrent()) return;
            if (!renameEntry || entry?.id === saved.id) {
                setName(title);
                setEntry(saved);
                experimentId.current = id;
                if (!renameEntry) {
                    setSavedToken(historyToken(captured.view));
                    setSavedCursor(captured.view.original.tick);
                }
            }
            setNotice('Saved to local Library.');
            setModal(null);
            setRows(await owned!.list(search));
            const next = pendingAction.current;
            pendingAction.current = null;
            if (next)
                await next();
        }); }
        finally {
            if (foregroundIntent.current === intent) { foregroundIntent.current = null; if (alive.current) setSavePhase(null); }
        }
    }
    async function sendControl(action: Action, trigger?: HTMLElement) {
        const current = latest.current, c = current.lab.active.current, v = c?.view;
        if (foregroundIntent.current || current.io || current.guideBusy) {
            setControlStatus('Another action is pending. Wait for it or cancel the pending command.');
            return;
        }
        if (!c || !v || c.failed || c.closed || (c.busy && !(autoBusy.current && c.pendingType === 'EXPORT_STATE')) || !controlAllowed(v, action)) {
            setControlStatus('Command unavailable in the current experiment state.');
            return;
        }
        const intent = { kind: 'control' as const, cancelled: false }, identity = experimentId.current;
        const session = c.cursor.sessionId, epoch = c.cursor.epoch, context = controlContext(v, action), label = controlLabel(action);
        const owns = () => alive.current && foregroundIntent.current === intent && latest.current.lab.active.current === c && experimentId.current === identity && c.cursor.sessionId === session && c.cursor.epoch === epoch;
        removedControlFocus.current = null;
        const rememberRemovedFocus = () => {
            // Record ownership before the waiting control is removed. BODY alone
            // never grants restoration; a later focusin cancels this request.
            if (owns() && controlCancel.current && document.activeElement === controlCancel.current) {
                removedControlFocus.current = { target: controlOpener.current, current: () => alive.current && latest.current.lab.active.current === c && experimentId.current === identity && c.cursor.sessionId === session && c.cursor.epoch === epoch };
            }
        };
        foregroundIntent.current = intent;
        controlOpener.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        setStarted(true); setIO(true); setProblem('');
        setControlPhase(recoveryWork.current ? 'waiting' : 'running');
        setControlStatus(recoveryWork.current ? `Waiting for recovery before ${label}.` : `Applying ${label}…`);
        try {
            // Share Save's complete recovery transaction boundary. Storage failure
            // settles this work too; a healthy memory-only command can still run.
            await recoveryWork.current;
            if (intent.cancelled) return;
            if (!owns() || c.failed || c.closed || c.busy || !c.view || controlContext(c.view, action) !== context || !controlAllowed(c.view, action)) {
                if (alive.current) setControlStatus(`${label} cancelled: the experiment changed or its Worker is unavailable.`);
                return;
            }
            rememberRemovedFocus();
            setControlPhase('running'); setControlStatus(`Applying ${label}…`);
            const reply = await current.lab.request(action);
            if (owns()) setControlStatus(`${label} completed at ${((reply.view?.original.tick ?? 0) / 10000).toFixed(3)} s.`);
        } catch (error) {
            if (owns()) setControlStatus(`${label} failed: ${error instanceof Error ? error.message : 'Command failed'}`);
        } finally {
            if (foregroundIntent.current === intent) {
                rememberRemovedFocus();
                foregroundIntent.current = null;
                if (alive.current) {
                    if (intent.cancelled) setControlStatus('Command cancelled.');
                    setControlPhase(null); setIO(false);
                }
            }
        }
    }
    function cancelControl() {
        const intent = foregroundIntent.current;
        if (intent?.kind !== 'control' || controlPhase !== 'waiting') return;
        intent.cancelled = true;
        setControlPhase('cancelled');
        setControlStatus('Command cancelled. Finishing the current recovery record.');
        removedControlFocus.current = null;
        // A deliberate Cancel returns to its native initiator.
        if (controlOpener.current?.isConnected) controlOpener.current.focus();
    }
    async function openLibrary() { await perform(async () => { await pause(); setRows(available ? await db().list(search) : []); setModal('library'); }); }
    async function filter(value: string) {
        setSearch(value);
        const sequence = ++searchSequence.current, owned = database.current;
        try {
            const found = available && owned ? await owned.list(value) : [];
            if (alive.current && database.current === owned && searchSequence.current === sequence) setRows(found);
        } catch (error) {
            if (alive.current && searchSequence.current === sequence) setProblem(storageError(error));
        }
    }
    async function previewFile(file: string, source: 'library' | 'import' | 'recovery', selected?: Entry) {
        await perform(async () => { const candidate = await lab.prepareLoad(file); preview?.client.dispose(); setPreview({ ...candidate, source, entry: selected }); setModal('preview'); });
    }
    async function importFile(file: File) { await perform(async () => { const text = await readExperimentFile(file); const candidate = await lab.prepareLoad(text); preview?.client.dispose(); setPreview({ ...candidate, source: 'import' }); setModal('preview'); }); }
    async function loadEntry(row: Entry) { await perform(async () => { const stored = await db().read(row.id); const candidate = await lab.prepareLoad(stored.file); setPreview({ ...candidate, source: 'library', entry: stored.entry }); setModal('preview'); }); }
    async function acceptPreview() {
        if (!preview)
            return;
        const target = preview;
        await perform(() => guard(async () => {
            lab.install(target.client);
            setControlStatus('');
            experimentId.current = target.source === 'library' ? target.metadata.id : crypto.randomUUID();
            setName(target.source === 'recovery' ? target.metadata.name + ' recovered' : target.metadata.name);
            setEntry(target.source === 'library' ? target.entry ?? null : null);
            setSavedToken(target.source === 'library' ? historyToken(target.client.view) : null);
            setSavedCursor(target.source === 'library' ? target.client.view!.original.tick : null);
            setPreview(null);
            setModal(null);
            setStarted(true);
            setNotice('Loaded paused. Use Replay check to independently verify this history.');
        }));
    }
    async function start(dataset: 'malecns' | 'synthetic', guide = false) {
        await perform(() => guard(async () => {
            const next = await lab.prepare(dataset);
            lab.install(next);
            setControlStatus('');
            experimentId.current = crypto.randomUUID();
            setEntry(null);
            setSavedToken(null);
            setSavedCursor(null);
            setName(guide ? 'Guided experiment' : 'Untitled experiment');
            setStarted(true);
            setGuideStep(0);
            cancelledGuide.current = false;
            setModal(guide ? 'guide' : null);
            setNotice(guide ? 'Guide uses the real simulation motor.' : 'New blank experiment.');
        }));
    }
    async function nextGuide() {
        const c = lab.active.current;
        if (!c)
            return;
        if (guideStep === 4) {
            setModal(null);
            setNotice('Guide complete. Save or export this computed experiment.');
            return;
        }
        setGuideBusy(true);
        setProblem('');
        try {
            await guidedStep(c, guideStep, () => cancelledGuide.current || lab.active.current !== c);
            setGuideStep(n => n + 1);
        }
        catch (error) {
            setProblem(storageError(error));
        }
        finally {
            setGuideBusy(false);
        }
    }
    async function discard() {
        const next = pendingAction.current;
        pendingAction.current = null;
        setModal(null);
        if (next)
            await perform(next);
    }
    async function exportFile(row?: Entry) {
        await perform(async () => {
            if (row) {
                const stored = await db().read(row.id);
                download(stored.file, row.name);
            }
            else {
                const captured = await capture(experimentId.current, name);
                download(captured.prepared.file, name);
            }
            setNotice('Exported .flyfork.json file.');
        });
    }
    async function remove() {
        if (!deleteEntry)
            return;
        await perform(async () => {
            await db().remove(deleteEntry.id, deleteEntry.revision);
            if (entry?.id === deleteEntry.id) {
                setEntry(null);
                setSavedToken(null);
                experimentId.current = crypto.randomUUID();
            }
            setRows(await db().list(search));
            setModal('library');
            setNotice('Library record deleted; the live experiment was preserved.');
        });
    }
    const canSave = Boolean(lab.view && available && !io && !guideBusy && !lab.failed && (!lab.busy || (autoBusy.current && lab.active.current?.pendingType === 'EXPORT_STATE')));
    const controlPending = controlPhase !== null;
    const controlsReady = Boolean(lab.view && !lab.view.job && !lab.failed && !guideBusy && (!io || controlPending) && (!lab.busy || controlPending || (autoBusy.current && lab.active.current?.pendingType === 'EXPORT_STATE')));
    return { modal, setModal, opener, io, savePhase, canSave, controlsReady, controlPending, controlPhase, controlStatus, controlCancel, sendControl, cancelControl, notice, problem, storageMessage, available, recovery, recoveryOwned, name, entry, savedCursor, dirty, rows, search, formName, setFormName, deleteEntry, preview, guideStep, guideBusy, started, setStarted, close, openSave, save, openLibrary, filter, loadEntry, previewFile, importFile, acceptPreview, start, nextGuide, discard, exportFile, remove,
        rename(row: Entry) { setRenameEntry(row); setFormName(row.name); setSaveCopy(false); setModal('save'); },
        confirmDelete(row: Entry) { setDeleteEntry(row); setModal('delete'); },
        saveCopy, renameEntry };
}
