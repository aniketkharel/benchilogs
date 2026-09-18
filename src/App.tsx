import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  emptyRepair,
  repairSummary,
  repairStore,
  sortRepairs,
  statusOptions,
  createdToday,
  type Repair,
  type RepairInput,
  type RepairStatus,
} from "./repairs";
import "./App.css";
import { HandoverReport, type HandoverSnapshot } from "./HandoverReport";

type View = "Dashboard" | "History";
function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const URL: string = "https://vaccumrepairs.repairdesk.co/";

function App() {
  const [handover, setHandover] = useState<HandoverSnapshot | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("Dashboard");
  const [benchScope, setBenchScope] = useState<"today" | "active">("today");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | RepairStatus>("Working On");
  const [editor, setEditor] = useState<Repair | "new" | null>(null);
  const [today, setToday] = useState(() => new Date().toDateString());
  const [chosenDate, setChosenDate] = useState(() => localDateKey(new Date()));
  function updateTimerRepair(saved: Repair) {
    setRepairs((current) => sortRepairs([saved, ...current.filter((r) => r.id !== saved.id)]));
    setEditor((current) =>
      current !== null && current !== "new" && current.id === saved.id ? saved : current,
    );
  }

  async function loadRepairs() {
    setLoading(true);
    setError("");
    try {
      setRepairs(await repairStore.list());
    } catch (error) {
      setError(errorText(error));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void loadRepairs();
  }, []);
  useEffect(() => {
    const refreshDate = () => setToday(new Date().toDateString());
    const timer = window.setInterval(refreshDate, 30_000);
    window.addEventListener("focus", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
    };
  }, []);

  const todaysRepairs = repairs
    .filter((r) => createdToday(r, today))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  const historyRepairs = repairs.filter((r) => localDateKey(new Date(r.createdAt)) === chosenDate);
  const activeRepairs = repairs
    .filter((r) => r.status !== "Completed" && r.status !== "Failed / Escalated")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  const scope =
    view === "History" ? repairs : benchScope === "today" ? todaysRepairs : activeRepairs;
  const term = search.trim().toLowerCase();
  // Match the local creation day, not the UTC day or latest edit.
  function matchesCreationDate(repair: Repair) {
    return view !== "History" || localDateKey(new Date(repair.createdAt)) === chosenDate;
  }
  const hasFilters = !!search || statusFilter !== "All" || view === "History";
  const filteredRepairs = scope.filter(
    (repair) =>
      matchesCreationDate(repair) &&
      (statusFilter === "All" || repair.status === statusFilter) &&
      [
        repair.ticket,
        repair.brand,
        repair.model,
        repair.fault,
        repair.diagnosis,
        repair.workPerformed,
        repair.parts,
        repair.notes,
      ].some((value) => value.toLowerCase().includes(term)),
  );

  function openHandover() {
    const date = view === "History" ? chosenDate : localDateKey(new Date());
    let benchName = "benchilogs";
    try {
      benchName = localStorage.getItem("benchilogs.benchName")?.trim() || benchName;
    } catch {
      /* Default if preferences are unavailable. */
    }
    setHandover({
      mode: view === "History" ? "daily" : "handover",
      date,
      benchName,
      generatedAt: new Date().toISOString(),
      repairs: repairs
        .filter(
          (repair) =>
            localDateKey(new Date(repair.createdAt)) === date &&
            (view === "History" ||
              repair.status === "On Hold" ||
              repair.status === "Failed / Escalated"),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    });
  }

  return (
    <div className={`app-shell ${view === "History" ? "history-layout" : ""}`}>
      <aside className="sidebar">
        <div>
          <div className="brand-mark shop-brand">
            <img
              className="shop-logo"
              src="/shop-logo.webp"
              alt="Shop logo"
              width="150"
              height="33"
            />
            <BenchName />
          </div>
          <p className="nav-label">Workspace</p>
          <nav className="nav-list" aria-label="Main navigation">
            {(["Dashboard", "History"] as View[]).map((item) => (
              <button
                key={item}
                className={`nav-item ${view === item ? "active" : ""}`}
                aria-current={view === item ? "page" : undefined}
                onClick={() => {
                  setView(item);
                  setStatusFilter(
                    item === "Dashboard" && benchScope === "today" ? "Working On" : "All",
                  );
                }}
              >
                <Icon name={item} />
                <span>{item}</span>
                {view === item && <span className="nav-active-mark" aria-hidden="true" />}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <RepairDeskLink />
          <div className="sidebar-footer">
            <span className="offline-dot" />
            <div>
              <strong>Local workspace</strong>
              <span>Offline & ready for the bench</span>
            </div>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <div className="workspace-topline">
          <span>
            Workspace <span aria-hidden="true">/</span> {view}
          </span>
          <time>
            {new Date(today).toLocaleDateString([], {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        </div>
        <header className="page-header">
          <div>
            <h2>{view === "Dashboard" ? "Your Bench" : "Repair History"}</h2>
          </div>
          {view === "History" && (
            <div className="history-date-filter history-summary-date">
              <label htmlFor="history-date-filter">Created</label>
              <input
                id="history-date-filter"
                type="date"
                aria-label="Repair creation date"
                value={chosenDate}
                onChange={(event) => setChosenDate(event.target.value)}
              />
              {!chosenDate && <span>Select a date to show repairs.</span>}
            </div>
          )}
          <button
            className="primary-button"
            disabled={loading || !!error}
            onClick={() => setEditor("new")}
          >
            <span aria-hidden="true">＋</span> New Repair
          </button>
        </header>
        {error && (
          <div className="error-message" role="alert">
            {error}{" "}
            <button className="ghost-button" onClick={() => void loadRepairs()}>
              Retry
            </button>
          </div>
        )}
        {view === "History" ? (
          <>
            <HistorySummary
              repairs={historyRepairs}
              date={chosenDate}
              unavailable={loading || !!error || !chosenDate}
            />
          </>
        ) : (
          <section className="stats-grid" aria-label="Today's repair statistics">
            <StatCard
              label="Total today"
              value={todaysRepairs.length}
              unavailable={loading || !!error}
            />
            {(["Completed", "On Hold", "Testing", "Failed / Escalated"] as RepairStatus[]).map(
              (status) => (
                <StatCard
                  key={status}
                  label={status}
                  value={todaysRepairs.filter((r) => r.status === status).length}
                  unavailable={loading || !!error}
                />
              ),
            )}
          </section>
        )}
        <section className="panel" aria-busy={loading}>
          <div className="panel-heading">
            <div>
              <h3>
                {view === "Dashboard"
                  ? benchScope === "today"
                    ? "On the bench today"
                    : "All active repairs · every date"
                  : "Repairs"}
              </h3>
            </div>
            <div className="report-panel-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={loading || !!error || (view === "History" && !chosenDate)}
                onClick={openHandover}
              >
                {view === "History" ? "Daily report" : "Handover report"}
              </button>
              <span className="record-count">
                {loading || error
                  ? "—"
                  : `${filteredRepairs.length} ${filteredRepairs.length === 1 ? "repair" : "repairs"}`}
              </span>
            </div>
          </div>
          {view === "Dashboard" && (
            <div className="bench-scope" role="group" aria-label="Dashboard repair scope">
              <button
                type="button"
                aria-pressed={benchScope === "today"}
                onClick={() => {
                  setBenchScope("today");
                  setStatusFilter("Working On");
                }}
              >
                Today
              </button>
              <button
                type="button"
                aria-pressed={benchScope === "active"}
                onClick={() => {
                  setBenchScope("active");
                  setStatusFilter("All");
                }}
              >
                All active
              </button>
            </div>
          )}
          <div className="toolbar">
            <div className="search-wrap">
              <Icon name="search" />
              <input
                aria-label="Search repairs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket, model, fault, notes..."
              />
            </div>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "All" | RepairStatus)}
            >
              <option value="All">All statuses</option>
              {statusOptions
                .filter(
                  (item) =>
                    view !== "Dashboard" ||
                    benchScope !== "active" ||
                    (item !== "Completed" && item !== "Failed / Escalated"),
                )
                .map((item) => (
                  <option key={item}>{item}</option>
                ))}
            </select>
          </div>
          <div
            className="repair-list"
            tabIndex={view === "History" ? 0 : undefined}
            role={view === "History" ? "region" : undefined}
            aria-label={view === "History" ? "Repair history list" : undefined}
          >
            {loading ? (
              <div className="empty-state" role="status">
                Loading repairs...
              </div>
            ) : error ? (
              <div className="empty-state">
                Repair storage is unavailable. Retry to load your records.
              </div>
            ) : filteredRepairs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="bench" />
                </div>
                <h3>{hasFilters ? "No matching repairs" : "A clear bench"}</h3>
                <p>
                  {hasFilters
                    ? "Try another search, status, or creation date."
                    : "Add a repair to get started, or find previous work in History."}
                </p>
              </div>
            ) : (
              filteredRepairs.map((repair) => (
                <article key={repair.id} className="repair-card">
                  <div className="repair-left">
                    <div className="ticket-badge">#{repair.ticket}</div>
                    <div className="repair-copy">
                      <div className="repair-title-row">
                        <h3>
                          {repair.brand} {repair.model}
                        </h3>
                        <StatusBadge status={repair.status} />
                        {repair.robotDeepCleaned && (
                          <span
                            className="clean-badge"
                            title="Robot deep cleaned"
                            role="img"
                            aria-label="Robot deep cleaned"
                          >
                            <Icon name="robot" />
                            <span aria-hidden="true">✓</span>
                          </span>
                        )}
                        {repair.dockDeepCleaned && (
                          <span
                            className="clean-badge"
                            title="Dock deep cleaned"
                            role="img"
                            aria-label="Dock deep cleaned"
                          >
                            <Icon name="dock" />
                            <span aria-hidden="true">✓</span>
                          </span>
                        )}
                      </div>
                      <p>{repair.fault || "No fault description yet."}</p>
                    </div>
                  </div>
                  <div className="repair-meta">
                    <RepairTimer repair={repair} onUpdated={updateTimerRepair} />
                    <time
                      dateTime={repair.updatedAt}
                      title={`Updated ${new Date(repair.updatedAt).toLocaleString()}`}
                    >
                      {new Date(repair.updatedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                    <button
                      className="ghost-button"
                      aria-label={`Open repair ${repair.ticket}`}
                      onClick={() => setEditor(repair)}
                    >
                      Open <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
      {handover && <HandoverReport report={handover} onClose={() => setHandover(null)} />}
      {editor !== null && (
        <RepairEditor
          repair={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onTimerUpdated={updateTimerRepair}
          onSaved={(saved) => {
            setRepairs((current) =>
              sortRepairs([saved, ...current.filter((r) => r.id !== saved.id)]),
            );
            setEditor(null);
          }}
          onDeleted={(id) => {
            setRepairs((current) => current.filter((r) => r.id !== id));
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}

function RepairEditor({
  repair,
  onClose,
  onSaved,
  onDeleted,
  onTimerUpdated,
}: {
  repair: Repair | null;
  onClose: () => void;
  onSaved: (repair: Repair) => void;
  onDeleted: (id: number) => void;
  onTimerUpdated: (repair: Repair) => void;
}) {
  const [form, setForm] = useState<RepairInput>(() => repair ?? emptyRepair());
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const dirty =
    repair !== null &&
    (Object.keys(emptyRepair()) as (keyof RepairInput)[]).some((key) => form[key] !== repair[key]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function change<K extends keyof RepairInput>(field: K, value: RepairInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || timerBusy) return;
    if (!form.ticket.trim()) {
      setError("Ticket / Job ID is required.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      onSaved(repair ? await repairStore.update(repair.id, form) : await repairStore.create(form));
    } catch (error) {
      setError(errorText(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!repair || pending.current || timerBusy) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await repairStore.delete(repair.id);
      onDeleted(repair.id);
    } catch (error) {
      setError(errorText(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current && !timerBusy) onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <p className="eyebrow">{repair ? `Job #${repair.ticket}` : "Quick entry"}</p>
          <h2 id="editor-title">{repair ? "Edit Repair" : "New Repair"}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close repair"
          disabled={busy || timerBusy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {repair ? (
        <div className="editor-timer">
          <RepairTimer
            repair={repair}
            disabled={busy || confirmDelete || dirty}
            onBusy={setTimerBusy}
            onUpdated={(saved) => {
              onTimerUpdated(saved);
              setForm((current) => ({ ...current, status: saved.status }));
            }}
          />
          <p>
            {dirty
              ? "Save your changes before using the timer."
              : "Start sets Working On. Pause before stepping away; a running timer continues while the app is closed."}
          </p>
        </div>
      ) : (
        <p className="timer-hint">
          Save this repair first, then hit Start when you’re ready to work.
        </p>
      )}
      <form onSubmit={save}>
        <fieldset disabled={busy || timerBusy || confirmDelete} className="form-grid">
          <label>
            Ticket / Job ID
            <input
              autoFocus
              required
              value={form.ticket}
              onChange={(e) => change("ticket", e.target.value)}
              placeholder="45821"
            />
          </label>
          <label>
            Brand
            <select value={form.brand} onChange={(e) => change("brand", e.target.value)}>
              {["Roborock", "Ecovacs", "iRobot", "Other"].map((brand) => (
                <option key={brand}>{brand}</option>
              ))}
            </select>
          </label>
          <label>
            Model
            <input
              value={form.model}
              onChange={(e) => change("model", e.target.value)}
              placeholder="Q7 Max"
            />
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => change("status", e.target.value as RepairStatus)}
            >
              {statusOptions.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            {repair?.timerStartedAt != null && form.status !== "Working On" && (
              <span>Saving will stop the timer and keep your total.</span>
            )}
          </label>
          {(
            [
              ["fault", "Fault / Symptom"],
              ["diagnosis", "Diagnosis"],
              ["workPerformed", "Work performed"],
              ["parts", "Parts replaced or used"],
              ["notes", "Notes"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="full-width">
              {label}
              <textarea
                rows={2}
                value={form[field]}
                onChange={(e) => change(field, e.target.value)}
              />
            </label>
          ))}
          <fieldset className="cleaning-options full-width">
            <legend>Deep cleaning</legend>
            <label>
              <input
                type="checkbox"
                checked={form.robotDeepCleaned}
                onChange={(e) => change("robotDeepCleaned", e.target.checked)}
              />
              <Icon name="robot" />
              Robot deep cleaned
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.dockDeepCleaned}
                onChange={(e) => change("dockDeepCleaned", e.target.checked)}
              />
              <Icon name="dock" />
              Dock deep cleaned
            </label>
          </fieldset>
        </fieldset>
        {repair && (
          <CopyRepairSummary
            repair={repair}
            disabled={busy || timerBusy || confirmDelete || dirty}
          />
        )}
        {repair && (
          <p className="timestamps">
            Created {new Date(repair.createdAt).toLocaleString()}
            <br />
            Updated {new Date(repair.updatedAt).toLocaleString()}
          </p>
        )}
        {confirmDelete ? (
          <div className="delete-confirm" role="alert">
            <p>Permanently delete repair #{repair?.ticket}? This cannot be undone.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy || timerBusy}
                onClick={() => setConfirmDelete(false)}
              >
                Keep repair
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={busy || timerBusy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            {repair && (
              <button
                type="button"
                className="danger-button delete-button"
                disabled={busy || timerBusy}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              disabled={busy || timerBusy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busy || timerBusy}>
              {busy ? "Saving..." : "Save Repair"}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
function BenchName() {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("benchilogs.benchName")?.trim().slice(0, 40) || "benchilogs";
    } catch {
      return "benchilogs";
    }
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const renameButton = useRef<HTMLButtonElement>(null);
  function close() {
    setEditing(false);
    setError("");
    window.requestAnimationFrame(() => renameButton.current?.focus());
  }
  function save(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) {
      setError("Enter a name for your workspace.");
      return;
    }
    try {
      localStorage.setItem("benchilogs.benchName", value);
      setName(value);
      close();
    } catch {
      setError("Could not save the name on this device. Try again.");
    }
  }
  return (
    <div className="bench-name">
      {editing ? (
        <form
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        >
          <label htmlFor="bench-name">Name your BenchiLogs</label>
          <input
            id="bench-name"
            autoFocus
            maxLength={40}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. Nick’s Bench"
          />
          <div className="bench-name-actions">
            <button type="submit">Save</button>
            <button type="button" onClick={close}>
              Cancel
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      ) : (
        <>
          <h1>
            <button
              ref={renameButton}
              type="button"
              className="bench-name-button"
              title="Rename your BenchiLogs"
              aria-label={`Rename workspace: ${name}`}
              onClick={() => {
                setDraft(name);
                setEditing(true);
              }}
            >
              {name}
              <span aria-hidden="true">✎</span>
            </button>
          </h1>
          <p>Your repair workspace</p>
        </>
      )}
    </div>
  );
}

function RepairDeskLink() {
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const url = URL;
  async function open(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isTauri()) return;
    event.preventDefault();
    if (opening) return;
    setOpening(true);
    setError("");
    try {
      await openUrl(url);
    } catch {
      setError("Could not open your browser. Try again.");
    } finally {
      setOpening(false);
    }
  }
  return (
    <div className="repairdesk-shortcut">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => void open(event)}
        aria-label="Open RepairDesk in your browser"
        aria-busy={opening}
      >
        <span>{opening ? "Opening…" : "Open RepairDesk"}</span>
        <span aria-hidden="true">↗</span>
      </a>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function CopyRepairSummary({ repair, disabled }: { repair: Repair; disabled: boolean }) {
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const preview = useRef<HTMLDetailsElement>(null);
  const text = repairSummary(repair);
  useEffect(() => {
    setMessage("");
    setCopyFailed(false);
  }, [repair, disabled]);
  async function copy() {
    if (copying || disabled) return;
    setCopying(true);
    setMessage("");
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied. Paste into the matching RepairDesk ticket comment.");
    } catch {
      setCopyFailed(true);
      setMessage("Clipboard unavailable. Select the summary below and press Ctrl+C to copy it.");
      if (preview.current) preview.current.open = true;
    } finally {
      setCopying(false);
    }
  }
  return (
    <section className="copy-summary" aria-label="RepairDesk summary">
      <div className="copy-summary-heading">
        <strong>RepairDesk comment</strong>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || copying}
          onClick={() => void copy()}
        >
          {copying ? "Copying…" : "Copy repair summary"}
        </button>
      </div>
      <p>
        {disabled
          ? "Save any changes and finish the current action before copying."
          : "Copy saved details, then paste into the matching ticket. Nothing is posted automatically."}
      </p>
      {message && <p role={copyFailed ? "alert" : "status"}>{message}</p>}
      <details ref={preview}>
        <summary>Preview saved summary</summary>
        <textarea
          aria-label="Saved repair summary"
          readOnly
          value={text}
          rows={9}
          onFocus={(event) => event.currentTarget.select()}
        />
      </details>
    </section>
  );
}

function RepairTimer({
  repair,
  onUpdated,
  disabled = false,
  onBusy,
}: {
  repair: Repair;
  onUpdated: (repair: Repair) => void;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const running = repair.timerStartedAt !== null;
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [running, repair.timerStartedAt]);
  const seconds =
    repair.elapsedSeconds +
    (repair.timerStartedAt === null
      ? 0
      : Math.max(0, Math.floor(now / 1000) - repair.timerStartedAt));
  const duration = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  async function toggle() {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      onUpdated(await repairStore.timer(repair.id, !running));
    } catch (error) {
      setError(errorText(error));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  const action = running ? "Pause" : repair.elapsedSeconds > 0 ? "Resume" : "Start";
  return (
    <div className={`repair-timer ${running ? "timer-running" : ""}`}>
      <div className="timer-controls">
        <div className="timer-readout">
          <span>{running ? "Timing" : "Hands-on"}</span>
          <strong aria-label={`Hands-on time ${duration}`}>{duration}</strong>
        </div>
        <button
          type="button"
          className="ghost-button timer-button"
          disabled={busy || disabled}
          aria-label={`${action} timer for repair ${repair.ticket}`}
          title={running ? "Pause hands-on time" : "Start timing and set Working On"}
          onClick={() => void toggle()}
        >
          {busy ? "Saving…" : action}
        </button>
      </div>
      {error && (
        <p className="timer-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function HistorySummary({
  repairs,
  date,
  unavailable,
}: {
  repairs: Repair[];
  date: string;
  unavailable: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const hasRunningTimer = repairs.some((repair) => repair.timerStartedAt !== null);
  useEffect(() => {
    setNow(Date.now());
    if (!hasRunningTimer) return;
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [hasRunningTimer, date]);
  const elapsed = (repair: Repair) =>
    repair.elapsedSeconds +
    (repair.timerStartedAt === null
      ? 0
      : Math.max(0, Math.floor(now / 1000) - repair.timerStartedAt));
  const completed = repairs.filter((repair) => repair.status === "Completed");
  const totalSeconds = repairs.reduce((sum, repair) => sum + elapsed(repair), 0);
  const averageSeconds = completed.length
    ? Math.round(completed.reduce((sum, repair) => sum + elapsed(repair), 0) / completed.length)
    : null;
  const duration = (seconds: number) =>
    `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
  const dateLabel = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString([], {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Choose a date";
  return (
    <section
      className="history-summary"
      aria-label="Selected date repair summary"
      aria-busy={unavailable}
    >
      <div className="summary-heading">
        <h3>{dateLabel}</h3>
        <span>Day at a glance</span>
      </div>
      <div className="stats-grid history-counts">
        <div className="stat-card stat-total">
          <span>Total repairs</span>
          <strong>{unavailable ? "—" : repairs.length}</strong>
        </div>
        {(
          ["Completed", "Working On", "Testing", "On Hold", "Failed / Escalated"] as RepairStatus[]
        ).map((status) => {
          const tone =
            status === "Failed / Escalated" ? "failed" : status.toLowerCase().replace(/ /g, "-");
          return (
            <div className={`stat-card stat-${tone}`} key={status}>
              <span>{status}</span>
              <strong>
                {unavailable ? "—" : repairs.filter((repair) => repair.status === status).length}
              </strong>
            </div>
          );
        })}
      </div>
      <div className="history-time-stats">
        <div className="stat-card">
          <span>Total hands-on time</span>
          <strong>{unavailable ? "—" : duration(totalSeconds)}</strong>
          <p>All repairs from this date{hasRunningTimer ? " · includes running timers" : ""}</p>
        </div>
        <div className="stat-card">
          <span>Average per completed repair</span>
          <strong>{unavailable || averageSeconds === null ? "—" : duration(averageSeconds)}</strong>
          <p>
            {completed.length
              ? `Across ${completed.length} completed ${completed.length === 1 ? "repair" : "repairs"} (untimed included)`
              : "No completed repairs yet"}
          </p>
        </div>
      </div>
      <p className="summary-note">
        Current statuses · lifetime time, including later work · totals ignore list filters.
      </p>
    </section>
  );
}

function StatCard({
  label,
  value,
  unavailable,
}: {
  label: string;
  value: number;
  unavailable: boolean;
}) {
  const tone =
    label === "Total today"
      ? "total"
      : label === "Failed / Escalated"
        ? "failed"
        : label.toLowerCase().replace(/ /g, "-");
  return (
    <div className={`stat-card stat-${tone}`}>
      <span>{label}</span>
      <strong>{unavailable ? "—" : String(value).padStart(2, "0")}</strong>
      <span className="stat-caption">
        {label === "Total today" ? "Created today" : "Current status · today"}
      </span>
    </div>
  );
}
function StatusBadge({ status }: { status: RepairStatus }) {
  const className =
    status === "Failed / Escalated" ? "failed" : status.toLowerCase().replace(/ /g, "-");
  const symbol = {
    "Working On": "◐",
    Testing: "◷",
    Completed: "✓",
    "On Hold": "Ⅱ",
    "Failed / Escalated": "!",
  }[status];
  return (
    <span className={`status-badge status-${className}`}>
      <span className="status-symbol" aria-hidden="true">
        {symbol}
      </span>
      {status}
    </span>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    Dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    History: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    robot: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="8" r="2" />
        <path d="M7 16h10" />
      </>
    ),
    dock: (
      <>
        <path d="M6 18V4h12v14M4 18h16v3H4zM9 7h6M9 10h6M10 15h4" />
      </>
    ),
    bench: (
      <>
        <path d="M4 8h16v9H4zM7 17v3m10-3v3M8 8V4h8v4M4 12h16" />
        <path d="M10 12v2h4v-2" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export default App;
