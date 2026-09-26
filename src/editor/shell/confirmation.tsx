// The confirmation a dispatch waits for (ARCHITECTURE.md, "Store and dispatch": state.confirmation, asked by a
// command whose manifest entry has a confirmation, such as File › Open over a page that holds work): the question and
// its two answers, in the manifest's words, in a modal dialog over the editor. The answer goes back to the store
// (store.answer), which runs the waiting dispatch or drops it. The focus goes to Cancel, the answer that loses
// nothing. Its two buttons are that door's run going on, not doors of their own (data-local).
import { useEffect, useRef } from 'react';
import { useEditorState, useStore } from '../store.ts';
import { useT } from '../text.ts';

export function Confirmation() {
  const t = useT();
  const store = useStore();
  const waiting = useEditorState((s) => s.confirmation ?? null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (waiting !== null) cancel.current?.focus();
  }, [waiting]);
  if (waiting === null) return null;
  return (
    <div className="confirmation" data-confirmation-dialog>
      <div className="confirmation__scrim" />
      <div className="confirmation__box" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-message">
        <p id="confirmation-message" className="confirmation__message">
          {t(waiting.message)}
        </p>
        <div className="confirmation__actions">
          <button ref={cancel} type="button" className="door door--button" data-local="confirmation" data-confirmation="cancel" onClick={() => store.answer(false)}>
            <span className="door__label">{t(waiting.cancel)}</span>
          </button>
          <button type="button" className="door door--primary" data-local="confirmation" data-confirmation="confirm" onClick={() => store.answer(true)}>
            <span className="door__label">{t(waiting.confirm)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
