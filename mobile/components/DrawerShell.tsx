import {
  View, Text, TouchableOpacity, Animated, StyleSheet,
  Dimensions, Pressable, Image, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, router } from 'expo-router';
import { useRef, useState, ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';
import { MenuIcon, XIcon, LogOutIcon } from './Icons';

const SCREEN_W = Dimensions.get('window').width;
const DRAWER_W = Math.min(SCREEN_W * 0.78, 300);

// Screens that need the full screen to themselves - e.g. scan-receipt's
// full-bleed camera view, which the bottom bar used to visibly sit on top
// of (and stay tappable through) since this shell wraps every route.
const FULLSCREEN_ROUTES = ['scan-receipt'];

export interface NavItem {
  route: string;
  icon: (props: { color: string; size: number }) => ReactNode;
  label: string;
  badge?: number;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

interface Props {
  children: ReactNode;
  bottomItems: [NavItem, NavItem];
  groups: NavGroup[];
  headerColor?: string;
}

export default function DrawerShell({ children, bottomItems, groups, headerColor }: Props) {
  const { user, logout } = useAuthStore();
  const { t } = useTranslation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const slideX = useRef(new Animated.Value(-DRAWER_W)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    setOpen(true);
    Animated.parallel([
      Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 280, friction: 28, overshootClamping: true }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const closeDrawer = useCallback((cb?: () => void) => {
    Animated.parallel([
      Animated.timing(slideX, { toValue: -DRAWER_W, duration: 200, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => { setOpen(false); cb?.(); });
  }, []);

  function navigate(route: string) {
    closeDrawer(() => router.navigate(route as any));
  }

  const drawerBadgeTotal = groups.reduce(
    (sum, g) => sum + g.items.reduce((s, item) => s + (item.badge ?? 0), 0),
    0
  );

  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();
  const bgColor = headerColor || COLORS.secondary;

  const roleLabel = user?.role
    ? user.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  const storeLabel = user?.storeIds?.length === 1
    ? null  // store name not available here; role chip is enough
    : null;

  function isActive(route: string) {
    return pathname.endsWith(route.replace(/^\//, '')) || pathname === route;
  }

  function confirmSignOut() {
    Alert.alert(t('drawer.signOut'), t('drawer.signOutConfirm'), [
      { text: t('drawer.cancel'), style: 'cancel' },
      { text: t('drawer.signOut'), style: 'destructive', onPress: () => closeDrawer(() => logout()) },
    ]);
  }

  const isFullscreen = FULLSCREEN_ROUTES.some((r) => pathname.endsWith(r));

  return (
    <View style={s.root}>
      <View style={s.content}>{children}</View>

      {/* Bottom mini bar */}
      {!isFullscreen && (
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 6 }]}>
        {bottomItems.map((item) => {
          const active = isActive(item.route);
          return (
            <TouchableOpacity
              key={item.route}
              style={s.bottomBtn}
              onPress={() => router.navigate(item.route as any)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
            >
              <View style={[s.bottomIconWrap, active && { backgroundColor: bgColor + '20' }]}>
                {item.icon({ color: active ? bgColor : COLORS.textMuted, size: 22 })}
                {item.badge != null && item.badge > 0 && (
                  <View style={s.badge}><Text style={s.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text></View>
                )}
              </View>
              <Text style={[s.bottomLabel, active && { color: bgColor, fontWeight: '800' }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Menu button */}
        <TouchableOpacity
          style={s.bottomBtn}
          onPress={openDrawer}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${t('nav.menu')}${drawerBadgeTotal > 0 ? `, ${drawerBadgeTotal} unread` : ''}`}
        >
          <View style={s.bottomIconWrap}>
            <MenuIcon size={22} color={COLORS.textMuted} strokeWidth={2} />
            {drawerBadgeTotal > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{drawerBadgeTotal > 99 ? '99+' : drawerBadgeTotal}</Text></View>
            )}
          </View>
          <Text style={s.bottomLabel}>{t('nav.menu')}</Text>
        </TouchableOpacity>
      </View>
      )}

      {/* Drawer overlay + panel */}
      {open && (
        <>
          <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeDrawer()} />
          </Animated.View>

          <Animated.View style={[s.drawer, { transform: [{ translateX: slideX }] }]}>
            {/* Drawer header */}
            <View style={[s.drawerHeader, { backgroundColor: bgColor, paddingTop: insets.top + 16 }]}>
              <TouchableOpacity
                style={s.drawerHeaderLeft}
                onPress={() => navigate('profile')}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Open profile for ${user?.name || t('drawer.noName')}`}
              >
                {/* Avatar - photo or initial */}
                {user?.avatarUrl ? (
                  <Image
                    source={{ uri: user.avatarUrl, cache: 'reload' }}
                    style={s.drawerAvatarPhoto}
                  />
                ) : (
                  <View style={s.drawerAvatar}>
                    <Text style={s.drawerAvatarText}>{initial}</Text>
                  </View>
                )}
                <View style={s.drawerUserInfo}>
                  <Text style={s.drawerName} numberOfLines={1}>{user?.name || t('drawer.noName')}</Text>
                  <Text style={s.drawerPhone}>{user?.phone}</Text>
                  {roleLabel && (
                    <View style={s.roleChip}>
                      <Text style={s.roleChipText}>{roleLabel}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => closeDrawer()}
                style={s.drawerClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
              >
                <XIcon size={18} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Nav groups - scrollable */}
            <ScrollView
              style={s.drawerBody}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              bounces={false}
            >
              {groups.map((group, gi) => (
                <View key={gi} style={s.navGroup}>
                  {group.title && <Text style={s.navGroupTitle}>{t(`navGroup.${group.title.toLowerCase()}`, group.title)}</Text>}
                  {group.items.map((item) => {
                    const active = isActive(item.route);
                    return (
                      <TouchableOpacity
                        key={item.route}
                        style={[s.navItem, active && { backgroundColor: bgColor + '12' }]}
                        onPress={() => navigate(item.route)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        accessibilityState={{ selected: active }}
                      >
                        <View style={[s.navItemIconWrap, active && { backgroundColor: bgColor + '22' }]}>
                          {item.icon({ color: active ? bgColor : COLORS.textMuted, size: 20 })}
                        </View>
                        <Text style={[s.navItemLabel, active && { color: bgColor, fontWeight: '800' }]}>
                          {item.label}
                        </Text>
                        {item.badge != null && item.badge > 0 && (
                          <View style={s.navBadge}>
                            <Text style={s.navBadgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                          </View>
                        )}
                        {active && <View style={[s.activeBar, { backgroundColor: bgColor }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            {/* Sign out */}
            <TouchableOpacity
              style={[s.signOut, { marginBottom: insets.bottom + 16 }]}
              onPress={confirmSignOut}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('drawer.signOut')}
            >
              <LogOutIcon size={20} color="#E63946" strokeWidth={2} />
              <Text style={s.signOutText}>{t('drawer.signOut')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1 },

  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  bottomBtn: { flex: 1, alignItems: 'center', gap: 3 },
  bottomIconWrap: {
    width: 44, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  bottomLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  badge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: '#E63946', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 13 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },

  drawer: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    width: DRAWER_W,
    backgroundColor: '#fff',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 22,
  },
  drawerHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  drawerAvatarPhoto: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  drawerAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  drawerAvatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  drawerUserInfo: { flex: 1 },
  drawerName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  drawerPhone: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  roleChip: {
    alignSelf: 'flex-start', marginTop: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  roleChipText: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700' },
  drawerClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  drawerBody: { flex: 1, paddingTop: 8 },

  navGroup: { marginBottom: 4 },
  navGroupTitle: {
    fontSize: 10, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 11,
    marginHorizontal: 8, borderRadius: 14,
    position: 'relative',
  },
  navItemIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  navItemLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  navBadge: {
    backgroundColor: '#E63946', borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  navBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  activeBar: {
    position: 'absolute', right: 0, top: '25%', bottom: '25%',
    width: 3, borderRadius: 3,
  },

  signOut: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 24, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#E63946' },
});
