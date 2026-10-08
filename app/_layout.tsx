import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { migrateDbIfNeeded } from '../database/db';
import ImpactResponseModal from '../src/components/ImpactResponseModal';
import MedicalPassQuickAccess from '../src/components/MedicalPassQuickAccess';
import { SensorProvider, useSensor } from '../src/context/SensorContext';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="summit-sentinel.db" onInit={migrateDbIfNeeded}>
      <SensorProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
          <MedicalPassQuickAccess />
          <ActiveImpactResponse />
        </View>
      </SensorProvider>
    </SQLiteProvider>
  );
}

function ActiveImpactResponse() {
  const { activeImpact, dismissImpact } = useSensor();
  if (!activeImpact) return null;
  return (
    <ImpactResponseModal
      key={activeImpact.id}
      impactId={activeImpact.id}
      accelerationG={activeImpact.accelerationG}
      onDismiss={dismissImpact}
    />
  );
}
