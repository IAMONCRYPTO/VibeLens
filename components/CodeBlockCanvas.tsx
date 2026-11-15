import { ArrowDownRight, ArrowRight, Blocks, Braces, CodeXml, FileCode2, GitFork, Layers3, LoaderCircle, Network, Package, ShieldAlert, ShieldCheck, Workflow } from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import type { CodeBlock } from "../lib/codeSlicer";
import type { Architecture } from "../lib/localAnalysis";

import { SyntaxLine } from "./SyntaxLine";
import { VibeCards } from "./VibeCards";
import { VibeGuard } from "./VibeGuard";

export const spring = { type: "spring", stiffness: 260, damping: 24 } as const;
export type CanvasView = "reader" | "map" | "cards" | "guard";
const categories = {
  imports: { label: "Imports", icon: Package },
  hook: { label: "Hook", icon: GitFork },
  function: { label: "Function", icon: Braces },
  ui: { label: "UI render", icon: Layers3 },
  logic: { label: "Logic", icon: Workflow },
};

interface Props {
  fileName: string;
  blocks: CodeBlock[];
  selected: string | null;
  onSelect: (id: string) => void;
  view: CanvasView;
  onView: (view: CanvasView) => void;
  deck: Pick<React.ComponentProps<typeof VibeCards>, "language" | "mastered" | "onMaster" | "onJump" | "onMutate">;
  deckKey: string;
  guard: Pick<React.ComponentProps<typeof VibeGuard>, "content" | "onApply" | "onJump"> & { privateEnvFile: boolean };
  architecture: Architecture | null;
  loading: boolean;
  onAudit: () => void;
  auditVisible: boolean;
}

export function CodeBlockCanvas({ fileName, blocks, selected, onSelect, view, onView, architecture, loading, onAudit, auditVisible, deck, deckKey, guard }: Props) {
  const lookup = new Map(blocks.map((block) => [block.id, block]));
  const related = architecture?.connections.filter((edge) => edge.from === selected || edge.to === selected) ?? [];
  return (
    <section className="glass canvas-panel" aria-label="Code canvas">
      <div className="panel-heading canvas-heading">
        <span className="panel-icon"><CodeXml size={18} /></span><div><h2>Code canvas</h2><p className="canvas-filename">{fileName}</p></div>
        <span className="sliced-badge"><span />{blocks.length} blocks</span>
      </div>
      <div className="canvas-toolbar" aria-label="Canvas view">
        {!guard.privateEnvFile && <>
        <button type="button" aria-pressed={view === "reader"} onClick={() => onView("reader")}><Blocks size={15} /> Block reader</button>
        <button type="button" aria-pressed={view === "map"} onClick={() => onView("map")}><Network size={16} /> Architecture map</button>
        <button type="button" aria-pressed={view === "cards"} onClick={() => onView("cards")}><span aria-hidden="true">🎴</span> Vibe Cards <small className="deck-count">{blocks.length ? blocks.length + 1 : 0} cards</small></button>
        </>}
        <button type="button" aria-pressed={view === "guard"} onClick={() => onView("guard")}><ShieldCheck size={16} /> VibeGuard</button>
      </div>
      <div className="canvas-scroll">
        {view === "guard" && <VibeGuard key={deckKey} fileName={fileName} blocks={guard.privateEnvFile ? [] : blocks} content={guard.content} onJump={guard.onJump} onApply={guard.onApply} />}
        {view === "cards" && <VibeCards key={deckKey} fileName={fileName} blocks={blocks} {...deck} />}
        {!blocks.length && <div className="empty-state"><FileCode2 size={27} /><p>This file has no code blocks.</p></div>}
        {view === "reader" && blocks.map((block) => {
          const active = selected === block.id;
          const CategoryIcon = categories[block.category].icon;
          const lines = block.code.split("\n");
          const visible = active ? lines : lines.slice(0, 4);
          return <button key={block.id} id={"reader-" + block.id} type="button"
            aria-pressed={active} aria-label={block.title + ", lines " + block.startLine + " to " + block.endLine}
            className={twMerge(clsx("code-card", active ? "selected-card" : selected && "dimmed-card"))} onClick={() => onSelect(block.id)}>
            <span className="code-card-head">
              <span className="block-icon"><CategoryIcon size={16} /></span>
              <span className="block-name"><strong>{block.title}</strong><small>Lines {block.startLine}–{block.endLine}</small></span>
              <span className="category-badge">{categories[block.category].label}</span>
              <span className={"risk-badge risk-" + block.riskLevel}><i />{block.riskLevel}</span>
            </span>
            <span className="code-body">
              {visible.map((line, index) => <span className="code-line" key={index}><span className="line-number">{block.startLine + index}</span><code><SyntaxLine text={line} /></code></span>)}
              {!active && lines.length > visible.length && <span className="code-more">+ {lines.length - visible.length} more lines</span>}
            </span>
          </button>;
        })}
        {view === "map" && blocks.length > 0 && <div className="architecture">
          <div className="architecture-intro">
            <div><h3><Network size={18} /> Architecture X-Ray</h3><p>{architecture?.summary ?? "Tracing relationships across the current file."}</p></div>
            {architecture && <span className="category-badge">{architecture.source === "cloud" ? "Firebase Cloud" : "Local analysis"}</span>}
          </div>
          {loading && <div className="inline-status" role="status"><LoaderCircle size={16} className="spin" /> Analyzing file…</div>}
          <div className="node-grid">
            {blocks.map((block) => <button type="button" aria-pressed={selected === block.id} key={block.id} onClick={() => onSelect(block.id)}>
              <GitFork size={15} /><span>{block.title}<small>Lines {block.startLine}–{block.endLine}</small></span><ArrowDownRight size={13} />
            </button>)}
          </div>
          {architecture && <div className="connections">
            <div className="section-label">Connections for selected block</div>
            {related.length ? related.map((edge, index) => <button type="button" className="edge" key={index}
              onClick={() => onSelect(edge.from === selected ? edge.to : edge.from)}>
              <span>{lookup.get(edge.from)?.title}</span><ArrowRight size={13} /><span>{lookup.get(edge.to)?.title}</span><code>{edge.label}</code>
            </button>) : <p>No direct links detected for this block.</p>}
          </div>}
          <button type="button" className="secondary-button audit-button" onClick={onAudit} disabled={loading}><ShieldAlert size={16} /> Scan file for leaked secrets / bugs</button>
          {auditVisible && architecture && <div className="audit-results" aria-live="polite">
            <h3><ShieldCheck size={17} /> Audit results</h3>
            {architecture.findings.length ? architecture.findings.map((finding, index) => <button type="button" className="finding" key={index}
              onClick={() => { const block = blocks.find((item) => finding.line >= item.startLine && finding.line <= item.endLine); if (block) onSelect(block.id); }}>
              <span className={"risk-badge risk-" + finding.severity}><i />{finding.severity}</span> Line {finding.line} · {finding.message}
            </button>) : <p>No potential issues matched the checks used in this scan.</p>}
          </div>}
        </div>}
      </div>
    </section>
  );
}
