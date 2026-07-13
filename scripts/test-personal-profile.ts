import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { database, initializeDatabase } from '../lib/db.ts';
import {
  MAX_PERSONAL_PROFILE_CHARS,
  parseProfileAccess,
  personalProfileSettingKey,
  profileConsentAfterStart,
  readPersonalProfile,
  setPersonalProfile,
} from '../lib/personal-profile.ts';

await initializeDatabase();
await database.settings.delete(personalProfileSettingKey);

// consent flag: absent means no access; anything non-boolean is rejected
assert.equal(parseProfileAccess(undefined), false, 'missing flag must default to no profile access');
assert.equal(parseProfileAccess(true), true);
assert.equal(parseProfileAccess(false), false);
assert.throws(() => parseProfileAccess('true'), /profileAccess must be a boolean/);
assert.throws(() => parseProfileAccess(1), /profileAccess must be a boolean/);

// consent is single-task: a successful start consumes it, a failed start keeps the choice
assert.equal(profileConsentAfterStart(true, true), false, 'a started task must consume the consent');
assert.equal(profileConsentAfterStart(true, false), true, 'a failed start must keep the consent');
assert.equal(profileConsentAfterStart(false, true), false);
assert.equal(profileConsentAfterStart(false, false), false);

// profile content round trip
assert.equal(await readPersonalProfile(), '', 'missing profile must read as empty');
await setPersonalProfile('  姓名：测试\n电话：123  ');
assert.equal(await readPersonalProfile(), '姓名：测试\n电话：123', 'profile must be stored trimmed');

// clearing deletes the setting instead of storing an empty string
await setPersonalProfile('   ');
assert.equal(await readPersonalProfile(), '');
assert.equal(await database.settings.get(personalProfileSettingKey), undefined);

// size cap
await assert.rejects(setPersonalProfile('x'.repeat(MAX_PERSONAL_PROFILE_CHARS + 1)), /at most 20000 characters/);
await setPersonalProfile('x'.repeat(MAX_PERSONAL_PROFILE_CHARS));
assert.equal((await readPersonalProfile()).length, MAX_PERSONAL_PROFILE_CHARS);

// corrupted value surfaces instead of silently degrading
await database.settings.put({ key: personalProfileSettingKey, value: 42 });
await assert.rejects(readPersonalProfile(), /personalProfile must be a string/);

assert.equal(database.verno, 4, 'personal profile must not add a database version');

database.close();
console.info('personal profile tests passed');
