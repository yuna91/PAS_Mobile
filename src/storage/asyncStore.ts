// Local persistence for the whole Dataset as a single JSON blob in
// AsyncStorage. Mobile is standalone-local (no cloud); the LAN sync layer
// reads/writes the same Dataset in memory via the store.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dataset, emptyDataset } from "../domain/types";

const KEY = "pas.dataset.v1";

export async function loadDataset(): Promise<Dataset> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyDataset();
    const parsed = JSON.parse(raw) as Partial<Dataset>;
    return {
      plans: parsed.plans ?? {},
      schedules: parsed.schedules ?? {},
      alarms: parsed.alarms ?? {},
    };
  } catch (e) {
    console.error("loadDataset failed", e);
    return emptyDataset();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced save so rapid edits (typing) don't thrash storage. */
export function saveDataset(ds: Dataset): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(ds)).catch((e) =>
      console.error("saveDataset failed", e)
    );
  }, 250);
}

/** Immediate save (used before sync round-trips / backgrounding). */
export function saveDatasetNow(ds: Dataset): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(ds));
}
