// LAN sync client. Pairs once with the desktop PAS sync server (URL + token,
// typically scanned from a QR code) and syncs by POSTing our Dataset to
// /sync; the desktop merges both sides and returns the merged result, which
// we merge back in locally (idempotent).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dataset } from "../domain/types";
import { store } from "../state/store";
import { invalidateAlarmSchedule, reconcileAlarms } from "../notifications/alarmScheduler";

const PEER_KEY = "pas.sync.peer.v1";

export interface Peer {
  url: string; // e.g. "http://192.168.1.42:8787"
  token: string; // shared secret from pairing
  lastSyncedAt?: number;
}

export async function getPeer(): Promise<Peer | null> {
  try {
    const raw = await AsyncStorage.getItem(PEER_KEY);
    return raw ? (JSON.parse(raw) as Peer) : null;
  } catch {
    return null;
  }
}

async function setPeer(p: Peer | null): Promise<void> {
  if (p) await AsyncStorage.setItem(PEER_KEY, JSON.stringify(p));
  else await AsyncStorage.removeItem(PEER_KEY);
}

/** Parse a pairing payload from a scanned QR / manual entry. */
export function parsePairing(raw: string): Peer | null {
  const text = raw.trim();
  // JSON form: {"url":"http://...","token":"..."}
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj.url === "string" && typeof obj.token === "string") {
      return { url: stripSlash(obj.url), token: obj.token };
    }
  } catch {
    /* not JSON, try URL form */
  }
  // URL form: pas-sync://pair?url=<enc>&token=<enc>
  const m = text.match(/[?&]url=([^&]+).*?[?&]token=([^&]+)/);
  if (m) {
    return { url: stripSlash(decodeURIComponent(m[1])), token: decodeURIComponent(m[2]) };
  }
  return null;
}

function stripSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

export async function pair(peer: Peer): Promise<void> {
  await setPeer(peer);
}

export async function unpair(): Promise<void> {
  await setPeer(null);
}

export interface SyncResult {
  ok: boolean;
  error?: string;
  at: number;
  /** Desktop's data version after this sync (from the X-PAS-Version header). */
  version?: number;
}

export interface WaitResult {
  ok: boolean;
  error?: string;
  /** Desktop's data version observed; carry it into the next wait as `since`. */
  version?: number;
  /** True if desktop data changed and was merged in; false on server timeout. */
  changed: boolean;
}

// Serialize every store mutation that originates from sync so a concurrent
// push (POST) and pull (long-poll) can't compute their merges off the same
// snapshot and clobber each other.
let applyChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = applyChain.then(fn, fn);
  applyChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

/** Merge a remote dataset into the store and reconcile alarms. */
async function applyRemote(merged: Dataset): Promise<void> {
  await store.importMerged(merged);
  // alarm set may have changed via the merge → force reschedule
  invalidateAlarmSchedule();
  await reconcileAlarms(store.getAlarms());
}

function parseVersion(res: Response): number | undefined {
  const v = res.headers.get("X-PAS-Version");
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Run a full bidirectional sync round-trip with the paired desktop (push). */
export async function syncNow(timeoutMs = 8000): Promise<SyncResult> {
  const peer = await getPeer();
  if (!peer) return { ok: false, error: "Not paired", at: Date.now() };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${peer.url}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${peer.token}`,
      },
      body: JSON.stringify(store.exportDataset()),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Server ${res.status}`, at: Date.now() };
    }
    const version = parseVersion(res);
    const merged = (await res.json()) as Dataset;
    await serialize(() => applyRemote(merged));

    const at = Date.now();
    await setPeer({ ...peer, lastSyncedAt: at });
    return { ok: true, at, version };
  } catch (e: any) {
    const error =
      e?.name === "AbortError" ? "Timed out (is the desktop running on this Wi-Fi?)" : String(e?.message ?? e);
    return { ok: false, error, at: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Long-poll the desktop: resolves when its data changes past `since` (the
 * change is merged in locally and `changed` is true) or when the server times
 * out with no change (`changed` is false). The caller owns `signal` and is
 * responsible for an overall timeout; on abort this resolves with
 * `{ ok: false, error: "aborted" }`.
 */
export async function waitForChange(since: number, signal: AbortSignal): Promise<WaitResult> {
  const peer = await getPeer();
  if (!peer) return { ok: false, error: "Not paired", changed: false };
  try {
    const res = await fetch(`${peer.url}/sync/wait?since=${since}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${peer.token}` },
      signal,
    });
    if (res.status === 204) return { ok: true, changed: false, version: since };
    if (!res.ok) return { ok: false, error: `Server ${res.status}`, changed: false };
    const version = parseVersion(res);
    const merged = (await res.json()) as Dataset;
    await serialize(() => applyRemote(merged));
    return { ok: true, changed: true, version };
  } catch (e: any) {
    const error = e?.name === "AbortError" ? "aborted" : String(e?.message ?? e);
    return { ok: false, error, changed: false };
  }
}
