import { database } from './db.ts';

export const personalProfileSettingKey = 'personalProfile';
export const MAX_PERSONAL_PROFILE_CHARS = 20_000;

/** Task-scoped consent flag from the composer; absent means no access. */
export function parseProfileAccess(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error('profileAccess must be a boolean');
  return value;
}

/** Consent is single-task: a successful start consumes it; a failed start keeps the user's choice. */
export function profileConsentAfterStart(consent: boolean, startSucceeded: boolean): boolean {
  return startSucceeded ? false : consent;
}

export async function readPersonalProfile(): Promise<string> {
  const setting = await database.settings.get(personalProfileSettingKey);
  if (!setting) return '';
  if (typeof setting.value !== 'string') throw new Error('personalProfile must be a string');
  return setting.value;
}

export async function setPersonalProfile(value: string): Promise<void> {
  if (value.length > MAX_PERSONAL_PROFILE_CHARS) throw new Error(`Personal profile must be at most ${MAX_PERSONAL_PROFILE_CHARS} characters`);
  const trimmed = value.trim();
  if (!trimmed) {
    await database.settings.delete(personalProfileSettingKey);
    return;
  }
  await database.settings.put({ key: personalProfileSettingKey, value: trimmed });
}
