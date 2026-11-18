import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export default function DetailSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    const media = window.matchMedia('(max-width:700px)');
    const resize = () => { if (!media.matches && ref.current?.open) ref.current.close(); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  return <dialog ref={ref} className="detail-sheet" aria-label="物品詳情" onClose={onClose}
    onKeyDown={e => {
      if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
      const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex="0"]'))
        .filter(el => !el.matches(':disabled') && el.checkVisibility());
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {e.preventDefault(); last?.focus();}
      else if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first?.focus();}
    }}
    onClick={e => { if (e.target === e.currentTarget) ref.current?.close(); }}>
    <div className="sheet-header"><span>物品與照護條件</span><button type="button" className="icon-button" autoFocus aria-label="關閉詳情" onClick={() => ref.current?.close()}>✕</button></div>
    {children}
  </dialog>;
}
