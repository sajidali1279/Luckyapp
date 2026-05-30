import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { router } from 'expo-router';
import { COLORS } from '../constants';
import { ChevronLeftIcon } from './Icons';

interface Props {
  title: string;
  content: string;
  headerColor?: string;
}

export default function GuideScreen({ title, content, headerColor = COLORS.secondary }: Props) {
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={headerColor} />

      <SafeAreaView style={[s.header, { backgroundColor: headerColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
          <ChevronLeftIcon size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
      >
        <Markdown style={mdStyles}>{content}</Markdown>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, color: '#fff', fontSize: 17, fontWeight: '800',
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  body: { padding: 20, paddingTop: 24 },
});

const mdStyles = StyleSheet.create({
  body: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  heading1: {
    fontSize: 22, fontWeight: '900', color: COLORS.secondary,
    marginTop: 24, marginBottom: 8,
    borderBottomWidth: 2, borderBottomColor: COLORS.primary + '40',
    paddingBottom: 6,
  },
  heading2: {
    fontSize: 18, fontWeight: '800', color: COLORS.secondary,
    marginTop: 20, marginBottom: 6,
  },
  heading3: {
    fontSize: 15, fontWeight: '700', color: COLORS.secondary,
    marginTop: 16, marginBottom: 4,
  },
  heading4: {
    fontSize: 13, fontWeight: '700', color: COLORS.textMuted,
    marginTop: 12, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  paragraph: { marginBottom: 12, lineHeight: 22 },
  strong: { fontWeight: '700', color: COLORS.text },
  em: { fontStyle: 'italic' },
  bullet_list: { marginBottom: 12 },
  ordered_list: { marginBottom: 12 },
  list_item: { marginBottom: 4, flexDirection: 'row' },
  bullet_list_icon: { color: COLORS.primary, fontWeight: '800', marginRight: 6 },
  ordered_list_icon: { color: COLORS.primary, fontWeight: '700', marginRight: 6 },
  code_inline: {
    backgroundColor: '#F1F3F5', fontFamily: 'monospace',
    fontSize: 13, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
    color: COLORS.secondary,
  },
  fence: {
    backgroundColor: '#F1F3F5', borderRadius: 10,
    padding: 14, marginVertical: 12,
  },
  code_block: {
    backgroundColor: '#F1F3F5', borderRadius: 10,
    padding: 14, marginVertical: 12, fontSize: 13, fontFamily: 'monospace',
  },
  blockquote: {
    backgroundColor: COLORS.primary + '0C',
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    paddingHorizontal: 14, paddingVertical: 8,
    marginVertical: 10, borderRadius: 4,
  },
  hr: { borderBottomWidth: 1, borderBottomColor: COLORS.border, marginVertical: 20 },
  table: { marginVertical: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 },
  thead: { backgroundColor: COLORS.secondary },
  th: { padding: 10, color: '#fff', fontWeight: '700', fontSize: 13 },
  td: { padding: 10, borderTopWidth: 1, borderTopColor: COLORS.border, fontSize: 13 },
  link: { color: COLORS.primary, textDecorationLine: 'underline' },
});
