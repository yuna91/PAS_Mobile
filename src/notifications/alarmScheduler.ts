// Alarm firing via expo-notifications. Each enabled alarm becomes one
// scheduled local notification; Expo handles all five recurrence types
// natively (once/daily/weekly/monthly/yearly), so the app doesn't need a
// polling loop. We reconcile the scheduled set whenever the alarm list
// changes (no-op if nothing relevant changed).

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Alarm } from "../domain/types";
import { fmt12, parseKey } from "../domain/util";

const CHANNEL_ID = "alarms";

// Foreground presentation: still show the banner + play sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function initNotifications(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Alarms",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  return granted;
}

/** Build the Expo trigger for an alarm's recurrence. */
function triggerFor(a: Alarm): Notifications.NotificationTriggerInput | null {
  const [h, m] = a.time.split(":").map(Number);
  const T = Notifications.SchedulableTriggerInputTypes;

  switch (a.occurs) {
    case "once": {
      const d = parseKey(a.date);
      d.setHours(h, m, 0, 0);
      if (d.getTime() <= Date.now()) return null; // past one-time: skip
      return { type: T.DATE, date: d, channelId: CHANNEL_ID };
    }
    case "daily":
      return { type: T.DAILY, hour: h, minute: m, channelId: CHANNEL_ID };
    case "weekly": {
      const wd = parseKey(a.date).getDay(); // 0=Sun..6=Sat
      return {
        type: T.WEEKLY,
        weekday: wd + 1, // Expo: 1=Sun..7=Sat
        hour: h,
        minute: m,
        channelId: CHANNEL_ID,
      };
    }
    case "monthly":
      return {
        type: T.MONTHLY,
        day: parseKey(a.date).getDate(),
        hour: h,
        minute: m,
        channelId: CHANNEL_ID,
      };
    case "yearly": {
      const d = parseKey(a.date);
      return {
        type: T.YEARLY,
        day: d.getDate(),
        month: d.getMonth() + 1, // Expo: 1=Jan..12=Dec
        hour: h,
        minute: m,
        channelId: CHANNEL_ID,
      };
    }
  }
}

// Track the last scheduled signature so reconcile is cheap on no-ops.
let lastSig = "";

function signature(alarms: Alarm[]): string {
  return alarms
    .filter((a) => a.enabled && !a.deleted)
    .map((a) => `${a.id}:${a.time}:${a.date}:${a.occurs}`)
    .sort()
    .join("|");
}

/**
 * Cancel everything and reschedule from the current enabled alarms.
 * Cheap to call often — returns early when the alarm set is unchanged.
 */
export async function reconcileAlarms(alarms: Alarm[]): Promise<void> {
  const sig = signature(alarms);
  if (sig === lastSig) return;
  lastSig = sig;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const a of alarms) {
    if (!a.enabled || a.deleted) continue;
    const trigger = triggerFor(a);
    if (!trigger) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: a.id,
        content: {
          title: a.label || "Alarm",
          body: fmt12(a.time),
          sound: "default",
        },
        trigger,
      });
    } catch (e) {
      console.error("scheduleNotification failed", a.id, e);
    }
  }
}

/** Force a reschedule on next reconcile (e.g. after a sync merge). */
export function invalidateAlarmSchedule(): void {
  lastSig = "";
}
