import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSensor } from '../../src/context/SensorContext';

const COLORS = {
  ink: '#102536',
  muted: '#637584',
  snow: '#F2F6F8',
  white: '#FFFFFF',
  orange: '#F47721',
  border: '#D7E0E6',
  green: '#16834A',
  red: '#B52626',
};

function timeLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ActivityScreen() {
  const { telemetry } = useSensor();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>SESSION LOG</Text>
        <Text style={styles.title}>Telemetry</Text>
        <Text style={styles.subtitle}>Recent sensor events stay available offline on this device.</Text>
        {telemetry.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptyCopy}>Enable Developer Mock Mode on the dashboard and send a test event.</Text>
          </View>
        ) : (
          telemetry.map((event) => {
            const isSevere = event.peakAccelerationG >= 50;
            const isHard = event.peakAccelerationG >= 8;
            const color = isSevere ? COLORS.red : isHard ? COLORS.orange : COLORS.green;
            return (
              <View key={event.id} style={styles.eventCard}>
                <View style={[styles.eventMarker, { backgroundColor: color }]} />
                <View style={styles.eventDetails}>
                  <Text style={styles.eventTitle}>{event.label}</Text>
                  <Text style={styles.eventMeta}>{timeLabel(event.timestamp)} · {event.source === 'mock' ? 'SIMULATED' : 'SENSOR'}</Text>
                </View>
                <Text style={[styles.eventMagnitude, { color }]}>{event.peakAccelerationG}g</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.snow },
  content: { padding: 22, paddingBottom: 36 },
  eyebrow: { color: COLORS.orange, fontSize: 13, fontWeight: '900', letterSpacing: 1.5, marginTop: 8 },
  title: { color: COLORS.ink, fontSize: 34, fontWeight: '900', marginTop: 5 },
  subtitle: { color: COLORS.muted, fontSize: 16, lineHeight: 23, marginTop: 7, marginBottom: 22 },
  emptyCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderWidth: 1, borderRadius: 18, padding: 22 },
  emptyTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800' },
  emptyCopy: { color: COLORS.muted, fontSize: 16, lineHeight: 23, marginTop: 8 },
  eventCard: { alignItems: 'center', backgroundColor: COLORS.white, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16, flexDirection: 'row', marginBottom: 12, minHeight: 84, padding: 16 },
  eventMarker: { borderRadius: 5, height: 44, marginRight: 14, width: 8 },
  eventDetails: { flex: 1 },
  eventTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  eventMeta: { color: COLORS.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 6 },
  eventMagnitude: { fontSize: 23, fontWeight: '900', marginLeft: 8 },
});
