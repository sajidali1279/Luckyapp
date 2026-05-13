import { View, Text, StyleSheet } from 'react-native';
import { ReactNode } from 'react';
import { COLORS } from '../constants';
import { InboxIcon } from './Icons';

interface Props {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ icon, title, subtitle }: Props) {
  return (
    <View style={s.root}>
      <View style={s.iconWrap}>
        {icon ?? <InboxIcon size={52} color="#C4CAD4" strokeWidth={1.25} />}
      </View>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  iconWrap: { marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
