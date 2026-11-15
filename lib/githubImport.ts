import { presetFiles } from "./presetFiles";

const allowed = /\.(ts|tsx|js|jsx|py|html|css|json|md)$/i;
const ignored = /(?:^|\/)(?:node_modules|\.next|dist|build|coverage|vendor|__pycache__|\.git)(?:\/|$)|(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|composer\.lock|bun\.lock|pnpm-lock\.yaml|yarn\.lock)$|\.min\.(?:js|css)$|\.d\.ts$/i;
const maxBytes = 250_000;
const maxFiles = 25;
const rawOrigin = "https://raw.githubusercontent.com";
type TreeEntry = { type: string; mode: string; path: string; size?: number };
export type RepoEntry = { id: string; path: string; rawUrl: string } | { id: string; path: string; sample: string };
export type RepoListing = { label: string; entries: RepoEntry[]; direct?: boolean; truncated?: boolean };
export type SampleRepo = "react" | "auth";

export function sampleRepo(kind: SampleRepo): RepoListing {
  const react = kind === "react";
  const label = react ? "Sample React App" : "Sample Auth API";
  const paths = react
    ? { checkout: "src/components/", crypto: "src/hooks/" }
    : { auth: "src/middleware/", stripe: "src/api/" };
  return {
    label,
    entries: Object.entries(paths).map(([id, directory]) => {
      const file = presetFiles.find((item) => item.id === id)!;
      return { id: "repo-sample:" + id, path: directory + file.name, sample: file.content };
    }),
  };
}

const encodePath = (segments: string[]) => segments.map(encodeURIComponent).join("/");
const isSource = (path: string) => allowed.test(path) && !ignored.test(path);

export function parseGitHubUrl(input: string) {
  const typed = input.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : "https://" + typed);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      (url.hostname !== "github.com" && url.hostname !== "www.github.com")) {
    throw new Error("Paste a public GitHub repository or file URL.");
  }
  const parts = url.pathname.replace(/^\/|\/$/g, "").split("/").map(decodeURIComponent);
  const [owner, repoName, action, ...location] = parts;
  const repo = repoName?.replace(/\.git$/, "");
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) ||
      [owner, repo].some((part) => part === "." || part === "..")) {
    throw new Error("Include the GitHub owner and repository name.");
  }
  if (action === undefined) return { owner, repo };
  if (action !== "blob" || location.length < 2 || location.some((part) =>
    !part || part.includes("\\") || part.split("/").some((segment) => !segment || segment === "." || segment === ".."))) {
    throw new Error("Use a repository URL or a GitHub file link with /blob/ in it.");
  }
  const path = location.slice(1).join("/");
  if (!isSource(path)) throw new Error("Choose a supported source or text file.");
  // Raw GitHub resolves refs containing slashes against the full path.
  const rawUrl = rawOrigin + "/" + encodePath([owner, repo, ...location.flatMap((part) => part.split("/"))]);
  return { owner, repo, entry: { id: rawUrl, path, rawUrl } };
}

export class GitHubUnavailable extends Error {}

async function request(url: string, signal: AbortSignal, githubApi = false) {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      credentials: "omit",
      headers: githubApi ? { Accept: "application/vnd.github+json" } : undefined,
    });
  } catch {
    throw new GitHubUnavailable("GitHub could not be reached.");
  }
  if (githubApi && (response.status === 403 || response.status === 429)) {
    throw new GitHubUnavailable("GitHub is rate-limiting or blocking this request.");
  }
  if (response.status === 429 || response.status >= 500) throw new GitHubUnavailable("GitHub is temporarily unavailable.");
  if (response.status === 404) throw new Error("GitHub could not find this public repository or file.");
  if (!response.ok) throw new Error("GitHub declined this request.");
  return response;
}

function relevance(path: string) {
  if (/^(?:src|app|pages|routes|api|components|lib|server|client)\//i.test(path)) return /\.(?:json|md)$/i.test(path) ? 2 : 0;
  if (/\.(?:json|md)$/i.test(path)) return 3;
  return 1;
}

export async function loadRepo(input: string, signal: AbortSignal): Promise<RepoListing> {
  let parsed: ReturnType<typeof parseGitHubUrl>;
  try {
    parsed = parseGitHubUrl(input);
  } catch (error) {
    if (error instanceof TypeError || error instanceof URIError) throw new Error("Paste a valid GitHub repository or file URL.");
    throw error;
  }
  const label = parsed.owner + "/" + parsed.repo;
  if (parsed.entry) return { label, entries: [parsed.entry], direct: true };
  const root = "https://api.github.com/repos/" + encodePath([parsed.owner, parsed.repo]);
  const metadata = await (await request(root, signal, true)).json() as { default_branch?: string; private?: boolean };
  if (!metadata.default_branch || metadata.private) throw new Error("Choose a public GitHub repository with a default branch.");
  const branch = metadata.default_branch;
  const result = await (await request(root + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1", signal, true)).json() as {
    tree?: TreeEntry[]; truncated?: boolean;
  };
  if (!Array.isArray(result.tree)) throw new Error("GitHub did not return a repository file list.");
  const entries = result.tree
    .filter(({ type, mode, path, size }) => type === "blob" && /^100/.test(mode) && Number(size) <= maxBytes && isSource(path))
    .sort((a, b) => relevance(a.path) - relevance(b.path) || a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path))
    .slice(0, maxFiles)
    .map(({ path }) => {
      const rawUrl = rawOrigin + "/" + encodePath([parsed.owner, parsed.repo, ...branch.split("/"), ...path.split("/")]);
      return { id: rawUrl, path, rawUrl };
    });
  if (!entries.length) throw new Error("No supported source files were found in the available repository tree.");
  return { label, entries, truncated: result.truncated };
}

export async function loadRepoFile(entry: RepoEntry, signal: AbortSignal) {
  if ("sample" in entry) return entry.sample;
  const response = await request(entry.rawUrl, signal);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GitHub returned an empty file.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) throw new Error("This file exceeds the 250 KB limit.");
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    const content = chunks.join("");
    if (!content.trim() || content.includes("\0")) throw new Error("This file is empty or binary.");
    return content;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof TypeError) throw new Error("This file could not be read as UTF-8 source text.");
    throw error;
  }
}
