import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

interface Props { children: string }

export default function MarkdownView({ children }: Props) {
  const lines = children.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      nodes.push(<View key={key++} style={s.fence}><Text style={s.fenceText}>{codeLines.join('\n')}</Text></View>);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      nodes.push(<View key={key++} style={s.hr} />);
      i++; continue;
    }

    // Headings
    const h4 = line.match(/^#### (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) { nodes.push(<Text key={key++} style={s.h1}>{inline(h1[1])}</Text>); i++; continue; }
    if (h2) { nodes.push(<Text key={key++} style={s.h2}>{inline(h2[1])}</Text>); i++; continue; }
    if (h3) { nodes.push(<Text key={key++} style={s.h3}>{inline(h3[1])}</Text>); i++; continue; }
    if (h4) { nodes.push(<Text key={key++} style={s.h4}>{inline(h4[1])}</Text>); i++; continue; }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push(<View key={key++} style={s.blockquote}><Text style={s.blockquoteText}>{inline(line.slice(2))}</Text></View>);
      i++; continue;
    }

    // Bullet list
    const bullet = line.match(/^(\s*)[-*•] (.+)/);
    if (bullet) {
      const indent = Math.floor(bullet[1].length / 2);
      nodes.push(
        <View key={key++} style={[s.listItem, { paddingLeft: 16 + indent * 16 }]}>
          <Text style={s.bullet}>•</Text>
          <Text style={s.listText}>{inline(bullet[2])}</Text>
        </View>
      );
      i++; continue;
    }

    // Ordered list
    const ordered = line.match(/^(\s*)(\d+)\. (.+)/);
    if (ordered) {
      nodes.push(
        <View key={key++} style={[s.listItem, { paddingLeft: 16 }]}>
          <Text style={s.bullet}>{ordered[2]}.</Text>
          <Text style={s.listText}>{inline(ordered[3])}</Text>
        </View>
      );
      i++; continue;
    }

    // Empty line — skip
    if (line.trim() === '') { i++; continue; }

    // Paragraph
    nodes.push(<Text key={key++} style={s.para}>{inline(line)}</Text>);
    i++;
  }

  return <>{nodes}</>;
}

let _inlineKey = 0;
function inline(text: string): React.ReactNode {
  // Strip link syntax [label](url) → label
  const clean = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const parts: React.ReactNode[] = [];
  const rx = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(clean)) !== null) {
    if (m.index > last) parts.push(clean.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**'))      parts.push(<Text key={_inlineKey++} style={{ fontWeight: '700' }}>{tok.slice(2, -2)}</Text>);
    else if (tok.startsWith('*'))  parts.push(<Text key={_inlineKey++} style={{ fontStyle: 'italic' }}>{tok.slice(1, -1)}</Text>);
    else                           parts.push(<Text key={_inlineKey++} style={s.code}>{tok.slice(1, -1)}</Text>);
    last = rx.lastIndex;
  }
  if (last < clean.length) parts.push(clean.slice(last));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

const s = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '900', color: COLORS.secondary, marginTop: 24, marginBottom: 8, borderBottomWidth: 2, borderBottomColor: COLORS.primary + '40', paddingBottom: 6 },
  h2: { fontSize: 18, fontWeight: '800', color: COLORS.secondary, marginTop: 20, marginBottom: 6 },
  h3: { fontSize: 15, fontWeight: '700', color: COLORS.secondary, marginTop: 16, marginBottom: 4 },
  h4: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  para: { color: COLORS.text, fontSize: 14, lineHeight: 22, marginBottom: 12 },
  hr: { borderBottomWidth: 1, borderBottomColor: COLORS.border, marginVertical: 20 },
  blockquote: { backgroundColor: COLORS.primary + '0C', borderLeftWidth: 4, borderLeftColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, marginVertical: 10, borderRadius: 4 },
  blockquoteText: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  listItem: { flexDirection: 'row', marginBottom: 6 },
  bullet: { color: COLORS.primary, fontWeight: '800', marginRight: 8, fontSize: 14, lineHeight: 22, minWidth: 16 },
  listText: { flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 22 },
  fence: { backgroundColor: '#F1F3F5', borderRadius: 10, padding: 14, marginVertical: 12 },
  fenceText: { fontFamily: 'monospace', fontSize: 13, color: COLORS.secondary },
  code: { backgroundColor: '#F1F3F5', fontFamily: 'monospace', fontSize: 13, color: COLORS.secondary, paddingHorizontal: 4, borderRadius: 4 },
});
