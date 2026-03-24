import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <Text style={[s.iconEmoji, focused && s.iconEmojiActive]}>{emoji}</Text>
    </View>
  );
}

export default function ManagerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: s.bar,
        tabBarLabelStyle: s.label,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="offers"
        options={{
          title: 'Offers',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📢" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="banners"
        options={{
          title: 'Banners',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🖼️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.white,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 72,
    paddingBottom: 12,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 12,
  },
  label: { fontSize: 11, fontWeight: '700' },
  iconWrap: {
    width: 38, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: COLORS.primary + '18' },
  iconEmoji: { fontSize: 19, opacity: 0.45 },
  iconEmojiActive: { fontSize: 21, opacity: 1 },
});
