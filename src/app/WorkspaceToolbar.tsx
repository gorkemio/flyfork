import type { useWorkspace } from './use-workspace';
import type { useLab } from './use-lab';
export function WorkspaceToolbar({ ws, lab, ready }: {
    ws: ReturnType<typeof useWorkspace>;
    lab: ReturnType<typeof useLab>;
    ready: boolean;
}) {
    const actions = <><button className="button" disabled={!ws.canSave} onClick={event => ws.openSave(true, event.currentTarget)}>Save as copy</button><button className="button" disabled={!ready} onClick={() => void ws.exportFile()}>Export file</button><button className="button" disabled={lab.busy || ws.io} onClick={() => void ws.start('malecns', true)}>Guide</button><button className="button" onClick={() => ws.setModal('model')}>Model & limitations</button></>;
    return <nav className="workspace-tools" aria-label="Local experiment"><div className="record-name" data-dirty={ws.dirty}><span className="record-label">EXPERIMENT</span><strong aria-describedby="library-record-status">{ws.name}</strong></div><button className="button" disabled={lab.busy || ws.io} onClick={() => ws.setModal('new')}>New experiment</button><button className="button" disabled={!ws.canSave} onClick={event => ws.openSave(false, event.currentTarget)}>Save</button><button className="button" disabled={ws.io || lab.busy} onClick={() => void ws.openLibrary()}>Library</button><div className="desktop-actions" role="group" aria-label="Export and help">{actions}</div><details className="mobile-actions"><summary>More actions</summary><div>{actions}</div></details></nav>;
}
