// Auto-sync engine: keeps the paired desktop and this phone converged with no
// button presses, while the app is foregrounded.
//
//   • desktop → phone: a long-poll loop (GET /sync/wait) that parks on the
//     desktop until its data changes, then merges it in — near-instant, and
//     ~zero traffic while nothing changes.
//   • phone → desktop: a debounced push (POST /sync) a moment after any local
//     edit; the desktop merges and its UI updates live.
//
// Everything stops when the app backgrounds (mobile OSes won't reliably run
// network loops in the background anyway) and resumes on foreground.

import { AppState, AppStateStatus } from "react-native";
import { getPeer, syncNow, waitForChange } from "./syncClient";
import { store } from "../state/store";

const PUSH_DEBOUNCE_MS = 1200; // coalesce a burst of edits into one push
const WAIT_TIMEOUT_MS = 35000; // client cap, above the server's 25s hold
const ERROR_BACKOFF_MS = 3000; // desktop offline / unreachable
const UNPAIRED_BACKOFF_MS = 2000; // not paired yet (or just unpaired)

let started = false;
let active = false; // app is foregrounded
let lastVersion = 0; // highest desktop data version we've applied
let waitLooping = false;
let waitCtrl: AbortController | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubLocal: (() => void) | null = null;
let appSub: { remove: () => void } | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function pushSoon() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void doPush();
  }, PUSH_DEBOUNCE_MS);
}

async function doPush() {
  if (!active) return;
  const r = await syncNow();
  if (r.ok && typeof r.version === "number") lastVersion = r.version;
}

async function waitLoop() {
  if (waitLooping) return;
  waitLooping = true;
  try {
    while (started && active) {
      if (!(await getPeer())) {
        await sleep(UNPAIRED_BACKOFF_MS);
        continue;
      }
      waitCtrl = new AbortController();
      const to = setTimeout(() => waitCtrl?.abort(), WAIT_TIMEOUT_MS);
      const r = await waitForChange(lastVersion, waitCtrl.signal);
      clearTimeout(to);
      waitCtrl = null;

      if (!started || !active) break;
      if (r.ok) {
        if (typeof r.version === "number") lastVersion = r.version;
        // re-arm immediately (changed data was already merged in)
      } else if (r.error === "aborted") {
        // a timeout/background abort — just loop (guards above will exit)
      } else {
        await sleep(ERROR_BACKOFF_MS);
      }
    }
  } finally {
    waitLooping = false;
  }
}

async function goActive() {
  if (active) return;
  active = true;
  await doPush(); // flush any pending local edits + learn current version
  void waitLoop(); // then stream desktop changes
}

function goInactive() {
  active = false;
  waitCtrl?.abort();
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

function onAppState(s: AppStateStatus) {
  if (s === "active") void goActive();
  else goInactive();
}

/** Begin auto-syncing. Safe to call once after the store has loaded. */
export function startAutoSync() {
  if (started) return;
  started = true;
  unsubLocal = store.subscribeLocal(pushSoon);
  appSub = AppState.addEventListener("change", onAppState);
  if (AppState.currentState === "active") void goActive();
}

/** Tear everything down (e.g. on app unmount). */
export function stopAutoSync() {
  started = false;
  goInactive();
  unsubLocal?.();
  unsubLocal = null;
  appSub?.remove();
  appSub = null;
}

/** Nudge a sync right after a fresh pairing so streaming starts at once. */
export function nudgeAutoSync() {
  lastVersion = 0;
  if (started && active) void doPush();
}
