import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthUser, Role } from '../middleware/auth';
import { canEditAssignedRecord, canEditAvailability, canEditDemand } from './demoPermissions';

const user = (personId: string, roles: Role[] = ['user']): AuthUser => ({
  userId: personId,
  personId,
  email: `${personId}@example.com`,
  name: personId,
  roles,
});

test('project and department assignments allow only owners, delegates and admins', () => {
  assert.equal(canEditAssignedRecord(user('owner'), 'OWNER', 'delegate'), true);
  assert.equal(canEditAssignedRecord(user('delegate'), 'owner', 'delegate'), true);
  assert.equal(canEditAssignedRecord(user('admin', ['admin']), 'owner', 'delegate'), true);
  assert.equal(canEditAssignedRecord(user('other'), 'owner', 'delegate'), false);
  assert.equal(canEditAssignedRecord(user('moderator', ['demand_moderator']), 'owner', 'delegate'), false);
});

test('availability allows self, department assignments, availability moderators and admins', () => {
  const department = { leadPersonId: 'lead', delegatePersonId: 'delegate' };
  assert.equal(canEditAvailability(user('owner'), 'owner', department), true);
  assert.equal(canEditAvailability(user('lead'), 'owner', department), true);
  assert.equal(canEditAvailability(user('delegate'), 'owner', department), true);
  assert.equal(canEditAvailability(user('moderator', ['availability_moderator']), 'owner'), true);
  assert.equal(canEditAvailability(user('admin', ['admin']), 'owner'), true);
  assert.equal(canEditAvailability(user('other'), 'owner', department), false);
  assert.equal(canEditAvailability(user('demand-mod', ['demand_moderator']), 'owner'), false);
});

test('demand allows the project manager, delegate, demand moderator and admin', () => {
  const project = { managerPersonId: 'manager', delegatePersonId: 'delegate' };
  assert.equal(canEditDemand(user('manager'), project), true);
  assert.equal(canEditDemand(user('delegate'), project), true);
  assert.equal(canEditDemand(user('moderator', ['demand_moderator']), project), true);
  assert.equal(canEditDemand(user('admin', ['admin']), project), true);
  assert.equal(canEditDemand(user('other'), project), false);
  assert.equal(canEditDemand(user('availability-mod', ['availability_moderator']), project), false);
});