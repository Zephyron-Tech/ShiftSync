"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";

// Apple's exponential-decay projection: where a flick would come to rest.
const project = (v: number, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);

/** Bottom sheet on a native <dialog>: focus trap, Esc and backdrop come from the browser; the handle drags it away. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y0: number; last: { y: number; t: number }; v: number } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function down(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, last: { y: e.clientY, t: e.timeStamp }, v: 0 };
    if (ref.current) {
      ref.current.style.animation = "none";
      ref.current.style.transition = "none";
    }
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g || !ref.current) return;
    const dy = Math.max(0, e.clientY - g.y0);
    const dt = e.timeStamp - g.last.t;
    if (dt > 0) g.v = ((e.clientY - g.last.y) / dt) * 1000;
    g.last = { y: e.clientY, t: e.timeStamp };
    ref.current.style.transform = `translateY(${dy}px)`;
  }

  function up(e: PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    const d = ref.current;
    drag.current = null;
    if (!g || !d) return;
    const dy = Math.max(0, e.clientY - g.y0);
    const h = d.getBoundingClientRect().height;
    // Decide from where the flick is heading, not from where the finger let go.
    const dismiss = dy + Math.max(0, project(g.v, 0.99)) > h * 0.35;
    const ms = reduced() ? 0 : 220;
    d.style.transition = `transform ${ms}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    d.style.transform = dismiss ? `translateY(${h}px)` : "translateY(0)";
    window.setTimeout(() => {
      if (dismiss) onClose();
      d.style.transition = "";
      d.style.transform = "";
      d.style.animation = "";
    }, ms);
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div
          className="-mx-4 touch-none px-4 pt-2"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <h2 className="py-3 text-lg font-bold">{title}</h2>
            <button
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-11 px-3 text-sm font-bold text-accent underline underline-offset-4"
            >
              Zavřít
            </button>
          </div>
        </div>
        {children}
      </div>
    </dialog>
  );
}
