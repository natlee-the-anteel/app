import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSensor } from '../../src/context/SensorContext';
import type { ConnectionStatus } from '../../src/context/SensorContext';

const COLORS = {
  ink: '#102536',
  muted: '#637584',
  snow: '#F2F6F8',
  white: '#FFFFFF',
  navy: '#102536',
  orange: '#F47721',
  blue: '#1769AA',
  red: '#B52626',
  green: '#16834A',
  border: '#D7E0E6',
  paleBlue: '#EAF3FA',
  paleOrange: '#FFF2E8',
  paleRed: '#FCECEC',
};

type Scenario = {
  peakG: number;
  title: string;
  detail: string;
  color: string;
  background: string;
};

const SCENARIOS: Scenario[] = [
  { peakG: 2, title: 'Normal Movement', detail: 'Everyday motion', color: COLORS.blue, background: COLORS.paleBlue },
  { peakG: 10, title: 'Hard Turn', detail: 'High-force maneuver', color: COLORS.orange, background: COLORS.paleOrange },
  { peakG: 65, title: 'Severe Impact', detail: 'High-magnitude test', color: COLORS.red, background: COLORS.paleRed },
];

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  Disconnected: COLORS.red,
  Scanning: COLORS.orange,
  Connected: COLORS.green,
};

