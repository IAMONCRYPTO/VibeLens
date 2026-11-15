import type { Node } from "@babel/types";

type Severity = "critical" | "high" | "medium";
export type GuardFinding = { line: number; severity: Severity; title: string; detail: string };
export type GuardEdit = { line: number; start: number; end: number; name: string; replacement: string };
const secretName = /(?:secret|api[_-]?key|access[_-]?token|auth[_-]?token|bearer|password|private[_-]?key|database[_-]?url|^token$)/i;
const credential = /(?:\b(?:sk|rk)_(?:live|test)_[\w]{12,}|\bAIza[\w-]{30,}|\b(?:ghp_|github_pat_|xox[baprs]-)[\w-]{15,}|\bBearer\s+[\w./+=-]{12,}|\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}|-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----)/i;
const publicName = /\b(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_)[\w]+/g;
const jsFile = /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i;
export const isEnvFile = (name: string) => /^\.env(?:\.|$)/i.test(name);
const safePlaceholder = /^(?:your[_ -]|replace[_ -]|placeholder|dummy|example|redacted|<|\*{3})/i;

const leakTypes = ["Gemini API", "Google API key", "Stripe key", "GitHub token", "Slack token", "Bearer token", "JWT", "Private key", "Credential"] as const;
type LeakType = typeof leakTypes[number];

function leakType(value: string, name = ""): LeakType {
  if (/^AIza/.test(value)) return /gemini|genai/i.test(name) ? "Gemini API" : "Google API key";
  if (/^(sk|rk)_/i.test(value)) return "Stripe key";
  if (/^(ghp_|github_pat_)/i.test(value)) return "GitHub token";
  if (/^xox/i.test(value)) return "Slack token";
  if (/^Bearer\s/i.test(value)) return "Bearer token";
  if (/^eyJ/.test(value)) return "JWT";
  if (/^-----BEGIN/.test(value)) return "Private key";
  return /gemini|genai/i.test(name) ? "Gemini API" : "Credential";
}

