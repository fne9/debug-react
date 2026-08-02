import { useEffect, useRef, useState } from "react";
import type { DetectedIssue } from "../../shared/protocol";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function IssueCard({ issue }: { issue: DetectedIssue }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  const copy = async () => {
    await copyText(issue.fix);
    setCopied(true);
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`issue issue-${issue.severity}`}>
      <div className="issue-head" onClick={() => setOpen((o) => !o)}>
        <span className={`issue-sev sev-${issue.severity}`}>
          {issue.severity === "error" ? "ERRO" : "AVISO"}
        </span>
        <span className="mono issue-comp">{issue.component}</span>
        <span className="issue-title">{issue.title}</span>
        {issue.count > 1 && <span className="ev-count issue-count">×{issue.count}</span>}
        <span className="issue-time">{formatTime(issue.lastTs)}</span>
        <span className="ev-arrow">{open ? "▼" : "▶"}</span>
      </div>
      {open && (
        <div className="issue-body">
          <p className="issue-detail">{issue.detail}</p>
          {issue.evidence && (
            <>
              <div className="issue-sub">Código do efeito (evidência)</div>
              <pre className="ev-payload">{issue.evidence}</pre>
            </>
          )}
          <div className="offender-fix-head">
            <strong>Fix sugerido</strong>
            <button className="btn-copy" onClick={copy}>
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
          <pre className="ev-payload">{issue.fix}</pre>
        </div>
      )}
    </div>
  );
}

export function IssueList({
  title,
  issues,
  emptyTitle,
  emptyText,
}: {
  title: string;
  issues: DetectedIssue[];
  emptyTitle: string;
  emptyText: string;
}) {
  return (
    <div className="issues">
      <div className="timeline-head">
        <h2>{title}</h2>
        <span className="timeline-total">
          {issues.length} {issues.length === 1 ? "problema" : "problemas"}
        </span>
      </div>

      {issues.length === 0 ? (
        <div className="placeholder">
          <h2>✅ {emptyTitle}</h2>
          <p>{emptyText}</p>
        </div>
      ) : (
        <div className="offenders">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}
