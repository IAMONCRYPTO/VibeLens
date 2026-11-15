import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, CircleHelp, Cpu, FlaskConical, Lightbulb, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import type { CodeBlock } from "../lib/codeSlicer";
import type { Explanation, Mutation } from "../lib/hybridEngine";
import { spring } from "./CodeBlockCanvas";

interface Props {
  block: CodeBlock | null;
  explanation: Explanation | null;
  pending: boolean;
  draft: { prompt: string } | null;
  onMutate: (instruction: string, scope: Mutation["scope"]) => Promise<Mutation>;
  onApply: (patch: Mutation) => void;
}

function diff(before: string, after: string) {
  const oldLines = before.split(/\r\n|\r|\n/);
  const newLines = after.split(/\r\n|\r|\n/);
  const rows: { text: string; kind: "same" | "add" | "remove" }[] = [];
  if (oldLines.length * newLines.length > 500_000) {
    let start = 0;
    while (start < Math.min(oldLines.length, newLines.length) && oldLines[start] === newLines[start]) start++;
    let oldEnd = oldLines.length;
    let newEnd = newLines.length;
    while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    return [
      { text: "Changed section starting at line " + (start + 1), kind: "same" as const },
      ...oldLines.slice(start, oldEnd).map((text) => ({ text, kind: "remove" as const })),
      ...newLines.slice(start, newEnd).map((text) => ({ text, kind: "add" as const })),
    ];
  }
  const lengths = oldLines.map(() => new Uint16Array(newLines.length + 1));
  for (let a = oldLines.length - 1; a >= 0; a--) {
    for (let b = newLines.length - 1; b >= 0; b--) {
      const next = lengths[a + 1]?.[b + 1] ?? 0;
      lengths[a][b] = oldLines[a] === newLines[b] ? next + 1 : Math.max(lengths[a + 1]?.[b] ?? 0, lengths[a][b + 1]);
    }
  }
  let a = 0;
  let b = 0;
  while (a < oldLines.length || b < newLines.length) {
    if (a < oldLines.length && b < newLines.length && oldLines[a] === newLines[b]) {
      rows.push({ text: oldLines[a], kind: "same" });
      a++;
      b++;
    }
    else if (a < oldLines.length && (b === newLines.length || (lengths[a + 1]?.[b] ?? 0) >= lengths[a][b + 1])) rows.push({ text: oldLines[a++], kind: "remove" });
    else rows.push({ text: newLines[b++], kind: "add" });
  }
  return rows;
}

