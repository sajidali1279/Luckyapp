import { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Animated, StatusBar, SafeAreaView,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { COLORS } from '../constants';
import { TERMS_OF_SERVICE } from '../constants/termsOfService';
import { PRIVACY_POLICY } from '../constants/privacyPolicy';

type DocType = 'terms' | 'privacy';

const DOC_META: Record<DocType, { title: string; content: string; color: string }> = {
  terms: {
    title: 'Terms of Service',
    content: TERMS_OF_SERVICE,
    color: COLORS.secondary,
  },
  privacy: {
    title: 'Privacy Policy',
    content: PRIVACY_POLICY,
    color: '#157A6E',
  },
};

interface Props {
  visible: boolean;
  doc: DocType;
  onClose: () => void;
}

export default function LegalDocModal({ visible, doc, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(800)).current;
  const meta = DOC_META[doc];

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, friction: 20, tension: 180, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 800, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Header */}
            <View style={[s.header, { backgroundColor: meta.color }]}>
              <View style={s.headerPill} />
              <View style={s.headerRow}>
                <Text style={s.headerTitle}>{meta.title}</Text>
                <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
                  <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Content */}
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Markdown style={mdStyles}>{meta.content}</Markdown>
              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const mdStyles = {
  body:     { fontSize: 14, color: '#374151', lineHeight: 22 },
  heading1: { fontSize: 17, fontWeight: '900' as const, color: '#111827', marginTop: 8, marginBottom: 8 },
  heading2: { fontSize: 14, fontWeight: '800' as const, color: '#1D3557', marginTop: 20, marginBottom: 6 },
  strong:   { fontWeight: '700' as const, color: '#111827' },
  hr:       { backgroundColor: '#e5e7eb', height: 1, marginVertical: 16 },
  bullet_list: { marginBottom: 8 },
  list_item:   { marginBottom: 4 },
  em:          { fontStyle: 'italic' as const },
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    height: '90%',
    overflow: 'hidden',
  },
  header: {
    paddingTop: 12, paddingBottom: 18, paddingHorizontal: 20,
  },
  headerPill: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignSelf: 'center', marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
});
