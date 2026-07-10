import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { COLORS } from '../constants';
import { ChevronLeftIcon } from './Icons';

type Size = 'lg' | 'md' | 'sm';

interface ManagerHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  size?: Size;
  showBack?: boolean;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  paddingHorizontal?: number;
  children?: ReactNode;
}

// Shared header for Manager-role screens. Centralizing this also fixes a
// recurring bug where screens wrapped their whole body (light background) in
// the top-inset SafeAreaView instead of just the colored header, leaving the
// status-bar notch area the wrong color — here the SafeAreaView itself always
// carries the managerPrimary background.
export default function ManagerHeader({
  title, eyebrow, subtitle, size = 'md', showBack = false, icon, rightSlot,
  paddingHorizontal = 20, children,
}: ManagerHeaderProps) {
  return (
    <SafeAreaView style={s.headerBg} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.managerPrimary} />
      <View style={[s.row, { paddingHorizontal }, size === 'sm' && s.rowCompact]}>
        {showBack && (
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.backBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeftIcon size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
        {icon}
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
          <Text style={size === 'sm' ? s.titleSm : size === 'lg' ? s.titleLg : s.titleMd}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {rightSlot}
      </View>
      {children}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  headerBg: { backgroundColor: COLORS.managerPrimary },
  row: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12,
    paddingTop: 14, paddingBottom: 12,
  },
  rowCompact: { paddingTop: 4, paddingBottom: 14, gap: 8 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  titleLg: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  titleMd: { color: '#fff', fontSize: 22, fontWeight: '800' },
  titleSm: { color: '#fff', fontSize: 17, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
});
