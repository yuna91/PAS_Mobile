// Plan page: per-date checklist. Add, edit inline, check (strike-through),
// delete, and reorder with up/down. Reads/writes the selected date via the
// store; keeps a local editable copy so typing doesn't lose focus.

import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CalendarDropdown } from "../components/CalendarDropdown";
import { useStore } from "../state/store";
import { PlanItem } from "../domain/types";
import { uid } from "../domain/util";
import { colors, radius, space } from "../theme";

export function PlanScreen() {
  const store = useStore();
  const key = store.selectedKey;

  const [items, setItems] = useState<PlanItem[]>(() => store.getPlan());
  const [draft, setDraft] = useState("");

  // reload the editable copy whenever the selected date changes
  useEffect(() => {
    setItems(store.getPlan(key));
    setDraft("");
  }, [key]);

  const commit = (next: PlanItem[]) => {
    setItems(next);
    store.setPlan(next, key);
  };

  const addDraft = () => {
    const text = draft.trim();
    if (!text) return;
    commit([...items, { id: uid(), text, done: false }]);
    setDraft("");
  };

  const update = (id: string, patch: Partial<PlanItem>) =>
    commit(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id: string) => commit(items.filter((it) => it.id !== id));

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    commit(next);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <CalendarDropdown title="Plan" />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {items.length === 0 && (
          <Text style={styles.empty}>No plan items yet. Add one below.</Text>
        )}

        {items.map((it, idx) => (
          <View key={it.id} style={styles.row}>
            <Pressable
              hitSlop={6}
              style={[styles.check, it.done && styles.checkOn]}
              onPress={() => update(it.id, { done: !it.done })}
            >
              {it.done && <Text style={styles.checkMark}>✓</Text>}
            </Pressable>

            <TextInput
              style={[styles.input, it.done && styles.inputDone]}
              value={it.text}
              multiline
              placeholder="Plan item…"
              placeholderTextColor={colors.textDim}
              onChangeText={(t) => update(it.id, { text: t })}
            />

            <View style={styles.rowBtns}>
              <Pressable hitSlop={6} onPress={() => move(idx, -1)}>
                <Text style={styles.moveBtn}>▲</Text>
              </Pressable>
              <Pressable hitSlop={6} onPress={() => move(idx, 1)}>
                <Text style={styles.moveBtn}>▼</Text>
              </Pressable>
              <Pressable hitSlop={6} onPress={() => remove(it.id)}>
                <Text style={styles.delBtn}>🗑</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* add row */}
        <View style={styles.row}>
          <View style={[styles.check, styles.checkGhost]} />
          <TextInput
            style={styles.input}
            value={draft}
            placeholder="Add a plan item…"
            placeholderTextColor={colors.textDim}
            onChangeText={setDraft}
            onSubmitEditing={addDraft}
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <Pressable hitSlop={6} style={styles.addBtn} onPress={addDraft}>
            <Text style={styles.addBtnText}>＋</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.md, gap: space.sm },
  empty: { color: colors.textDim, textAlign: "center", marginVertical: space.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.accent },
  checkGhost: { borderColor: colors.border, opacity: 0.4 },
  checkMark: { color: "#fff", fontSize: 14, fontWeight: "800" },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 2 },
  inputDone: { textDecorationLine: "line-through", color: colors.textDim },
  rowBtns: { flexDirection: "row", alignItems: "center", gap: space.sm },
  moveBtn: { color: colors.textDim, fontSize: 12 },
  delBtn: { fontSize: 15 },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 18, lineHeight: 20 },
});
