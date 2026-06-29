// Schedule page: a per-date free-form text editor. Auto-saves to the store
// as you type; reloads when the selected date changes.

import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { CalendarDropdown } from "../components/CalendarDropdown";
import { useStore } from "../state/store";
import { colors, space } from "../theme";

export function ScheduleScreen() {
  const store = useStore();
  const key = store.selectedKey;
  const syncVersion = store.getSyncVersion();
  const [text, setText] = useState(() => store.getSchedule());

  // Re-seed on date change, and whenever a sync merge brings in newer data for
  // the visible date (skip if it matches, so the cursor isn't disturbed).
  useEffect(() => {
    const current = store.getSchedule(key);
    setText((prev) => (prev === current ? prev : current));
  }, [key, syncVersion]);

  const onChange = (t: string) => {
    setText(t);
    store.setSchedule(t, key);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <CalendarDropdown />
      <View style={styles.body}>
        <TextInput
          style={styles.area}
          value={text}
          onChangeText={onChange}
          multiline
          textAlignVertical="top"
          placeholder="Write your schedule for the day…"
          placeholderTextColor={colors.textDim}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: space.md },
  area: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
