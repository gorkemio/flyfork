import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
export function Dialog({ title, children, onClose, returnFocus, kind }: {
    title: string;
    kind?: string;
    children: ReactNode;
    onClose(): void;
    returnFocus: HTMLElement | null;
}) {
    const ref = useRef<HTMLDialogElement>(null), titleId = useId(), close = useRef(onClose), opener = useRef(returnFocus);
    close.current = onClose;
    useEffect(() => {
        const previous = opener.current ?? document.activeElement, dialog = ref.current!;
        dialog.showModal();
        const cancel = (event: Event) => { event.preventDefault(); close.current(); };
        const focusable = (container: Element) => Array.from(container.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],summary,[tabindex]'))
            .filter(element => !element.matches(':disabled,[tabindex="-1"]') && element.getClientRects().length > 0);
        const trap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab')
                return;
            const controls = focusable(dialog);
            event.preventDefault();
            if (!controls.length)
                dialog.focus();
            else {
                // WebKit may skip buttons in native Tab navigation. Own the full
                // dialog order so an input cannot tab out past usable actions.
                const index = controls.indexOf(document.activeElement as HTMLElement);
                const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
                controls[next].focus();
            }
        };
        dialog.addEventListener('cancel', cancel);
        dialog.addEventListener('keydown', trap);
        return () => {
            dialog.removeEventListener('cancel', cancel);
            dialog.removeEventListener('keydown', trap);
            dialog.close();
            if (previous instanceof HTMLElement && previous.isConnected) {
                const toolbar = previous.closest('nav');
                // A cancelled Save can leave its opener disabled until the active
                // recovery settles. Return to a usable control in the same toolbar.
                const target = previous.matches(':disabled') && toolbar ? focusable(toolbar)[0] : previous;
                target?.focus();
            }
        };
    }, []);
    return <dialog ref={ref} tabIndex={-1} className={`workspace-dialog dialog-${kind ?? 'default'}`} aria-labelledby={titleId}><header><div><p className="dialog-kicker">FlyFork / {kind === 'model' ? 'Scientific context' : kind === 'guide' ? 'Guided experiment' : kind === 'library' ? 'Local workspace' : 'Experiment workspace'}</p><h2 id={titleId}>{title}</h2></div><button className="button" aria-label="Close dialog" onClick={onClose}>×</button></header>{children}</dialog>;
}
