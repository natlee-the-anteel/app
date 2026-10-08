import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import {
  deleteEmergencyContact,
  deleteUserProfile,
  getEmergencyContacts,
  getUserProfile,
  saveEmergencyContact,
  saveUserProfile,
  setPrimaryContact,
} from '../../database/db';
import type { EmergencyContact, UserProfile } from '../../database/db';

const COLORS = {
  ink: '#102536',
  muted: '#637584',
  snow: '#F2F6F8',
  white: '#FFFFFF',
  orange: '#F47721',
  green: '#16834A',
  red: '#B52626',
  border: '#D7E0E6',
  paleGreen: '#E5F4EB',
};

const EMPTY_PROFILE: UserProfile = {
  name: '',
  blood_type: '',
  medical_notes: '',
  allergies: '',
  baseline_symptom_score: null,
};

type ContactDraft = {
  name: string;
  relationship: string;
  phone_number: string;
  is_primary: boolean;
};

const EMPTY_CONTACT: ContactDraft = {
  name: '',
  relationship: '',
  phone_number: '',
  is_primary: false,
};

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
}: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#758592"
        selectionColor={COLORS.orange}
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  );
}

export default function MedicalIdScreen() {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [baselineText, setBaselineText] = useState('');
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(EMPTY_CONTACT);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [contactFormVisible, setContactFormVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [savedProfile, savedContacts] = await Promise.all([
      getUserProfile(db),
      getEmergencyContacts(db),
    ]);
    const currentProfile = savedProfile ?? EMPTY_PROFILE;
    setProfile(currentProfile);
    setBaselineText(currentProfile.baseline_symptom_score?.toString() ?? '');
    setContacts(savedContacts);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    void refresh().catch(() => {
      setNotice('Could not load the Medical ID. Please try again.');
      setLoading(false);
    });
  }, [refresh]);

  const updateProfile = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const handleSaveProfile = async () => {
    if (!profile.name.trim()) {
      setNotice('Add the rider name before saving.');
      return;
    }
    const score = baselineText.trim() === '' ? null : Number(baselineText);
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 10)) {
      setNotice('Baseline symptom score must be a whole number from 0 to 10.');
      return;
    }

    setSaving(true);
    setNotice('');
    try {
      await saveUserProfile(db, { ...profile, baseline_symptom_score: score });
      await refresh();
      setNotice('Medical ID saved on this device.');
    } catch {
      setNotice('Could not save the Medical ID. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmClearProfile = () => {
    Alert.alert('Clear Medical ID?', 'This permanently removes the rider profile stored on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear Medical ID',
        style: 'destructive',
        onPress: () => {
          void deleteUserProfile(db)
            .then(() => {
              setProfile(EMPTY_PROFILE);
              setBaselineText('');
              setNotice('Medical ID cleared from this device.');
            })
            .catch(() => setNotice('Could not clear the Medical ID. Please try again.'));
        },
      },
    ]);
  };

  const openNewContact = () => {
    setEditingContactId(null);
    setContactDraft({ ...EMPTY_CONTACT, is_primary: contacts.length === 0 });
    setContactFormVisible(true);
    setNotice('');
  };

  const openEditContact = (contact: EmergencyContact) => {
    setEditingContactId(contact.id);
    setContactDraft({
      name: contact.name,
      relationship: contact.relationship,
      phone_number: contact.phone_number,
      is_primary: contact.is_primary,
    });
    setContactFormVisible(true);
    setNotice('');
  };

  const closeContactForm = () => {
    setContactFormVisible(false);
    setEditingContactId(null);
    setContactDraft(EMPTY_CONTACT);
  };

  const handleSaveContact = async () => {
    if (!contactDraft.name.trim() || !contactDraft.relationship.trim() || !contactDraft.phone_number.trim()) {
      setNotice('Enter a name, relationship, and phone number for this contact.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      await saveEmergencyContact(db, {
        ...contactDraft,
        id: editingContactId ?? undefined,
      });
      await refresh();
      closeContactForm();
      setNotice('Emergency contact saved.');
    } catch {
      setNotice('Could not save the emergency contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (contactId: number) => {
    try {
      await setPrimaryContact(db, contactId);
      await refresh();
      setNotice('Primary emergency contact updated.');
    } catch {
      setNotice('Could not update the primary contact. Please try again.');
    }
  };

  const confirmDelete = (contact: EmergencyContact) => {
    Alert.alert('Delete contact?', `Remove ${contact.name} from this Medical ID?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteEmergencyContact(db, contact.id)
            .then(refresh)
            .then(() => setNotice('Emergency contact deleted.'))
            .catch(() => setNotice('Could not delete the emergency contact.'));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>RIDER INFORMATION</Text>
        <Text style={styles.title}>Medical ID &amp; Contacts</Text>
        <Text style={styles.subtitle}>Saved on this device for offline access when it matters.</Text>

        {loading ? (
          <View style={styles.card}><Text style={styles.bodyText}>Loading your Medical ID…</Text></View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeading}>
                <Text style={styles.cardTitle}>Medical ID</Text>
                <Text style={styles.readOnlyTag}>ON DEVICE</Text>
              </View>
              <Field label="Rider name" value={profile.name} onChangeText={(value) => updateProfile('name', value)} placeholder="Full name" autoCapitalize="words" />
              <Field label="Blood type" value={profile.blood_type} onChangeText={(value) => updateProfile('blood_type', value)} placeholder="e.g. O+" autoCapitalize="characters" />
              <Field label="Allergies" value={profile.allergies} onChangeText={(value) => updateProfile('allergies', value)} placeholder="List allergies or enter None" multiline />
              <Field label="Medical notes" value={profile.medical_notes} onChangeText={(value) => updateProfile('medical_notes', value)} placeholder="Relevant conditions or medications" multiline />
              <Field label="Baseline symptom score (0–10)" value={baselineText} onChangeText={setBaselineText} placeholder="Optional" keyboardType="numeric" />
              <TouchableOpacity
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void handleSaveProfile()}
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save Medical ID'}</Text>
              </TouchableOpacity>
              {profile.name ? (
                <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={confirmClearProfile} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>Delete Medical ID</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.cardTitle}>Emergency contacts</Text>
                <Text style={styles.sectionHint}>Choose one primary contact for the Medical Pass.</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add emergency contact" onPress={openNewContact} style={styles.addButton}>
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {contacts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No contacts added</Text>
                <Text style={styles.bodyText}>Add someone who can be reached in an emergency.</Text>
                <TouchableOpacity accessibilityRole="button" onPress={openNewContact} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Add first contact</Text>
                </TouchableOpacity>
              </View>
            ) : (
              contacts.map((contact) => (
                <View key={contact.id} style={styles.contactCard}>
                  <View style={styles.contactTopRow}>
                    <View style={styles.contactIdentity}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      <Text style={styles.contactMeta}>{contact.relationship} · {contact.phone_number}</Text>
                    </View>
                    {contact.is_primary ? <Text style={styles.primaryTag}>PRIMARY</Text> : null}
                  </View>
                  <View style={styles.contactActions}>
                    {!contact.is_primary && (
                      <TouchableOpacity accessibilityRole="button" onPress={() => void handleSetPrimary(contact.id)} style={styles.textAction}>
                        <Text style={styles.textActionLabel}>Make primary</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity accessibilityRole="button" onPress={() => openEditContact(contact)} style={styles.textAction}>
                      <Text style={styles.textActionLabel}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" onPress={() => confirmDelete(contact)} style={styles.textAction}>
                      <Text style={styles.deleteActionLabel}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            {contactFormVisible && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{editingContactId === null ? 'Add emergency contact' : 'Edit emergency contact'}</Text>
                <Field label="Contact name" value={contactDraft.name} onChangeText={(value) => setContactDraft((current) => ({ ...current, name: value }))} placeholder="Full name" autoCapitalize="words" />
                <Field label="Relationship" value={contactDraft.relationship} onChangeText={(value) => setContactDraft((current) => ({ ...current, relationship: value }))} placeholder="e.g. Partner" autoCapitalize="words" />
                <Field label="Phone number" value={contactDraft.phone_number} onChangeText={(value) => setContactDraft((current) => ({ ...current, phone_number: value }))} placeholder="Include country code if needed" keyboardType="phone-pad" />
                <View style={styles.primaryToggleRow}>
                  <View style={styles.primaryToggleCopy}>
                    <Text style={styles.fieldLabel}>Primary contact</Text>
                    <Text style={styles.sectionHint}>Only one contact can be primary.</Text>
                  </View>
                  <Switch
                    accessibilityLabel="Primary emergency contact"
                    onValueChange={(value) => setContactDraft((current) => ({ ...current, is_primary: value }))}
                    value={contactDraft.is_primary}
                    trackColor={{ false: '#AAB7C0', true: COLORS.green }}
                    thumbColor={COLORS.white}
                  />
                </View>
                <View style={styles.formActions}>
                  <TouchableOpacity accessibilityRole="button" onPress={closeContactForm} style={styles.cancelButton}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => void handleSaveContact()} style={[styles.primaryButton, styles.formSaveButton, saving && styles.buttonDisabled]}>
                    <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save contact'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        <Text style={styles.privacyNote}>Medical information is stored locally and is not encrypted by this starter app. Protect access to your device.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.snow },
  content: { padding: 20, paddingBottom: 40 },
  eyebrow: { color: COLORS.orange, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginTop: 8 },
  title: { color: COLORS.ink, fontSize: 30, fontWeight: '900', lineHeight: 37, marginTop: 5 },
  subtitle: { color: COLORS.muted, fontSize: 15, lineHeight: 22, marginBottom: 20, marginTop: 6 },
  card: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 18, borderWidth: 1, marginBottom: 18, padding: 17 },
  cardHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  cardTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '900' },
  readOnlyTag: { backgroundColor: COLORS.paleGreen, borderRadius: 7, color: COLORS.green, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { color: COLORS.ink, fontSize: 14, fontWeight: '800', marginBottom: 7 },
  input: { backgroundColor: '#FBFCFD', borderColor: COLORS.border, borderRadius: 11, borderWidth: 1, color: COLORS.ink, fontSize: 16, minHeight: 52, paddingHorizontal: 13, paddingVertical: 12 },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' },
  primaryButton: { alignItems: 'center', backgroundColor: COLORS.ink, borderRadius: 12, justifyContent: 'center', marginTop: 4, minHeight: 54, paddingHorizontal: 16 },
  primaryButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '900' },
  clearButton: { alignItems: 'center', borderColor: '#E2B8B8', borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 50, paddingHorizontal: 16 },
  clearButtonText: { color: COLORS.red, fontSize: 15, fontWeight: '900' },
  buttonDisabled: { opacity: 0.6 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 11, marginTop: 4 },
  sectionHint: { color: COLORS.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  addButton: { alignItems: 'center', backgroundColor: COLORS.orange, borderRadius: 16, height: 52, justifyContent: 'center', marginLeft: 10, width: 52 },
  addButtonText: { color: COLORS.white, fontSize: 31, fontWeight: '500', lineHeight: 34, marginTop: -2 },
  emptyCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 18 },
  emptyTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900', marginBottom: 5 },
  bodyText: { color: COLORS.muted, fontSize: 15, lineHeight: 22 },
  secondaryButton: { alignItems: 'center', alignSelf: 'flex-start', borderColor: COLORS.ink, borderRadius: 10, borderWidth: 1, justifyContent: 'center', marginTop: 15, minHeight: 48, paddingHorizontal: 15 },
  secondaryButtonText: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  contactCard: { backgroundColor: COLORS.white, borderColor: COLORS.border, borderRadius: 15, borderWidth: 1, marginBottom: 11, padding: 15 },
  contactTopRow: { alignItems: 'center', flexDirection: 'row' },
  contactIdentity: { flex: 1, paddingRight: 8 },
  contactName: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  contactMeta: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  primaryTag: { backgroundColor: COLORS.paleGreen, borderRadius: 7, color: COLORS.green, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 6 },
  contactActions: { alignItems: 'center', borderTopColor: COLORS.border, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, paddingTop: 10 },
  textAction: { justifyContent: 'center', marginRight: 20, minHeight: 42 },
  textActionLabel: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  deleteActionLabel: { color: COLORS.red, fontSize: 14, fontWeight: '800' },
  primaryToggleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 4, minHeight: 58 },
  primaryToggleCopy: { flex: 1, paddingRight: 12 },
  formActions: { flexDirection: 'row', marginTop: 5 },
  cancelButton: { alignItems: 'center', borderColor: COLORS.border, borderRadius: 12, borderWidth: 1, justifyContent: 'center', marginRight: 10, minHeight: 54, paddingHorizontal: 16 },
  cancelButtonText: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  formSaveButton: { flex: 1, marginTop: 0 },
  notice: { color: COLORS.ink, fontSize: 14, fontWeight: '700', lineHeight: 20, marginBottom: 12 },
  privacyNote: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
});
