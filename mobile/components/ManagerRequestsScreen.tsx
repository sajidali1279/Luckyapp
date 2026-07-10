import {
  View, Text, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, type ReactElement } from 'react';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeRequestApi, chatApi, productRequestApi, employeeRequestApi } from '../services/api';
import { COLORS } from '../constants';
import FadeSlideIn from './FadeSlideIn';
import ErrorState from './ErrorState';
import {
  PackageIcon, ClipboardIcon, ShoppingBagIcon, BriefcaseIcon, TagIcon,
  CheckCircleIcon, XIcon, MessageCircleIcon, BuildingIcon, InboxIcon, BellIcon,
} from './Icons';

function TypeIcon({ type, size = 22, color = '#374151' }: { type: string; size?: number; color?: string }) {
  const p = { size, color, strokeWidth: 1.75 };
  switch (type) {
    case 'LOW_STOCK':                   return <PackageIcon {...p} />;
    case 'STORE_SUPPLIES':              return <ClipboardIcon {...p} />;
    case 'CUSTOMER_REQUESTED_PRODUCT':  return <ShoppingBagIcon {...p} />;
    case 'WORK_ORDER':                  return <BriefcaseIcon {...p} />;
    default:                            return <ClipboardIcon {...p} />;
  }
}

// ── Store alerts ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'Low Stock Alert',
  STORE_SUPPLIES: 'Store Supplies',
  CUSTOMER_REQUESTED_PRODUCT: 'Customer Asking',
  WORK_ORDER: 'Work Order',
};
const TYPE_BG: Record<string, string> = {
  LOW_STOCK: '#eff6ff', STORE_SUPPLIES: '#fefce8',
  CUSTOMER_REQUESTED_PRODUCT: '#f0fdf4', WORK_ORDER: '#fdf4ff',
};
const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#E63946', MEDIUM: '#f59e0b', LOW: '#2DC653',
};

// ── Product requests ──────────────────────────────────────────────────────────

