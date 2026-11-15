"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, CircleCheck, GitPullRequest, ScanLine, X } from "lucide-react";
import { CodeBlockCanvas, type CanvasView } from "../components/CodeBlockCanvas";
import { DynamicIsland, type Metrics } from "../components/DynamicIsland";
import { FileSidebar } from "../components/FileSidebar";
import { VibeInspector } from "../components/VibeInspector";
import { PasteDialog } from "../components/WorkspaceDialogs";
import { applyBlockPatch, sliceCodeIntoBlocks } from "../lib/codeSlicer";
import { explainBlockHybrid, generateFileArchitectureMap, mutateBlockInCloud, warmTranslator, type Explanation, type Mutation, type SimulationMode } from "../lib/hybridEngine";
import type { Architecture } from "../lib/localAnalysis";
import { validateMutation } from "../lib/patchValidation";
import { presetFiles, type ProjectFile } from "../lib/presetFiles";
import { isEnvFile } from "../lib/vibeGuard";

const maxFileSize = 250_000;
const supported = /\.(js|ts|tsx|jsx|py|sol)$/i;
type Request<T> = { key: string; promise: Promise<T> };
type Result<T> = { key: string; value: T };

const workspaceGuide = [
  { icon: Braces, title: "Read in blocks", description: "Follow the logic with line numbers and plain-language explanations." },
  { icon: ScanLine, title: "Trace and audit", description: "Map connections and scan the file for potential issues." },
  { icon: GitPullRequest, title: "Review before editing", description: "Compare changes before applying them to your workspace copy." },
];

