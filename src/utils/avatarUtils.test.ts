import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserInitials, formatNavbarUserName, MAX_AVATAR_URL_LENGTH } from './avatarUtils.ts';

test('getUserInitials extracts clean two-letter initials from multi-word name', () => {
  assert.equal(getUserInitials('Alex Dev', 'alex@linkhub.cloud'), 'AD');
  assert.equal(getUserInitials('Debu Das', 'debu@linkhub.cloud'), 'DD');
  assert.equal(getUserInitials('Debu Kumar Das', 'debu@linkhub.cloud'), 'DD');
});

test('getUserInitials handles single-word names and falls back to email', () => {
  assert.equal(getUserInitials('Debu', 'debu@linkhub.cloud'), 'DE');
  assert.equal(getUserInitials('', 'alex@linkhub.cloud'), 'AL');
  assert.equal(getUserInitials('', ''), 'U');
});

test('formatNavbarUserName keeps natural case and fits compact navbar width', () => {
  assert.equal(formatNavbarUserName('Alex Dev', '', 'alex@linkhub.cloud'), 'Alex Dev');
  assert.equal(formatNavbarUserName('Debapriyo Chatterjee', '', 'debu@linkhub.cloud'), 'Debapriyo');
  assert.equal(formatNavbarUserName('Alexandria Robertson', 'Alexandria', 'alex@linkhub.cloud'), 'Alexandria');
  assert.equal(formatNavbarUserName('', '', 'debapriyo00@gmail.com'), 'debapriyo00');
});

test('MAX_AVATAR_URL_LENGTH aligns with 32KB Firestore user photoURL boundary', () => {
  assert.equal(MAX_AVATAR_URL_LENGTH, 32768);
});
