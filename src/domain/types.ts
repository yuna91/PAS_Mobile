// Core data models + the merge-friendly dataset shape shared with desktop PAS.
//
// Every syncable record carries `updatedAt` (epoch ms) and an optional
// `deleted` tombstone so two-way LAN sync can do last-write-wins merging
// without losing edits or "resurrecting" deletions.

export interface PlanItem {
  id: string;
  text: string;
  done: boolean;
}

export type Occurs = "once" | "daily" | "weekly" | "monthly" | "yearly";

export interface Alarm {
  id: string;
  label: string;
  time: string; // "HH:MM" 24h
  date: string; // "YYYY-MM-DD"
  occurs: Occurs;
  enabled: boolean;
  lastFired?: string; // ISO/minute key of last fire to avoid double-firing
  updatedAt: number; // epoch ms — for merge
  deleted?: boolean; // tombstone
}

/** Per-date plan list, wrapped with merge metadata. */
export interface PlanEntry {
  items: PlanItem[];
  updatedAt: number;
  deleted?: boolean;
}

/** Per-date free-text schedule, wrapped with merge metadata. */
export interface ScheduleEntry {
  text: string;
  updatedAt: number;
  deleted?: boolean;
}

/**
 * The full syncable dataset. This is also the on-the-wire format for
 * POST /sync between desktop and mobile. Alarms are keyed by id (not an
 * array) so the merge is a simple per-key last-write-wins union.
 */
export interface Dataset {
  plans: Record<string, PlanEntry>; // key = dateKey "YYYY-MM-DD"
  schedules: Record<string, ScheduleEntry>; // key = dateKey
  alarms: Record<string, Alarm>; // key = alarm id
}

export function emptyDataset(): Dataset {
  return { plans: {}, schedules: {}, alarms: {} };
}
