import {
  View, Text, TouchableOpacity, Animated, StyleSheet,
  Dimensions, Platform, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, router } from 'expo-router';
import { useRef, useState, ReactNode, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';

const SCREEN_W = Dimensions.get('window').width;
const DRAWER_W = Math.min(SCREEN_W * 0.78, 300);

export interface NavItem {
  route: string;
  emoji: string;
  label: string;
  badge?: number;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

interface Props {
  children: ReactNode;
  /** Two items shown permanently in the bottom bar */
  bottomItems: [NavItem, NavItem];
  /** All nav groups shown inside the drawer */
  groups: NavGroup[];
  headerColor?: string;
}

export default function DrawerShell({ children, bottomItems, groups, headerColor }: Props) {
  const { user, logout } = useAuthStore();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const slideX = useRef(new Animated.Value(-DRAWER_W)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    setOpen(true);
    Animated.parallel([
      Animated.spring(slideX, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
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

  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();
  const bgColor = headerColor || COLORS.secondary;

  function isActive(route: string) {
    // Match exact or prefix (e.g. /home matches /(customer)/home)
    return pathname.endsWith(route.replace(/^\//, '')) || pathname === route;
  }

  return (
    <View style={s.root}>
      {/* Main content */}
      <View style={s.content}>
        {children}
      </View>

      {/* Bottom mini bar */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 6 }]}>
        {bottomItems.map((item) => {
          const active = isActive(item.route);
          return (
            <TouchableOpacity
              key={item.route}
              style={s.bottomBtn}
              onPress={() => router.navigate(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[s.bottomIconWrap, active && { backgroundColor: bgColor + '20' }]}>
                <Text style={[s.bottomEmoji, { opacity: active ? 1 : 0.45, fontSize: active ? 22 : 20 }]}>
                  {item.emoji}
                </Text>
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
        <TouchableOpacity style={s.bottomBtn} onPress={openDrawer} activeOpacity={0.7}>
          <View style={s.bottomIconWrap}>
            <Text style={[s.bottomEmoji, { opacity: 0.6, fontSize: 20 }]}>☰</Text>
          </View>
          <Text style={s.bottomLabel}>Menu</Text>
        </TouchableOpacity>
      </View>

      {/* Drawer overlay + panel */}
      {open && (
        <>
          <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeDrawer()} />
          </Animated.View>

          <Animated.View style={[s.drawer, { transform: [{ translateX: slideX }] }]}>
            {/* Drawer header */}
            <View style={[s.drawerHeader, { backgroundColor: bgColor, paddingTop: insets.top + 16 }]}>
              <TouchableOpacity style={s.drawerHeaderLeft} onPress={() => navigate('profile')} activeOpacity={0.75}>
                <View style={s.drawerAvatar}>
                  <Text style={s.drawerAvatarText}>{initial}</Text>
                </View>
                <View style={s.drawerUserInfo}>
                  <Text style={s.drawerName} numberOfLines={1}>{user?.name || 'No name set'}</Text>
                  <Text style={s.drawerPhone}>{user?.phone}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => closeDrawer()} style={s.drawerClose}>
                <Text style={s.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Nav groups */}
            <View style={s.drawerBody}>
              {groups.map((group, gi) => (
                <View key={gi} style={s.navGroup}>
                  {group.title && <Text style={s.navGroupTitle}>{group.title}</Text>}
                  {group.items.map((item) => {
                    const active = isActive(item.route);
                    return (
                      <TouchableOpacity
                        key={item.route}
                        style={[s.navItem, active && { backgroundColor: bgColor + '14' }]}
                        onPress={() => navigate(item.route)}
                        activeOpacity={0.75}
                      >
                        <View style={[s.navItemIconWrap, active && { backgroundColor: bgColor + '20' }]}>
                          <Text style={s.navItemEmoji}>{item.emoji}</Text>
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
            </View>

            {/* Sign out */}
            <TouchableOpacity
              style={[s.signOut, { marginBottom: insets.bottom + 16 }]}
              onPress={() => closeDrawer(() => logout())}
              activeOpacity={0.8}
            >
              <Text style={s.signOutEmoji}>🚪</Text>
              <Text style={s.signOutText}>Sign Out</Text>
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

  // Bottom bar
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
    width: 44, height: 34, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  bottomEmoji: { fontSize: 20 },
  bottomLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  badge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: '#E63946', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 13 },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },

  // Drawer panel
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
    paddingHorizontal: 20, paddingBottom: 20,
  },
  drawerHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  drawerClose: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  drawerCloseText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  drawerBody: { flex: 1, paddingTop: 8, overflowY: 'scroll' as any },

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
  navItemEmoji: { fontSize: 19 },
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
  signOutEmoji: { fontSize: 18 },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#E63946' },
});
