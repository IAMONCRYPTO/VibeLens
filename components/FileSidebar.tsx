import { useRef, useState } from "react";
import { Activity, ArrowUpRight, ChevronRight, CodeXml, CreditCard, Download, FileCode2, Folder, FolderOpen, LayoutTemplate, Shield, UploadCloud } from "lucide-react";
import type { ProjectFile } from "../lib/presetFiles";
import { GitHubImporter } from "./GitHubImporter";

interface Props {
  files: ProjectFile[];
  current: ProjectFile | undefined;
  showingSamples: boolean;
  onToggleSamples: () => void;
  lines: number;
  blocks: number;
  onSelect: (id: string) => void;
  onUpload: (files: File[]) => void;
  onPaste: () => void;
  onExport: () => void;
  onOpenRepositoryFile: (file: ProjectFile) => void;
  onNotice: (message: string) => void;
}
const icons = [CreditCard, Activity, Shield, LayoutTemplate];

export function FileSidebar({ files, current, lines, blocks, showingSamples, onToggleSamples, onSelect, onUpload, onPaste, onExport, onOpenRepositoryFile, onNotice }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function selectFiles(input: HTMLInputElement) {
    onUpload(Array.from(input.files ?? []));
    input.value = "";
  }
  return (
    <aside className="glass sidebar">
      <div className="panel-heading"><span className="panel-icon"><FolderOpen size={19} /></span><div><h2>{current ? "Workspace" : "Open your code"}</h2></div></div>
      <div className="sidebar-body">
        {files.length > 0 && <>
        <div className="section-label"><span>{showingSamples ? "Demo files" : "Project files"}</span><span className="count">{files.length}</span></div>
        <nav className="file-list" aria-label={showingSamples ? "Demo files" : "Project files"}>
          {files.map((file, index) => {
            const Icon = (showingSamples && icons[index]) || FileCode2;
            return <button type="button" key={file.id} className={"file-row" + (current?.id === file.id ? " active-file" : "")}
              aria-current={current?.id === file.id ? "true" : undefined} onClick={() => onSelect(file.id)}>
              <span className={"file-icon file-color-" + Math.min(index, 4)}><Icon size={17} /></span>
              <span className="file-label"><strong>{file.name}</strong><small>{file.description}</small></span>
              <ChevronRight className="file-chevron" size={14} />
            </button>;
          })}
        </nav>
        <div className="sidebar-rule" /></>}
        <GitHubImporter currentId={current?.id} onOpen={onOpenRepositoryFile} onNotice={onNotice} />
        <input type="file" ref={fileInput} hidden multiple onChange={(event) => selectFiles(event.currentTarget)} />
        <input type="file" ref={folderInput} hidden multiple
          {...{ webkitdirectory: "", directory: "" }} onChange={(event) => selectFiles(event.currentTarget)} />
        <button type="button" className={"dropzone" + (dragging ? " dragging" : "")}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); onUpload(Array.from(event.dataTransfer.files)); }}
          onClick={() => fileInput.current?.click()}>
          <span className="upload-icon"><UploadCloud size={20} /></span><strong className="upload-cta">Upload code files</strong><small>Choose files or drop them here</small>
        </button>
        {!current && <p className="supported-formats">JS, TS, JSX, TSX, Python, Solidity, .env · Up to 250 KB per file</p>}
        <div className="sidebar-actions">
          <button type="button" className="secondary-button" onClick={() => folderInput.current?.click()}><Folder size={15} /> Open folder</button>
          <button type="button" className="secondary-button paste-code-button" onClick={onPaste}><CodeXml size={16} /> Paste code</button>
        </div>
        {!current ? <div className="start-demo">
          <div><strong>Explore a sample project</strong><p>Try two practice files with intentional bugs and two reference files.</p></div>
          <button type="button" className="demo-button" onClick={onToggleSamples}>Try demo files <ArrowUpRight size={16} aria-hidden="true" /></button>
        </div> : <button type="button" className="demo-button" onClick={onToggleSamples}>{showingSamples ? "Exit demo" : "Try demo files"}</button>}
      </div>
      {current && <div className="sidebar-footer">
        <div className="section-label"><span>Current file</span><button type="button" className="icon-button" onClick={onExport} aria-label="Download current file" title="Download current file"><Download size={15} /></button></div>
        <div className="file-stats"><div><strong>{lines}</strong><small>Lines of code</small></div><div><strong>{blocks}</strong><small>Blocks sliced</small></div></div>
      </div>}
    </aside>
  );
}
