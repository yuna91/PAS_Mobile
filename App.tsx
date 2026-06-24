// App shell: swipeable pager (Plan default → Schedule → Alarms) with a top
// tab bar, plus store load and alarm-notification reconciliation.

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import PagerView from "react-native-pager-view";

import { PlanScreen } from "./src/screens/PlanScreen";
import { ScheduleScreen } from "./src/screens/ScheduleScreen";
import { AlarmsScreen } from "./src/screens/AlarmsScreen";
import { store, useStore } from "./src/state/store";
import { initNotifications, reconcileAlarms } from "./src/notifications/alarmScheduler";
import { SyncModal } from "./src/components/SyncModal";
import { colors, space } from "./src/theme";

const TABS = ["Plan", "Schedule", "Alarms"];

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await store.load();
      await initNotifications();
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={[styles.flex, styles.center]}>
          <StatusBar style="light" />
          <Text style={styles.loading}>PAS</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <StatusBar style="light" />
        <Shell />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Shell() {
  const store = useStore();
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0); // start on Plan
  const [showSync, setShowSync] = useState(false);

  // keep scheduled notifications in sync with the alarm list (cheap no-op
  // when the alarm set hasn't changed)
  useEffect(() => {
    reconcileAlarms(store.getAlarms());
  });

  const goTo = (i: number) => {
    setPage(i);
    pagerRef.current?.setPage(i);
  };

  return (
    <View style={styles.flex}>
      {/* top tab bar */}
      <View style={styles.tabs}>
        {TABS.map((t, i) => (
          <Pressable key={t} style={styles.tab} onPress={() => goTo(i)}>
            <Text style={[styles.tabText, page === i && styles.tabTextOn]}>
              {t}
            </Text>
            <View style={[styles.tabBar, page === i && styles.tabBarOn]} />
          </Pressable>
        ))}
        <Pressable
          style={styles.syncBtn}
          hitSlop={8}
          onPress={() => setShowSync(true)}
        >
          <Text style={styles.syncIcon}>⟳</Text>
        </Pressable>
      </View>

      {showSync && <SyncModal onClose={() => setShowSync(false)} />}

      <PagerView
        ref={pagerRef}
        style={styles.flex}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        <View key="plan" style={styles.flex}>
          <PlanScreen />
        </View>
        <View key="schedule" style={styles.flex}>
          <ScheduleScreen />
        </View>
        <View key="alarms" style={styles.flex}>
          <AlarmsScreen />
        </View>
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  loading: { color: colors.accent, fontSize: 32, fontWeight: "800" },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, alignItems: "center", paddingTop: space.md },
  syncBtn: { paddingHorizontal: space.md, justifyContent: "center" },
  syncIcon: { color: colors.textDim, fontSize: 22 },
  tabText: { color: colors.textDim, fontSize: 15, fontWeight: "600" },
  tabTextOn: { color: colors.text },
  tabBar: {
    height: 3,
    width: "60%",
    marginTop: space.sm,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  tabBarOn: { backgroundColor: colors.accent },
});
