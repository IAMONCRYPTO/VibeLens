import { useEffect, useRef, useState } from "react";
import { ChevronRight, GitFork, LoaderCircle, Zap } from "lucide-react";
import { GitHubUnavailable, loadRepo, loadRepoFile, sampleRepo, type RepoEntry, type RepoListing, type SampleRepo } from "../lib/githubImport";
import type { ProjectFile } from "../lib/presetFiles";

interface Props {
  currentId?: string;
  onOpen: (file: ProjectFile) => void;
  onNotice: (message: string) => void;
}

export function GitHubImporter({ currentId, onOpen, onNotice }: Props) {
  const [url, setUrl] = useState("");
  const [listing, setListing] = useState<RepoListing>();
  const [loading, setLoading] = useState<string>();
  const active = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, string>());
  useEffect(() => () => active.current?.abort(), []);

  function begin(key: string) {
    active.current?.abort();
    const operation = new AbortController();
    active.current = operation;
    setLoading(key);
    return operation;
  }

  async function openEntry(entry: RepoEntry, operation: AbortController) {
    let content = cache.current.get(entry.id);
    if (content === undefined) {
      content = await loadRepoFile(entry, operation.signal);
      if (operation.signal.aborted) return;
      if (cache.current.size >= 50) {
        const oldest = cache.current.keys().next().value;
        if (oldest) cache.current.delete(oldest);
      }
      cache.current.set(entry.id, content);
    }
    if (!operation.signal.aborted) onOpen({
      id: entry.id,
      name: entry.path.split("/").at(-1) ?? entry.path,
      description: entry.path,
      content,
    });
  }

  async function openSample(kind: SampleRepo) {
    const operation = begin("listing");
    const sample = sampleRepo(kind);
    setListing(sample);
    try {
      await openEntry(sample.entries[0], operation);
    } finally {
      if (!operation.signal.aborted) setLoading(undefined);
    }
  }

  function report(error: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    const message = error instanceof Error ? error.message : "Could not import from GitHub.";
    if (error instanceof GitHubUnavailable) {
      onNotice(message + " Opened Sample React App instead.");
      void openSample("react");
    } else onNotice(message);
  }

  async function fetchListing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;
    const operation = begin("listing");
    try {
      const next = await loadRepo(url, operation.signal);
      if (operation.signal.aborted) return;
      if (next.direct) await openEntry(next.entries[0], operation);
      if (operation.signal.aborted) return;
      setListing(next);
      if (next.truncated) onNotice("GitHub returned a partial tree. Showing supported files from the available results.");
    } catch (error) {
      report(error, operation.signal);
    } finally {
      if (!operation.signal.aborted) setLoading(undefined);
    }
  }

  async function selectEntry(entry: RepoEntry) {
    if (entry.id === currentId && !loading) return;
    const operation = begin(entry.id);
    try {
      await openEntry(entry, operation);
    } catch (error) {
      report(error, operation.signal);
    } finally {
      if (!operation.signal.aborted) setLoading(undefined);
    }
  }

  return <section className="github-import" aria-label="GitHub importer">
    <form onSubmit={(event) => void fetchListing(event)}>
      <label htmlFor="github-import-url"><GitFork size={17} aria-hidden="true" /> Import from GitHub</label>
      <div className="github-import-input">
        <input id="github-import-url" type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048}
          value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste GitHub repo or file URL..." />
        <button className="secondary-button github-fetch" type="submit" disabled={!url.trim() || loading === "listing"}>Fetch</button>
      </div>
    </form>
    <div className="github-samples">
      <button type="button" className="secondary-button" onClick={() => void openSample("react")}><Zap size={13} aria-hidden="true" /> Sample React App</button>
      <button type="button" className="secondary-button" onClick={() => void openSample("auth")}><Zap size={13} aria-hidden="true" /> Sample Auth API</button>
    </div>
    {loading && <p className="inline-status" role="status"><LoaderCircle size={15} className="spin" />{loading === "listing" ? "Opening repository…" : "Loading file…"}</p>}
    {listing && <nav className="github-repo" aria-label="Repository files">
      <div className="section-label"><span>{listing.label}</span><span className="count">{listing.entries.length}</span></div>
      <div className="file-list">
        {listing.entries.map((entry) => <button type="button" key={entry.id} className={"file-row" + (currentId === entry.id ? " active-file" : "")}
          aria-current={currentId === entry.id ? "true" : undefined} disabled={loading === entry.id} onClick={() => void selectEntry(entry)}>
          <span className="file-icon github-file-icon" aria-hidden="true"><GitFork size={15} /></span>
          <span className="file-label"><strong>{entry.path}</strong></span>
          <ChevronRight className="file-chevron" size={14} aria-hidden="true" />
        </button>)}
      </div>
    </nav>}
  </section>;
}
