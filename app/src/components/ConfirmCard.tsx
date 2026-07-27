/**
 * ConfirmCard — 大图标确认卡片
 *
 * Agent 主动推荐玩游戏/画画时弹出，让不识字的 3-8 岁孩子用大按钮确认：
 *  ✅ 玩 / 画  或  ❌ 先不玩。Agent 同时会用语音问一句，两条通道都能确认。
 */

import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface ConfirmCardProps {
  readonly visible: boolean;
  readonly kind: "game" | "drawing";
  readonly title: string;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}

export function ConfirmCard(props: ConfirmCardProps): React.JSX.Element {
  const { visible, kind, title, onApprove, onReject } = props;
  const icon = kind === "game" ? "🎮" : "🎨";
  const verb = kind === "game" ? "玩" : "画";
  const question = kind === "game" ? `想玩「${title}」吗？` : `想让我画「${title}」吗？`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onReject}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={styles.question}>{question}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.reject]} onPress={onReject} activeOpacity={0.8}>
              <Text style={styles.btnIcon}>❌</Text>
              <Text style={styles.btnLabel}>先不{verb}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.approve]} onPress={onApprove} activeOpacity={0.8}>
              <Text style={styles.btnIcon}>✅</Text>
              <Text style={styles.btnLabel}>好呀，{verb}！</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(5, 10, 18, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(20, 36, 60, 0.98)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(100, 170, 255, 0.3)",
    padding: 24,
    alignItems: "center",
  },
  icon: { fontSize: 56, marginBottom: 12 },
  question: {
    color: "#E8F4FF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 16,
  },
  btn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  reject: {
    backgroundColor: "rgba(120, 130, 150, 0.2)",
    borderColor: "rgba(150, 160, 180, 0.3)",
  },
  approve: {
    backgroundColor: "rgba(0, 160, 90, 0.28)",
    borderColor: "rgba(80, 220, 140, 0.45)",
  },
  btnIcon: { fontSize: 34, marginBottom: 6 },
  btnLabel: { color: "#EAF6FF", fontSize: 16, fontWeight: "700" },
});
