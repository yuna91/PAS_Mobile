// In-memory store over the syncable Dataset, with React reactivity via
// useSyncExternalStore. Mirrors the desktop store's per-date accessors but
// every mutation stamps `updatedAt` and writes tombstones on delete so the
// LAN sync merge is lossless.

import { useSyncExternalStore } from "react";
import { Alarm, Dataset, PlanItem, emptyDataset } from "../domain/types";
import { mergeDatasets, pruneTombstones } from "../domain/merge";
import { dateKey, parseKey } from "../domain/util";
import { loadDataset, saveDataset, saveDatasetNow } from "../storage/asyncStore";

class Store {
  private ds: Dataset = emptyDataset();
  private version = 0;
  private listeners = new Set<() => void>();
  loaded = false;

  /** Currently selected date key, shared by Plan & Schedule. */
  selectedKey: string = dateKey(new Date());

  async load() {
    this.ds = await loadDataset();
    this.loaded = true;
    this.bump();
  }

  // ---- React subscription (useSyncExternalStore) ----
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;

  private bump() {
    this.version++;
    this.listeners.forEach((f) => f());
  }
  private commit() {
    saveDataset(this.ds);
    this.bump();
  }

  // ---- selected date ----
  get selected(): Date {
    return parseKey(this.selectedKey);
  }
  setSelected(d: Date) {
    this.selectedKey = dateKey(d);
    this.bump(); // selection is UI-only, not persisted to the dataset
  }

  // ---- Plans (per selected date by default) ----
  getPlan(key = this.selectedKey): PlanItem[] {
    const e = this.ds.plans[key];
    if (!e || e.deleted) return [];
    return e.items;
  }
  setPlan(items: PlanItem[], key = this.selectedKey) {
    const cleaned = items.filter((i) => i.text.trim() !== "");
    if (cleaned.length === 0) {
      // tombstone the date if it had data, else nothing to do
      if (this.ds.plans[key] && !this.ds.plans[key].deleted) {
        this.ds.plans[key] = { items: [], updatedAt: Date.now(), deleted: true };
        this.commit();
      }
      return;
    }
    this.ds.plans[key] = { items: cleaned, updatedAt: Date.now() };
    this.commit();
  }

  // ---- Schedules ----
  getSchedule(key = this.selectedKey): string {
    const e = this.ds.schedules[key];
    if (!e || e.deleted) return "";
    return e.text;
  }
  setSchedule(text: string, key = this.selectedKey) {
    if (text.trim() === "") {
      if (this.ds.schedules[key] && !this.ds.schedules[key].deleted) {
        this.ds.schedules[key] = { text: "", updatedAt: Date.now(), deleted: true };
        this.commit();
      }
      return;
    }
    this.ds.schedules[key] = { text, updatedAt: Date.now() };
    this.commit();
  }

  /** Does a given date have any (non-deleted) plan or schedule data? */
  hasData(d: Date): boolean {
    const k = dateKey(d);
    const p = this.ds.plans[k];
    const s = this.ds.schedules[k];
    const hasPlan = !!p && !p.deleted && p.items.length > 0;
    const hasSched = !!s && !s.deleted && s.text.trim().length > 0;
    return hasPlan || hasSched;
  }

  // ---- Alarms ----
  getAlarms(): Alarm[] {
    return Object.values(this.ds.alarms)
      .filter((a) => !a.deleted)
      .sort((a, b) => a.time.localeCompare(b.time));
  }
  getAlarm(id: string): Alarm | undefined {
    const a = this.ds.alarms[id];
    return a && !a.deleted ? a : undefined;
  }
  upsertAlarm(a: Alarm) {
    this.ds.alarms[a.id] = { ...a, updatedAt: Date.now() };
    this.commit();
  }
  setAlarmEnabled(id: string, enabled: boolean) {
    const a = this.ds.alarms[id];
    if (!a) return;
    this.ds.alarms[id] = { ...a, enabled, updatedAt: Date.now() };
    this.commit();
  }
  /** Mark fired (records lastFired; one-time alarms disarm). */
  markFired(id: string, firedKey: string) {
    const a = this.ds.alarms[id];
    if (!a) return;
    this.ds.alarms[id] = {
      ...a,
      lastFired: firedKey,
      enabled: a.occurs === "once" ? false : a.enabled,
      updatedAt: Date.now(),
    };
    this.commit();
  }
  deleteAlarm(id: string) {
    const a = this.ds.alarms[id];
    if (!a) return;
    this.ds.alarms[id] = { ...a, deleted: true, updatedAt: Date.now() };
    this.commit();
  }

  // ---- Sync ----
  /** Snapshot for sending to a peer. */
  exportDataset(): Dataset {
    return this.ds;
  }
  /** Merge a peer dataset in, persist immediately, return the merged result. */
  async importMerged(remote: Dataset): Promise<Dataset> {
    this.ds = pruneTombstones(mergeDatasets(this.ds, remote));
    await saveDatasetNow(this.ds);
    this.bump();
    return this.ds;
  }
}

export const store = new Store();

// ---- React hooks ----

/** Re-render on any store change; returns the store for imperative calls. */
export function useStore(): Store {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
