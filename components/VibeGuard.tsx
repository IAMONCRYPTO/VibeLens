import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Download, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import type { CodeBlock } from "../lib/codeSlicer";
import { parseGuardSource, sanitizeSecrets, scanVibeGuard, summarizeGuard } from "../lib/vibeGuard";

interface Props {
  fileName: string;
  content: string;
  blocks: CodeBlock[];
  onJump: (id: string) => void;
  onApply: (before: string, after: string) => void;
}

export function VibeGuard({ fileName, content, blocks, onJump, onApply }: Props) {
  const [verified, setVerified] = useState<ReturnType<typeof scanVibeGuard>>();
  const [parsed, setParsed] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [nanoRequest, setNanoRequest] = useState<AbortController | null>(null);
  const report = useMemo(() => scanVibeGuard(content, fileName), [content, fileName]);
  const { findings, score } = verified ?? report;
  const edits = verified && parsed ? verified.edits : [];
  const template = edits.map(({ name }) => name + "=").join("\n");
  const critical = findings.some((finding) => finding.severity === "critical");

  useEffect(() => {
    let mounted = true;
    void parseGuardSource(content, fileName).then((tree) => {
      if (mounted && tree) {
        setVerified(scanVibeGuard(content, fileName, tree));
        setParsed(true);
      }
    });
    return () => { mounted = false; };
  }, [content, fileName]);

  useEffect(() => () => nanoRequest?.abort(), [nanoRequest]);


  async function runNano() {
    const controller = new AbortController();
    setNanoRequest(controller);
    setBusy(true);
    setMessage("");
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const result = await summarizeGuard(findings, controller.signal);
      if (result && !controller.signal.aborted) setSummary(result);
      else if (!controller.signal.aborted) setMessage("Gemini Nano is unavailable here. Your local results are ready.");
    } catch {
      if (!controller.signal.aborted) setMessage("On-device summary unavailable. Your local results are ready.");
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([template + "\n"], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = ".env.example";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function apply() {
    setBusy(true);
    const updated = sanitizeSecrets(content, edits);
    try {
      if (!await parseGuardSource(updated, fileName)) {
        setMessage("The proposed change could not be syntax-checked. No changes applied.");
        return;
      }
      onApply(content, updated);
    } finally {
      setBusy(false);
    }
  }

  return <section className="vibe-guard" aria-label="VibeGuard Security Shield">
    <div className={"guard-score" + (critical ? " guard-critical" : "")}>
      <ShieldCheck size={26} aria-hidden="true" />
      <div><h3>VibeGuard Score</h3><p>{critical ? "Critical leak detected" : findings.length ? "Review recommended" : "No findings in this scan"}</p></div>
      <strong>{score}<small>/100</small></strong>
    </div>
    <p className="guard-privacy"><LockKeyhole size={14} aria-hidden="true" /> This audit stays on your device. A clean scan does not guarantee secure code.</p>
    <div className="guard-review">
      <h4>On-device secret masking</h4>
      <p>When you request a Vibe Mutate preview, VibeGuard masks detected credentials in the copy sent to Gemini. Gemini Nano can help classify masks on-device. Your workspace continues to show the original code.</p>
    </div>
    {findings.length > 0 && <>
      <div className="guard-tools">
        <button type="button" className="secondary-button" onClick={() => void runNano()} disabled={busy}><Sparkles size={15} /> On-device summary</button>
        {edits.length > 0 && <button type="button" className="secondary-button" onClick={() => setReview(!review)} disabled={busy} aria-expanded={review}>Auto-Mask &amp; Move to .env</button>}
      </div>
      {summary && <p className="guard-advice" role="status">{summary}</p>}
      {message && <p className="guard-advice" role="status">{message}</p>}
      {review && edits.length > 0 && <div className="guard-review">
        <h4>Sanitization preview</h4>
        <ul>{edits.map(({ line, replacement }) => <li key={line}>Line {line} <code>{replacement}</code></li>)}</ul>
        <pre aria-label="Blank .env.example template">{template}</pre>
        <p>Add rotated values to your private environment before running the patched file. The example contains variable names only.</p>
        <div className="guard-tools">
          <button type="button" className="secondary-button" onClick={downloadTemplate}><Download size={15} /> Download .env.example</button>
          <button type="button" className="secondary-button" onClick={() => void apply()} disabled={busy}>Apply sanitized code</button>
        </div>
      </div>}
      {critical && edits.length === 0 && <p className="guard-advice">Move exposed credentials to a private server environment. Automatic rewrites are limited to supported server-side JavaScript and TypeScript declarations.</p>}
      <ul className="guard-findings" aria-label="Security findings">
        {findings.slice(0, 150).map((finding) => {
          const block = blocks.find(({ startLine, endLine }) => finding.line >= startLine && finding.line <= endLine);
          return <li key={finding.line + ":" + finding.title}>
            <div><span className={"guard-severity guard-" + finding.severity}>{finding.severity}</span><span>Line {finding.line}</span></div>
            <h4>{finding.title}</h4><p>{finding.detail}</p>
            {block && <button type="button" className="secondary-button" onClick={() => onJump(block.id)}>Open line {finding.line} in reader <ArrowUpRight size={13} /></button>}
          </li>;
        })}
      </ul>
      {findings.length > 150 && <p className="guard-advice">Showing the first 150 of {findings.length} findings.</p>}
    </>}
  </section>;
}
