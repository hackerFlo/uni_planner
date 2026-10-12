import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnrollmentSelection, enrollmentSelectionReducer } from './agentEnrollmentSelection.js';

const all = ['planner_read', 'planner_write', 'notifications', 'export'];
const linked = { linked: true, requiresReenrollment: false, revokedAt: null, capabilities: all };
const toggle = (state, capability, checked) => enrollmentSelectionReducer(state, { type: 'toggle', capability, checked });
const refresh = (state, status, confirmed = false) => enrollmentSelectionReducer(state, { type: 'status', status, confirmed });

test('initial selection reflects only saved linked grants with planner read always required', () => {
  assert.deepEqual(createEnrollmentSelection(linked).capabilities, all);
  assert.deepEqual(createEnrollmentSelection({ ...linked, capabilities: ['planner_read', 'notifications'] }).capabilities,
    ['planner_read', 'notifications']);
  assert.deepEqual(createEnrollmentSelection({ ...linked, linked: false }).capabilities, ['planner_read']);
  assert.deepEqual(createEnrollmentSelection({ ...linked, requiresReenrollment: true }).capabilities, ['planner_read']);
});

test('confirmed permission saves keep all selected grants visible and clear the unsaved state', () => {
  const initial = createEnrollmentSelection({ ...linked, capabilities: ['planner_read'] });
  const edited = ['planner_write', 'notifications', 'export'].reduce((state, capability) => toggle(state, capability, true), initial);
  const saved = refresh(edited, linked, true);
  assert.deepEqual(saved.capabilities, all);
  assert.equal(saved.dirty, false);
});

test('confirmed saved grants replace selections exactly without restoring unchecked permissions', () => {
  const edited = toggle(createEnrollmentSelection(linked), 'export', false);
  const status = { ...linked, capabilities: ['planner_read', 'planner_write', 'notifications'] };
  assert.deepEqual(refresh(edited, status, true).capabilities, status.capabilities);
  assert.deepEqual(refresh(edited, { ...linked, capabilities: ['planner_read'] }, true).capabilities, ['planner_read']);
});

test('refresh after a failed save preserves user edits while an untouched form follows saved grants', () => {
  const initial = createEnrollmentSelection(linked);
  const edited = toggle(initial, 'notifications', false);
  assert.equal(refresh(edited, { ...linked }), edited);
  assert.equal(refresh(edited, { ...linked, capabilities: ['planner_read'] }), edited);
  assert.deepEqual(refresh(initial, { ...linked, capabilities: ['planner_read'] }).capabilities, ['planner_read']);
});

test('disable and credential revocation reset optional grants before fresh enrollment', () => {
  const edited = toggle(createEnrollmentSelection(linked), 'export', false);
  const disabled = { ...linked, linked: false, revokedAt: '2026-10-11T12:00:00Z', capabilities: [] };
  const reset = refresh(edited, disabled);
  assert.deepEqual(reset.capabilities, ['planner_read']);
  assert.equal(reset.dirty, false);
  const reenrolled = refresh(toggle(reset, 'notifications', true),
    { ...linked, capabilities: ['planner_read', 'notifications'] }, true);
  assert.deepEqual(reenrolled.capabilities, ['planner_read', 'notifications']);
  assert.deepEqual(refresh(edited, { ...linked, linked: false, requiresReenrollment: true }).capabilities, ['planner_read']);
});

test('selection never removes required read permission or accepts an unknown grant', () => {
  const initial = createEnrollmentSelection(linked);
  assert.equal(toggle(initial, 'planner_read', false), initial);
  assert.equal(toggle(initial, 'administrator', true), initial);
  const twice = toggle(toggle(initial, 'export', true), 'export', true);
  assert.deepEqual(twice.capabilities, all);
});
