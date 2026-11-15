import { applyBlockPatch, type CodeBlock } from "./codeSlicer";
import type { Mutation } from "./hybridEngine";

export async function validateMutation(content: string, fileName: string, block: CodeBlock, mutation: Mutation): Promise<Mutation> {
  const original = mutation.scope === "file" ? content : block.code;
  if (mutation.updatedCode === original) return mutation;
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  if (!["js", "jsx", "ts", "tsx"].includes(extension)) return mutation;

  const replacement = mutation.scope === "file" ? mutation.updatedCode : applyBlockPatch(content, block, mutation.updatedCode);
  if (replacement === null) {
    return { ...mutation, updatedCode: original, changeSummary: "The source changed. Generate a new preview." };
  }

  try {
    const { parse } = await import("@babel/parser");
    const plugins: ("typescript" | "jsx")[] = [];
    if (extension.startsWith("ts")) plugins.push("typescript");
    if (extension !== "ts") plugins.push("jsx");
    const parseSource = (source: string) => parse(source, { sourceType: "unambiguous", plugins });
    try {
      parseSource(replacement);
    } catch {
      try {
        parseSource(content);
      } catch {
        return { ...mutation, changeSummary: mutation.changeSummary + " The original snippet has syntax errors, so the patch could not be syntax-checked." };
      }
      return { ...mutation, updatedCode: original, changeSummary: "The proposed patch would introduce a syntax error. Try a smaller change." };
    }
    return mutation;
  } catch {
    return { ...mutation, changeSummary: mutation.changeSummary + " Syntax validation was unavailable." };
  }
}
