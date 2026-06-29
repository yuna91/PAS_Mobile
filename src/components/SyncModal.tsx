// Camera-first sync: opening this modal turns on the camera immediately to
// scan the desktop's pairing QR. On a successful scan it pairs and syncs in
// one step, then closes. QR-only — no manual entry, no status buttons.

import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { pair, parsePairing, syncNow } from "../sync/syncClient";
import { nudgeAutoSync } from "../sync/autoSync";
import { colors, radius, space } from "../theme";

type Phase = "scan" | "syncing" | "done" | "error";

const SCAN_HINT = "Point at the QR code on your desktop (tray icon → Sync).";

export function SyncModal({ onClose }: { onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("scan");
  const [message, setMessage] = useState(SCAN_HINT);
  const handled = useRef(false);

  // ask for camera access as soon as the modal opens
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission?.granted]);

  const handleScan = async (data: string) => {
    if (handled.current || phase !== "scan") return;
    const peer = parsePairing(data);
    if (!peer) {
      setMessage("That isn’t a PAS pairing code — keep pointing at the QR.");
      return;
    }
    handled.current = true;
    setPhase("syncing");
    setMessage("Syncing…");
    await pair(peer);
    const r = await syncNow();
    if (r.ok) {
      nudgeAutoSync(); // start live streaming from the desktop right away
      setPhase("done");
      setMessage("Synced ✓");
      setTimeout(onClose, 1200);
    } else {
      setPhase("error");
      setMessage(r.error || "Sync failed");
    }
  };

  const retry = () => {
    handled.current = false;
    setMessage(SCAN_HINT);
    setPhase("scan");
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.head}>
          <Text style={styles.title}>Scan desktop QR</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            phase === "scan" ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => handleScan(data)}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.center]}>
                <Text style={styles.status}>{message}</Text>
                {phase === "error" && (
                  <View style={styles.row}>
                    <Pressable style={[styles.btn, styles.btnPrimary]} onPress={retry}>
                      <Text style={styles.btnTextPrimary}>Try again</Text>
                    </Pressable>
                    <Pressable style={styles.btn} onPress={onClose}>
                      <Text style={styles.btnText}>Close</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <Text style={styles.status}>
                Camera access is needed to scan the pairing QR.
              </Text>
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => requestPermission()}
              >
                <Text style={styles.btnTextPrimary}>Grant camera access</Text>
              </Pressable>
            </View>
          )}
        </View>

        {phase === "scan" && permission?.granted && (
          <Text style={styles.hint}>{message}</Text>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  close: { color: colors.textDim, fontSize: 20 },
  cameraWrap: {
    flex: 1,
    margin: space.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.lg,
  },
  status: { color: colors.text, fontSize: 17, textAlign: "center" },
  hint: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  row: { flexDirection: "row", gap: space.sm },
  btn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnText: { color: colors.text, fontWeight: "600" },
  btnTextPrimary: { color: "#fff", fontWeight: "700" },
});
