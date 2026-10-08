import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { useSQLiteContext } from 'expo-sqlite';
import { getEmergencyContacts, getUserProfile } from '../../database/db';
import type { EmergencyContact, UserProfile } from '../../database/db';
import { useSensor } from '../context/SensorContext';

const COUNTDOWN_SECONDS = 45;
const VIBRATION_PULSE_MS = 850;
const VIBRATION_INTERVAL_MS = 1400;
const SAMPLE_RATE = 8000;
const ALARM_SOURCE = createAlarmWaveSource();

const COLORS = {
  ink: '#102536',
  muted: '#637584',
  white: '#FFFFFF',
  red: '#B52626',
  darkRed: '#811B1B',
  paleRed: '#FCECEC',
  border: '#D7E0E6',
  orange: '#F47721',
  green: '#16834A',
};

function createAlarmWaveSource(): { uri: string } {
  // Generate a short, offline 8-bit PCM alarm cadence; it is looped only during an alert.
  const sampleCount = SAMPLE_RATE;
  const bytes = new Uint8Array(44 + sampleCount);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };

  writeText(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const phaseInCycle = index % 3600;
    const isPulse = phaseInCycle < 2300 || (phaseInCycle >= 2700 && phaseInCycle < 3300);
    if (!isPulse) {
      bytes[44 + index] = 128;
      continue;
    }
    const frequency = phaseInCycle < 2300 ? 980 : 740;
    const amplitude = Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE) * 96;
    bytes[44 + index] = Math.max(0, Math.min(255, Math.round(128 + amplitude)));
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    base64 += alphabet[first >> 2];
    base64 += alphabet[((first & 3) << 4) | (second >> 4)];
    base64 += hasSecond ? alphabet[((second & 15) << 2) | (third >> 6)] : '=';
    base64 += hasThird ? alphabet[third & 63] : '=';
  }
  return { uri: `data:audio/wav;base64,${base64}` };
}

interface ImpactResponseModalProps {
  impactId: string;
  accelerationG: number;
  onDismiss: () => void;
}

function formatCoordinate(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? 'Unavailable' : value.toFixed(6);
}

async function getEmergencyLocation(): Promise<string> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      return 'Coordinates: Unavailable (location permission denied)\nAltitude: Unavailable';
    }

    const location = await Location.getLastKnownPositionAsync({ maxAge: 1000 * 60 * 60 * 24 });
    if (!location) return 'Coordinates: Unavailable (no recent GPS fix)\nAltitude: Unavailable';

    const altitude = location.coords.altitude;
    return [
      `Coordinates: ${formatCoordinate(location.coords.latitude)}, ${formatCoordinate(location.coords.longitude)}`,
      `Altitude: ${altitude == null ? 'Unavailable' : `${Math.round(altitude)} m`}`,
      `GPS fix: ${new Date(location.timestamp).toISOString()}`,
    ].join('\n');
  } catch {
    return 'Coordinates: Unavailable (location lookup failed)\nAltitude: Unavailable';
  }
}

function makeEmergencyMessage(
  profile: UserProfile | null,
  accelerationG: number,
  locationDetails: string,
): string {
  const riderName = profile?.name.trim() || 'Name not provided';
  return [
    `URGENT: Possible severe impact involving rider ${riderName}.`,
    `Estimated peak acceleration: ${accelerationG.toFixed(1)} g.`,
    locationDetails,
    'Please try to contact the rider and request local emergency assistance if needed.',
  ].join('\n');
}

