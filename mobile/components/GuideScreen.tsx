import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import MarkdownView from './MarkdownView';
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
        <MarkdownView>{content}</MarkdownView>
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

