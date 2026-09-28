import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthUser, Role } from '../middleware/auth';
import { canAssignRequestDelegate, canEditAssignedRecord, canEditAvailability, canEditDemand, canEditRequest } from './demoPermissions';
import { completedStagesOnTransition } from '../services/requestWorkflow';
import { CsvDataService, type DemoData } from './csvData';
import { opportunitySubmissionSchema } from '../services/opportunitySubmission';

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

test('request editing follows assignments and lifecycle', () => {
  const request = { phase: 'Prioritization', requesterPersonId: 'owner', sponsorPersonId: 'sponsor', delegatePersonId: 'delegate' };
  for (const personId of ['OWNER', 'sponsor', 'delegate']) {
    assert.equal(canEditRequest(user(personId), request), true);
    assert.equal(canEditRequest(user(personId), { ...request, phase: 'DQ Check' }), false);
  }
  assert.equal(canEditRequest(user('moderator', ['intake_moderator']), { ...request, phase: 'Processed' }), true);
  assert.equal(canEditRequest(user('admin', ['admin']), { ...request, phase: 'Processed' }), true);
  assert.equal(canEditRequest(user('other'), request), false);
  assert.equal(canEditRequest(user('other', ['demand_moderator']), request), false);
  assert.equal(canEditRequest(user('owner'), { ...request, phase: 'Unknown' }), false);
  assert.equal(canEditRequest(user('owner'), { ...request, phase: '1. Draft' }), true);
  assert.equal(canAssignRequestDelegate(user('owner'), request), true);
  assert.equal(canAssignRequestDelegate(user('sponsor'), request), false);
  assert.equal(canAssignRequestDelegate(user('delegate'), request), false);
  assert.equal(canAssignRequestDelegate(user('owner'), { ...request, phase: 'DQ Check' }), false);
  assert.equal(canAssignRequestDelegate(user('moderator', ['intake_moderator']), { ...request, phase: 'DQ Check' }), true);
});

test('workflow completion occurs when a stage is exited or intake finishes', () => {
  assert.deepEqual(completedStagesOnTransition('Draft', 'Prioritization'), ['Draft']);
  assert.deepEqual(completedStagesOnTransition('2. Prioritization', 'DQ Check'), ['Prioritization']);
  assert.deepEqual(completedStagesOnTransition('Configuration', 'Processed'), ['Configuration', 'Processed']);
  assert.deepEqual(completedStagesOnTransition('DQ Check', 'DQ Check'), []);
  assert.deepEqual(completedStagesOnTransition('Unknown', 'Processed'), []);
});

test('demo requests retain completion timestamps across later phase changes', () => {
  const data = CsvDataService.empty();
  data.create('requests', { id: 'test-request', phase: 'Draft' } as DemoData['requests'][number]);
  data.update('requests', 'test-request', { phase: 'Prioritization' });
  const draftCompleted = data.workflowCompletedAt('test-request').Draft;
  assert.match(draftCompleted, /^\d{4}-\d{2}-\d{2}T/);
  data.update('requests', 'test-request', { phase: 'DQ Check' });
  assert.equal(data.workflowCompletedAt('test-request').Draft, draftCompleted);
  assert.match(data.workflowCompletedAt('test-request').Prioritization, /^\d{4}-\d{2}-\d{2}T/);
});

test('deactivating non-project work clears future hours without changing past hours', () => {
  const data = CsvDataService.empty();
  const record = data.createNonProjectDemand({
    id: 'other-work', categoryId: 'category', categoryName: 'Other work', subcategoryId: 'activity',
    subcategoryName: 'Activity', personId: 'owner', departmentId: 'department', description: 'Example',
    weeks: [8, 12, 4], pastWeeks: [6, 7], isActive: true,
  });
  data.updateNonProjectDemand(record.id, { description: 'Updated activity' });
  assert.deepEqual(record.weeks, [8, 12, 4]);
  data.updateNonProjectDemand(record.id, { isActive: false });
  assert.deepEqual(record.weeks, [0, 0, 0]);
  assert.deepEqual(record.pastWeeks, [6, 7]);
  record.weeks[0] = 5;
  data.updateNonProjectDemand(record.id, { isActive: false });
  assert.deepEqual(record.weeks, [0, 0, 0]);
  data.updateNonProjectDemand(record.id, { isActive: true });
  assert.deepEqual(record.weeks, [0, 0, 0]);
});

test('submission requires all opportunity intake fields', () => {
  const complete = { shortTitle: 'Improve process', neededBy: '2027-03-28', neededByJustification: 'Time-sensitive change',
    location: 'Site A', sponsorPersonId: 'sponsor', currentState: 'Current state needs improvement',
    discoveryMethod: 'Observed during review', impactToOperations: 'Delays production', desiredFutureState: 'Faster operations' };
  assert.doesNotThrow(() => opportunitySubmissionSchema.parse(complete));
  for (const field of Object.keys(complete)) {
    assert.equal(opportunitySubmissionSchema.safeParse({ ...complete, [field]: '' }).success, false, `${field} must be required`);
  }
});