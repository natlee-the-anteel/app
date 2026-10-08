import type { SQLiteDatabase } from 'expo-sqlite';

export interface UserProfile {
  name: string;
  blood_type: string;
  medical_notes: string;
  allergies: string;
  baseline_symptom_score: number | null;
}

export interface EmergencyContact {
  id: number;
  name: string;
  relationship: string;
  phone_number: string;
  is_primary: boolean;
}

export type EmergencyContactInput = Omit<EmergencyContact, 'id'> & { id?: number };

interface EmergencyContactRow extends Omit<EmergencyContact, 'is_primary'> {
  is_primary: number;
}

interface UserProfileRow extends Omit<UserProfile, 'blood_type' | 'medical_notes' | 'allergies'> {
  blood_type: string | null;
  medical_notes: string | null;
  allergies: string | null;
}

const DATABASE_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      name TEXT NOT NULL DEFAULT '',
      blood_type TEXT,
      medical_notes TEXT,
      allergies TEXT,
      baseline_symptom_score INTEGER CHECK (baseline_symptom_score BETWEEN 0 AND 10)
    );
    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_contacts_one_primary
      ON emergency_contacts (is_primary) WHERE is_primary = 1;
    PRAGMA user_version = ${DATABASE_VERSION};
  `);
}

export async function getUserProfile(db: SQLiteDatabase): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<UserProfileRow>(
    `SELECT name, blood_type, medical_notes, allergies, baseline_symptom_score
     FROM user_profile WHERE id = 1`,
  );
  if (!row) return null;
  return {
    ...row,
    blood_type: row.blood_type ?? '',
    medical_notes: row.medical_notes ?? '',
    allergies: row.allergies ?? '',
  };
}

export async function saveUserProfile(db: SQLiteDatabase, profile: UserProfile): Promise<void> {
  await db.runAsync(
    `INSERT INTO user_profile
      (id, name, blood_type, medical_notes, allergies, baseline_symptom_score)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       blood_type = excluded.blood_type,
       medical_notes = excluded.medical_notes,
       allergies = excluded.allergies,
       baseline_symptom_score = excluded.baseline_symptom_score`,
    profile.name.trim(),
    profile.blood_type.trim() || null,
    profile.medical_notes.trim() || null,
    profile.allergies.trim() || null,
    profile.baseline_symptom_score,
  );
}

export async function deleteUserProfile(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM user_profile WHERE id = 1');
}

export async function getEmergencyContacts(db: SQLiteDatabase): Promise<EmergencyContact[]> {
  const rows = await db.getAllAsync<EmergencyContactRow>(
    `SELECT id, name, relationship, phone_number, is_primary
     FROM emergency_contacts
     ORDER BY is_primary DESC, name COLLATE NOCASE ASC`,
  );
  return rows.map((row) => ({ ...row, is_primary: row.is_primary === 1 }));
}

export async function saveEmergencyContact(
  db: SQLiteDatabase,
  contact: EmergencyContactInput,
): Promise<number> {
  let savedId = contact.id ?? 0;
  await db.withTransactionAsync(async () => {
    if (contact.is_primary) {
      await db.runAsync('UPDATE emergency_contacts SET is_primary = 0 WHERE is_primary = 1');
    }
    const result = await db.runAsync(
      `INSERT INTO emergency_contacts (id, name, relationship, phone_number, is_primary)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         relationship = excluded.relationship,
         phone_number = excluded.phone_number,
         is_primary = excluded.is_primary`,
      contact.id ?? null,
      contact.name.trim(),
      contact.relationship.trim(),
      contact.phone_number.trim(),
      contact.is_primary ? 1 : 0,
    );
    savedId = contact.id ?? result.lastInsertRowId;
  });
  return savedId;
}

export async function setPrimaryContact(db: SQLiteDatabase, contactId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE emergency_contacts SET is_primary = 0 WHERE is_primary = 1');
    await db.runAsync('UPDATE emergency_contacts SET is_primary = 1 WHERE id = ?', contactId);
  });
}

export async function deleteEmergencyContact(db: SQLiteDatabase, contactId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const contact = await db.getFirstAsync<{ is_primary: number }>(
      'SELECT is_primary FROM emergency_contacts WHERE id = ?',
      contactId,
    );
    await db.runAsync('DELETE FROM emergency_contacts WHERE id = ?', contactId);
    if (contact?.is_primary === 1) {
      const nextContact = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM emergency_contacts ORDER BY id ASC LIMIT 1',
      );
      if (nextContact) {
        await db.runAsync('UPDATE emergency_contacts SET is_primary = 1 WHERE id = ?', nextContact.id);
      }
    }
  });
}
