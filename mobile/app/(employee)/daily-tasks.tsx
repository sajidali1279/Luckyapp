import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { dailyTaskApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import { ListChecksIcon, ChevronDownIcon, ChevronUpIcon, CheckCircleIcon, CircleIcon } from '../../components/Icons';
import FadeSlideIn from '../../components/FadeSlideIn';
import { useCurrentStoreId } from '../../utils/geo';

type Shift = 'OPENING' | 'MIDDLE' | 'CLOSING';

interface DailyTask {
  id: string;
  shift: Shift;
  title: string;
  description: string | null;
}

// Emoji/color config keyed by shift stays here; the label text itself is
// translated at render time via employeeDailyTasks.shiftOpening/Middle/Closing.
const SHIFT_CONFIG: Record<Shift, { emoji: string; color: string; bg: string }> = {
  OPENING: { emoji: '🌅', color: '#C2410C', bg: '#FFF7ED' },
  MIDDLE:  { emoji: '☀️', color: '#92400E', bg: '#FEFCE8' },
  CLOSING: { emoji: '🌙', color: '#1E40AF', bg: '#EFF6FF' },
};

const SHIFT_ORDER: Shift[] = ['OPENING', 'MIDDLE', 'CLOSING'];

function todayKey() {
  const d = new Date();
  return `daily-tasks-checked-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function DailyTasksScreen() {
  const { t } = useTranslation();
  const SHIFT_LABEL_KEYS: Record<Shift, string> = {
    OPENING: 'employeeDailyTasks.shiftOpening',
    MIDDLE: 'employeeDailyTasks.shiftMiddle',
    CLOSING: 'employeeDailyTasks.shiftClosing',
  };
  const { user } = useAuthStore();
  // GPS-resolved for multi-store employees, matching the pattern used on
  // Home and Hot Food - this screen previously had no store picker at all
  // and was permanently locked to the employee's first assignment.
  const { data: gasPricesData } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    staleTime: 30_000,
  });
  const allStoresWithLocation: any[] = gasPricesData?.data?.data || [];
  const storeId = useCurrentStoreId(allStoresWithLocation, user?.storeIds);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<Shift>>(new Set(['OPENING']));

  // Load persisted check state (resets daily)
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(todayKey()).then(raw => {
      if (raw) {
        try { setChecked(new Set(JSON.parse(raw))); } catch {}
      } else {
        setChecked(new Set());
      }
    });
  }, []));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['daily-tasks', storeId],
    queryFn: () => dailyTaskApi.getTasks(storeId),
    staleTime: 10 * 60_000,
    enabled: !!user,
  });
  const tasks: DailyTask[] = data?.data?.data ?? [];

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      AsyncStorage.setItem(todayKey(), JSON.stringify([...next]));
      return next;
    });
  }

  function toggleExpand(shift: Shift) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(shift)) next.delete(shift);
      else next.add(shift);
      return next;
    });
  }

  const grouped = SHIFT_ORDER.reduce<Record<Shift, DailyTask[]>>((acc, s) => {
    acc[s] = tasks.filter(t => t.shift === s);
    return acc;
  }, { OPENING: [], MIDDLE: [], CLOSING: [] });

  const totalCount = tasks.length;
  const doneCount = tasks.filter(t => checked.has(t.id)).length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <ListChecksIcon size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('employeeDailyTasks.headerTitle')}</Text>
          <Text style={styles.headerSub}>{t('employeeDailyTasks.headerSub')}</Text>
        </View>
      </View>

      {/* Progress bar */}
      {totalCount > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>{t('employeeDailyTasks.progressLabel', { done: doneCount, total: totalCount })}</Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('employeeDailyTasks.loadFailed')}</Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="Retry loading tasks"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.retryText}>{t('employeeDailyTasks.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : totalCount === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>{t('employeeDailyTasks.noTasksTitle')}</Text>
          <Text style={styles.emptySub}>{t('employeeDailyTasks.noTasksSub')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {SHIFT_ORDER.map((shift, shiftIdx) => {
            const shiftTasks = grouped[shift];
            if (shiftTasks.length === 0) return null;
            const cfg = SHIFT_CONFIG[shift];
            const shiftLabel = t(SHIFT_LABEL_KEYS[shift]);
            const isOpen = expanded.has(shift);
            const shiftDone = shiftTasks.filter(t => checked.has(t.id)).length;

            return (
              <FadeSlideIn key={shift} delay={Math.min(shiftIdx * 40, 200)}>
                <View style={styles.section}>
                  {/* Shift header - tappable to expand/collapse */}
                  <TouchableOpacity
                    style={[styles.shiftHeader, { backgroundColor: cfg.bg }]}
                    onPress={() => toggleExpand(shift)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${shiftLabel} shift, ${shiftDone} of ${shiftTasks.length} completed`}
                    accessibilityState={{ expanded: isOpen }}
                  >
                    <View style={styles.shiftLeft}>
                      <Text style={styles.shiftEmoji}>{cfg.emoji}</Text>
                      <View>
                        <Text style={[styles.shiftLabel, { color: cfg.color }]}>{shiftLabel}</Text>
                        <Text style={styles.shiftCount}>{t('employeeDailyTasks.shiftCompleted', { done: shiftDone, total: shiftTasks.length })}</Text>
                      </View>
                    </View>
                    {isOpen
                      ? <ChevronUpIcon size={18} color={cfg.color} />
                      : <ChevronDownIcon size={18} color={cfg.color} />}
                  </TouchableOpacity>

                  {/* Tasks */}
                  {isOpen && (
                    <View style={styles.taskList}>
                      {shiftTasks.map((task, idx) => {
                        const done = checked.has(task.id);
                        return (
                          <TouchableOpacity
                            key={task.id}
                            style={[styles.taskRow, done && styles.taskRowDone]}
                            onPress={() => toggleCheck(task.id)}
                            activeOpacity={0.65}
                            accessibilityRole="checkbox"
                            accessibilityLabel={task.title}
                            accessibilityState={{ checked: done }}
                          >
                            <View style={styles.taskCheckbox}>
                              {done
                                ? <CheckCircleIcon size={22} color={COLORS.primary} />
                                : <CircleIcon size={22} color="#D1D5DB" />}
                            </View>
                            <View style={styles.taskBody}>
                              <View style={styles.taskTitleRow}>
                                <View style={styles.taskNumBadge}>
                                  <Text style={styles.taskNum}>{idx + 1}</Text>
                                </View>
                                <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>
                                  {task.title}
                                </Text>
                              </View>
                              {task.description && (
                                <Text style={[styles.taskDesc, done && styles.taskDescDone]}>
                                  {task.description}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </FadeSlideIn>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  iconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  progressLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', width: 70, textAlign: 'right' },

  scroll: { padding: 16, gap: 12 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { color: '#EF4444', fontSize: 15, marginBottom: 12, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  section: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  shiftHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingHorizontal: 16 },
  shiftLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shiftEmoji: { fontSize: 22 },
  shiftLabel: { fontSize: 15, fontWeight: '800' },
  shiftCount: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  taskList: { borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  taskRowDone: { backgroundColor: '#F9FAFB' },
  taskCheckbox: { paddingTop: 1 },
  taskBody: { flex: 1 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  taskNumBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  taskNum: { fontSize: 10, fontWeight: '700', color: '#9CA3AF' },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  taskTitleDone: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  taskDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  taskDescDone: { color: '#D1D5DB' },
});
