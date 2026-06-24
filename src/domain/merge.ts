// Last-write-wins merge for the syncable Dataset.
//
// The same algorithm runs on both desktop (Rust) and mobile (here). For each
// record we keep whichever side has the greater `updatedAt`. Tombstones
// (`deleted: true`) are just records with a timestamp, so a delete propagates
// iff it is newer than the competing edit. Ties keep the local side.

import { Dataset, emptyDataset } from "./types";

interface Stamped {
  updatedAt: number;
}

function pickNewer<T extends Stamped>(local: T | undefined, remote: T | undefined): T | undefined {
  if (!local) return remote;
  if (!remote) return local;
  // strictly-greater keeps local on ties (local is authoritative for "now")
  return remote.updatedAt > local.updatedAt ? remote : local;
}

function mergeMap<T extends Stamped>(
  local: Record<string, T>,
  remote: Record<string, T>
): Record<string, T> {
  const out: Record<string, T> = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    const winner = pickNewer(local[k], remote[k]);
    if (winner) out[k] = winner;
  }
  return out;
}

/** Merge two datasets into one (order-independent, idempotent). */
export function mergeDatasets(local: Dataset, remote: Dataset): Dataset {
  const a = local ?? emptyDataset();
  const b = remote ?? emptyDataset();
  return {
    plans: mergeMap(a.plans, b.plans),
    schedules: mergeMap(a.schedules, b.schedules),
    alarms: mergeMap(a.alarms, b.alarms),
  };
}

/**
 * Drop tombstones older than `maxAgeMs` so deleted records don't accumulate
 * forever. A tombstone must outlive the chance that a stale peer still holds
 * the original; default 90 days is comfortably safe for home LAN sync.
 */
export function pruneTombstones(ds: Dataset, maxAgeMs = 90 * 24 * 60 * 60 * 1000): Dataset {
  const cutoff = Date.now() - maxAgeMs;
  const prune = <T extends { deleted?: boolean; updatedAt: number }>(
    m: Record<string, T>
  ): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(m)) {
      if (v.deleted && v.updatedAt < cutoff) continue;
      out[k] = v;
    }
    return out;
  };
  return {
    plans: prune(ds.plans),
    schedules: prune(ds.schedules),
    alarms: prune(ds.alarms),
  };
}
