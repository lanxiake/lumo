/**
 * EditInstructionModal — "改一改"游戏时收集修改要求
 *
 * 孩子点游戏内"改一改"后弹出，用语音或打字说想怎么改（如"把泡泡变成红色"）。
 * 提交后交给 Agent 在原 HTML 上修改并就地更新。语音入口复用系统 STT（由上层传入）。
 */

import React, { useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export interface EditInstructionModalProps {
  readonly visible: boolean;
  readonly gameTitle: string;
  readonly onSubmit: (instruction: string) => void;
  readonly onCancel: () => void;
}

export function EditInstructionModal(props: EditInstructionModalProps): React.JSX.Element {
  const { visible, gameTitle, onSubmit, onCancel } = props;
  const [text, setText] = useState("");

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    onSubmit(t);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>想怎么改「{gameTitle}」呀？</Text>
          <Text style={styles.hint}>说一说或写一写，比如"把泡泡变成红色"</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="想怎么改…"
            placeholderTextColor="#7088A0"
            multiline
            autoFocus
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.btnLabel}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.confirm, !text.trim() && styles.disabled]}
              onPress={submit}
              activeOpacity={0.8}
              disabled={!text.trim()}
            >
              <Text style={styles.btnLabel}>改好它！</Text>
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
    maxWidth: 380,
    backgroundColor: "rgba(20, 36, 60, 0.98)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(160, 120, 255, 0.35)",
    padding: 24,
  },
  title: { color: "#E8F4FF", fontSize: 19, fontWeight: "800", marginBottom: 6 },
  hint: { color: "#90A8C0", fontSize: 13, marginBottom: 16 },
  input: {
    minHeight: 72,
    backgroundColor: "rgba(10, 20, 36, 0.8)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(100, 140, 200, 0.3)",
    color: "#E8F4FF",
    fontSize: 16,
    padding: 12,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  actions: { flexDirection: "row", gap: 14 },
  btn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  cancel: { backgroundColor: "rgba(120, 130, 150, 0.2)", borderColor: "rgba(150, 160, 180, 0.3)" },
  confirm: { backgroundColor: "rgba(160, 120, 255, 0.3)", borderColor: "rgba(180, 140, 255, 0.45)" },
  disabled: { opacity: 0.45 },
  btnLabel: { color: "#EAF6FF", fontSize: 16, fontWeight: "700" },
});
