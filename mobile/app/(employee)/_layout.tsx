import { Tabs } from 'expo-router';
import { COLORS } from '../../constants';

export default function EmployeeLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.border,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon label="🏠" color={color} /> }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: ({ color }) => <TabIcon label="📷" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: ({ color }) => <TabIcon label="👤" color={color} /> }} />
    </Tabs>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, opacity: color === COLORS.primary ? 1 : 0.5 }}>{label}</Text>;
}
