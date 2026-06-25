// Plan page: per-date checklist. Add, edit inline, check (strike-through),
// delete, and drag-to-reorder via a grip handle (PanResponder + Animated, no
// extra native deps). A drop line shows the target slot; the order commits on
// release — same interaction model as the desktop app.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  PanResponder,
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

  // drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const positions = useRef<{ y: number; h: number }[]>([]);
  const fromIndex = useRef(-1);
  const dropRef = useRef<number | null>(null);

  // refs so the (once-created) PanResponder handlers read current values
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    setItems(store.getPlan(key));
    setDraft("");
  }, [key]);

  const commit = useCallback((next: PlanItem[]) => {
    setItems(next);
    store.setPlan(next, keyRef.current);
  }, []);

  const addDraft = () => {
    const text = draft.trim();
    if (!text) return;
    commit([...items, { id: uid(), text, done: false }]);
    setDraft("");
  };

  const update = (id: string, patch: Partial<PlanItem>) =>
    commit(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id: string) => commit(items.filter((it) => it.id !== id));

  // ---- drag handlers (stable; read from refs) ----
  const onRowLayout = useCallback((index: number, y: number, h: number) => {
    positions.current[index] = { y, h };
  }, []);

  const handleDragStart = useCallback((id: string) => {
    const from = itemsRef.current.findIndex((i) => i.id === id);
    fromIndex.current = from;
    dropRef.current = from;
    dragY.setValue(0);
    setDragId(id);
    setDropIndex(from);
  }, []);

  const handleDragMove = useCallback((dy: number) => {
    dragY.setValue(dy);
    const from = fromIndex.current;
    const p = positions.current;
    if (from < 0 || !p[from]) return;
    const center = p[from].y + p[from].h / 2 + dy;
    let target = 0;
    for (let i = 0; i < itemsRef.current.length; i++) {
      const q = p[i];
      if (!q) continue;
      if (center > q.y + q.h / 2) target = i + 1;
    }
    if (target !== dropRef.current) {
      dropRef.current = target;
      setDropIndex(target);
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    const from = fromIndex.current;
    const target = dropRef.current;
    setDragId(null);
    setDropIndex(null);
    fromIndex.current = -1;
    dropRef.current = null;
    if (from < 0 || target == null) return;
    const insertAt = target > from ? target - 1 : target;
    if (insertAt === from) return;
    const arr = itemsRef.current.slice();
    const [moved] = arr.splice(from, 1);
    arr.splice(insertAt, 0, moved);
    commit(arr);
  }, [commit]);

  // top of the drop line for the current target slot
  const dropTop = (() => {
    if (dropIndex == null) return null;
    const p = positions.current;
    if (dropIndex < items.length && p[dropIndex]) return p[dropIndex].y;
    const last = p[items.length - 1];
    return last ? last.y + last.h : 0;
  })();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <CalendarDropdown />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={dragId === null}
      >
        <View style={styles.list}>
          {items.length === 0 && (
            <Text style={styles.empty}>No plan items yet. Add one below.</Text>
          )}

          {dragId !== null && dropTop !== null && (
            <View style={[styles.dropLine, { top: dropTop }]} pointerEvents="none" />
          )}

          {items.map((it, idx) => (
            <PlanRow
              key={it.id}
              item={it}
              index={idx}
              dragging={dragId === it.id}
              dragY={dragY}
              onLayout={onRowLayout}
              onChangeText={(t) => update(it.id, { text: t })}
              onToggle={() => update(it.id, { done: !it.done })}
              onDelete={() => remove(it.id)}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            />
          ))}
        </View>

        {/* add row */}
        <View style={styles.row}>
          <View style={[styles.grip, styles.gripGhost]} />
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

function PlanRow({
  item,
  index,
  dragging,
  dragY,
  onLayout,
  onChangeText,
  onToggle,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  item: PlanItem;
  index: number;
  dragging: boolean;
  dragY: Animated.Value;
  onLayout: (index: number, y: number, h: number) => void;
  onChangeText: (t: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onDragStart: (id: string) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
}) {
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => onDragStart(item.id),
      onPanResponderMove: (_e, g) => onDragMove(g.dy),
      onPanResponderRelease: () => onDragEnd(),
      onPanResponderTerminate: () => onDragEnd(),
    })
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    onLayout(index, y, height);
  };

  return (
    <Animated.View
      onLayout={handleLayout}
      style={[
        styles.row,
        dragging && {
          zIndex: 10,
          elevation: 6,
          opacity: 0.95,
          transform: [{ translateY: dragY }],
        },
      ]}
    >
      <View style={styles.grip} {...responder.panHandlers}>
        <Text style={styles.gripDots}>⠿</Text>
      </View>

      <Pressable
        hitSlop={6}
        style={[styles.check, item.done && styles.checkOn]}
        onPress={onToggle}
      >
        {item.done && <Text style={styles.checkMark}>✓</Text>}
      </Pressable>

      <TextInput
        style={[styles.input, item.done && styles.inputDone]}
        value={item.text}
        multiline
        placeholder="Plan item…"
        placeholderTextColor={colors.textDim}
        onChangeText={onChangeText}
      />

      <Pressable hitSlop={6} onPress={onDelete}>
        <Text style={styles.delBtn}>🗑</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.md, gap: space.sm },
  list: { gap: space.sm },
  empty: { color: colors.textDim, textAlign: "center", marginVertical: space.lg },
  dropLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    marginTop: -1,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  grip: {
    width: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  gripGhost: { opacity: 0 },
  gripDots: { color: colors.textDim, fontSize: 18 },
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
  delBtn: { fontSize: 15, paddingHorizontal: 2 },
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
