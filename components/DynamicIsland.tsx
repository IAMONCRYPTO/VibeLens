import { ChevronDown, Cpu, Globe2, Radio, SlidersHorizontal, Zap } from "lucide-react";
import Image from "next/image";
import brandIcon from "../app/icon.png";
import type { Explanation, SimulationMode } from "../lib/hybridEngine";

export interface Metrics { local: number; cloud: number }
export const languageOptions = [
  ["en", "🇬🇧 Simple English"], ["hinglish", "🇮🇳 Hinglish"],
  ["hi", "🇮🇳 Hindi (Local Translator)"], ["es", "🇪🇸 Español"], ["ja", "🇯🇵 日本語"],
];

interface Props {
  mode: SimulationMode;
  onMode: (mode: SimulationMode) => void;
  language: string;
  onLanguage: (language: string) => void;
  metrics: Metrics;
  telemetry: Explanation | null;
  pending: boolean;
  workspaceOpen: boolean;
}

export function DynamicIsland({ mode, onMode, language, onLanguage, metrics, telemetry, pending, workspaceOpen }: Props) {
  const total = metrics.local + metrics.cloud;
  const saved = total ? Math.round(metrics.local / total * 100) : 0;
  const cloud = telemetry?.execution === "firebase" && telemetry.inferenceSource === "IN_CLOUD";
  const source = pending ? "Routing…" : !telemetry ? "Hybrid router ready" :
    telemetry.execution === "simulated" ? "Nano simulator" : telemetry.execution === "fallback" ? "Offline analysis" :
    cloud ? "Cloud analysis" : "Local Gemini Nano";
  const localCost = !pending && telemetry?.execution === "firebase" && !cloud
    ? " · " + telemetry.latencyMs + " ms" : "";
  return (
    <header className={"island glass" + (workspaceOpen ? "" : " island-start")} aria-label="VibeLens controls">
      <div className="brand"><Image className="brand-mark" src={brandIcon} alt="" width={52} height={44} priority /><span>VibeLens</span></div>
      {workspaceOpen && <div className={"route-badge" + (cloud ? " cloud-route" : "")} role="status"><span className="pulse-dot" />{source}{localCost}</div>}
      <div className="island-spacer" />
      {workspaceOpen && <div className="metrics" aria-label="Routing metrics">
        <span title="Local scans"><Cpu size={14} /><strong>{metrics.local}</strong><span>Local</span></span>
        <span title="Cloud calls this session"><Radio size={14} /><strong>{metrics.cloud}</strong><span>Cloud</span></span>
        <span title="Estimated cloud calls avoided: local scans as a share of local scans and cloud calls"><Zap size={14} /><strong>{total ? saved + "%" : "—"}</strong><span>Saved</span></span>
      </div>}
      {process.env.NODE_ENV === "development" && <label className="island-select" title="Analysis mode">
        <SlidersHorizontal size={15} /><select aria-label="Analysis mode" value={mode} onChange={(event) => onMode(event.target.value as SimulationMode)}>
          <option value="auto">Auto Hybrid</option>
          <option value="simulate">Demo simulator</option>
          <option value="cloud">Cloud analysis</option>
        </select><ChevronDown size={13} />
      </label>}
      <label className="island-select language-select">
        <Globe2 size={15} /><select aria-label="Explanation language" value={language} onChange={(event) => onLanguage(event.target.value)}>
          {languageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select><ChevronDown size={13} />
      </label>
    </header>
  );
}
