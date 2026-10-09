import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { fmtElapsed, limitOutput, summarizeArgs, toolLabel } from "./toolLabels";
import type { ToolStep } from "./types";

const KIND_ICON: Record<string, string> = {
  skill: "sparkles",
  terminal: "square-terminal",
  delegate: "git-fork",
  memory: "brain",
  cron: "calendar-clock",
  web: "globe",
  file: "file-text",
};

/** Relógio que anda enquanto há passo rodando (meio segundo; sem movimento extra para quem pede menos animação). */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [active]);
  return now;
}

function Output({ text, empty }: { text: string; empty: string }) {
  const [all, setAll] = useState(false);
  const o = limitOutput(text, all);
  return (
    <>
      <pre className="au-pre">{text ? o.text : empty}</pre>
      {(o.cut || (all && text.split("\n").length > 40)) && (
        <button className="au-more" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Mostrar tudo (${text.split("\n").length} linhas)`}
        </button>
      )}
    </>
  );
}

function Step({ step, last, now }: { step: ToolStep; last: boolean; now: number }) {
  const [open, setOpen] = useState(false);
  const run = step.status === "run";
  const err = step.status === "err";
  const what = summarizeArgs(step.name, step.args) || step.target;
  const time = run ? (step.startedAt ? fmtElapsed(now - step.startedAt) : "…") : step.dur;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 10, animation: "hblurin .5s cubic-bezier(.2,.7,.2,1) both" }}>
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        {!last && (
          <div style={{ position: "absolute", top: 22, bottom: -2, left: 10.5, width: 1, background: "linear-gradient(var(--acc),var(--line2) 70%)", transformOrigin: "top", animation: "hdraw .7s cubic-bezier(.2,.7,.2,1) both" }} />
        )}
        <div
          style={{
            position: "relative",
            marginTop: 6,
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: run ? "var(--accSoft)" : "var(--panel)",
            border: `1px solid ${run ? "var(--acc)" : err ? "var(--err)" : "var(--line2)"}`,
            color: run ? "var(--acc)" : err ? "var(--err)" : "var(--fg2)",
            transition: "all .3s",
            animation: run ? "hglow 1.6s ease-in-out infinite" : "hpop .45s cubic-bezier(.3,1.5,.5,1) both",
          }}
        >
          {run ? <Icon name="loader-circle" size={12} className="au-spin" /> : <Icon name={err ? "circle-alert" : (KIND_ICON[step.kind] ?? "circle")} size={11} />}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, paddingBottom: 6 }}>
        <button className={"au-step" + (run ? " run" : "")} aria-expanded={open} title={step.name} onClick={() => setOpen(!open)}>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: err ? "var(--err)" : "var(--acc)", whiteSpace: "nowrap" }}>{toolLabel(step.name, run)}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{what}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", whiteSpace: "nowrap" }}>{time}</span>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={12} color="var(--fg3)" />
        </button>
        {open && <Output text={step.output} empty={run ? `rodando…${what ? " " + what : ""}` : "(a ferramenta não devolveu nada)"} />}
      </div>
    </div>
  );
}

export function ToolTimeline({ steps, secs }: { steps: ToolStep[]; secs?: number }) {
  const [open, setOpen] = useState(true);
  const running = steps.some((s) => s.status === "run");
  const now = useNow(running);
  const done = steps.filter((s) => s.status !== "run").length;
  const head = running ? `trabalhando · passo ${done + 1}` : `${steps.length} ${steps.length === 1 ? "passo" : "passos"}${secs ? " · " + fmtElapsed(secs * 1000) : ""}`;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button className="au-ghost" aria-expanded={open} onClick={() => setOpen(!open)} style={{ alignSelf: "flex-start", padding: "4px 0 10px", fontFamily: "var(--fm)", fontSize: 11.5 }}>
        <Icon name={running ? "loader-circle" : "workflow"} size={13} color="var(--acc)" className={running ? "au-spin" : undefined} />
        {head}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={12} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {steps.map((s, i) => (
            <Step key={s.id} step={s} last={i === steps.length - 1} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
