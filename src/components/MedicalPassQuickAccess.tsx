import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { getEmergencyContacts, getUserProfile } from '../../database/db';
import type { EmergencyContact, UserProfile } from '../../database/db';

const COLORS = {
  ink: '#102536',
  muted: '#637584',
  snow: '#F2F6F8',
  white: '#FFFFFF',
  orange: '#F47721',
  blue: '#1769AA',
  red: '#B52626',
  border: '#D7E0E6',
  paleRed: '#FCECEC',
};

interface MedicalPassModalProps {
  visible: boolean;
  onClose: () => void;
}

function MedicalPassModal({ visible, onClose }: MedicalPassModalProps) {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadMedicalDetails = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [savedProfile, savedContacts] = await Promise.all([
        getUserProfile(db),
        getEmergencyContacts(db),
      ]);
      setProfile(savedProfile);
      setContacts(savedContacts);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [db]);

  const hasProfileDetails = Boolean(
    profile?.name || profile?.blood_type || profile?.allergies || profile?.medical_notes,
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => void loadMedicalDetails()}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.eyebrow}>OFFLINE EMERGENCY REFERENCE</Text>
            <Text style={styles.title}>Medical Pass</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Medical Pass" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingView}>
            <ActivityIndicator color={COLORS.orange} size="large" />
            <Text style={styles.loadingText}>Loading Medical Pass…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Could not load details</Text>
            <Text style={styles.bodyText}>Close this pass and try again.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.passContent}>
            {!hasProfileDetails && contacts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Medical ID not set up</Text>
                <Text style={styles.bodyText}>Add rider details and emergency contacts in the Medical ID tab.</Text>
              </View>
            ) : (
              <>
                <View style={styles.identityCard}>
                  <Text style={styles.cardLabel}>RIDER</Text>
                  <Text style={styles.riderName}>{profile?.name || 'Name not provided'}</Text>
                  <View style={styles.bloodBlock}>
                    <Text style={styles.cardLabel}>BLOOD TYPE</Text>
                    <Text style={styles.bloodType}>{profile?.blood_type || 'Not provided'}</Text>
                  </View>
                </View>

                <View style={styles.alertCard}>
                  <Text style={styles.alertLabel}>ALLERGIES</Text>
                  <Text style={styles.alertText}>{profile?.allergies || 'Not provided'}</Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.cardLabel}>MEDICAL NOTES</Text>
                  <Text style={styles.bodyText}>{profile?.medical_notes || 'Not provided'}</Text>
                  <View style={styles.scoreRow}>
                    <Text style={styles.cardLabel}>BASELINE SYMPTOM SCORE</Text>
                    <Text style={styles.scoreValue}>
                      {profile?.baseline_symptom_score == null ? '—' : `${profile.baseline_symptom_score} / 10`}
                    </Text>
                  </View>
                </View>

                <View style={styles.contactsHeading}>
                  <Text style={styles.sectionTitle}>Emergency contacts</Text>
                  {contacts.length > 0 ? <Text style={styles.contactCount}>{contacts.length}</Text> : null}
                </View>
                {contacts.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.bodyText}>No emergency contacts added.</Text>
                  </View>
                ) : (
                  contacts.map((contact) => (
                    <View key={contact.id} style={styles.contactCard}>
                      <View style={styles.contactHeader}>
                        <Text style={styles.contactName}>{contact.name}</Text>
                        {contact.is_primary ? <Text style={styles.primaryTag}>PRIMARY</Text> : null}
                      </View>
                      <Text style={styles.contactRelationship}>{contact.relationship}</Text>
                      <Text style={styles.phoneNumber}>{contact.phone_number}</Text>
                    </View>
                  ))
                )}
              </>
            )}
            <Text style={styles.disclaimer}>Medical Pass is an emergency reference, not a diagnosis. Details are stored locally on this device.</Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default function MedicalPassQuickAccess() {
  const [visible, setVisible] = useState(false);
  const open = () => setVisible(true);
  const close = () => setVisible(false);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="View Medical Pass"
        accessibilityHint="Opens the rider's offline medical details and emergency contacts"
        activeOpacity={0.85}
        onPress={open}
        style={styles.quickButton}
      >
        <View style={styles.quickIcon}>
          <Text style={styles.quickIconText}>+</Text>
        </View>
        <Text style={styles.quickButtonText}>MEDICAL PASS</Text>
      </TouchableOpacity>
      <MedicalPassModal visible={visible} onClose={close} />
    </>
  );
}

