import { useState } from "react";
import { Icon } from "../Icon";
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

function Step({ step, last }: { step: ToolStep; last: boolean }) {
  const [open, setOpen] = useState(false);
  const run = step.status === "run";
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
            border: `1px solid ${run ? "var(--acc)" : step.status === "err" ? "var(--err)" : "var(--line2)"}`,
            color: run ? "var(--acc)" : step.status === "err" ? "var(--err)" : "var(--fg2)",
            transition: "all .3s",
            animation: run ? "hglow 1.6s ease-in-out infinite" : "hpop .45s cubic-bezier(.3,1.5,.5,1) both",
          }}
        >
          {run ? <Icon name="loader-circle" size={12} className="au-spin" /> : <Icon name={KIND_ICON[step.kind] ?? "circle"} size={11} />}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, paddingBottom: 6 }}>
        <button className={"au-step" + (run ? " run" : "")} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--acc)", whiteSpace: "nowrap" }}>{step.name}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{step.target}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>{run ? "…" : step.dur}</span>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={12} color="var(--fg3)" />
        </button>
        {open && <pre className="au-pre">{step.output || (run ? `rodando…${step.target ? " " + step.target : ""}` : "(sem saída)")}</pre>}
      </div>
    </div>
  );
}

export function ToolTimeline({ steps, meta }: { steps: ToolStep[]; meta?: string }) {
  const [open, setOpen] = useState(true);
  const running = steps.some((s) => s.status === "run");
  const done = steps.filter((s) => s.status !== "run").length;
  const head = running ? `trabalhando · passo ${done + 1}` : `${steps.length} ${steps.length === 1 ? "passo" : "passos"}${meta ? " · " + meta.split(" · ").pop() : ""}`;
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
            <Step key={s.id} step={s} last={i === steps.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