export default function Home() {
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [sampleFiles, setSampleFiles] = useState(presetFiles);
  const [showSamples, setShowSamples] = useState(false);
  const [fileId, setFileId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState<SimulationMode>("auto");
  const [metrics, setMetrics] = useState<Metrics>({ local: 0, cloud: 0 });
  const [view, setView] = useState<CanvasView>("reader");
  const [mastery, setMastery] = useState<Record<string, ReadonlySet<string>>>({});
  const [mutationDraft, setMutationDraft] = useState<{ file: string; block: string; prompt: string } | null>(null);
  const [readerJump, setReaderJump] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [explanationResult, setExplanationResult] = useState<Result<Explanation> | null>(null);
  const [mapResult, setMapResult] = useState<Result<Architecture> | null>(null);
  const [auditKey, setAuditKey] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const explanationRequest = useRef<Request<Explanation> | null>(null);
  const mapRequest = useRef<Request<Architecture> | null>(null);

  const files = showSamples ? sampleFiles : projectFiles;
  const current = files.find((file) => file.id === fileId) ?? files[0];
  const content = current?.content;
  const privateEnvFile = Boolean(current && isEnvFile(current.name));
  const explanationMode = !showSamples ? "local" : mode;
  const blocks = useMemo(() => content === undefined ? [] : sliceCodeIntoBlocks(content), [content]);
  const active = blocks.find((block) => block.id === blockId) ?? blocks[0] ?? null;
  const mapKey = JSON.stringify([current?.id, revision, language, mode]);
  const explanationKey = JSON.stringify([mapKey, active?.id, selectionRevision, explanationMode]);
  const explanation = explanationResult?.key === explanationKey ? explanationResult.value : null;
  const architecture = mapResult?.key === mapKey ? mapResult.value : null;
  const fileMasteryKey = current?.id ?? "";

  useEffect(() => {
    if (view !== "reader" || !readerJump) return;
    document.getElementById("reader-" + readerJump)?.focus();
  }, [readerJump, view]);

  useEffect(() => {
    if (!active || view === "guard" || privateEnvFile) return;
    if (explanationRequest.current?.key !== explanationKey) {
      const promise = explainBlockHybrid(active, language, explanationMode);
      explanationRequest.current = { key: explanationKey, promise };
      void promise.then((result) => setMetrics((prev) => ({
        local: prev.local + Number(result.inferenceSource === "ON_DEVICE"),
        cloud: prev.cloud + result.cloudCalls,
      })));
    }
    let current = true;
    void explanationRequest.current.promise.then((value) => {
      if (current) setExplanationResult({ key: explanationKey, value });
    });
    return () => { current = false; };
  }, [active, explanationKey, explanationMode, language, privateEnvFile, view]);

  useEffect(() => {
    if (view !== "map" || !current || privateEnvFile || !blocks.length) return;
    if (mapRequest.current?.key !== mapKey) {
      const promise = generateFileArchitectureMap(current.name, blocks, language, mode === "simulate");
      mapRequest.current = { key: mapKey, promise };
      void promise.then(({ cloudCalls }) => {
        if (cloudCalls) setMetrics((prev) => ({ ...prev, cloud: prev.cloud + cloudCalls }));
      });
    }
    let visible = true;
    void mapRequest.current.promise.then((value) => {
      if (visible) setMapResult({ key: mapKey, value });
    });
    return () => { visible = false; };
  }, [blocks, current, language, mapKey, mode, privateEnvFile, view]);

  function selectFile(id: string) {
    if (id === current?.id) return;
    setFileId(id);
    setBlockId("lines-1");
    setView(view === "guard" || isEnvFile(files.find((file) => file.id === id)?.name ?? "") ? "guard" : "reader");
    setSelectionRevision((value) => value + 1);
  }

  function selectBlock(id: string) {
    if (id === active?.id) return;
    setBlockId(id);
    setMutationDraft(null);
    setSelectionRevision((value) => value + 1);
  }

  function addFiles(newFiles: ProjectFile[]) {
    if (!newFiles.length) return;
    setProjectFiles((prev) => [...prev, ...newFiles]);
    setShowSamples(false);
    selectFile(newFiles[0].id);
    if (isEnvFile(newFiles[0].name)) setView("guard");
  }

  function openRepositoryFile(file: ProjectFile) {
    setProjectFiles((previous) => previous.some(({ id }) => id === file.id) ? previous : [...previous, file]);
    setShowSamples(false);
    selectFile(file.id);
  }

  function toggleSamples() {
    setShowSamples(!showSamples);
    setFileId(null);
    setBlockId(null);
    setView("reader");
    setSelectionRevision((value) => value + 1);
  }

  async function upload(incoming: File[]) {
    const candidates = incoming.filter((file) => (supported.test(file.name) || isEnvFile(file.name)) && file.size <= maxFileSize);
    const results = await Promise.allSettled(candidates.map(async (file) => {
      const content = await file.text();
      if (!content.trim() || content.includes("\0")) throw new Error("Invalid source file");
      return { id: crypto.randomUUID(), name: file.name, description: file.webkitRelativePath || "Uploaded source", content };
    }));
    const accepted = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    addFiles(accepted);
    const skipped = incoming.length - accepted.length;
    if (incoming.length) setNotice(
      (accepted.length ? "Added " + accepted.length + (accepted.length === 1 ? " file." : " files.") : "No files added.") +
      (skipped ? " Skipped " + skipped + " unsupported, empty, unreadable, or oversized file(s). Each file can be up to 250 KB." : ""),
    );
  }

  function exportFile() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = current.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function mutate(instruction: string, scope: Mutation["scope"]) {
    if (!current || !active || privateEnvFile || view === "guard") throw new Error("Select a code block outside the private audit first.");
    const patch = await mutateBlockInCloud(current, active, instruction, language, scope);
    if (patch.cloudCalls) setMetrics((prev) => ({ ...prev, cloud: prev.cloud + patch.cloudCalls }));
    return validateMutation(current.content, current.name, active, patch);
  }

  function apply(patch: Mutation) {
    if (!current || !active) return;
    const content = current.content !== patch.originalFile ? null
      : patch.scope === "file" ? patch.updatedCode : applyBlockPatch(current.content, active, patch.updatedCode);
    if (content === null) {
      setNotice("This file changed before the patch could be applied. Generate a fresh preview.");
      return;
    }
    updateFile(current.content, content);
  }

  function updateFile(before: string, content: string) {
    if (!current || current.content !== before) {
      setNotice("This file changed. Generate a fresh preview.");
      return;
    }
    const setFiles = showSamples ? setSampleFiles : setProjectFiles;
    setFiles((prev) => prev.map((file) => file.id === current.id ? { ...file, content } : file));
    setMastery((previous) => {
      const next = { ...previous };
      delete next[current.id];
      return next;
    });
    setMutationDraft(null);
    setRevision((value) => value + 1);
    setNotice("Patch applied to " + current.name + ". Download the file to keep your changes.");
  }

  return (
    <main className="studio">
      <div className="studio-inner">
        <DynamicIsland mode={mode} onMode={setMode} language={language} onLanguage={(value) => { if (mode !== "simulate") void warmTranslator(value); setLanguage(value); }}
          metrics={metrics} telemetry={explanation} pending={Boolean(active && !explanation)} workspaceOpen={Boolean(current)} />
        {current && <div className="workspace-title workspace-active-title">
          <h1>Visual Code <span>Studio</span></h1>
        </div>}
        <div className={current ? "workspace-grid" : "workspace-grid workspace-start"}>
          {!current && <section className="start-intro" aria-labelledby="start-heading">
            <h1 id="start-heading">See how your <span>code works.</span></h1>
            <ul className="workspace-guide">
              {workspaceGuide.map(({ icon: Icon, title, description }) => <li key={title}>
                <span className="guide-icon"><Icon size={19} aria-hidden="true" /></span>
                <div><h2>{title}</h2><p>{description}</p></div>
              </li>)}
            </ul>
          </section>}
          <FileSidebar files={files} current={current} lines={blocks.at(-1)?.endLine ?? 0} blocks={blocks.length}
            onOpenRepositoryFile={openRepositoryFile} onNotice={setNotice}
            showingSamples={showSamples} onToggleSamples={toggleSamples}
            onSelect={selectFile} onUpload={(incoming) => { void upload(incoming); }} onPaste={() => setPasteOpen(true)} onExport={exportFile} />
          {current && <><CodeBlockCanvas fileName={current.name} blocks={blocks} selected={active?.id ?? null} onSelect={selectBlock}
            view={privateEnvFile ? "guard" : view} onView={(next) => { setReaderJump(null); setView(next); }} architecture={architecture} loading={Boolean(view === "map" && !architecture && blocks.length)}
            guard={{ content: current.content, privateEnvFile, onApply: updateFile, onJump: (id) => { selectBlock(id); setReaderJump(id); setView("reader"); } }}
            deckKey={JSON.stringify([current.id, revision, language])}
            deck={{
              language, mastered: mastery[fileMasteryKey] ?? new Set(),
              onMaster: (id) => setMastery((previous) => {
                const next = new Set(previous[fileMasteryKey]);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return { ...previous, [fileMasteryKey]: next };
              }),
              onJump: (id) => { selectBlock(id); setReaderJump(id); setView("reader"); },
              onMutate: (id, prompt) => { selectBlock(id); setMutationDraft({ file: current.id, block: id, prompt }); },
            }}
            onAudit={() => setAuditKey(mapKey)} auditVisible={auditKey === mapKey} />
          {!privateEnvFile && view !== "guard" && <VibeInspector key={current.id + ":" + mode + ":" + language + ":" + revision} block={active} explanation={explanation}
            pending={Boolean(active && !explanation)} draft={mutationDraft?.file === current.id && mutationDraft.block === active?.id ? mutationDraft : null}
            onMutate={mutate} onApply={apply} />}</>}
        </div>
      </div>
      {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onPaste={(name, content) => {
        addFiles([{ id: crypto.randomUUID(), name, description: "Pasted snippet", content }]);
        setPasteOpen(false);
      }} />}
      {notice && <div className="toast glass" role="status"><CircleCheck size={19} /><span>{notice}</span><button className="icon-button" onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={17} /></button></div>}
    </main>
  );
}