const styles = StyleSheet.create({
  quickButton: { alignItems: 'center', backgroundColor: COLORS.ink, borderColor: COLORS.white, borderRadius: 30, borderWidth: 2, bottom: 91, elevation: 7, flexDirection: 'row', minHeight: 58, paddingHorizontal: 15, position: 'absolute', right: 16, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.24, shadowRadius: 6, zIndex: 20 },
  quickIcon: { alignItems: 'center', backgroundColor: COLORS.orange, borderRadius: 11, height: 28, justifyContent: 'center', marginRight: 9, width: 28 },
  quickIconText: { color: COLORS.white, fontSize: 22, fontWeight: '700', lineHeight: 25, marginTop: -2 },
  quickButtonText: { color: COLORS.white, fontSize: 13, fontWeight: '900', letterSpacing: 0.6 },
  safeArea: { backgroundColor: COLORS.snow, flex: 1 },
  modalHeader: { alignItems: 'center', backgroundColor: COLORS.ink, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 18 },
  eyebrow: { color: '#FFB16F', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: COLORS.white, fontSize: 30, fontWeight: '900', marginTop: 3 },
  closeButton: { alignItems: 'center', borderColor: '#8A9AA5', borderRadius: 18, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  closeButtonText: { color: COLORS.white, fontSize: 30, fontWeight: '400', lineHeight: 34, marginTop: -4 },
  loadingView: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { color: COLORS.muted, fontSize: 16, fontWeight: '700', marginTop: 12 },
  passContent: { padding: 18, paddingBottom: 32 },
  identityCard: { backgroundColor: COLORS.ink, borderRadius: 18, marginBottom: 12, padding: 20 },
  cardLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  riderName: { color: COLORS.white, fontSize: 30, fontWeight: '900', marginTop: 5 },
  bloodBlock: { borderTopColor: '#405361', borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  bloodType: { color: '#FFB16F', fontSize: 22, fontWeight: '900', marginTop: 4 },
  alertCard: { backgroundColor: COLORS.paleRed, borderColor: '#E9BBBB', borderRadius: 15, borderWidth: 1, marginBottom: 12, padding: 17 },
  alertLabel: { color: COLORS.red, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  alertText: { color: COLORS.ink, fontSize: 21, fontWeight: '900', lineHeight: 28, marginTop: 5 },
  infoCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 15, borderWidth: 1, marginBottom: 20, padding: 17 },
  bodyText: { color: COLORS.ink, fontSize: 16, lineHeight: 23, marginTop: 5 },
  scoreRow: { borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 13 },
  scoreValue: { color: COLORS.ink, fontSize: 15, fontWeight: '900', marginLeft: 10 },
  contactsHeading: { alignItems: 'center', flexDirection: 'row', marginBottom: 10 },
  sectionTitle: { color: COLORS.ink, fontSize: 21, fontWeight: '900' },
  contactCount: { backgroundColor: '#E3EAF0', borderRadius: 11, color: COLORS.ink, fontSize: 12, fontWeight: '900', marginLeft: 9, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  contactCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 15, borderWidth: 1, marginBottom: 10, padding: 16 },
  contactHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  contactName: { color: COLORS.ink, flex: 1, fontSize: 19, fontWeight: '900', paddingRight: 8 },
  primaryTag: { backgroundColor: '#E5F4EB', borderRadius: 7, color: '#16834A', fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 6 },
  contactRelationship: { color: COLORS.muted, fontSize: 14, fontWeight: '600', marginTop: 4 },
  phoneNumber: { color: COLORS.blue, fontSize: 21, fontWeight: '900', letterSpacing: 0.2, marginTop: 10 },
  emptyCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 15, borderWidth: 1, marginBottom: 12, padding: 19 },
  emptyTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '900' },
  disclaimer: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
});
