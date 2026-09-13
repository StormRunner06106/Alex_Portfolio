import { useEffect, useId, useRef } from "react";
import Icon from "./Icon";

export default function Modal({ title, children, onClose, busy = false }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return <dialog ref={dialog} className="admin-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="admin-dialog__heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close" /></button>
    </div>
    {children}
  </dialog>;
}
