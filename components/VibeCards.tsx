import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Check, Download, RotateCw, Shuffle, Volume2, WandSparkles } from "lucide-react";
import type { CodeBlock } from "../lib/codeSlicer";
import { languageKey } from "../lib/localAnalysis";
import { cardCategories, cardLanguages, enrichCard, makeVibeCards, type VibeCard } from "../lib/vibeCards";
import { SyntaxLine } from "./SyntaxLine";

type Filter = "all" | "safe" | "fragile" | "unmastered";
const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All Cards" },
  { id: "safe", label: "Safe Tweaks" },
  { id: "fragile", label: "Fragile Warnings" },
  { id: "unmastered", label: "Unmastered" },
];
const flipSpring = { type: "spring", stiffness: 300, damping: 29 } as const;

interface Props {
  blocks: CodeBlock[];
  fileName: string;
  language: string;
  mastered: ReadonlySet<string>;
  onMaster: (id: string) => void;
  onJump: (id: string) => void;
  onMutate: (id: string, prompt: string) => void;
}

export function VibeCards({ blocks, fileName, language, mastered, onMaster, onJump, onMutate }: Props) {
  const cards = useMemo(() => makeVibeCards(blocks, language), [blocks, language]);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<string[]>([]);
  const [enriched, setEnriched] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const requests = useRef(new Map<string, AbortController>());
  const speech = useRef<SpeechSynthesisUtterance | null>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const pending = requests.current;
    return () => {
      pending.forEach((controller) => controller.abort());
      pending.clear();
      if (speech.current) window.speechSynthesis.cancel();
    };
  }, []);

  const byId = new Map(cards.map((card) => [card.id, card]));
  const ordered = order.length ? order.flatMap((id) => byId.get(id) ?? []) : cards;
  const visible = ordered.filter((card) =>
    filter === "all" || (filter === "unmastered" ? !mastered.has(card.id) : card.category === filter));
  const allFlipped = visible.length > 0 && visible.every((card) => flipped.has(card.id));
  const masteredBlocks = cards.filter((card) => card.block && mastered.has(card.id)).length;
  const progress = blocks.length ? Math.round(masteredBlocks / blocks.length * 100) : 0;

  function flip(card: VibeCard, button: HTMLButtonElement) {
    const opened = flipped.has(card.id);
    const article = button.closest("article");
    setFlipped((previous) => {
      const next = new Set(previous);
      if (opened) next.delete(card.id);
      else next.add(card.id);
      return next;
    });
    requestAnimationFrame(() => article?.querySelector<HTMLButtonElement>(opened ? ".vibe-front .vibe-face-main" : ".vibe-back .vibe-face-main")?.focus({ preventScroll: true }));
    if (opened || enriched[card.id] || requests.current.has(card.id)) return;
    const controller = new AbortController();
    requests.current.set(card.id, controller);
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    void enrichCard(card, language, controller.signal).then((answer) => {
      if (answer && !controller.signal.aborted) setEnriched((previous) => ({ ...previous, [card.id]: answer }));
    }).catch(() => undefined).finally(() => {
      window.clearTimeout(timeout);
      if (requests.current.get(card.id) === controller) requests.current.delete(card.id);
    });
  }

  function flipAll() {
    setFlipped((previous) => {
      const next = new Set(previous);
      visible.forEach(({ id }) => allFlipped ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function shuffle() {
    const ids = ordered.map(({ id }) => id);
    for (let index = ids.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [ids[index], ids[other]] = [ids[other], ids[index]];
    }
    if (ids.length > 1 && ids.every((id, index) => id === ordered[index].id)) ids.push(ids.shift()!);
    setOrder(ids);
  }

  function listen(answer: string) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setNotice("This browser does not support speech playback.");
      return;
    }
    const lang = cardLanguages[languageKey(language)].speech;
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.localService);
    const voice = voices.find((item) => item.lang.toLowerCase() === lang.toLowerCase()) ??
      voices.find((item) => item.lang.toLowerCase().split("-")[0] === lang.split("-")[0]);
    if (!voice) {
      setNotice("No offline voice is available for this language.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = voice.lang;
    utterance.voice = voice;
    utterance.onend = () => { if (speech.current === utterance) speech.current = null; };
    utterance.onerror = (event) => {
      if (speech.current !== utterance) return;
      speech.current = null;
      if (event.error !== "canceled" && event.error !== "interrupted") setNotice("Speech playback could not start.");
    };
    if (speech.current) window.speechSynthesis.cancel();
    speech.current = utterance;
    setNotice("");
    window.speechSynthesis.speak(utterance);
  }

  function exportGuide() {
    const items = (lines: string[]) => lines.length ? lines.map((line) => "- " + line).join("\n") : "—";
    const markdown = ["# Vibe Cards · " + fileName, ...cards.map((card) => [
      "## " + card.title + " · Lines " + card.start + "–" + card.end,
      "**Question**  \n" + card.question,
      "**Answer**  \n" + (enriched[card.id] ?? card.answer),
      "### Safe to tweak\n" + items(card.safe),
      "### Do not touch\n" + items(card.fragile),
    ].join("\n\n"))].join("\n\n") + "\n";
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName + "-vibe-cards.md";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!cards.length) return null;
  return <section className="vibe-deck" aria-label="Vibe Cards deck">
    <div className="deck-controls">
      <div className="deck-progress">
        <strong>Vibe Mastery</strong><span>{masteredBlocks} / {blocks.length} blocks mastered · {progress}%</span>
        <progress aria-label="Block mastery" value={masteredBlocks} max={blocks.length} />
      </div>
      <div className="deck-filters" aria-label="Filter cards">
        {filters.map(({ id, label }) => <button key={id} type="button" className="secondary-button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      <div className="deck-actions">
        <button type="button" className="secondary-button" onClick={shuffle}><Shuffle size={15} /> Shuffle Deck</button>
        <button type="button" className="secondary-button" onClick={flipAll} disabled={!visible.length}><RotateCw size={15} /> {allFlipped ? "Show Questions" : "Flip All"}</button>
        <button type="button" className="secondary-button" onClick={exportGuide}><Download size={15} /> Export Cheat Sheet (.md)</button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </div>
    {!visible.length && <p className="deck-empty">No cards match this filter.</p>}
    <div className="vibe-card-grid">
      {visible.map((card) => {
        const back = flipped.has(card.id);
        const answer = enriched[card.id] ?? card.answer;
        const blockId = card.block?.id;
        const done = mastered.has(card.id);
        const prompt = card.mutation;
        return <article className={"vibe-card vibe-card-" + card.category} key={card.id} aria-label={card.title}>
          <motion.div className="vibe-card-rotor" initial={false} animate={{ rotateY: back && !reducedMotion ? 180 : 0 }}
            transition={reducedMotion ? { duration: 0 } : flipSpring}>
            <div className="vibe-face vibe-front" inert={back} aria-hidden={back}>
              <button type="button" className="vibe-face-main" aria-label={"Flip card: " + card.title} onClick={(event) => flip(card, event.currentTarget)}>
                <span className="vibe-card-meta"><span>{cardCategories[card.category]}</span><small>Lines {card.start}–{card.end}</small></span>
                <strong>{card.title}</strong>
                <span className="vibe-question" lang={language === "hinglish" ? "hi-Latn" : language}>{card.question}</span>
                <span className="vibe-snippet">{card.preview.map(({ line, code }) =>
                  <span key={line}><span aria-hidden="true">{line}</span><code><SyntaxLine text={code} /></code></span>)}</span>
                <span className="vibe-flip-hint"><RotateCw size={14} /> Click to flip card{done && <><Check size={14} /> Mastered</>}</span>
              </button>
              {blockId && <button type="button" className="secondary-button vibe-jump" onClick={() => onJump(blockId)}>Jump to Block <ArrowUpRight size={14} /></button>}
            </div>
            <div className="vibe-face vibe-back" inert={!back} aria-hidden={!back}>
              <button type="button" className="vibe-face-main" aria-label={"Show question: " + card.title} onClick={(event) => flip(card, event.currentTarget)}>
                <span className="vibe-card-meta"><span>{cardCategories[card.category]}</span><small>Lines {card.start}–{card.end}</small></span>
                <strong>{card.title}</strong>
                <span className="vibe-answer" lang={language === "hinglish" ? "hi-Latn" : language}>{answer}</span>
                <span className="vibe-flip-hint"><RotateCw size={14} /> Show question</span>
              </button>
              <div className="vibe-insights">
                <p className="vibe-safe"><strong>Safe to Tweak</strong> {card.safe[0] ?? "—"}</p>
                <p className="vibe-fragile"><strong>Do Not Touch</strong> {card.fragile[0] ?? "—"}</p>
              </div>
              <div className="vibe-card-actions">
                <button type="button" className="secondary-button" aria-pressed={done} onClick={() => onMaster(card.id)}><Check size={15} /> {done ? "Mastered" : "Got It"}</button>
                <button type="button" className="secondary-button" onClick={() => listen(answer)}><Volume2 size={15} /> Listen</button>
                {blockId && <button type="button" className="secondary-button" disabled={!prompt} title={prompt ? undefined : "No supported cosmetic edit was found"} onClick={() => { if (prompt) onMutate(blockId, prompt); }}><WandSparkles size={15} /> Send to Vibe Mutate</button>}
              </div>
            </div>
          </motion.div>
        </article>;
      })}
    </div>
  </section>;
}
