// Page header with a tap-to-toggle dropdown month calendar, shared by the
// Plan and Schedule screens. Mirrors the desktop calendar: today in red,
// selected highlighted, a dot under dates that have data, month nav + Today.

import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useStore } from "../state/store";
import { addDays, addMonths, monthName, sameDay } from "../domain/util";
import { colors, radius, space } from "../theme";

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function fmtSelected(d: Date): string {
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${wd}, ${monthName(d.getMonth())} ${d.getDate()}, ${d.getFullYear()}`;
}

export function CalendarDropdown() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(store.selected.getFullYear(), store.selected.getMonth(), 1)
  );

  const selected = store.selected;
  const today = new Date();

  // keep the visible month following the selected date when reopened
  const openCalendar = () => {
    setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setOpen(true);
  };

  const cells = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // 0 = Monday
    const start = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    // store.getVersion via useStore re-renders; viewMonth drives the grid
  }, [viewMonth]);

  const select = (d: Date) => {
    store.setSelected(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setOpen(false);
  };

  // Step one day without closing the calendar; keep the visible month in sync.
  const step = (n: number) => {
    const d = addDays(selected, n);
    store.setSelected(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Pressable hitSlop={10} onPress={() => step(-1)}>
          <Text style={styles.nav}>‹</Text>
        </Pressable>
        <Pressable onPress={() => (open ? setOpen(false) : openCalendar())}>
          <View style={styles.dateChip}>
            <Text style={styles.dateText}>{fmtSelected(selected)}</Text>
            <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
          </View>
        </Pressable>
        <Pressable hitSlop={10} onPress={() => step(1)}>
          <Text style={styles.nav}>›</Text>
        </Pressable>
      </View>

      {open && (
        <View style={styles.panel}>
          <View style={styles.monthRow}>
            <Pressable
              hitSlop={10}
              onPress={() => setViewMonth(addMonths(viewMonth, -1))}
            >
              <Text style={styles.nav}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>
              {monthName(viewMonth.getMonth())} {viewMonth.getFullYear()}
            </Text>
            <Pressable
              hitSlop={10}
              onPress={() => setViewMonth(addMonths(viewMonth, 1))}
            >
              <Text style={styles.nav}>›</Text>
            </Pressable>
          </View>

          <View style={styles.grid}>
            {DOW.map((d) => (
              <View key={d} style={styles.cell}>
                <Text style={styles.dow}>{d}</Text>
              </View>
            ))}
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const isToday = sameDay(d, today);
              const isSel = sameDay(d, selected);
              const hasData = store.hasData(d);
              return (
                <Pressable key={i} style={styles.cell} onPress={() => select(d)}>
                  <View style={[styles.numWrap, isSel && styles.numWrapSel]}>
                    <Text
                      style={[
                        styles.num,
                        !inMonth && styles.numOther,
                        isToday && styles.numToday,
                        isSel && styles.numSel,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                  {hasData && <View style={[styles.dot, isSel && styles.dotSel]} />}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable hitSlop={10} onPress={() => select(addDays(selected, -1))}>
              <Text style={styles.nav}>‹</Text>
            </Pressable>
            <Pressable
              style={styles.todayBtn}
              onPress={() => select(new Date())}
            >
              <Text style={styles.todayBtnText}>Today</Text>
            </Pressable>
            <Pressable hitSlop={10} onPress={() => select(addDays(selected, 1))}>
              <Text style={styles.nav}>›</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.md,
  },
  dateText: { color: colors.text, fontSize: 13 },
  chevron: { color: colors.textDim, fontSize: 10 },

  panel: { paddingHorizontal: space.md, paddingBottom: space.md },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  monthLabel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  nav: { color: colors.text, fontSize: 24, paddingHorizontal: space.md },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: CELL as any,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  numWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  numWrapSel: { backgroundColor: colors.selected },
  dow: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  num: { color: colors.text, fontSize: 14 },
  numOther: { color: colors.textDim, opacity: 0.5 },
  numToday: { color: colors.today, fontWeight: "800" },
  numSel: { color: "#fff", fontWeight: "800" },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.dot,
    marginTop: 2,
  },
  dotSel: { backgroundColor: "#fff" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    marginTop: space.sm,
  },
  todayBtn: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs + 2,
    borderRadius: radius.md,
  },
  todayBtnText: { color: colors.text, fontWeight: "600" },
});