const PR_STATUS: Record<string, { label: string; bg: string; color: string; border: string }> = {
  PENDING:  { label: 'Pending',  bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  ACCEPTED: { label: 'Accepted', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  DECLINED: { label: 'Declined', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
};

// ── Employee stock requests ───────────────────────────────────────────────────

const EMP_TYPE_LABELS: Record<string, string> = {
  LOW_STOCK:        'Low / Out of Stock',
  CUSTOMER_REQUEST: 'Customer Asked',
};
const REJECTION_REASONS: { key: string; label: string }[] = [
  { key: 'IN_STOCK',      label: 'In stock' },
  { key: 'NO_SUPPLIER',   label: 'No supplier' },
  { key: 'OUT_OF_BUDGET', label: 'Over budget' },
  { key: 'DUPLICATE',     label: 'Duplicate' },
  { key: 'OTHER',         label: 'Other' },
];

// ── Interfaces ────────────────────────────────────────────────────────────────

interface StoreRequest {
  id: string; storeId: string; submitterName: string; submitterRole: string;
  type: string; priority: string; notes: string | null; status: string;
  acknowledgedById: string | null; acknowledgerName: string | null;
  acknowledgerNote: string | null; acknowledgedAt: string | null;
  createdAt: string; store: { name: string };
}

interface ProductRequest {
  id: string; productName: string; category: string | null; description: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED'; responseNote: string | null;
  createdAt: string; customer: { id: string; name: string; phone: string };
}

interface EmpRequestLine {
  id: string; name: string; quantity?: string; category?: string; notes?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string; rejectionNote?: string;
}

interface EmployeeItemRequest {
  id: string; status: 'PENDING' | 'REVIEWED'; note?: string;
  requestType: string; createdAt: string;
  submittedBy: { id: string; name: string };
  reviewedBy?: { id: string; name: string };
  lines: EmpRequestLine[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function getInitial(name: string) { return (name || '?')[0].toUpperCase(); }
const AVATAR_COLORS = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', '#1D3557', '#E63946'];

// ── Component ─────────────────────────────────────────────────────────────────

type MainTab = 'alerts' | 'stock' | 'products';

export default function ManagerRequestsScreen() {
  const qc = useQueryClient();

  // ── Main tab ────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('alerts');

  // Switch to the requested tab when arriving from a notification tap
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useFocusEffect(useCallback(() => {
    if (tab && ['alerts', 'stock', 'products'].includes(tab)) {
      setMainTab(tab as MainTab);
      router.setParams({ tab: '' });
    }
  }, [tab]));

  // ── Store picker ────────────────────────────────────────────────────────────
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // ── Store alerts state ──────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ackTarget, setAckTarget] = useState<StoreRequest | null>(null);
  const [ackNote, setAckNote] = useState('');

  // ── Product requests state ──────────────────────────────────────────────────
  const [respondTarget, setRespondTarget] = useState<ProductRequest | null>(null);
  const [respondStatus, setRespondStatus] = useState<'ACCEPTED' | 'DECLINED'>('ACCEPTED');
  const [respondNote, setRespondNote] = useState('');

  // ── Stock requests (employee) state ─────────────────────────────────────────
  const [empFilter, setEmpFilter] = useState<string>('');
  const [reviewTarget, setReviewTarget] = useState<EmployeeItemRequest | null>(null);
  const [lineDecisions, setLineDecisions] = useState<Record<string, 'ACCEPT' | 'REJECT' | null>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  // ── Stores ──────────────────────────────────────────────────────────────────
  const { data: storesData } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data || [];
  const effectiveStoreId = stores.length === 1 ? stores[0]?.id : selectedStoreId;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: requestsData, isLoading: alertsLoading, isError: alertsError, refetch: refetchAlerts } = useQuery({
    queryKey: ['manager-store-requests', effectiveStoreId, statusFilter],
    queryFn: () => storeRequestApi.getStoreRequests(effectiveStoreId!, statusFilter || undefined),
    enabled: !!effectiveStoreId && mainTab === 'alerts',
    refetchInterval: 15000,
  });
  const requests: StoreRequest[] = requestsData?.data?.data || [];
  const pending = requests.filter(r => r.status === 'PENDING');
  const displayed = statusFilter === 'PENDING' ? pending
    : statusFilter === 'ACKNOWLEDGED' ? requests.filter(r => r.status === 'ACKNOWLEDGED')
    : requests;

  const { data: empData, isLoading: empLoading, isError: empError, refetch: refetchEmp } = useQuery({
    queryKey: ['manager-employee-requests', effectiveStoreId, empFilter],
    queryFn: () => employeeRequestApi.forStore(effectiveStoreId!, empFilter || undefined),
    enabled: !!effectiveStoreId && mainTab === 'stock',
    refetchInterval: 15000,
  });
  const empRequests: EmployeeItemRequest[] = empData?.data?.data || [];
  const pendingEmp = empRequests.filter(r => r.status === 'PENDING');
  const displayedEmp = empFilter === 'PENDING' ? pendingEmp
    : empFilter === 'REVIEWED' ? empRequests.filter(r => r.status === 'REVIEWED')
    : empRequests;

  const { data: productRequestsData, isLoading: prLoading, isError: prError, refetch: refetchPr } = useQuery({
    queryKey: ['manager-product-requests', effectiveStoreId],
    queryFn: () => productRequestApi.getStoreRequests(effectiveStoreId!),
    enabled: !!effectiveStoreId && mainTab === 'products',
    refetchInterval: 15000,
  });
  const productRequests: ProductRequest[] = productRequestsData?.data?.data || [];
  const pendingProducts = productRequests.filter(r => r.status === 'PENDING');

  // ── Mutations ────────────────────────────────────────────────────────────────
  const acknowledgeMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      storeRequestApi.acknowledge(id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-store-requests'] });
      setAckTarget(null); setAckNote('');
    },
    onError: (err: any) =>
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Something went wrong.'),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'ACCEPTED' | 'DECLINED'; note: string }) =>
      productRequestApi.respond(id, status, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-product-requests'] });
      setRespondTarget(null); setRespondNote('');
    },
    onError: (err: any) =>
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Something went wrong.'),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ requestId, lines }: {
      requestId: string;
      lines: { id: string; action: 'ACCEPT' | 'REJECT'; rejectionReason?: string }[];
    }) => employeeRequestApi.review(requestId, { lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-employee-requests'] });
      qc.invalidateQueries({ queryKey: ['employee-requests-pending-count'] });
      setReviewTarget(null); setLineDecisions({}); setRejectReasons({});
    },
    onError: (err: any) =>
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Something went wrong.'),
  });

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderAlertItem = useCallback(({ item, index }: { item: StoreRequest; index: number }) => {
    const pColor = PRIORITY_COLORS[item.priority] || '#adb5bd';
    const typeBg = TYPE_BG[item.type] || '#f3f4f6';
    const isDone = item.status === 'ACKNOWLEDGED';
    const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
    return (
      <View style={[s.card, isDone && s.cardDone]}>
        <View style={s.cardInner}>
          <View style={s.cardTop}>
            <View style={[s.typeIconWrap, { backgroundColor: typeBg }]}>
              <TypeIcon type={item.type} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.typeLabel, isDone && s.typeLabelDone]}>{TYPE_LABELS[item.type] || item.type}</Text>
              <Text style={s.metaSub}>{item.store?.name}</Text>
            </View>
            {!isDone ? (
              <View style={[s.prioBadge, { backgroundColor: pColor + '18', borderColor: pColor + '60' }]}>
                <View style={[s.prioBadgeDot, { backgroundColor: pColor }]} />
                <Text style={[s.prioBadgeText, { color: pColor }]}>{item.priority}</Text>
              </View>
            ) : (
              <View style={s.doneBadge}>
                <CheckCircleIcon size={12} color="#065f46" strokeWidth={2.5} />
                <Text style={s.doneBadgeText}>Done</Text>
              </View>
            )}
          </View>

          <View style={s.submitterRow}>
            <View style={[s.avatarCircle, { backgroundColor: avatarColor }]}>
              <Text style={s.avatarText}>{getInitial(item.submitterName)}</Text>
            </View>
            <Text style={s.submitterText}>
              <Text style={s.submitterName}>{item.submitterName}</Text>
              {'  ·  '}{formatTime(item.createdAt)}
            </Text>
          </View>

          {item.notes ? (
            <View style={s.notesBox}><Text style={s.notesText}>"{item.notes}"</Text></View>
          ) : null}

          {isDone ? (
            <View style={s.ackBox}>
              <CheckCircleIcon size={18} color="#16a34a" strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={s.ackBy}>Handled by {item.acknowledgerName}</Text>
                {item.acknowledgerNote ? <Text style={s.ackNote}>"{item.acknowledgerNote}"</Text> : null}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => { setAckTarget(item); setAckNote(''); }}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${TYPE_LABELS[item.type] || item.type} alert as handled`}
            >
              <CheckCircleIcon size={15} color="#fff" strokeWidth={2.25} />
              <Text style={s.actionBtnText}>Mark as Handled</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, []);

  const renderEmpItem = useCallback(({ item }: { item: EmployeeItemRequest }) => {
    const isPending = item.status === 'PENDING';
    const accepted = item.lines.filter(l => l.status === 'ACCEPTED').length;
    const rejected = item.lines.filter(l => l.status === 'REJECTED').length;
    const typeLabel = EMP_TYPE_LABELS[item.requestType] || item.requestType;

    return (
      <View style={[s.card, !isPending && s.cardDone]}>
        <View style={s.cardInner}>
          <View style={s.cardTop}>
            <View style={[s.typeIconWrap, { backgroundColor: '#eff6ff' }]}>
              <PackageIcon size={22} color="#2563eb" strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.typeLabel, !isPending && s.typeLabelDone]}>{typeLabel}</Text>
              <Text style={s.metaSub}>
                {item.lines.length} item{item.lines.length !== 1 ? 's' : ''}
                {!isPending ? ` · ${accepted} accepted, ${rejected} declined` : ''}
              </Text>
            </View>
            {isPending ? (
              <View style={[s.prioBadge, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
                <View style={[s.prioBadgeDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={[s.prioBadgeText, { color: '#c2410c' }]}>Pending</Text>
              </View>
            ) : (
              <View style={s.doneBadge}>
                <CheckCircleIcon size={12} color="#065f46" strokeWidth={2.5} />
                <Text style={s.doneBadgeText}>Reviewed</Text>
              </View>
            )}
          </View>

          <View style={s.submitterRow}>
            <View style={[s.avatarCircle, { backgroundColor: '#7c3aed' }]}>
              <Text style={s.avatarText}>{getInitial(item.submittedBy.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.submitterText}>
                <Text style={s.submitterName}>{item.submittedBy.name}</Text>
                {'  ·  '}{formatTime(item.createdAt)}
              </Text>
              {item.reviewedBy && (
                <Text style={s.metaSub}>Reviewed by {item.reviewedBy.name}</Text>
              )}
            </View>
          </View>

          {/* Show line previews grouped by category */}
          {(() => {
            const byCategory: Record<string, EmpRequestLine[]> = {};
            for (const l of item.lines) {
              const k = l.category || 'Uncategorized';
              if (!byCategory[k]) byCategory[k] = [];
              byCategory[k].push(l);
            }
            return Object.entries(byCategory).map(([cat, lines]) => (
              <View key={cat} style={s.lineGroup}>
                <Text style={s.lineCatHeader}>{cat}</Text>
                {lines.map(l => (
                  <View key={l.id} style={[
                    s.linePreviewRow,
                    l.status === 'ACCEPTED' && { borderLeftColor: '#16a34a' },
                    l.status === 'REJECTED' && { borderLeftColor: '#E63946' },
                  ]}>
                    <Text style={s.linePreviewName} numberOfLines={1}>{l.name}</Text>
                    {l.quantity ? <Text style={s.linePreviewQty}>{l.quantity}</Text> : null}
                    {l.status === 'ACCEPTED' && <CheckCircleIcon size={14} color="#16a34a" strokeWidth={2.5} />}
                    {l.status === 'REJECTED' && <XIcon size={14} color="#E63946" strokeWidth={2.5} />}
                  </View>
                ))}
              </View>
            ));
          })()}

          {isPending && (
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#1e40af', shadowColor: '#1e40af' }]}
              onPress={() => {
                const decisions: Record<string, 'ACCEPT' | 'REJECT' | null> = {};
                item.lines.forEach(l => { decisions[l.id] = null; });
                setLineDecisions(decisions);
                setRejectReasons({});
                setReviewTarget(item);
              }}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityLabel={`Review stock request from ${item.submittedBy.name}`}
            >
              <ClipboardIcon size={15} color="#fff" strokeWidth={2.25} />
              <Text style={s.actionBtnText}>Review Items</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, []);

  const renderProductItem = useCallback(({ item }: { item: ProductRequest }) => {
    const st = PR_STATUS[item.status] || PR_STATUS.PENDING;
    const isPending = item.status === 'PENDING';
    return (
      <View style={[s.card, !isPending && s.cardDone]}>
        <View style={s.cardInner}>
          <View style={s.cardTop}>
            <View style={[s.typeIconWrap, { backgroundColor: '#fff7ed' }]}>
              <ShoppingBagIcon size={22} color="#c2410c" strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.typeLabel, !isPending && s.typeLabelDone]}>{item.productName}</Text>
              {item.category ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <TagIcon size={11} color={COLORS.textMuted} strokeWidth={2} />
                  <Text style={s.categoryMeta}>{item.category}</Text>
                </View>
              ) : item.description ? (
                <Text style={s.metaSub} numberOfLines={1}>{item.description}</Text>
              ) : null}
            </View>
            <View style={[s.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
              <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>

          <View style={s.submitterRow}>
            <View style={[s.avatarCircle, { backgroundColor: '#7c3aed' }]}>
              <Text style={s.avatarText}>{getInitial(item.customer.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.submitterText}>
                <Text style={s.submitterName}>{item.customer.name}</Text>
                {'  ·  '}{formatTime(item.createdAt)}
              </Text>
              <Text style={s.metaSub}>{item.customer.phone}</Text>
            </View>
          </View>

          {item.responseNote ? (
            <View style={[s.notesBox, { backgroundColor: st.bg, borderColor: st.border }]}>
              <Text style={[s.notesText, { color: st.color }]}>Response: "{item.responseNote}"</Text>
            </View>
          ) : null}

          {isPending ? (
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#1e40af', shadowColor: '#1e40af' }]}
              onPress={() => { setRespondTarget(item); setRespondStatus('ACCEPTED'); setRespondNote(''); }}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityLabel={`Respond to product request for ${item.productName}`}
            >
              <MessageCircleIcon size={15} color="#fff" strokeWidth={2} />
              <Text style={s.actionBtnText}>Respond to Request</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }, []);

  // ── Review helpers ────────────────────────────────────────────────────────────
  const allDecided = reviewTarget
    ? reviewTarget.lines.every(l => lineDecisions[l.id] !== null && lineDecisions[l.id] !== undefined)
    : false;

  function submitReview() {
    if (!reviewTarget) return;
    const lines = reviewTarget.lines.map(l => ({
      id: l.id,
      action: lineDecisions[l.id] as 'ACCEPT' | 'REJECT',
      ...(lineDecisions[l.id] === 'REJECT' ? { rejectionReason: rejectReasons[l.id] || 'OTHER' } : {}),
    }));
    reviewMutation.mutate({ requestId: reviewTarget.id, lines });
  }

  const isLoading = mainTab === 'alerts' ? alertsLoading
    : mainTab === 'stock' ? empLoading
    : prLoading;
  const isError = mainTab === 'alerts' ? alertsError
    : mainTab === 'stock' ? empError
    : prError;
  const refetchCurrent = mainTab === 'alerts' ? refetchAlerts
    : mainTab === 'stock' ? refetchEmp
    : refetchPr;

  // ── Tab config ────────────────────────────────────────────────────────────────
  const TABS: { key: MainTab; icon: (p: { size: number; color: string }) => ReactElement; label: string; badge: number }[] = [
    { key: 'alerts',   icon: (p) => <BellIcon {...p} strokeWidth={2} />,        label: 'Alerts',   badge: pending.length },
    { key: 'stock',    icon: (p) => <PackageIcon {...p} strokeWidth={2} />,     label: 'Stock',    badge: pendingEmp.length },
    { key: 'products', icon: (p) => <ShoppingBagIcon {...p} strokeWidth={2} />, label: 'Products', badge: pendingProducts.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>
              {mainTab === 'alerts' ? 'STORE ALERTS'
                : mainTab === 'stock' ? 'STOCK REQUESTS'
                : 'PRODUCT REQUESTS'}
            </Text>
            <Text style={s.headerTitle}>
              {mainTab === 'alerts' ? 'Store Alerts'
                : mainTab === 'stock' ? 'Stock Requests'
                : 'Product Requests'}
            </Text>
          </View>
          {(() => {
            const badgeCount = TABS.find(t => t.key === mainTab)?.badge ?? 0;
            return badgeCount > 0 ? (
              <View style={s.pendingBadge}>
                <Text style={s.pendingBadgeNum}>{badgeCount}</Text>
                <Text style={s.pendingBadgeLbl}>pending</Text>
              </View>
            ) : null;
          })()}
        </View>

        {/* Store picker */}
        {stores.length > 1 && (
          <View style={s.storePickerRow}>
            {stores.map(st => (
              <TouchableOpacity
                key={st.id}
                style={[s.storeChip, st.id === effectiveStoreId && s.storeChipActive]}
                onPress={() => setSelectedStoreId(st.id)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="tab"
                accessibilityLabel={`Select store ${st.name}`}
              >
                <Text style={[s.storeChipText, st.id === effectiveStoreId && s.storeChipTextActive]}>
                  {st.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Main tabs */}
        <View style={s.mainTabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[s.mainTab, mainTab === tab.key && s.mainTabActive]}
              onPress={() => setMainTab(tab.key)}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} tab${tab.badge > 0 ? `, ${tab.badge} pending` : ''}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {tab.icon({ size: 13, color: mainTab === tab.key ? COLORS.managerPrimary : 'rgba(255,255,255,0.70)' })}
                <Text style={[s.mainTabText, mainTab === tab.key && s.mainTabTextActive]}>
                  {tab.label}
                </Text>
              </View>
              {tab.badge > 0 && (
                <View style={[s.mainTabCount, mainTab === tab.key && s.mainTabCountActive]}>
                  <Text style={[s.mainTabCountText, mainTab === tab.key && s.mainTabCountTextActive]}>
                    {tab.badge}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Sub-filter (alerts tab) */}
        {effectiveStoreId && mainTab === 'alerts' && (
          <View style={s.filterRow}>
            {[
              { key: '', label: 'All', count: requests.length },
              { key: 'PENDING', label: 'Pending', count: pending.length },
              { key: 'ACKNOWLEDGED', label: 'Done', count: requests.length - pending.length },
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.filterTab, statusFilter === f.key && s.filterTabActive]}
                onPress={() => setStatusFilter(f.key)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="tab"
                accessibilityLabel={`Filter alerts by ${f.label}`}
              >
                <Text style={[s.filterTabText, statusFilter === f.key && s.filterTabTextActive]}>{f.label}</Text>
                {f.count > 0 && (
                  <View style={[s.filterCount, statusFilter === f.key && s.filterCountActive]}>
                    <Text style={[s.filterCountText, statusFilter === f.key && s.filterCountTextActive]}>{f.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Sub-filter (stock requests tab) */}
        {effectiveStoreId && mainTab === 'stock' && (
          <View style={s.filterRow}>
            {[
              { key: '', label: 'All', count: empRequests.length },
              { key: 'PENDING', label: 'Pending', count: pendingEmp.length },
              { key: 'REVIEWED', label: 'Reviewed', count: empRequests.length - pendingEmp.length },
            ].map(f => (
              <TouchableOpacity
                key={f.key}
                style={[s.filterTab, empFilter === f.key && s.filterTabActive]}
                onPress={() => setEmpFilter(f.key)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="tab"
                accessibilityLabel={`Filter stock requests by ${f.label}`}
              >
                <Text style={[s.filterTabText, empFilter === f.key && s.filterTabTextActive]}>{f.label}</Text>
                {f.count > 0 && (
                  <View style={[s.filterCount, empFilter === f.key && s.filterCountActive]}>
                    <Text style={[s.filterCountText, empFilter === f.key && s.filterCountTextActive]}>{f.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SafeAreaView>

      {/* ── Content ── */}
      {!effectiveStoreId ? (
        <View style={s.centered}>
          <View style={{ marginBottom: 12 }}><BuildingIcon size={44} color="#d1d5db" strokeWidth={1.25} /></View>
          <Text style={s.emptyTitle}>Select a store</Text>
          <Text style={s.emptySub}>Choose a store above to view requests</Text>
        </View>
      ) : isLoading ? (
        <View style={s.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : isError ? (
        <ErrorState message="Failed to load requests." onRetry={() => refetchCurrent()} />
      ) : mainTab === 'alerts' ? (
        displayed.length === 0 ? (
          <View style={s.centered}>
            <View style={{ marginBottom: 12 }}>
              {statusFilter === 'PENDING'
                ? <CheckCircleIcon size={44} color="#86efac" strokeWidth={1.5} />
                : <InboxIcon size={44} color="#d1d5db" strokeWidth={1.25} />}
            </View>
            <Text style={s.emptyTitle}>{statusFilter === 'PENDING' ? 'All clear!' : 'Nothing here'}</Text>
            <Text style={s.emptySub}>{statusFilter === 'PENDING' ? 'No pending alerts' : 'No alerts in this category'}</Text>
          </View>
        ) : (
          <FadeSlideIn style={{ flex: 1 }}>
            <FlatList data={displayed} keyExtractor={r => r.id} renderItem={renderAlertItem} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
          </FadeSlideIn>
        )
      ) : mainTab === 'stock' ? (
        displayedEmp.length === 0 ? (
          <View style={s.centered}>
            <View style={{ marginBottom: 12 }}>
              {empFilter === 'PENDING'
                ? <CheckCircleIcon size={44} color="#86efac" strokeWidth={1.5} />
                : <InboxIcon size={44} color="#d1d5db" strokeWidth={1.25} />}
            </View>
            <Text style={s.emptyTitle}>{empFilter === 'PENDING' ? 'All reviewed!' : 'Nothing here'}</Text>
            <Text style={s.emptySub}>{empFilter === 'PENDING' ? 'No pending stock requests' : 'No stock requests in this category'}</Text>
          </View>
        ) : (
          <FadeSlideIn style={{ flex: 1 }}>
            <FlatList data={displayedEmp} keyExtractor={r => r.id} renderItem={renderEmpItem} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
          </FadeSlideIn>
        )
      ) : (
        productRequests.length === 0 ? (
          <View style={s.centered}>
            <View style={{ marginBottom: 12 }}><ShoppingBagIcon size={44} color="#d1d5db" strokeWidth={1.25} /></View>
            <Text style={s.emptyTitle}>No product requests</Text>
            <Text style={s.emptySub}>Customer product requests will appear here</Text>
          </View>
        ) : (
          <FadeSlideIn style={{ flex: 1 }}>
            <FlatList data={productRequests} keyExtractor={r => r.id} renderItem={renderProductItem} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} />
          </FadeSlideIn>
        )
      )}

      {/* ── Acknowledge Sheet (Store Alerts) ── */}
      <Modal visible={!!ackTarget} animationType="slide" transparent onRequestClose={() => setAckTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetDrag} />
            <Text style={s.sheetTitle}>Mark as Handled</Text>
            {ackTarget && (
              <View style={s.previewCard}>
                <View style={[s.previewIconWrap, { backgroundColor: TYPE_BG[ackTarget.type] || '#f3f4f6' }]}>
                  <TypeIcon type={ackTarget.type} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.previewType}>{TYPE_LABELS[ackTarget.type]}</Text>
                  <Text style={s.previewMeta}>from {ackTarget.submitterName}</Text>
                  {ackTarget.notes ? <Text style={s.previewNotes} numberOfLines={2}>"{ackTarget.notes}"</Text> : null}
                </View>
                <View style={[s.previewPrio, { backgroundColor: (PRIORITY_COLORS[ackTarget.priority] || '#aaa') + '22' }]}>
                  <Text style={[s.previewPrioText, { color: PRIORITY_COLORS[ackTarget.priority] || '#aaa' }]}>{ackTarget.priority}</Text>
                </View>
              </View>
            )}
            <Text style={s.sheetLabel}>Note <Text style={s.optionalTag}>(optional)</Text></Text>
            <TextInput style={s.noteInput} value={ackNote} onChangeText={setAckNote} placeholder="e.g. Ordered, arriving Thursday…" placeholderTextColor="#9ca3af" multiline maxLength={300} numberOfLines={3} textAlignVertical="top" />
            <View style={s.sheetActions}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => setAckTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, acknowledgeMutation.isPending && { opacity: 0.65 }]}
                disabled={acknowledgeMutation.isPending}
                onPress={() => ackTarget && acknowledgeMutation.mutate({ id: ackTarget.id, note: ackNote })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Confirm alert handled"
              >
                {acknowledgeMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <CheckCircleIcon size={16} color="#fff" strokeWidth={2.25} />
                    <Text style={s.confirmBtnText}>Confirm</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Review Sheet (Stock Requests) ── */}
      <Modal visible={!!reviewTarget} animationType="slide" transparent onRequestClose={() => setReviewTarget(null)}>
        <View style={s.overlay}>
          {/* flex: 1 gives this a defined height so the inner ScrollView can expand */}
          <View style={[s.sheet, { flex: 1, maxHeight: '92%' }]}>
            <View style={s.sheetDrag} />
            <View style={s.reviewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>Review Stock Request</Text>
                {reviewTarget && (
                  <Text style={s.reviewMeta}>
                    {reviewTarget.submittedBy.name} · {EMP_TYPE_LABELS[reviewTarget.requestType] || reviewTarget.requestType}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={s.acceptAllBtn}
                onPress={() => {
                  if (!reviewTarget) return;
                  const d: Record<string, 'ACCEPT' | 'REJECT' | null> = {};
                  reviewTarget.lines.forEach(l => { d[l.id] = 'ACCEPT'; });
                  setLineDecisions(d);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Accept all items"
              >
                <CheckCircleIcon size={13} color="#15803d" strokeWidth={2.25} />
                <Text style={s.acceptAllBtnText}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setReviewTarget(null)}
                style={s.closeBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <XIcon size={14} color="#6b7280" strokeWidth={2.25} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {reviewTarget?.lines.map(line => {
                const decision = lineDecisions[line.id];
                return (
                  <View key={line.id} style={s.reviewLineCard}>
                    <View style={s.reviewLineTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.reviewLineName}>{line.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          {line.category ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <TagIcon size={11} color="#6b7280" strokeWidth={2} />
                              <Text style={s.reviewLineMeta}>{line.category}</Text>
                            </View>
                          ) : null}
                          {line.quantity ? <Text style={s.reviewLineMeta}>· {line.quantity}</Text> : null}
                        </View>
                      </View>
                      <View style={s.decisionRow}>
                        <TouchableOpacity
                          style={[s.decisionBtn, decision === 'ACCEPT' && s.decisionBtnAccept]}
                          onPress={() => setLineDecisions(prev => ({ ...prev, [line.id]: 'ACCEPT' }))}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Accept ${line.name}`}
                        >
                          <CheckCircleIcon size={20} color={decision === 'ACCEPT' ? '#16a34a' : '#9ca3af'} strokeWidth={2.25} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.decisionBtn, decision === 'REJECT' && s.decisionBtnReject]}
                          onPress={() => setLineDecisions(prev => ({ ...prev, [line.id]: 'REJECT' }))}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Reject ${line.name}`}
                        >
                          <XIcon size={20} color={decision === 'REJECT' ? '#E63946' : '#9ca3af'} strokeWidth={2.25} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {decision === 'REJECT' && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.reasonRow}>
                        {REJECTION_REASONS.map(r => (
                          <TouchableOpacity
                            key={r.key}
                            style={[s.reasonPill, rejectReasons[line.id] === r.key && s.reasonPillActive]}
                            onPress={() => setRejectReasons(prev => ({ ...prev, [line.id]: r.key }))}
                            hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Select rejection reason ${r.label} for ${line.name}`}
                          >
                            <Text style={[s.reasonPillText, rejectReasons[line.id] === r.key && s.reasonPillTextActive]}>
                              {r.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
              <View style={{ height: 16 }} />
            </ScrollView>

            <View style={[s.sheetActions, { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => setReviewTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, (!allDecided || reviewMutation.isPending) && { opacity: 0.45 }]}
                disabled={!allDecided || reviewMutation.isPending}
                onPress={submitReview}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Submit review"
              >
                {reviewMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <>
                      <ClipboardIcon size={16} color="#fff" strokeWidth={2.25} />
                      <Text style={s.confirmBtnText}>
                        Submit Review{reviewTarget ? ` (${reviewTarget.lines.length})` : ''}
                      </Text>
                    </>
                  )
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Respond Sheet (Product Requests) ── */}
      <Modal visible={!!respondTarget} animationType="slide" transparent onRequestClose={() => setRespondTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetDrag} />
            <Text style={s.sheetTitle}>Respond to Request</Text>
            {respondTarget && (
              <View style={s.previewCard}>
                <View style={[s.previewIconWrap, { backgroundColor: '#fff7ed' }]}>
                  <ShoppingBagIcon size={20} color="#c2410c" strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.previewType}>{respondTarget.productName}</Text>
                  <Text style={s.previewMeta}>{respondTarget.customer.name} · {respondTarget.customer.phone}</Text>
                  {respondTarget.description ? <Text style={s.previewNotes} numberOfLines={2}>"{respondTarget.description}"</Text> : null}
                </View>
              </View>
            )}
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleBtn, respondStatus === 'ACCEPTED' && s.toggleBtnAccept]}
                onPress={() => setRespondStatus('ACCEPTED')}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel="Set response to accept"
              >
                <CheckCircleIcon size={15} color={respondStatus === 'ACCEPTED' ? '#15803d' : '#6b7280'} strokeWidth={2.25} />
                <Text style={[s.toggleBtnText, respondStatus === 'ACCEPTED' && s.toggleBtnTextAccept]}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, respondStatus === 'DECLINED' && s.toggleBtnDecline]}
                onPress={() => setRespondStatus('DECLINED')}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel="Set response to decline"
              >
                <XIcon size={15} color={respondStatus === 'DECLINED' ? '#b91c1c' : '#6b7280'} strokeWidth={2.25} />
                <Text style={[s.toggleBtnText, respondStatus === 'DECLINED' && s.toggleBtnTextDecline]}>Decline</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.sheetLabel}>Note <Text style={s.optionalTag}>(optional)</Text></Text>
            <TextInput
              style={s.noteInput} value={respondNote} onChangeText={setRespondNote}
              placeholder={respondStatus === 'ACCEPTED' ? "e.g. We'll stock it next week…" : "e.g. Not available from our supplier…"}
              placeholderTextColor="#9ca3af" multiline maxLength={300} numberOfLines={3} textAlignVertical="top"
            />
            <View style={s.sheetActions}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => setRespondTarget(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, respondStatus === 'DECLINED' && { backgroundColor: '#E63946', shadowColor: '#E63946' }, respondMutation.isPending && { opacity: 0.65 }]}
                disabled={respondMutation.isPending}
                onPress={() => respondTarget && respondMutation.mutate({ id: respondTarget.id, status: respondStatus, note: respondNote })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={respondStatus === 'ACCEPTED' ? 'Accept product request' : 'Decline product request'}
              >
                {respondMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <>
                      {respondStatus === 'ACCEPTED'
                        ? <CheckCircleIcon size={16} color="#fff" strokeWidth={2.25} />
                        : <XIcon size={16} color="#fff" strokeWidth={2.25} />}
                      <Text style={s.confirmBtnText}>{respondStatus === 'ACCEPTED' ? 'Accept Request' : 'Decline Request'}</Text>
                    </>
                  )
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  headerBg: { backgroundColor: COLORS.managerPrimary },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 12,
  },
  headerEyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

  pendingBadge: {
    backgroundColor: '#E63946', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, alignItems: 'center',
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 4,
  },
  pendingBadgeNum: { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 20 },
  pendingBadgeLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700' },

  storePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  storeChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.5)' },
  storeChipText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff' },

  mainTabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 4, gap: 6 },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  mainTabActive: { backgroundColor: '#fff', borderColor: '#fff' },
  mainTabText: { color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: '700' },
  mainTabTextActive: { color: COLORS.managerPrimary },
  mainTabCount: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  mainTabCountActive: { backgroundColor: '#E63946' },
  mainTabCountText: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '800' },
  mainTabCountTextActive: { color: '#fff' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8, gap: 8 },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  filterTabActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterTabText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: COLORS.managerPrimary },
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterCountActive: { backgroundColor: COLORS.managerPrimary },
  filterCountText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800' },
  filterCountTextActive: { color: '#fff' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  cardDone: { opacity: 0.75 },
  cardInner: { padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  typeLabelDone: { color: '#6b7280' },
  metaSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  categoryMeta: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginTop: 2 },

  prioBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  prioBadgeDot: { width: 7, height: 7, borderRadius: 4 },
  prioBadgeText: { fontSize: 10, fontWeight: '800' },

  doneBadge: {
    backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#a7f3d0',
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  doneBadgeText: { fontSize: 11, fontWeight: '700', color: '#065f46' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  submitterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  submitterText: { fontSize: 12, color: '#6b7280' },
  submitterName: { fontWeight: '700', color: '#374151' },

  notesBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  notesText: { fontSize: 13, color: '#374151', fontStyle: 'italic', lineHeight: 18 },

  ackBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#bbf7d0',
  },
  ackIcon: { fontSize: 15, marginTop: 1 },
  ackBy: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  ackNote: { fontSize: 12, color: '#16a34a', fontStyle: 'italic', marginTop: 2 },

  actionBtn: {
    backgroundColor: COLORS.managerPrimary, paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 12, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 6,
    shadowColor: COLORS.managerPrimary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Employee line group preview
  lineGroup: { gap: 2 },
  lineCatHeader: { fontSize: 10, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  linePreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8,
    backgroundColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: '#e5e7eb',
  },
  linePreviewName: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },
  linePreviewQty: { fontSize: 11, color: '#9ca3af' },

  // Bottom sheets
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 16,
  },
  sheetDrag: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },

  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  acceptAllBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#bbf7d0',
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  acceptAllBtnText: { fontSize: 12, fontWeight: '800', color: '#15803d' },

  reviewLineCard: {
    borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb', padding: 12, gap: 8, marginBottom: 8,
  },
  reviewLineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewLineName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reviewLineMeta: { fontSize: 11, color: '#6b7280' },
  decisionRow: { flexDirection: 'row', gap: 6 },
  decisionBtn: {
    width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  decisionBtnAccept: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  decisionBtnReject: { borderColor: '#E63946', backgroundColor: '#fef2f2' },
  reasonRow: { marginTop: 2 },
  reasonPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginRight: 6,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  reasonPillActive: { backgroundColor: '#fef2f2', borderColor: '#E63946' },
  reasonPillText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  reasonPillTextActive: { color: '#b91c1c' },

  previewCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb',
  },
  previewIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewType: { fontSize: 14, fontWeight: '700', color: '#111827' },
  previewMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  previewNotes: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 4 },
  previewPrio: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  previewPrioText: { fontSize: 10, fontWeight: '800' },

  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 6,
    borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#f9fafb',
  },
  toggleBtnAccept: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  toggleBtnDecline: { borderColor: '#E63946', backgroundColor: '#fef2f2' },
  toggleBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  toggleBtnTextAccept: { color: '#15803d' },
  toggleBtnTextDecline: { color: '#b91c1c' },

  sheetLabel: { fontSize: 11, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8 },
  optionalTag: { fontSize: 10, fontWeight: '500', textTransform: 'none', color: '#9ca3af' },
  noteInput: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#111827', minHeight: 88, backgroundColor: '#f9fafb',
  },

  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmBtn: {
    flex: 2, padding: 15, borderRadius: 12, backgroundColor: COLORS.managerPrimary, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 6,
    shadowColor: COLORS.managerPrimary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
