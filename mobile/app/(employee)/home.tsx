import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, StatusBar, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { offersApi, hotFoodApi, notificationsApi, schedulingApi, dailyReportApi, dailyTaskApi, storesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  QrCodeScanIcon, GiftIcon, MegaphoneIcon, TagIcon,
  InboxIcon, ChevronRightIcon, FlameIcon, ReceiptIcon, DollarSignIcon,
  BellIcon, FileCheckIcon, ListChecksIcon,
} from '../../components/Icons';
import NoticeBanner, { usePinnedNotice } from '../../components/NoticeBanner';
import DashboardWatermark from '../../components/DashboardWatermark';
import GasPriceCard from '../../components/GasPriceCard';
import { useCurrentStoreId } from '../../utils/geo';

function getGreeting(t: (key: string) => string) {
  const h = new Date().getHours();
  if (h < 12) return t('employeeHome.goodMorning');
  if (h < 17) return t('employeeHome.goodAfternoon');
  return t('employeeHome.goodEvening');
}

const JS_DAY_TO_ENUM = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
// Text values are translated at usage via SHIFT_LABEL_KEYS + t(); this map
// only tracks which translation key corresponds to each shift.
const SHIFT_LABEL_KEYS: Record<string, string> = { OPENING: 'employeeHome.shiftOpening', MIDDLE: 'employeeHome.shiftMiddle', CLOSING: 'employeeHome.shiftClosing' };

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EmployeeHomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();

  // GPS-resolved for multi-store employees so every store-scoped query below
  // reflects the store they're actually standing in, not just their first
  // assignment - the gas-price query needs to run early to feed this.
  const { data: gasPricesData, refetch: refetchGasPrices } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const allStoresWithPrices: any[] = gasPricesData?.data?.data || [];
  const storeId = useCurrentStoreId(allStoresWithPrices, user?.storeIds);
  const currentStorePrices = allStoresWithPrices.find((s: any) => s.id === storeId);

  // Staggered entrance — 6 sections fade + slide up on mount
  const fadeAnims = useRef([...Array(6)].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([...Array(6)].map(() => new Animated.Value(18))).current;
  useEffect(() => {
    Animated.stagger(60, fadeAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 380, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  const {
    data: offersData, isLoading: offersLoading,
    refetch: refetchOffers, isRefetching: offersRefetching,
  } = useQuery({ queryKey: ['offers', storeId], queryFn: () => offersApi.getActive(storeId) });

  const { data: scheduleData } = useQuery({
    queryKey: ['my-schedule'],
    queryFn: () => schedulingApi.getMySchedule(),
  });
  const templates: any[] = scheduleData?.data?.data?.templates || [];
  const scheduleRequests: any[] = scheduleData?.data?.data?.requests || [];
  const templateByDay: Record<string, any> = {};
  for (const t of templates) templateByDay[t.dayOfWeek] = t;

  const todayKey = JS_DAY_TO_ENUM[new Date().getDay()];
  const todayTemplate = templateByDay[todayKey];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = JS_DAY_TO_ENUM[tomorrowDate.getDay()];
  const tomorrowISO = tomorrowDate.toISOString().slice(0, 10);
  const tomorrowTemplate = templateByDay[tomorrowKey];
  const approvedOffTomorrow = scheduleRequests.some(
    (r: any) => r.requestType === 'TIME_OFF' && r.status === 'APPROVED' &&
      new Date(r.date).toISOString().slice(0, 10) === tomorrowISO
  );
  const isOffTomorrow = !tomorrowTemplate || approvedOffTomorrow;

  const todayISO = todayStr();
  const { data: reportData, refetch: refetchTodayReport } = useQuery({
    queryKey: ['daily-reports-today', storeId, todayISO],
    queryFn: () => dailyReportApi.getToday(storeId!, todayISO),
    enabled: !!storeId,
    staleTime: 60_000,
  });
  const todaysReports: any[] = reportData?.data?.data || [];
  const reportSubmitted = todaysReports.length > 0;

  const { data: tasksData, refetch: refetchDailyTasks } = useQuery({
    queryKey: ['daily-tasks', storeId],
    queryFn: () => dailyTaskApi.getTasks(storeId),
    enabled: !!storeId && !!todayTemplate,
    staleTime: 5 * 60_000,
  });
  const allTasks: any[] = tasksData?.data?.data || [];
  const shiftTasks = todayTemplate ? allTasks.filter((t: any) => t.shift === todayTemplate.shiftType) : [];

  const [taskIdx, setTaskIdx] = useState(0);
  useEffect(() => {
    if (shiftTasks.length <= 1) return;
    const id = setInterval(() => setTaskIdx((i) => (i + 1) % shiftTasks.length), 4000);
    return () => clearInterval(id);
  }, [shiftTasks.length]);

  // Same query key as (employee)/_layout.tsx's tab badge — shares one cache
  // entry, and now covers every store the employee is assigned to rather
  // than just storeIds[0].
  const { data: pendingData } = useQuery({
    queryKey: ['hot-food-pending-count'],
    queryFn: () => hotFoodApi.getMyStoresPendingCount(),
    refetchInterval: 20_000,
  });
  const pendingCount: number = pendingData?.data?.data?.count ?? 0;

  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  // Pulse animation when there are pending orders
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (pendingCount > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pendingCount > 0]);

  const allOffers: any[] = offersData?.data?.data || [];
  const promotions = allOffers.filter((o: any) => !o.dealText);
  const deals = allOffers.filter((o: any) => o.dealText);
  const isRefreshing = offersRefetching;

  // A notice may be scoped to any store the employee is assigned to, not
  // just storeIds[0] — pass the full list so a multi-store employee sees
  // notices for every store they work at, not only their first one.
  const { notice: pinnedNotice, dismiss: dismissNotice, refetch: refetchNotice } = usePinnedNotice(user?.storeIds);

  return (
    <View style={s.root}>
      <DashboardWatermark color={COLORS.primary} />
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <Animated.View style={{ opacity: fadeAnims[0], transform: [{ translateY: slideAnims[0] }] }}>
        <SafeAreaView style={s.headerBg} edges={['top']}>
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.storeLine}>{t('employeeHome.headerEyebrow')}</Text>
              <Text style={s.greeting}>{getGreeting(t)},</Text>
              <Text style={s.greetingName}>{firstName}!</Text>
            </View>
            <View style={s.headerRight}>
              <TouchableOpacity
                onPress={() => router.push('/(employee)/notifications')}
                style={s.bellBtn}
                accessibilityRole="button"
                accessibilityLabel={`View notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <BellIcon size={20} color="#fff" strokeWidth={2} />
                {unreadCount > 0 && (
                  <View style={s.bellBadge}>
                    <Text style={s.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.avatarRing}
                onPress={() => router.push('/(employee)/profile')}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
              >
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl, cache: 'reload' }} style={s.avatarPhoto} />
                ) : (
                  <View style={s.avatarCircle}>
                    <Text style={s.avatarText}>{initial}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.statusPill}>
            <View style={s.statusDot} />
            <Text style={s.statusText}>{t('employeeHome.onDutyStatus', { role: user?.role?.replace(/_/g, ' ') })}</Text>
          </View>

          {isOffTomorrow && (
            <View style={s.offTomorrowPill}>
              <Text style={s.offTomorrowEmoji}>😴</Text>
              <Text style={s.offTomorrowText}>{t('employeeHome.offTomorrow')}</Text>
            </View>
          )}

          <GasPriceCard
            gasPrice={currentStorePrices?.gasPricePerGallon}
            dieselPrice={currentStorePrices?.dieselPricePerGallon}
            gasUpdatedAt={currentStorePrices?.gasPriceUpdatedAt}
            dieselUpdatedAt={currentStorePrices?.dieselPriceUpdatedAt}
          />

          {promotions.length > 0 && (
            <View style={s.promoStrip}>
              <FlameIcon size={16} color="#fff" strokeWidth={2} />
              <Text style={s.promoStripText}>
                {t('employeeHome.promosActive', { count: promotions.length })}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Animated.View>

      {pinnedNotice && (
        <NoticeBanner notice={pinnedNotice} onDismiss={() => dismissNotice(pinnedNotice.id)} />
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              refetchOffers();
              refetchGasPrices();
              refetchTodayReport();
              refetchDailyTasks();
              refetchNotice();
            }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── Quick Actions ── */}
        <Animated.View style={{ opacity: fadeAnims[1], transform: [{ translateY: slideAnims[1] }] }}>
          <Text style={s.sectionLabel}>{t('employeeHome.quickActions')}</Text>
          <View style={s.actionsRow}>
            <TouchableOpacity
              style={[s.actionCard, { backgroundColor: '#1D3557' }]}
              onPress={() => router.push('/(employee)/scan')}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Grant points: scan customer QR code"
            >
              <View style={s.actionIconBg}>
                <QrCodeScanIcon size={24} color="#fff" strokeWidth={1.75} />
              </View>
              <Text style={s.actionTitle}>{t('employeeHome.grantPointsTitle')}</Text>
              <Text style={s.actionSub}>{t('employeeHome.grantPointsSub')}</Text>
              <View style={s.actionArrow}>
                <ChevronRightIcon size={16} color="#fff" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.actionCard, { backgroundColor: '#b45309' }]}
              onPress={() => router.push('/(employee)/scan')}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Redeem credits: scan customer QR code"
            >
              <View style={[s.actionIconBg, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <GiftIcon size={24} color="#fff" strokeWidth={1.75} />
              </View>
              <Text style={s.actionTitle}>{t('employeeHome.redeemCreditsTitle')}</Text>
              <Text style={s.actionSub}>{t('employeeHome.redeemCreditsSub')}</Text>
              <View style={s.actionArrow}>
                <ChevronRightIcon size={16} color="#fff" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Hot Food Orders Tile ── */}
        {storeId && (
          <Animated.View style={[
            { transform: [{ scale: pulseAnim }], marginTop: 16, marginBottom: 4 },
            { opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }, { scale: pulseAnim }] },
          ]}>
            <TouchableOpacity
              style={[s.hotFoodTile, pendingCount > 0 && s.hotFoodTileActive]}
              onPress={() => router.push('/(employee)/hot-food')}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={pendingCount > 0
                ? `View hot food orders, ${pendingCount} waiting`
                : 'View hot food orders'}
            >
              <View style={s.hotFoodTileLeft}>
                <View style={[s.hotFoodIconBg, pendingCount > 0 && s.hotFoodIconBgActive]}>
                  <FlameIcon size={22} color={pendingCount > 0 ? '#fff' : '#EA580C'} strokeWidth={2} />
                </View>
                <View>
                  <Text style={[s.hotFoodTileTitle, pendingCount > 0 && s.hotFoodTileTitleActive]}>
                    {t('employeeHome.hotFoodOrdersTitle')}
                  </Text>
                  <Text style={[s.hotFoodTileSub, pendingCount > 0 && s.hotFoodTileSubActive]}>
                    {pendingCount > 0
                      ? t('employeeHome.hotFoodOrdersWaiting', { count: pendingCount })
                      : t('employeeHome.hotFoodOrdersEmpty')}
                  </Text>
                </View>
              </View>
              <View style={s.hotFoodTileRight}>
                {pendingCount > 0 && (
                  <View style={s.hotFoodBadge}>
                    <Text style={s.hotFoodBadgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
                  </View>
                )}
                <ChevronRightIcon size={18} color={pendingCount > 0 ? '#fff' : '#94A3B8'} strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Active Promotions ── */}
        <Animated.View style={{ opacity: fadeAnims[3], transform: [{ translateY: slideAnims[3] }] }}>
          <View style={s.sectionRow}>
            <MegaphoneIcon size={13} color="#6b7280" strokeWidth={2} />
            <Text style={s.sectionLabel}>{t('employeeHome.activePromotions')}</Text>
          </View>

          {offersLoading ? (
            <View style={s.loadingCard}><ActivityIndicator color={COLORS.primary} /></View>
          ) : promotions.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <InboxIcon size={38} color="#D1D5DB" strokeWidth={1.5} />
              </View>
              <Text style={s.emptyTitle}>{t('employeeHome.noActivePromotions')}</Text>
              <Text style={s.emptySub}>{t('employeeHome.standardCashbackNote')}</Text>
            </View>
          ) : (
            promotions.map((p: any) => (
              <View key={p.id} style={s.promoCard}>
                <View style={s.promoInfo}>
                  <Text style={s.promoTitle}>{p.title}</Text>
                  {p.description ? <Text style={s.promoDesc} numberOfLines={2}>{p.description}</Text> : null}
                  {p.category ? (
                    <View style={s.promoTag}>
                      <Text style={s.promoTagText}>{p.category.replace(/_/g, ' ')}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.promoBadge}>
                  {p.gasBonusCentsPerGallon != null && p.bonusRate == null ? (
                    <>
                      <Text style={[s.promoBadgeRate, { fontSize: 16 }]}>+{p.gasBonusCentsPerGallon}¢</Text>
                      <Text style={s.promoBadgePct}>/gal</Text>
                    </>
                  ) : (
                    <>
                      <Text style={s.promoBadgeRate}>{Math.round((p.bonusRate ?? 0) * 100)}</Text>
                      <Text style={s.promoBadgePct}>%</Text>
                    </>
                  )}
                </View>
              </View>
            ))
          )}
        </Animated.View>

        {/* ── Today's Deals ── */}
        {deals.length > 0 && (
          <Animated.View style={{ opacity: fadeAnims[4], transform: [{ translateY: slideAnims[4] }] }}>
            <View style={[s.sectionRow, { marginTop: 28 }]}>
              <TagIcon size={13} color="#6b7280" strokeWidth={2} />
              <Text style={s.sectionLabel}>{t('employeeHome.todaysDeals')}</Text>
            </View>
            {deals.map((d: any) => (
              <View key={d.id} style={s.dealCard}>
                <View style={s.dealBadge}>
                  <Text style={s.dealBadgeText}>{d.dealText}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dealTitle}>{d.title}</Text>
                  {d.description && d.description !== d.dealText
                    ? <Text style={s.dealSub} numberOfLines={1}>{d.description}</Text>
                    : null}
                  {d.category ? <Text style={s.dealCat}>{d.category.replace(/_/g, ' ')}</Text> : null}
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── Daily Report Status ── */}
        {storeId && (
          <Animated.View style={{ opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }], marginTop: 12 }}>
            <TouchableOpacity
              style={[s.dailyReportTile, reportSubmitted && s.dailyReportTileDone]}
              onPress={() => router.push('/(employee)/daily-report')}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={reportSubmitted ? 'Daily report already submitted today' : "Submit today's daily report"}
            >
              <View style={s.dailyReportTileLeft}>
                <View style={[s.dailyReportIconBg, reportSubmitted && s.dailyReportIconBgDone]}>
                  <FileCheckIcon size={22} color={reportSubmitted ? '#16A34A' : COLORS.secondary} strokeWidth={2} />
                </View>
                <View>
                  <Text style={s.dailyReportTitle}>{t('employeeHome.dailyReportTitle')}</Text>
                  <Text style={s.dailyReportSub}>
                    {reportSubmitted
                      ? t('employeeHome.dailyReportSubmittedBy', { name: todaysReports[0].submittedBy?.name || todaysReports[0].submittedBy?.phone || t('employeeHome.aTeammate'), time: fmtTime(todaysReports[0].createdAt) })
                      : t('employeeHome.dailyReportNotSubmitted')}
                  </Text>
                </View>
              </View>
              <ChevronRightIcon size={18} color={reportSubmitted ? '#16A34A' : '#94A3B8'} strokeWidth={2.5} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Daily Tasks Ticker ── */}
        {todayTemplate && shiftTasks.length > 0 && (
          <Animated.View style={{ opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }], marginTop: 10 }}>
            <TouchableOpacity
              style={s.taskTickerCard}
              onPress={() => router.push('/(employee)/daily-tasks')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Daily tasks checklist, showing task ${(taskIdx % shiftTasks.length) + 1} of ${shiftTasks.length}: ${shiftTasks[taskIdx % shiftTasks.length].title}`}
            >
              <View style={s.taskTickerIconBg}>
                <ListChecksIcon size={20} color={COLORS.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.taskTickerLabel}>{t('employeeHome.shiftChecklistLabel', { shift: t(SHIFT_LABEL_KEYS[todayTemplate.shiftType]) })}</Text>
                <Text style={s.taskTickerTitle} numberOfLines={1}>
                  {shiftTasks[taskIdx % shiftTasks.length].title}
                </Text>
              </View>
              <ChevronRightIcon size={16} color="#94A3B8" strokeWidth={2.5} />
            </TouchableOpacity>
            {shiftTasks.length > 1 && (
              <View style={s.taskTickerDots}>
                {shiftTasks.map((t: any, i: number) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setTaskIdx(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Show task ${i + 1}: ${t.title}`}
                  >
                    <View style={[s.taskTickerDot, i === (taskIdx % shiftTasks.length) && s.taskTickerDotActive]} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Info Footer ── */}
        <Animated.View style={{ opacity: fadeAnims[5], transform: [{ translateY: slideAnims[5] }] }}>
          <View style={s.infoFooter}>
            {[
              { icon: <DollarSignIcon size={14} color="#0369a1" strokeWidth={2} />, text: t('employeeHome.infoCashback') },
              { icon: <ReceiptIcon size={14} color="#0369a1" strokeWidth={2} />, text: t('employeeHome.infoReceipt') },
              ...(promotions.length > 0 ? [{ icon: <FlameIcon size={14} color="#0369a1" strokeWidth={2} />, text: t('employeeHome.infoPromosAuto') }] : []),
            ].map((row, i) => (
              <View key={i} style={s.infoRow}>
                <View style={s.infoIconWrap}>{row.icon}</View>
                <Text style={s.infoText}>{row.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EDF1F7' },

  // Header
  headerBg: { backgroundColor: '#1D3557' },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
  },
  storeLine: {
    color: 'rgba(255,255,255,0.45)', fontSize: 10,
    fontWeight: '800', letterSpacing: 1.5, marginBottom: 4,
  },
  greeting: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '600' },
  greetingName: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: -2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatarRing: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: { width: 44, height: 44, borderRadius: 22 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F4A261',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  statusText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  offTomorrowPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20,
  },
  offTomorrowEmoji: { fontSize: 12 },
  offTomorrowText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  promoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: '#F4A261',
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
  },
  promoStripText: { color: '#fff', fontSize: 12.5, fontWeight: '700', flex: 1 },

  // Body
  body: { padding: 16, paddingBottom: 24 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, marginTop: 28 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  // Action cards
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  actionCard: {
    flex: 1, borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 12, elevation: 5,
  },
  actionIconBg: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  actionTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  actionSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, lineHeight: 16 },
  actionArrow: {
    marginTop: 16, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end',
  },

  // Cards
  loadingCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', gap: 6 },
  emptyIconWrap: { marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 },

  promoCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, borderWidth: 1, borderColor: '#f0f1f2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  promoInfo: { flex: 1, paddingRight: 14 },
  promoTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  promoDesc: { color: '#6b7280', fontSize: 13, marginTop: 4, lineHeight: 18 },
  promoTag: {
    backgroundColor: '#f0fdf4', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 7, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  promoTagText: { color: '#16a34a', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  promoBadge: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#1D3557',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  promoBadgeRate: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 24 },
  promoBadgePct: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },

  dealCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#f0f1f2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  dealBadge: {
    backgroundColor: '#b45309', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 76, alignItems: 'center',
  },
  dealBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center' },
  dealTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  dealSub: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  dealCat: { color: '#b45309', fontSize: 11, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },

  // Daily report tile
  dailyReportTile: {
    backgroundColor: '#fff', borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderWidth: 1.5, borderColor: '#BFDBFE',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  dailyReportTileDone: { borderColor: '#86EFAC', shadowColor: '#16A34A', shadowOpacity: 0.06 },
  dailyReportTileLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  dailyReportIconBg: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  dailyReportIconBgDone: { backgroundColor: '#DCFCE7' },
  dailyReportTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 2 },
  dailyReportSub: { fontSize: 12, color: '#6b7280', lineHeight: 16 },

  // Daily tasks ticker
  taskTickerCard: {
    backgroundColor: '#fff', borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderWidth: 1, borderColor: '#f0f1f2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  taskTickerIconBg: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  taskTickerLabel: { fontSize: 10.5, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  taskTickerTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  taskTickerDots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 10 },
  taskTickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e5e7eb' },
  taskTickerDotActive: { backgroundColor: COLORS.primary, width: 16 },

  infoFooter: {
    backgroundColor: '#f0f9ff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#bae6fd', marginTop: 24, gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIconWrap: { marginTop: 2 },
  infoText: { flex: 1, fontSize: 13, color: '#0369a1', lineHeight: 20 },

  // Hot food orders tile
  hotFoodTile: {
    backgroundColor: '#fff', borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderWidth: 1.5, borderColor: '#FED7AA',
    shadowColor: '#EA580C', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  hotFoodTileActive: {
    backgroundColor: '#EA580C', borderColor: '#EA580C',
    shadowOpacity: 0.28, elevation: 6,
  },
  hotFoodTileLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  hotFoodTileRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hotFoodIconBg: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center',
  },
  hotFoodIconBgActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  hotFoodTileTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 2 },
  hotFoodTileTitleActive: { color: '#fff' },
  hotFoodTileSub:   { fontSize: 12, color: '#6b7280', lineHeight: 16 },
  hotFoodTileSubActive: { color: 'rgba(255,255,255,0.8)' },
  hotFoodBadge: {
    minWidth: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  hotFoodBadgeText: { color: '#EA580C', fontSize: 13, fontWeight: '900' },
});
