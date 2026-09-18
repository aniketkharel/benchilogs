import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { statusOptions, type Repair } from "./repairs";
import "./HandoverReport.css";

export type HandoverSnapshot = {
  mode: "handover" | "daily";
  repairs: Repair[];
  date: string;
  benchName: string;
  generatedAt: string;
};

export function HandoverReport({
  report,
  onClose,
}: {
  report: HandoverSnapshot;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const previousTitle = document.title;
    document.title = `BenchiLogs-${report.mode === "daily" ? "daily-report" : "handover"}-${report.date}`;
    return () => {
      document.title = previousTitle;
    };
  }, [report.date, report.mode]);
  const dateLabel = new Date(`${report.date}T12:00:00`).toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const reportStatuses =
    report.mode === "daily" ? statusOptions : ["Failed / Escalated", "On Hold"];
  const groups = reportStatuses.map((status) => ({
    title: status,
    repairs: report.repairs.filter((repair) => repair.status === status),
  }));
  function print() {
    setError("");
    try {
      window.print();
    } catch {
      setError("The print dialog could not open. Please try again.");
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="handover-dialog"
      aria-labelledby="handover-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="handover-actions">
        <div>
          <strong>Report preview</strong>
          <p>Choose Save as PDF or Microsoft Print to PDF in the print dialog.</p>
        </div>
        <button type="button" className="primary-button" onClick={print}>
          Print / Save as PDF
        </button>
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
      {error && (
        <p className="handover-error" role="alert">
          {error}
        </p>
      )}
      <div className="handover-paper">
        <header className="handover-heading">
          <p className="handover-bench">{report.benchName}</p>
          <h1 id="handover-title">
            {report.mode === "daily" ? "Daily repair report" : "Technician handover"}
          </h1>
          <p className="handover-date">{dateLabel}</p>
          <p className="handover-scope">
            {report.mode === "daily"
              ? "All repairs created on this date, across every status."
              : "Repairs created on this date currently On Hold or Failed / Escalated."}
          </p>
          <p className="handover-generated">
            Prepared {new Date(report.generatedAt).toLocaleString()}
          </p>
        </header>
        <div className="handover-counts">
          <span>
            <strong>{report.repairs.length}</strong>{" "}
            {report.mode === "daily" ? "total repairs" : "jobs for review"}
          </span>
          {groups.map((group) => (
            <span key={group.title}>
              <strong>{group.repairs.length}</strong> {group.title}
            </span>
          ))}
        </div>
        {report.repairs.length === 0 ? (
          <p className="handover-empty">
            {report.mode === "daily"
              ? "No repairs were created on this date."
              : "No On Hold or Failed / Escalated repairs were found for this creation date."}
          </p>
        ) : (
          groups
            .filter((group) => group.repairs.length)
            .map((group) => (
              <section className="handover-group" key={group.title}>
                <h2>
                  {group.title} <span>({group.repairs.length})</span>
                </h2>
                {group.repairs.map((repair) => (
                  <ReportRepair key={repair.id} repair={repair} generatedAt={report.generatedAt} />
                ))}
              </section>
            ))
        )}
      </div>
    </dialog>,
    document.body,
  );
}

function ReportRepair({ repair, generatedAt }: { repair: Repair; generatedAt: string }) {
  const seconds =
    repair.elapsedSeconds +
    (repair.timerStartedAt === null
      ? 0
      : Math.max(0, Math.floor(new Date(generatedAt).getTime() / 1000) - repair.timerStartedAt));
  const time = `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
  const cleaned = [
    repair.robotDeepCleaned ? "Robot" : "",
    repair.dockDeepCleaned ? "Dock" : "",
  ].filter(Boolean);
  return (
    <article className="handover-job">
      <header>
        <h3>
          Job #{repair.ticket}{" "}
          <span>
            {repair.brand} {repair.model}
          </span>
        </h3>
        <p>{repair.status}</p>
      </header>
      <dl>
        {(
          [
            ["Fault / symptom", repair.fault],
            ["Diagnosis", repair.diagnosis],
            ["Work performed", repair.workPerformed],
            ["Parts used", repair.parts],
            ["Notes / follow-up", repair.notes],
          ] as const
        ).map(([label, value]) => (
          <div className="handover-field" key={label}>
            <dt>{label}</dt>
            <dd>{value.trim() || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
      <div className="handover-job-meta">
        <p>
          <strong>Time spent:</strong> {time}
          {repair.timerStartedAt !== null ? " (running at report time)" : ""}
        </p>
        {cleaned.length > 0 && (
          <p>
            <strong>Deep cleaned:</strong> {cleaned.join(" and ")}
          </p>
        )}
        <p>
          <strong>Last updated:</strong> {new Date(repair.updatedAt).toLocaleString()}
        </p>
      </div>
    </article>
  );
}
