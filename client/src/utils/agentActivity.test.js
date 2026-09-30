import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAgentActivityLabel } from './agentActivity.js';

test('formatAgentActivityLabel uses Today for the local calendar day', () => {
  const now = new Date(2026, 8, 30, 16, 0);
  const timestamp = new Date(2026, 8, 30, 9, 5).toISOString();
  assert.equal(formatAgentActivityLabel(timestamp, 'created', { now }), 'Created by AI · Today at 09:05');
});

test('formatAgentActivityLabel uses Yesterday at the day boundary', () => {
  const now = new Date(2026, 8, 30, 0, 1);
  const timestamp = new Date(2026, 8, 29, 23, 59).toISOString();
  assert.equal(formatAgentActivityLabel(timestamp, 'moved', { dayAssigned: '2026-09-24', now }), 'Assigned date changed by AI · Yesterday at 23:59');
});

test('formatAgentActivityLabel uses weekday names for the previous six days', () => {
  const now = new Date(2026, 8, 30, 12, 0);
  const timestamp = new Date(2026, 8, 24, 8, 7).toISOString();
  assert.equal(formatAgentActivityLabel(timestamp, 'moved', { dayAssigned: '2026-09-24', now }), 'Assigned date changed by AI · Thursday at 08:07');
});

test('formatAgentActivityLabel uses an explicit date older than six days', () => {
  const now = new Date(2026, 8, 30, 12, 0);
  const timestamp = new Date(2026, 8, 23, 8, 7).toISOString();
  assert.equal(formatAgentActivityLabel(timestamp, 'created', { now }), 'Created by AI · 23 Sept 2026 at 08:07');
});

test('formatAgentActivityLabel identifies an AI unassignment', () => {
  const now = new Date(2026, 8, 30, 12, 0);
  const timestamp = new Date(2026, 8, 30, 8, 7).toISOString();
  assert.equal(formatAgentActivityLabel(timestamp, 'moved', { now }), 'Unassigned by AI · Today at 08:07');
});
