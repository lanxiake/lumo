/**
 * PetSelectionScreen — 宠物选择「伙伴册」（国风暖纸笺）
 *
 * MVP 只展示可用宠物，点击未解锁宠物提示需家长帮助。
 */

import React, { useState } from "react";
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BackIcon } from "../../components/KidsIcons";
import { kidsTheme as t, themeStyles as ts } from "../../theme/kidsTheme";

export interface PetOption {
  readonly id: string;
  readonly label: string;
  readonly modelPath: string;
  readonly unlocked: boolean;
  /** 当前有效名字（自定义优先，否则内置默认名） */
  readonly name: string;
}

export interface PetSelectionScreenProps {
  readonly pets: readonly PetOption[];
  readonly currentPetId: string;
  readonly onClose: () => void;
  readonly onSelect?: (petId: string) => void;
  /** 保存某角色的自定义名字（空字符串恢复默认） */
  readonly onRename?: (petId: string, name: string) => void;
}

/** 选宠物全屏页 */
export function PetSelectionScreen(props: PetSelectionScreenProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>选择小伙伴</Text>
          <Text style={styles.subtitle}>选一个一起玩吧</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={props.onClose} activeOpacity={0.75}>
          <BackIcon size={14} color={t.colors.ink} />
          <Text style={styles.closeText}>返回</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {props.pets.map((pet) => (
          <PetCard
            key={pet.id}
            pet={pet}
            isCurrent={pet.id === props.currentPetId}
            onSelect={props.onSelect}
            onClose={props.onClose}
            onRename={props.onRename}
          />
        ))}
      </View>
    </View>
  );
}

/** 单张宠物卡：点击选中，底部可编辑名字 */
function PetCard(props: {
  readonly pet: PetOption;
  readonly isCurrent: boolean;
  readonly onSelect?: (petId: string) => void;
  readonly onClose: () => void;
  readonly onRename?: (petId: string, name: string) => void;
}): React.JSX.Element {
  const { pet, isCurrent, onSelect, onClose, onRename } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pet.name);

  const commit = () => {
    onRename?.(pet.id, draft.trim());
    setEditing(false);
  };

  return (
    <View style={[styles.card, isCurrent && styles.cardActive, !pet.unlocked && styles.cardLocked]}>
      <TouchableOpacity
        style={styles.cardTap}
        onPress={() => {
          if (pet.unlocked) onSelect?.(pet.id);
          else onClose();
        }}
        activeOpacity={0.8}
      >
        <Image source={{ uri: pet.modelPath }} style={styles.avatar} resizeMode="contain" />
      </TouchableOpacity>

      {editing ? (
        <View style={styles.nameEditRow}>
          <TextInput
            style={styles.nameInput}
            value={draft}
            onChangeText={setDraft}
            placeholder={pet.label}
            placeholderTextColor={t.colors.placeholder}
            maxLength={12}
            autoFocus
            onSubmitEditing={commit}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.nameSaveBtn} onPress={commit} activeOpacity={0.7}>
            <Text style={styles.nameSaveText}>保存</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.nameRow}
          onPress={() => {
            setDraft(pet.name);
            setEditing(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.label}>{pet.name}</Text>
          {pet.unlocked && <Text style={styles.renameHint}>改名</Text>}
        </TouchableOpacity>
      )}

      {!pet.unlocked && <Text style={styles.lock}>锁定</Text>}
      {isCurrent && (
        <View style={styles.currentBadge}>
          <Text style={styles.current}>当前</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...ts.screen,
    paddingTop: 16,
    paddingHorizontal: t.space.screenX,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    color: t.colors.ink,
    fontSize: t.font.title,
    fontWeight: "800",
  },
  subtitle: {
    color: t.colors.cloudGray,
    fontSize: t.font.section,
    marginTop: 2,
  },
  closeBtn: { ...ts.btnGhost },
  closeText: { ...ts.btnGhostText },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  card: {
    width: "47%",
    aspectRatio: 0.92,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.glassBorder,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    ...t.shadow.card,
  },
  cardActive: {
    borderColor: t.colors.coral,
    borderWidth: 2.5,
  },
  cardLocked: {
    opacity: 0.72,
  },
  cardTap: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  renameHint: {
    color: t.colors.cloudGray,
    fontSize: 11,
    fontWeight: "600",
  },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    paddingHorizontal: 6,
  },
  nameInput: {
    flex: 1,
    color: t.colors.ink,
    fontSize: 14,
    fontWeight: "700",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: t.colors.surfaceInput,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.inputBorder,
  },
  nameSaveBtn: {
    backgroundColor: t.colors.coral,
    borderRadius: t.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  nameSaveText: {
    color: t.colors.textOnAccent,
    fontSize: 12,
    fontWeight: "700",
  },
  label: {
    color: t.colors.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  lock: {
    position: "absolute",
    top: 8,
    right: 10,
    fontSize: 11,
    color: t.colors.ink,
    fontWeight: "700",
    backgroundColor: t.colors.paperDeep,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  currentBadge: {
    marginTop: 6,
    backgroundColor: t.colors.coral,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  current: {
    color: t.colors.textOnAccent,
    fontSize: 11,
    fontWeight: "700",
  },
});
