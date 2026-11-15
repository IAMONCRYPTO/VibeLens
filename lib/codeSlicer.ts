export interface CodeBlock {
  id: string;
  title: string;
  category: "imports" | "hook" | "function" | "ui" | "logic";
  startLine: number;
  endLine: number;
  code: string;
  riskLevel: "low" | "medium" | "high";
}

const declaration = /^(?:(?:export|default|async|public|private|internal|static)\s+)*(?:function\s+|def\s+|class\s+|contract\s+)([\w$]+)|^(?:export\s+)?(?:const|let)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/;
const imports = /^(?:import\b|from\s+[\w.]+\s+import\b|using\b|(?:const|let|var)\s+.+?=\s*require\s*\(|["']use client["'])/;
const ui = /^(?:return\s*\(?\s*<|return\s*\(\s*$|<[A-Za-z]|<>)/;
const sensitive = /\b(?:constructEvent|jwtVerify|payment_status|webhooks|transaction|authorization|password|secret|apiKey|privateKey|csrf|session|token|middleware)\b|(?:SECRET|PRIVATE_KEY)/i;

function readable(name: string) {
  return name.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_$]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function sliceCodeIntoBlocks(rawCode: string): CodeBlock[] {
  if (!rawCode.trim()) return [];
  const lines = rawCode.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const blocks: CodeBlock[] = [];
  let start = 0;

  while (start < lines.length) {
    const max = Math.min(start + 18, lines.length);
    let end = max;
    let best = 0;
    for (let index = start + 8; index <= max && index < lines.length; index++) {
      if (lines.length - index < 8) continue;
      const line = lines[index].trim();
      const previous = lines[index - 1].trim();
      const score = declaration.test(line) || ui.test(line) ? 5 : !previous && line ? 4 :
        /^[}\])]+[;,]?$/.test(previous) ? 3 : /^\s*(?:if|for|try|const|await)\b/.test(lines[index]) ? 2 : 0;
      if (score >= best && score > 0) {
        end = index;
        best = score;
      }
    }
    if (lines.length - max > 0 && lines.length - max < 8 && end === max) end = lines.length - 8;

    const section = lines.slice(start, end);
    const code = section.join("\n");
    const first = section.find((line) => line.trim())?.trim() ?? "";
    const name = first.match(declaration)?.slice(1).find(Boolean);
    const containsUi = section.some((line) => /^\s*<[A-Za-z]/.test(line));
    const isHook = Boolean(name?.match(/^use[A-Z]/)) || /\buse(?:Effect|State|Ref|Memo|Callback)\s*[<(]/.test(code);
    const category = imports.test(first) ? "imports" : containsUi || ui.test(first) ? "ui" :
      isHook ? "hook" : name ? "function" : "logic";
    const route = name && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(name);
    const hint = first.match(/^(?:const|let|var)\s+([\w$]+)/)?.[1];
    const title = category === "imports" ? "Imports & configuration" :
      route ? name + " API route" : name ? readable(name) : category === "ui" ? "UI render" :
      category === "hook" ? "State & effects" : hint ? readable(hint) :
      sensitive.test(code) ? "Validation & security" : /return\b/.test(code) ? "Response & control flow" : "Application logic";
    blocks.push({
      id: "lines-" + (start + 1), title, category, startLine: start + 1, endLine: end, code,
      riskLevel: sensitive.test(code) ? "high" : category === "ui" || category === "imports" ? "low" : "medium",
    });
    start = end;
  }
  return blocks;
}

export function applyBlockPatch(content: string, block: CodeBlock, replacement: string) {
  const newline = content.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  const lines = content.split(/\r\n|\n|\r/);
  if (lines.slice(block.startLine - 1, block.endLine).join("\n") !== block.code) return null;
  lines.splice(block.startLine - 1, block.endLine - block.startLine + 1, ...replacement.split(/\r\n|\n|\r/));
  return lines.join(newline);
}
