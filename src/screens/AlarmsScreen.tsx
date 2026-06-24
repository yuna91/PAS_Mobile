// Alarms page: global alarm list (enable toggle, delete) + add/edit modal
// with occurrence, time, date, and label. Saving a one-time alarm in the
// past is blocked, matching desktop PAS.

import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useStore } from "../state/store";
import { Alarm, Occurs } from "../domain/types";
import { dateKey, fmt12, parseKey, pad, uid } from "../domain/util";
import { colors, radius, space } from "../theme";

const OCCURS: { value: Occurs; label: string }[] = [
  { value: "once", label: "One time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function occursLabel(o: Occurs): string {
  return OCCURS.find((x) => x.value === o)?.label ?? o;
}

function metaText(a: Alarm): string {
  if (a.occurs !== "once") return occursLabel(a.occurs);
  if (a.date === dateKey(new Date())) return "Today";
  return parseKey(a.date).toLocaleDateString();
}

export function AlarmsScreen() {
  const store = useStore();
  const alarms = store.getAlarms();
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [showModal, setShowModal] = useState(false);

  const openNew = () => {
    const now = new Date();
    setEditing({
      id: uid(),
      label: `Alarm ${alarms.length + 1}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      date: dateKey(now),
      occurs: "once",
      enabled: true,
      updatedAt: Date.now(),
    });
    setShowModal(true);
  };

  const openEdit = (a: Alarm) => {
    setEditing({ ...a });
    setShowModal(true);
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Alarms</Text>
        <Pressable hitSlop={8} style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>＋</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {alarms.length === 0 && (
          <Text style={styles.empty}>No alarms. Tap ＋ to add one.</Text>
        )}
        {alarms.map((a) => (
          <Pressable
            key={a.id}
            style={[styles.item, !a.enabled && styles.itemOff]}
            onPress={() => openEdit(a)}
          >
            <Switch
              value={a.enabled}
              onValueChange={(v) => store.setAlarmEnabled(a.id, v)}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#fff"
            />
            <View style={styles.itemMain}>
              <Text style={styles.itemTime}>{fmt12(a.time)}</Text>
              <Text style={styles.itemMeta}>
                {(a.label || "Alarm") + " · " + metaText(a)}
              </Text>
            </View>
            <Pressable hitSlop={8} onPress={() => store.deleteAlarm(a.id)}>
              <Text style={styles.del}>🗑</Text>
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>

      {showModal && editing && (
        <AlarmModal
          initial={editing}
          onCancel={() => setShowModal(false)}
          onSave={(a) => {
            store.upsertAlarm(a);
            setShowModal(false);
          }}
        />
      )}
    </View>
  );
}

function AlarmModal({
  initial,
  onCancel,
  onSave,
}: {
  initial: Alarm;
  onCancel: () => void;
  onSave: (a: Alarm) => void;
}) {
  const [draft, setDraft] = useState<Alarm>(initial);
  const [picker, setPicker] = useState<"time" | "date" | null>(null);

  const isPast = (() => {
    if (draft.occurs !== "once") return false;
    const [h, m] = draft.time.split(":").map(Number);
    const dt = parseKey(draft.date);
    dt.setHours(h, m, 0, 0);
    return dt.getTime() < Date.now();
  })();

  const timeAsDate = (() => {
    const [h, m] = draft.time.split(":").map(Number);
    const d = parseKey(draft.date);
    d.setHours(h, m, 0, 0);
    return d;
  })();

  const save = () => {
    if (isPast) return;
    onSave({ ...draft, lastFired: undefined, enabled: true });
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>
            {fmt12(draft.time)} · {parseKey(draft.date).toLocaleDateString()}
          </Text>

          {/* Occurs */}
          <Text style={styles.legend}>Occurs</Text>
          <View style={styles.occursRow}>
            {OCCURS.map((o) => (
              <Pressable
                key={o.value}
                style={[
                  styles.chip,
                  draft.occurs === o.value && styles.chipOn,
                ]}
                onPress={() => setDraft({ ...draft, occurs: o.value })}
              >
                <Text
                  style={[
                    styles.chipText,
                    draft.occurs === o.value && styles.chipTextOn,
                  ]}
                >
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Time + Date */}
          <View style={styles.pickRow}>
            <Pressable style={styles.pickBtn} onPress={() => setPicker("time")}>
              <Text style={styles.pickLabel}>Time</Text>
              <Text style={styles.pickValue}>{fmt12(draft.time)}</Text>
            </Pressable>
            <Pressable style={styles.pickBtn} onPress={() => setPicker("date")}>
              <Text style={styles.pickLabel}>Date</Text>
              <Text style={styles.pickValue}>
                {parseKey(draft.date).toLocaleDateString()}
              </Text>
            </Pressable>
          </View>

          {picker === "time" && (
            <DateTimePicker
              mode="time"
              value={timeAsDate}
              onChange={(_e, d) => {
                setPicker(Platform.OS === "ios" ? "time" : null);
                if (d)
                  setDraft({
                    ...draft,
                    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
                  });
              }}
            />
          )}
          {picker === "date" && (
            <DateTimePicker
              mode="date"
              value={parseKey(draft.date)}
              onChange={(_e, d) => {
                setPicker(Platform.OS === "ios" ? "date" : null);
                if (d) setDraft({ ...draft, date: dateKey(d) });
              }}
            />
          )}

          {/* Label */}
          <Text style={styles.legend}>Label</Text>
          <TextInput
            style={styles.labelInput}
            value={draft.label}
            onChangeText={(t) => setDraft({ ...draft, label: t })}
            placeholder="Alarm"
            placeholderTextColor={colors.textDim}
          />

          {isPast && (
            <Text style={styles.warn}>
              ⚠ Date/time is in the past — choose a future time
            </Text>
          )}

          <View style={styles.modalFoot}>
            <Pressable style={styles.btn} onPress={onCancel}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, isPast && styles.btnDisabled]}
              disabled={isPast}
              onPress={save}
            >
              <Text style={styles.btnTextPrimary}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 20, lineHeight: 22 },
  body: { padding: space.md, gap: space.sm },
  empty: { color: colors.textDim, textAlign: "center", marginVertical: space.lg },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
  },
  itemOff: { opacity: 0.5 },
  itemMain: { flex: 1 },
  itemTime: { color: colors.text, fontSize: 20, fontWeight: "700" },
  itemMeta: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  del: { fontSize: 16 },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: space.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: space.sm,
  },
  legend: { color: colors.textDim, fontSize: 12, marginTop: space.sm },
  occursRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 13 },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  pickRow: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  pickBtn: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: space.md,
  },
  pickLabel: { color: colors.textDim, fontSize: 12 },
  pickValue: { color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 2 },
  labelInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    fontSize: 15,
  },
  warn: { color: colors.danger, fontSize: 13, marginTop: space.sm },
  modalFoot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.sm,
    marginTop: space.md,
  },
  btn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.text, fontWeight: "600" },
  btnTextPrimary: { color: "#fff", fontWeight: "700" },
});
