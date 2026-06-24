// Sync settings sheet: pair with the desktop (scan its QR or enter manually),
// run a manual sync, view last-synced status, and unpair.

import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  Peer,
  getPeer,
  pair,
  parsePairing,
  syncNow,
  unpair,
} from "../sync/syncClient";
import { colors, radius, space } from "../theme";

export function SyncModal({ onClose }: { onClose: () => void }) {
  const [peer, setPeerState] = useState<Peer | null>(null);
  const [mode, setMode] = useState<"status" | "scan" | "manual">("status");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualUrl, setManualUrl] = useState("");
  const [manualToken, setManualToken] = useState("");

  const refresh = async () => setPeerState(await getPeer());
  useEffect(() => {
    refresh();
  }, []);

  const doPair = async (p: Peer) => {
    await pair(p);
    await refresh();
    setMode("status");
    setStatus("Paired. Tap “Sync now”.");
  };

  const onScan = (data: string) => {
    const parsed = parsePairing(data);
    if (!parsed) {
      setStatus("That QR isn’t a PAS pairing code.");
      setMode("status");
      return;
    }
    doPair(parsed);
  };

  const doSync = async () => {
    setBusy(true);
    setStatus("Syncing…");
    const r = await syncNow();
    setBusy(false);
    setStatus(r.ok ? "Synced ✓" : `Failed: ${r.error}`);
    await refresh();
  };

  const startScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setStatus("Camera permission denied — use manual entry.");
        return;
      }
    }
    setMode("scan");
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Sync with desktop</Text>
            <Pressable hitSlop={8} onPress={onClose}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {mode === "scan" ? (
            <View style={styles.scanWrap}>
              <CameraView
                style={styles.camera}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => onScan(data)}
              />
              <Pressable style={styles.btn} onPress={() => setMode("status")}>
                <Text style={styles.btnText}>Cancel</Text>
              </Pressable>
            </View>
          ) : mode === "manual" ? (
            <View style={styles.section}>
              <Text style={styles.legend}>Desktop URL</Text>
              <TextInput
                style={styles.input}
                value={manualUrl}
                onChangeText={setManualUrl}
                autoCapitalize="none"
                placeholder="http://192.168.1.42:8787"
                placeholderTextColor={colors.textDim}
              />
              <Text style={styles.legend}>Token</Text>
              <TextInput
                style={styles.input}
                value={manualToken}
                onChangeText={setManualToken}
                autoCapitalize="none"
                placeholder="pairing token"
                placeholderTextColor={colors.textDim}
              />
              <View style={styles.row}>
                <Pressable style={styles.btn} onPress={() => setMode("status")}>
                  <Text style={styles.btnText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() =>
                    onScan(
                      JSON.stringify({ url: manualUrl, token: manualToken })
                    )
                  }
                >
                  <Text style={styles.btnTextPrimary}>Pair</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              {peer ? (
                <>
                  <Text style={styles.paired}>Paired with {peer.url}</Text>
                  <Text style={styles.sub}>
                    {peer.lastSyncedAt
                      ? `Last synced ${new Date(peer.lastSyncedAt).toLocaleString()}`
                      : "Not synced yet"}
                  </Text>
                  <Pressable
                    style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                    disabled={busy}
                    onPress={doSync}
                  >
                    <Text style={styles.btnTextPrimary}>Sync now</Text>
                  </Pressable>
                  <Pressable
                    style={styles.btn}
                    onPress={async () => {
                      await unpair();
                      await refresh();
                      setStatus("Unpaired.");
                    }}
                  >
                    <Text style={styles.btnText}>Unpair</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.sub}>
                    Pair with PAS on your desktop (same Wi-Fi). Open Sync on the
                    desktop to show its QR code.
                  </Text>
                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={startScan}>
                    <Text style={styles.btnTextPrimary}>Scan QR code</Text>
                  </Pressable>
                  <Pressable style={styles.btn} onPress={() => setMode("manual")}>
                    <Text style={styles.btnText}>Enter manually</Text>
                  </Pressable>
                </>
              )}
              {!!status && <Text style={styles.status}>{status}</Text>}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  close: { color: colors.textDim, fontSize: 18 },
  section: { gap: space.sm },
  legend: { color: colors.textDim, fontSize: 12, marginTop: space.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  paired: { color: colors.text, fontSize: 15, fontWeight: "600" },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  status: { color: colors.accent, fontSize: 13, marginTop: space.sm },
  scanWrap: { gap: space.sm },
  camera: { width: "100%", height: 280, borderRadius: radius.md, overflow: "hidden" },
  btn: {
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    flex: 1,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: colors.text, fontWeight: "600" },
  btnTextPrimary: { color: "#fff", fontWeight: "700" },
});