export default function DashboardScreen() {
  const {
    connectionStatus,
    batteryLevel,
    developerMockMode,
    latestTelemetry,
    latestSensorReading,
    connectedDeviceName,
    bleSessionActive,
    bleError,
    setDeveloperMockMode,
    emitMockTelemetry,
    startBleScan,
    stopBleScan,
  } = useSensor();
  const mockControlsEnabled = developerMockMode && connectionStatus !== 'Connected';
  const [lastSent, setLastSent] = useState<string | null>(null);

  const handleEmit = (scenario: Scenario) => {
    emitMockTelemetry(scenario.peakG, scenario.title);
    setLastSent(`${scenario.title} · ${scenario.peakG}g`);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>MOUNTAIN SAFETY SYSTEM</Text>
            <Text style={styles.title}>Ride check</Text>
          </View>
          <View style={styles.logoMark} accessibilityLabel="Summit Sentinel">
            <Text style={styles.logoText}>SS</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>Your sensor at a glance. Stay safe out there.</Text>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Sensor Status</Text>
          <Text style={styles.liveLabel}>
            {connectionStatus === 'Connected' ? 'SENSOR' : connectionStatus === 'Scanning' ? 'SCANNING' : 'DEMO'}
          </Text>
        </View>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusIndicatorRow}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[connectionStatus] }]} />
              <View>
                <Text style={styles.cardLabel}>CONNECTION</Text>
                <Text style={styles.statusValue}>{connectionStatus}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.batteryBlock}>
              <Text style={styles.cardLabel}>BATTERY</Text>
              <Text style={styles.batteryValue}>{batteryLevel === null ? '—' : `${batteryLevel}%`}</Text>
            </View>
          </View>
          <View style={styles.cardFootnote}>
            <View style={[styles.batteryTrack]}>
              <View style={[styles.batteryFill, { width: `${batteryLevel ?? 0}%` }]} />
            </View>
            <Text style={styles.footnoteText}>
              {batteryLevel === null
                ? connectionStatus === 'Connected'
                  ? 'Battery service not configured'
                  : 'Battery unavailable'
                : 'Demo value · no sensor connected'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={bleSessionActive ? 'Stop BLE scan or disconnect sensor' : 'Find SnowShield sensor'}
          onPress={() => {
            if (bleSessionActive) void stopBleScan();
            else void startBleScan();
          }}
          style={styles.bleButton}
        >
          <Text style={styles.bleButtonText}>
            {bleSessionActive
              ? connectionStatus === 'Connected'
                ? `Disconnect ${connectedDeviceName ?? 'sensor'}`
                : 'Stop scan / auto-reconnect'
              : 'Find SnowShield sensor'}
          </Text>
        </TouchableOpacity>
        {bleError ? <Text accessibilityLiveRegion="polite" style={styles.bleError}>{bleError}</Text> : null}

        {latestSensorReading && connectionStatus === 'Connected' ? (
          <View style={styles.motionCard}>
            <Text style={styles.cardLabel}>LIVE MOTION · g / rad·s⁻¹</Text>
            <Text style={styles.motionValues}>
              A [{latestSensorReading.acceleration.x.toFixed(2)}, {latestSensorReading.acceleration.y.toFixed(2)}, {latestSensorReading.acceleration.z.toFixed(2)}] g
            </Text>
            <Text style={styles.motionValues}>
              G [{latestSensorReading.gyroscope.x.toFixed(2)}, {latestSensorReading.gyroscope.y.toFixed(2)}, {latestSensorReading.gyroscope.z.toFixed(2)}] rad/s
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Hardware Simulator Controls</Text>
        </View>
        <View style={styles.simulatorCard}>
          <View style={styles.mockModeRow}>
            <View style={styles.mockModeCopy}>
              <Text style={styles.mockModeTitle}>Developer Mock Mode</Text>
              <Text style={styles.mockModeDescription}>Send test readings without a physical sensor.</Text>
            </View>
            <Switch
              accessibilityLabel="Developer Mock Mode"
              accessibilityHint="Enables simulated telemetry buttons"
              value={developerMockMode}
              disabled={connectionStatus === 'Connected' || bleSessionActive}
              onValueChange={setDeveloperMockMode}
              trackColor={{ false: '#AAB7C0', true: COLORS.green }}
              thumbColor={COLORS.white}
              ios_backgroundColor="#AAB7C0"
            />
          </View>
          <View style={styles.mockBadge}>
            <View style={[styles.statusDot, { backgroundColor: developerMockMode ? COLORS.green : COLORS.muted }]} />
            <Text style={[styles.mockBadgeText, { color: developerMockMode ? COLORS.green : COLORS.muted }]}>
              {developerMockMode ? 'SIMULATOR READY' : 'SIMULATOR OFF'}
            </Text>
          </View>

          {SCENARIOS.map((scenario) => (
            <TouchableOpacity
              key={scenario.peakG}
              accessibilityRole="button"
              accessibilityLabel={`${scenario.title}, ${scenario.peakG} g`}
              accessibilityHint="Emits a simulated telemetry payload to the app"
              disabled={!mockControlsEnabled}
              activeOpacity={0.78}
              onPress={() => handleEmit(scenario)}
              style={[
                styles.scenarioButton,
                { backgroundColor: scenario.background, borderColor: scenario.color },
                !mockControlsEnabled && styles.disabledButton,
              ]}
            >
              <View style={[styles.scenarioIcon, { backgroundColor: scenario.color }]}>
                <Text style={styles.scenarioIconText}>{scenario.peakG}</Text>
              </View>
              <View style={styles.scenarioCopy}>
                <Text style={[styles.scenarioTitle, { color: scenario.color }]}>{scenario.title}</Text>
                <Text style={styles.scenarioDetail}>{scenario.detail}</Text>
              </View>
              <Text style={[styles.scenarioMagnitude, { color: scenario.color }]}>{scenario.peakG}g</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.safetyNote}>Simulated readings are for development only—not a medical assessment.</Text>
        </View>

        <View style={styles.latestCard}>
          <Text style={styles.cardLabel}>LATEST READING</Text>
          {latestTelemetry ? (
            <View style={styles.latestContent}>
              <Text style={styles.latestName}>{latestTelemetry.label}</Text>
              <Text style={styles.latestMagnitude}>{latestTelemetry.peakAccelerationG}g</Text>
            </View>
          ) : (
            <Text style={styles.noReading}>No telemetry received yet</Text>
          )}
          {lastSent ? <Text style={styles.lastSent}>Last sent: {lastSent}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.snow },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: COLORS.orange, fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: COLORS.ink, fontSize: 36, fontWeight: '900', letterSpacing: -0.7, marginTop: 4 },
  logoMark: { alignItems: 'center', backgroundColor: COLORS.navy, borderRadius: 16, height: 54, justifyContent: 'center', width: 54 },
  logoText: { color: COLORS.white, fontSize: 17, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: COLORS.muted, fontSize: 16, lineHeight: 22, marginBottom: 23, marginTop: 5 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 11, marginTop: 3 },
  sectionTitle: { color: COLORS.ink, fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  liveLabel: { backgroundColor: '#DFF3E7', borderRadius: 7, color: COLORS.green, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  statusCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, marginBottom: 24, padding: 18 },
  statusRow: { alignItems: 'center', flexDirection: 'row', minHeight: 65 },
  statusIndicatorRow: { alignItems: 'center', flex: 1, flexDirection: 'row' },
  statusDot: { borderRadius: 7, height: 14, marginRight: 10, width: 14 },
  cardLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  statusValue: { color: COLORS.ink, fontSize: 23, fontWeight: '900', marginTop: 3 },
  divider: { backgroundColor: COLORS.border, height: 48, marginHorizontal: 14, width: 1 },
  batteryBlock: { minWidth: 90 },
  batteryValue: { color: COLORS.ink, fontSize: 23, fontWeight: '900', marginTop: 3 },
  cardFootnote: { alignItems: 'center', flexDirection: 'row', marginTop: 13 },
  batteryTrack: { backgroundColor: '#E7EDF1', borderRadius: 5, height: 8, overflow: 'hidden', width: 84 },
  batteryFill: { backgroundColor: COLORS.green, borderRadius: 5, height: '100%' },
  footnoteText: { color: COLORS.muted, fontSize: 13, fontWeight: '600', marginLeft: 9 },
  bleButton: { alignItems: 'center', backgroundColor: COLORS.navy, borderRadius: 14, justifyContent: 'center', marginBottom: 8, minHeight: 58, paddingHorizontal: 16 },
  bleButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  bleError: { backgroundColor: COLORS.paleRed, borderColor: '#E9BBBB', borderRadius: 10, borderWidth: 1, color: COLORS.red, fontSize: 14, fontWeight: '700', lineHeight: 20, marginBottom: 14, padding: 12 },
  motionCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 15, borderWidth: 1, marginBottom: 22, padding: 15 },
  motionValues: { color: COLORS.ink, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '800', marginTop: 7 },
  simulatorCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, marginBottom: 18, padding: 16 },
  mockModeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 68 },
  mockModeCopy: { flex: 1, paddingRight: 10 },
  mockModeTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '900' },
  mockModeDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  mockBadge: { alignItems: 'center', backgroundColor: '#F2F6F8', borderRadius: 8, flexDirection: 'row', marginBottom: 12, marginTop: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: 'flex-start' },
  mockBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  scenarioButton: { alignItems: 'center', borderRadius: 14, borderWidth: 2, flexDirection: 'row', marginBottom: 10, minHeight: 76, paddingHorizontal: 12 },
  disabledButton: { opacity: 0.45 },
  scenarioIcon: { alignItems: 'center', borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
  scenarioIconText: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  scenarioCopy: { flex: 1, marginLeft: 12 },
  scenarioTitle: { fontSize: 16, fontWeight: '900' },
  scenarioDetail: { color: COLORS.muted, fontSize: 12, fontWeight: '600', marginTop: 3 },
  scenarioMagnitude: { fontSize: 23, fontWeight: '900', marginLeft: 6 },
  safetyNote: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  latestCard: { backgroundColor: COLORS.navy, borderRadius: 18, padding: 18 },
  latestContent: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  latestName: { color: COLORS.white, flex: 1, fontSize: 19, fontWeight: '800' },
  latestMagnitude: { color: '#FFB16F', fontSize: 30, fontWeight: '900', marginLeft: 10 },
  noReading: { color: COLORS.white, fontSize: 17, fontWeight: '700', marginTop: 10 },
  lastSent: { color: '#CBD7DE', fontSize: 13, marginTop: 8 },
});