function MutationForm({ block, draft, onMutate, onApply }: { block: CodeBlock } & Pick<Props, "draft" | "onMutate" | "onApply">) {
  const [instruction, setInstruction] = useState(draft?.prompt ?? "");
  const [scope, setScope] = useState<Mutation["scope"]>("block");
  const [seenDraft, setSeenDraft] = useState(draft);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [patch, setPatch] = useState<Mutation | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const before = patch?.scope === "file" ? patch.originalFile : block.code;
  const changed = patch && patch.updatedCode !== before;
  const diffRows = useMemo(() => {
    if (!changed || !patch) return [];
    return diff(before, patch.updatedCode);
  }, [before, changed, patch]);
  useEffect(() => {
    if (draft) textarea.current?.focus();
  }, [draft]);

  if (draft !== seenDraft) {
    setSeenDraft(draft);
    if (draft) {
      setInstruction(draft.prompt);
      setScope("block");
      setPatch(null);
      setError("");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!instruction.trim() || working) return;
    setWorking(true);
    setError("");
    setPatch(null);
    try {
      setPatch(await onMutate(instruction.trim(), scope));
    } catch (error) {
      setError(error instanceof Error && error.name === "Error" ? error.message : "Unable to reach cloud editing. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return <div className="mutation">
    <div className="mutation-title"><span><WandSparkles size={16} /></span><h3>Vibe Mutate</h3><small>Cloud</small></div>
    <p className="mutation-note">VibeGuard masks detected credentials on this device before Preview sends the file and request to Gemini 3.5 Flash-Lite through Firebase.</p>
    <form onSubmit={submit}>
      <label className="mutation-scope">Edit scope
        <select value={scope} disabled={working} onChange={(event) => {
          setScope(event.target.value === "file" ? "file" : "block");
          setPatch(null);
        }}>
          <option value="block">Selected block</option>
          <option value="file">Whole file</option>
        </select>
      </label>
      <label htmlFor="mutation-instruction" className="sr-only">Describe your code change</label>
      <textarea ref={textarea} id="mutation-instruction" value={instruction} onChange={(event) => { setInstruction(event.target.value); setPatch(null); }}
        maxLength={1200} rows={2} placeholder="Describe a change in plain language…" disabled={working} />
      <button className="mutate-button" type="submit" disabled={!instruction.trim() || working}>
        {working ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{working ? "Generating patch…" : "Preview change"}<ArrowUpRight size={15} />
      </button>
    </form>
    {error && <p role="alert" className="inline-status">{error}</p>}
    {patch && <div className="patch-preview" aria-live="polite">
      <div className="section-label">
        <span>{changed ? "Patch preview" : "Gemini response"}</span>
        <span>Cloud</span>
      </div>
      <p>{patch.changeSummary}</p>
      {changed && <>
        <pre className="diff" aria-label="Code diff">{diffRows.map((row, index) =>
          <span key={index} className={"diff-" + row.kind}>{row.kind === "add" ? "+ " : row.kind === "remove" ? "− " : "  "}{row.text}{"\n"}</span>)}</pre>
        <button type="button" className="apply-button" onClick={() => onApply(patch)}><Check size={16} /> Apply patch to file</button>
      </>}
    </div>}
  </div>;
}

export function VibeInspector({ block, explanation, pending, draft, onMutate, onApply }: Props) {
  const route = explanation?.execution === "fallback" ? "Local code analysis" :
    explanation?.execution === "simulated" ? "Simulated Gemini Nano" :
    explanation?.inferenceSource === "ON_DEVICE" ? "Local Gemini Nano" : "Cloud analysis";
  const translationLabel = explanation?.translationEngine === "CHROME_LOCAL_TRANSLATOR" ? "Chrome on-device translation" :
    explanation?.translationEngine === "HYBRID_AI" ? "Hybrid AI translation" : "";
  const translation = translationLabel && explanation?.execution === "simulated" ? "Simulated " + translationLabel : translationLabel;
  return (
    <aside className="glass inspector">
      <div className="panel-heading"><span className="panel-icon inspector-icon"><Sparkles size={17} /></span><div><h2>Vibe inspector</h2><p>{block ? "Lines " + block.startLine + "–" + block.endLine : "No block selected"}</p></div><span className="ai-tag">AI</span></div>
      <div className="inspector-scroll">
        <AnimatePresence mode="popLayout" initial={false}>
          {block ? <motion.div key={block.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring}>
            {pending && <div className="inline-status" role="status"><LoaderCircle size={15} className="spin" /> Reading selected block…</div>}
            {explanation && <div className="explanation" aria-live="polite">
              <div className="execution"><span>{explanation.execution === "simulated" ? <FlaskConical size={14} /> : <Cpu size={14} />}</span>
                <div><strong>{route}</strong><small>{explanation.latencyMs} ms{translation && " · " + translation}</small></div></div>
              <article className="insight plain"><h3><CircleHelp size={17} /> Plain Vibe</h3><p>{explanation.plainMeaning}</p></article>
              <article className="insight safe"><h3><ShieldCheck size={17} /> Safe to Tweak</h3><ul>{explanation.safeToEdit.map((item, index) => <li key={index}>{item}</li>)}</ul></article>
              <article className="insight danger"><h3><LockKeyhole size={16} /> Fragile Core</h3><ul>{explanation.dangerZone.map((item, index) => <li key={index}>{item}</li>)}</ul></article>
              <p className="pro-tip"><Lightbulb size={15} />{explanation.proTip}</p>
            </div>}
            <MutationForm key={block.code} block={block} draft={draft} onMutate={onMutate} onApply={onApply} />
          </motion.div> : <motion.div key="empty" className="empty-state"><Sparkles size={26} /><p>Select a code block to inspect it.</p></motion.div>}
        </AnimatePresence>
      </div>
    </aside>
  );
}
