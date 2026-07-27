/**
 * GalleryScreen — 我的画（图片画廊 · 暖纸笺风格）
 *
 * 展示 Agent 生成的图片网格。点击缩略图全屏预览，长按删除；
 * 支持保存到系统相册。视觉对齐 SettingsScreen。
 */

import React, { useState, useCallback } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Alert,
} from "react-native";
import type { GalleryImage } from "../../hooks/useAppActions";
import { saveImageToGallery } from "../../native/mediaStore";
import { kidsTheme as t } from "../../theme/kidsTheme";
import { KidsOverlayHeader } from "./components/KidsOverlayHeader";

export interface GalleryScreenProps {
  readonly images: readonly GalleryImage[];
  readonly onClose: () => void;
  readonly onDelete?: (index: number) => void;
}

/** 我的画画廊页 */
export function GalleryScreen(props: GalleryScreenProps): React.JSX.Element {
  const { images, onClose, onDelete } = props;
  const [preview, setPreview] = useState<GalleryImage | null>(null);

  const confirmDelete = useCallback(
    (idx: number) => {
      if (!onDelete) return;
      Alert.alert("删除图片", "确定要删除这张图片吗？", [
        { text: "取消", style: "cancel" },
        { text: "删除", style: "destructive", onPress: () => onDelete(idx) },
      ]);
    },
    [onDelete],
  );

  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(
    async (image: GalleryImage) => {
      if (saving) return;
      setSaving(true);
      try {
        await saveImageToGallery(image.url);
        Alert.alert("已保存", "图片已保存到相册啦~");
      } catch (err) {
        const message = err instanceof Error ? err.message : "保存失败了";
        Alert.alert("保存失败", `${message}，可以试试截屏保存哦。`);
      } finally {
        setSaving(false);
      }
    },
    [saving],
  );

  return (
    <View style={styles.container}>
      <KidsOverlayHeader title="我的画" subtitle="长按可以删除哦" onBack={onClose} />

      {images.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>还没有画过画哦</Text>
          <Text style={styles.emptyHint}>让宠物给你画一张吧~</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator>
          {/* 倒序：最近生成的在最前；idx 仍指向原数组 */}
          {images
            .map((_img, idx) => idx)
            .reverse()
            .map((idx) => {
              const img = images[idx];
              return (
                <TouchableOpacity
                  key={`${img.url}-${idx}`}
                  style={styles.thumbWrap}
                  onPress={() => setPreview(img)}
                  onLongPress={() => confirmDelete(idx)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: img.url }}
                    style={styles.thumb}
                    resizeMode="cover"
                    accessibilityLabel={img.prompt ?? "生成的图片"}
                  />
                </TouchableOpacity>
              );
            })}
        </ScrollView>
      )}

      <Modal visible={preview != null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreview(null)} activeOpacity={0.7}>
            <Text style={styles.previewCloseText}>关闭</Text>
          </TouchableOpacity>

          {preview && (
            <>
              <Image source={{ uri: preview.url }} style={styles.previewImage} resizeMode="contain" />
              <View style={styles.previewActions}>
                <TouchableOpacity style={styles.previewActionBtn} onPress={() => setPreview(null)} activeOpacity={0.7}>
                  <Text style={styles.previewActionText}>返回列表</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.previewActionBtnPrimary, saving && styles.previewActionBtnDisabled]}
                  onPress={() => handleSave(preview)}
                  activeOpacity={0.7}
                  disabled={saving}
                >
                  <Text style={styles.previewActionTextPrimary}>{saving ? "保存中…" : "保存图片"}</Text>
                </TouchableOpacity>
              </View>
              {preview.prompt ? <Text style={styles.previewPrompt}>{preview.prompt}</Text> : null}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.colors.overlayBg,
    paddingTop: 16,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    color: t.colors.ink,
    fontSize: t.font.body,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyHint: {
    color: t.colors.cloudGray,
    fontSize: t.font.label,
    textAlign: "center",
    lineHeight: 22,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
  },
  thumbWrap: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: t.colors.paperDeep,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(61, 43, 31, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  previewImage: {
    width: "100%",
    height: "70%",
  },
  previewCloseBtn: {
    position: "absolute",
    top: 48,
    right: 16,
    backgroundColor: t.colors.paper,
    borderRadius: t.radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: t.colors.cinnabarSoft,
    zIndex: 10,
  },
  previewCloseText: {
    color: t.colors.cinnabar,
    fontSize: t.font.label,
    fontWeight: "700",
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  previewActionBtn: {
    backgroundColor: t.colors.paper,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: t.colors.softGoldBorder,
  },
  previewActionBtnPrimary: {
    backgroundColor: t.colors.cinnabar,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: t.colors.cinnabar,
  },
  previewActionBtnDisabled: {
    opacity: 0.5,
  },
  previewActionText: {
    color: t.colors.ink,
    fontSize: t.font.label,
    fontWeight: "700",
  },
  previewActionTextPrimary: {
    color: t.colors.textOnAccent,
    fontSize: t.font.label,
    fontWeight: "700",
  },
  previewPrompt: {
    color: "rgba(255, 248, 240, 0.75)",
    fontSize: t.font.hint,
    marginTop: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
