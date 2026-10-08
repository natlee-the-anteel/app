import { Tabs } from 'expo-router';

const COLORS = {
  ink: '#102536',
  muted: '#637584',
  white: '#FFFFFF',
  orange: '#F47721',
  border: '#D7E0E6',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.orange,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          height: 76,
          paddingTop: 10,
          paddingBottom: 12,
          borderTopColor: COLORS.border,
          backgroundColor: COLORS.white,
        },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="activity" options={{ title: 'Telemetry' }} />
      <Tabs.Screen name="medical-id" options={{ title: 'Medical ID' }} />
    </Tabs>
  );
}