export default function ImpactResponseModal({ impactId, accelerationG, onDismiss }: ImpactResponseModalProps) {
  const db = useSQLiteContext();
  const alarmPlayer = useAudioPlayer(ALARM_SOURCE, { updateInterval: 500 });
  const [remainingSeconds, setRemainingSeconds] = useState(COUNTDOWN_SECONDS);
  const [escalationState, setEscalationState] = useState<'countdown' | 'preparing' | 'opened' | 'error'>('countdown');
  const [statusMessage, setStatusMessage] = useState('');
  const endAtRef = useRef(Date.now() + COUNTDOWN_SECONDS * 1000);
  const escalatedRef = useRef(false);
  const stoppedRef = useRef(false);
  const { dismissImpact: dismissSharedImpact } = useSensor();

  const cleanupAlert = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    Vibration.cancel();
    try {
      alarmPlayer.pause();
      void alarmPlayer.seekTo(0).catch(() => undefined);
    } catch {
      // The audio subsystem may not be available on simulators or if playback failed to load.
    }
  }, [alarmPlayer]);

  const dismiss = useCallback(() => {
    cleanupAlert();
    dismissSharedImpact();
    onDismiss();
  }, [cleanupAlert, dismissSharedImpact, onDismiss]);

  const prepareEmergencySms = useCallback(async () => {
    if (escalatedRef.current) return;
    escalatedRef.current = true;
    setEscalationState('preparing');
    setStatusMessage('Preparing location and emergency message…');
    cleanupAlert();

    try {
      const [profile, contacts, locationDetails] = await Promise.all([
        getUserProfile(db),
        getEmergencyContacts(db),
        getEmergencyLocation(),
      ]);
      const primaryContacts = contacts.filter((contact: EmergencyContact) => contact.is_primary);
      const recipients = (primaryContacts.length > 0 ? primaryContacts : contacts)
        .map((contact: EmergencyContact) => contact.phone_number.trim())
        .filter(Boolean);
      const message = makeEmergencyMessage(profile, accelerationG, locationDetails);

      if (!(await SMS.isAvailableAsync())) {
        setEscalationState('error');
        setStatusMessage('SMS is unavailable on this device. Call local emergency services and share these details manually.');
        return;
      }

      if (recipients.length === 0) {
        setEscalationState('error');
        setStatusMessage('No emergency phone number is saved. Add a contact, then use the Retry SMS button.');
        return;
      }

      await SMS.sendSMSAsync(recipients, message);
      setEscalationState('opened');
      setStatusMessage('Emergency text opened in your messaging app. Review and press Send to deliver it.');
    } catch {
      setEscalationState('error');
      setStatusMessage('Could not open the emergency text. Call local emergency services if immediate help is needed.');
    }
  }, [accelerationG, cleanupAlert, db]);

  useEffect(() => {
    let cancelled = false;
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' })
      .then(() => {
        if (cancelled || stoppedRef.current) return;
        alarmPlayer.volume = 1;
        alarmPlayer.loop = true;
        alarmPlayer.play();
      })
      .catch(() => setStatusMessage('Alarm audio unavailable; vibration alert is active.'));
    const vibrationTimer = setInterval(() => {
      if (!stoppedRef.current) Vibration.vibrate(VIBRATION_PULSE_MS);
    }, VIBRATION_INTERVAL_MS);
    Vibration.vibrate(VIBRATION_PULSE_MS);

    return () => {
      cancelled = true;
      clearInterval(vibrationTimer);
      cleanupAlert();
    };
  }, [alarmPlayer, cleanupAlert]);

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemainingSeconds((current) => current === remaining ? current : remaining);
      if (remaining === 0) void prepareEmergencySms();
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 250);
    return () => clearInterval(timer);
  }, [impactId, prepareEmergencySms]);

  const countdownLabel = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = `${remainingSeconds % 60}`.padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [remainingSeconds]);

  const isSevere = accelerationG >= 65;

  return (
    <Modal animationType="fade" onRequestClose={() => undefined} statusBarTranslucent transparent={false} visible>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={[styles.alertIcon, isSevere && styles.severeIcon]}>
            <Text style={styles.alertIconText}>!</Text>
          </View>
          <Text style={styles.eyebrow}>HIGH-PRIORITY SAFETY CHECK</Text>
          <Text accessibilityRole="header" style={styles.title}>Impact Detected</Text>
          <Text style={styles.explanation}>
            A high-force event was detected. If you are responsive and feel okay, confirm below.
          </Text>

          <View style={[styles.forceCard, isSevere && styles.severeForceCard]}>
            <Text style={styles.forceLabel}>ESTIMATED PEAK ACCELERATION</Text>
            <Text style={styles.forceValue}>{accelerationG.toFixed(1)}<Text style={styles.forceUnit}> g</Text></Text>
          </View>

          {remainingSeconds > 0 ? (
            <>
              <Text style={styles.countdownPrompt}>Emergency text will open in</Text>
              <View accessibilityLiveRegion="assertive" accessibilityLabel={`${remainingSeconds} seconds remaining`} style={styles.timerCircle}>
                <Text style={styles.timerText}>{countdownLabel}</Text>
                <Text style={styles.timerCaption}>REMAINING</Text>
              </View>
              <Text style={styles.smsHint}>A pre-filled text will open for you to review and send.</Text>
            </>
          ) : (
            <View style={styles.escalationCard}>
              {escalationState === 'preparing' && <ActivityIndicator color={COLORS.orange} size="large" />}
              <Text style={styles.escalationTitle}>
                {escalationState === 'preparing' ? 'Preparing emergency alert' : escalationState === 'opened' ? 'Emergency message ready' : 'Emergency escalation'}
              </Text>
              <Text accessibilityLiveRegion="polite" style={styles.escalationText}>{statusMessage || 'Attempting to open the emergency SMS app…'}</Text>
              {escalationState === 'error' && (
                <TouchableOpacity accessibilityRole="button" onPress={() => { escalatedRef.current = false; void prepareEmergencySms(); }} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>Retry SMS</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity accessibilityRole="button" accessibilityLabel="I'm OK, dismiss impact alarm" onPress={dismiss} style={styles.okButton}>
            <Text style={styles.okButtonText}>I’M OK</Text>
            <Text style={styles.okButtonHint}>Cancel alert and stop alarm</Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>This is a safety prompt, not a medical diagnosis. If injured or unsure, seek help now.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: COLORS.darkRed, flex: 1 },
  container: { alignItems: 'center', backgroundColor: COLORS.darkRed, flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 28 },
  alertIcon: { alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 35, height: 70, justifyContent: 'center', marginBottom: 18, width: 70 },
  severeIcon: { backgroundColor: '#FFD5D5' },
  alertIconText: { color: COLORS.red, fontSize: 49, fontWeight: '900', lineHeight: 56, marginTop: -2 },
  eyebrow: { color: '#FFD2B5', fontSize: 12, fontWeight: '900', letterSpacing: 1.3, textAlign: 'center' },
  title: { color: COLORS.white, fontSize: 34, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  explanation: { color: COLORS.white, fontSize: 16, lineHeight: 23, marginTop: 9, maxWidth: 360, opacity: 0.95, textAlign: 'center' },
  forceCard: { alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 18, marginTop: 23, paddingHorizontal: 24, paddingVertical: 14, width: '100%' },
  severeForceCard: { borderColor: '#FFB16F', borderWidth: 4 },
  forceLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textAlign: 'center' },
  forceValue: { color: COLORS.red, fontSize: 46, fontWeight: '900', marginTop: 1 },
  forceUnit: { fontSize: 25 },
  countdownPrompt: { color: COLORS.white, fontSize: 16, fontWeight: '800', marginTop: 24, textAlign: 'center' },
  timerCircle: { alignItems: 'center', borderColor: '#FFB16F', borderRadius: 76, borderWidth: 5, height: 152, justifyContent: 'center', marginTop: 13, width: 152 },
  timerText: { color: COLORS.white, fontSize: 48, fontVariant: ['tabular-nums'], fontWeight: '900' },
  timerCaption: { color: '#FFD2B5', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  smsHint: { color: COLORS.white, fontSize: 13, lineHeight: 19, marginTop: 11, opacity: 0.9, textAlign: 'center' },
  escalationCard: { alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, marginTop: 20, padding: 18, width: '100%' },
  escalationTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  escalationText: { color: COLORS.muted, fontSize: 15, lineHeight: 21, marginTop: 6, textAlign: 'center' },
  retryButton: { alignItems: 'center', backgroundColor: COLORS.ink, borderRadius: 12, justifyContent: 'center', marginTop: 13, minHeight: 50, paddingHorizontal: 16, width: '100%' },
  retryButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  okButton: { alignItems: 'center', backgroundColor: COLORS.white, borderColor: '#FFD2B5', borderRadius: 17, borderWidth: 2, justifyContent: 'center', marginTop: 25, minHeight: 82, paddingHorizontal: 20, width: '100%' },
  okButtonText: { color: COLORS.green, fontSize: 25, fontWeight: '900', letterSpacing: 0.6 },
  okButtonHint: { color: COLORS.muted, fontSize: 13, fontWeight: '700', marginTop: 2 },
  disclaimer: { color: '#FFD2B5', fontSize: 12, lineHeight: 17, marginTop: 16, maxWidth: 360, textAlign: 'center' },
});
