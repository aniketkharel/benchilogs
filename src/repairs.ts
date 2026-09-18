import { invoke, isTauri } from "@tauri-apps/api/core";

export const statusOptions = [
  "Working On",
  "Testing",
  "Completed",
  "On Hold",
  "Failed / Escalated",
] as const;
export type RepairStatus = (typeof statusOptions)[number];
export type RepairInput = {
  ticket: string;
  brand: string;
  model: string;
  fault: string;
  diagnosis: string;
  workPerformed: string;
  parts: string;
  status: RepairStatus;
  notes: string;
  robotDeepCleaned: boolean;
  dockDeepCleaned: boolean;
};
export type Repair = RepairInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
  elapsedSeconds: number;
  timerStartedAt: number | null;
};
export const emptyRepair = (): RepairInput => ({
  ticket: "",
  brand: "Roborock",
  model: "",
  fault: "",
  diagnosis: "",
  workPerformed: "",
  parts: "",
  status: "Working On",
  notes: "",
  robotDeepCleaned: false,
  dockDeepCleaned: false,
});
function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject(
      new Error("Open the desktop app with bun run tauri dev to access local SQLite storage."),
    );
  return invoke<T>(name, args);
}
export const repairStore = {
  list: () => command<Repair[]>("list_repairs"),
  create: (input: RepairInput) => command<Repair>("create_repair", { input }),
  update: (id: number, input: RepairInput) => command<Repair>("update_repair", { id, input }),
  delete: (id: number) => command<void>("delete_repair", { id }),
  timer: (id: number, running: boolean) => command<Repair>("set_repair_timer", { id, running }),
};
export function sortRepairs(repairs: Repair[]) {
  return [...repairs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
}
export function createdToday(repair: Repair, today: string) {
  return new Date(repair.createdAt).toDateString() === today;
}

// Plain text suitable for a ticket comment; only saved fields are included.
export function repairSummary(repair: Repair): string {
  const seconds =
    repair.elapsedSeconds +
    (repair.timerStartedAt === null
      ? 0
      : Math.max(0, Math.floor(Date.now() / 1000) - repair.timerStartedAt));
  const duration = `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m ${String(seconds % 60).padStart(2, "0")}s`;
  const sections = [
    `Job #${repair.ticket}`,
    `Device: ${[repair.brand, repair.model].filter(Boolean).join(" ")}\nStatus: ${repair.status}`,
  ];
  for (const [label, value] of [
    ["Fault / symptom", repair.fault],
    ["Diagnosis", repair.diagnosis],
    ["Work performed", repair.workPerformed],
    ["Parts used", repair.parts],
  ]) {
    if (value.trim()) sections.push(`${label}:\n${value.trim()}`);
  }
  const cleaned = [
    repair.robotDeepCleaned ? "Robot" : "",
    repair.dockDeepCleaned ? "Dock" : "",
  ].filter(Boolean);
  sections.push(
    [
      ...(cleaned.length ? [`Deep cleaned: ${cleaned.join(" and ")}`] : []),
      `Time spent: ${duration}`,
    ].join("\n"),
  );
  if (repair.notes.trim()) sections.push(`Notes:\n${repair.notes.trim()}`);
  return sections.join("\n\n");
}
