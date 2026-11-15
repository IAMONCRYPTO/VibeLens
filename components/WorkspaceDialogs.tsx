import { useEffect, useRef, useState } from "react";
import { CodeXml, X } from "lucide-react";

export function PasteDialog({ onClose, onPaste }: { onClose: () => void; onPaste: (name: string, code: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("snippet.ts");
  const [code, setCode] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="glass paste-dialog" onCancel={onClose} aria-labelledby="paste-heading">
    <div className="panel-heading"><span className="panel-icon"><CodeXml size={18} /></span><h2 id="paste-heading">Paste code</h2><button type="button" className="icon-button close-dialog" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
    <form onSubmit={(event) => { event.preventDefault(); if (name.trim() && code.trim()) onPaste(name.trim(), code); }}>
      <label>File name<input value={name} required maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
      <label>Source code<textarea value={code} required maxLength={250000} rows={10} spellCheck={false} onChange={(event) => setCode(event.target.value)} /></label>
      <button className="apply-button" disabled={!code.trim() || !name.trim()}>Add to workspace</button>
    </form>
  </dialog>;
}