export function findGuardLeaks(source: string, name = "") {
  const leaks = new Map<string, { label: LeakType; offset: number }>();
  const add = (value: string, offset: number, label: LeakType) => {
    if (value && !leaks.has(value)) leaks.set(value, { label, offset });
  };
  for (const match of source.matchAll(/-----BEGIN ((?:[A-Z]+ )*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g)) {
    add(match[0], match.index, "Private key");
    for (const chunk of match[0].split(/\r\n|\r|\n|\\n/).slice(1, -1)) {
      if (chunk.length > 16) add(chunk, match.index, "Private key");
    }
  }
  const assignment = /(?:^|[^\w$])["']?([\w$-]+)["']?\s*[:=]\s*(["'`])((?:\\.|(?!\2)[^\\\r\n])+)\2/g;
  for (const match of source.matchAll(assignment)) {
    const value = match[3];
    if (secretName.test(match[1]) && value.length >= 8 && !safePlaceholder.test(value) && !value.includes("${")) {
      add(value, match.index + match[0].indexOf(match[2] + value + match[2]) + 1, leakType(value, match[1]));
    }
  }
  for (const match of source.matchAll(new RegExp(credential.source, "gi"))) {
    add(match[0], match.index, leakType(match[0], source.slice(Math.max(0, match.index - 45), match.index).split(/[\r\n]/).at(-1)));
    if (/^Bearer\s/i.test(match[0])) add(match[0].replace(/^Bearer\s+/i, ""), match.index, "Bearer token");
  }
  if (isEnvFile(name)) {
    for (const match of source.matchAll(/^[ \t]*(?:export[ \t]+)?([\w.]+)[ \t]*=[ \t]*([^\r\n#]+)/gm)) {
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (value && !safePlaceholder.test(value)) add(value, match.index, leakType(value, match[1]));
    }
  }
  return [...leaks].map(([value, { label, offset }]) => ({ value, label, offset }));
}

type MaskMode = "display" | "transport";
export function createSecretMask(source: string, name: string, instruction = "", labels: Record<string, LeakType> = {}) {
  const fileLeaks = findGuardLeaks(source, name).map((leak) => {
    if (leak.label !== "Credential") return leak;
    const line = source.slice(0, leak.offset).split(/\r\n|\r|\n/).length;
    return { ...leak, label: labels[line] ?? leak.label };
  });
  const secrets = new Map([...findGuardLeaks(instruction), ...fileLeaks].map((leak) => [leak.value, leak]));
  const ordered = [...secrets.values()].sort((a, b) => b.value.length - a.value.length);
  const prefix = ordered.length ? "__VIBEGUARD_" + globalThis.crypto.randomUUID().replace(/-/g, "") + "_" : "";
  const entries = ordered.map((leak, index) => ({ ...leak, token: prefix + leak.label.replaceAll(" ", "_") + "_" + index + "__" }));
  const byValue = new Map(entries.map((entry) => [entry.value, entry]));
  const pattern = entries.length ? new RegExp(entries.map(({ value }) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  function mask(text: string, mode: MaskMode = "display") {
    return pattern ? text.replace(pattern, (value) => {
      const entry = byValue.get(value)!;
      const replacement = mode === "display" ? "[" + entry.label + " - ********]" : entry.token;
      // Keep source line numbers stable, even for PEM keys.
      return replacement + (value.match(/\r\n|\r|\n/g)?.join("") ?? "");
    }) : text;
  }
  function restore(updated: string, original: string) {
    if (!entries.length) return updated;
    const markers = new RegExp(prefix + "[A-Za-z_]+_\\d+__", "g");
    const before = mask(original, "transport").match(markers) ?? [];
    const after = updated.match(markers) ?? [];
    if (before.length !== after.length || before.some((token, index) => token !== after[index])) return null;
    const maskedValues = new Map(entries.map(({ value, token }) => [token + lineBreaks(value), value]));
    const restorePattern = new RegExp([...maskedValues.keys()].join("|"), "g");
    if ((updated.match(restorePattern)?.length ?? 0) !== before.length) return null;
    return updated.replace(restorePattern, (token) => maskedValues.get(token)!);
  }
  function safeSummary(text: string) {
    return mask(prefix ? text.replace(new RegExp(prefix + "[A-Za-z_]+_\\d+__", "g"), "[REDACTED]") : text);
  }
  return { mask, restore, safeSummary };
}

const lineBreaks = (text: string) => text.match(/\r\n|\r|\n/g)?.join("") ?? "";

export function maskedGuardRows(source: string, name: string) {
  const lines = source.split(/\r\n|\r|\n/);
  const masked = createSecretMask(source, name).mask(source).split(/\r\n|\r|\n/);
  return masked.flatMap((text, index) => text !== lines[index] ? [{ line: index + 1, text }] : []);
}

export function scanVibeGuard(source: string, name: string, syntaxTree?: Node) {
  const findings: GuardFinding[] = [];
  const edits: GuardEdit[] = [];
  const seen = new Set<string>();
  const add = (line: number, severity: Severity, title: string, detail: string) => {
    const key = line + ":" + title;
    if (!seen.has(key)) findings.push({ line, severity, title, detail });
    seen.add(key);
  };
  let offset = 0;
  let line = 0;
  const bindings: GuardEdit[] = [];
  const names = new Map<string, number>();
  const browser = /(?:^|[\r\n])\s*['"]use client['"]|\b(?:window|document|localStorage|sessionStorage)\s*[.[]|\bimport\.meta\.env\b|\b(?:const|let|var|function|class|import)\s+process\b/.test(source) ||
    /(?:^|[./\\-])client(?:[./\\-]|$)|\.(?:jsx|tsx)$/i.test(name);
  const server = !browser && jsFile.test(name) &&
    (/(?:^|[./\\-])(?:server|middleware|route|webhook)(?:[./\\-]|$)|Webhook/.test(name) ||
      /(?:^|[\r\n])\s*['"]use server['"]|\b(?:process\.env\.|require\(['"]node:|from\s+['"]node:)/.test(source));
  for (const row of source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? []) {
    if (!row) continue;
    line++;
    const assignment = /\b([\w$-]+)\s*[:=]\s*(["'])([^"'\\]+)\2/g;
    for (const m of row.matchAll(assignment)) {
      if (!credential.test(m[3]) && (!secretName.test(m[1]) || m[3].length < 8 || safePlaceholder.test(m[3]))) continue;
      add(line, "critical", "Hardcoded credential", "A credential is stored in code. Revoke or rotate it and load its replacement from a private environment variable.");
      const declaration = row.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"'\\\r\n]+)\2\s*;?\s*(?:\/\/.*)?$/);
      if (server && declaration && declaration[1] === m[1] && !/^(NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_)/i.test(m[1])) {
        const key = m[1].replace(/([a-z\d])([A-Z])/g, "$1_$2").replace(/[^\w]/g, "_").toUpperCase();
        const quoted = m[2] + m[3] + m[2];
        const start = offset + m.index + m[0].length - quoted.length;
        bindings.push({ line, start, end: start + quoted.length, name: key, replacement: "process.env." + key });
        names.set(key, (names.get(key) ?? 0) + 1);
      }
    }
    if (credential.test(row)) add(line, "critical", "Hardcoded credential", "A credential pattern was found. Revoke or rotate the value and remove it from the source.");
    for (const match of row.matchAll(publicName)) {
      if (secretName.test(match[0])) add(line, "high", "Public environment variable", "This variable uses a public prefix and can be exposed to browsers. Keep private credentials on the server.");
    }
    const envEntry = isEnvFile(name) ? row.match(/^\s*(?:export\s+)?([\w.]+)\s*=\s*([^#\s][^\r\n]*)/) : null;
    if (envEntry) {
      add(line, "medium", "Populated environment file", "Keep populated environment files private. Commit only a blank example.");
      const value = envEntry[2].trim().replace(/^["']|["']$/g, "");
      if (secretName.test(envEntry[1]) && value && !safePlaceholder.test(value)) {
        add(line, "high", "Private environment value", "Remove populated secrets from files shared publicly and rotate any exposed values.");
      }
    }
    if (!syntaxTree && /\b(?:eval\s*\(|new\s+Function\s*\(|(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|dangerouslySetInnerHTML\s*[:=])/.test(row)) {
      add(line, "high", "Dangerous execution or HTML sink", "Untrusted input here can run code or inject HTML. Use safer APIs or sanitize trusted HTML first.");
    }
    offset += row.length;
  }
  edits.push(...bindings.filter(({ name }) => names.get(name) === 1));
  for (const { offset } of findGuardLeaks(source, name)) {
    const leakLine = source.slice(0, offset).split(/\r\n|\r|\n/).length;
    add(leakLine, "critical", "Hardcoded credential", "This value is masked in the preview. Rotate any exposed credential.");
  }
  const authMarker = /\b(?:auth|authenticate|authorize|requireAuth|verifyToken|verifySession|jwtVerify|getServerSession|getSession|constructEvent|isAdmin|currentUser)\s*\(|\b(?:req|request)\.user\b/i;
  // Middleware or framework configuration may enforce access outside this file.
  const route = /\bexport\s+(?:(?:async\s+)?function\s+|(?:const|let)\s+)(?:POST|PUT|PATCH|DELETE)\b|\b(?:app|router)\.(?:post|put|patch|delete)\s*\(/g;
  const routes = [...source.matchAll(route)];
  for (const [index, match] of routes.entries()) {
    if (!authMarker.test(source.slice(match.index, routes[index + 1]?.index ?? source.length))) {
      const routeLine = source.slice(0, match.index).split(/\r\n|\r|\n/).length;
      add(routeLine, "medium", "No visible auth check", "Verify authorization here or in middleware. Some endpoints are intentionally public.");
    }
  }
  if (syntaxTree) {
    const stack: unknown[] = [syntaxTree];
    while (stack.length) {
      const item = stack.pop();
      if (!item || typeof item !== "object" || !("type" in item)) continue;
      const node = item as Node;
      let name: string | undefined;
      if (node.type === "CallExpression" || node.type === "OptionalCallExpression" || node.type === "NewExpression") {
        const callee = node.callee;
        name = callee.type === "Identifier" ? callee.name :
          callee.type === "MemberExpression" && callee.property.type === "Identifier" ? callee.property.name :
          callee.type === "MemberExpression" && callee.property.type === "StringLiteral" ? callee.property.value : undefined;
        if (!["eval", "Function", "insertAdjacentHTML"].includes(name ?? "")) name = undefined;
      } else if (node.type === "AssignmentExpression" && node.left.type === "MemberExpression") {
        const prop = node.left.property;
        if (prop.type === "Identifier" || prop.type === "StringLiteral") {
          const key = prop.type === "Identifier" ? prop.name : prop.value;
          if (key === "innerHTML" || key === "outerHTML") name = key;
        }
      } else if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && node.name.name === "dangerouslySetInnerHTML") {
        name = node.name.name;
      }
      if (name && node.loc) add(node.loc.start.line, "high", "Dangerous execution or HTML sink", name + " can run code or inject HTML. Review how input is validated.");
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const child of value) stack.push(child);
        } else stack.push(value);
      }
    }
  }
  findings.sort((a, b) => a.line - b.line);
  const penalties = { critical: 35, high: 18, medium: 7 };
  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + penalties[finding.severity], 0));
  return { findings, edits, score };
}

export async function parseGuardSource(source: string, name: string) {
  if (!jsFile.test(name)) return;
  try {
    const { parse } = await import("@babel/parser");
    const typed = /\.(?:ts|tsx|mts|cts)$/i.test(name);
    return parse(source, { sourceType: "unambiguous", plugins: typed ? (/tsx$/i.test(name) ? ["typescript", "jsx"] : ["typescript"]) : ["jsx"] });
  } catch {
    return undefined;
  }
}

export function sanitizeSecrets(source: string, edits: GuardEdit[]) {
  const parts: string[] = [];
  let end = 0;
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    parts.push(source.slice(end, edit.start), edit.replacement);
    end = edit.end;
  }
  parts.push(source.slice(end));
  return parts.join("");
}

type Nano = {
  availability(): Promise<string>;
  create(options: { signal: AbortSignal }): Promise<{ prompt(text: string, options: { signal: AbortSignal }): Promise<string>; destroy(): void }>;
};
export async function summarizeGuard(findings: GuardFinding[], signal: AbortSignal) {
  const nano = (window as Window & { LanguageModel?: Nano }).LanguageModel;
  if (!nano || await nano.availability() !== "available" || signal.aborted) return;
  const session = await nano.create({ signal });
  try {
    // Only fixed rule labels and line metadata go to the native model.
    const labels = findings.slice(0, 18).map(({ title, severity, line }) => ({ title, severity, line }));
    return (await session.prompt("Summarize these local security findings and choose one priority in two sentences. Do not invent findings. " + JSON.stringify(labels), { signal })).trim().slice(0, 550);
  } finally {
    session.destroy();
  }
}

export async function labelGuardMasks(rows: { line: number; text: string }[], signal: AbortSignal) {
  const nano = (window as Window & { LanguageModel?: Nano }).LanguageModel;
  if (!nano || await nano.availability() !== "available" || signal.aborted) return;
  const ambiguous = rows.filter(({ text }) => text.includes("[Credential - ********]")).slice(0, 25);
  if (!ambiguous.length) return;
  const session = await nano.create({ signal });
  try {
    // Share only constrained metadata. Never pass raw source or secret values.
    const indicators = ambiguous.map(({ line, text }) => ({
      line,
      gemini: /gemini|genai/i.test(text),
      stripe: /stripe/i.test(text),
      github: /github/i.test(text),
      slack: /slack/i.test(text),
      bearer: /bearer/i.test(text),
    }));
    const response = await session.prompt(
      "Classify masked credentials using only these indicators. Return a JSON object keyed by line number. Allowed values: " +
      leakTypes.join(", ") + ". Choose Credential when no provider is clear. Data: " + JSON.stringify(indicators), { signal });
    const proposed = JSON.parse(response.replace(/^\s*`{3}(?:json)?\s*|\s*`{3}\s*$/gi, "")) as Record<string, unknown>;
    return Object.fromEntries(ambiguous.flatMap(({ line }) => {
      const label = proposed?.[line];
      return leakTypes.includes(label as LeakType) && label !== "Credential" ? [[line, label as LeakType]] : [];
    }));
  } finally {
    session.destroy();
  }
}
