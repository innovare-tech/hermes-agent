import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';

import { groupAllowlist, matchesInboundWhatsAppGroup, parseAllowedUsers } from './allowlist.js';

const G1 = '120363000000000001@g.us';
const G2 = '120363000000000002@g.us';

test('sem arquivo: vale a env', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wa-allow-'));
  try {
    const env = parseAllowedUsers(G1);
    assert.equal(groupAllowlist(dir, env), env);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('arquivo do painel substitui a env e é relido quando muda (sem reiniciar a ponte)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wa-allow-'));
  const file = path.join(dir, 'group-allowlist.json');
  try {
    const env = parseAllowedUsers(G1);
    writeFileSync(file, JSON.stringify([G2]));
    const allow = () => groupAllowlist(dir, env);
    const passes = (id) => matchesInboundWhatsAppGroup({ chatId: id, groupPolicy: 'allowlist', groupAllowedUsers: allow(), sessionDir: dir });
    assert.equal(passes(G2), true);
    assert.equal(passes(G1), false);
    writeFileSync(file, JSON.stringify([G1, G2]));
    const later = new Date(Date.now() + 5000);
    utimesSync(file, later, later);
    assert.equal(passes(G1), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('arquivo ilegível nunca abre para todos', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wa-allow-'));
  try {
    writeFileSync(path.join(dir, 'group-allowlist.json'), '{quebrado');
    const allowed = groupAllowlist(dir, parseAllowedUsers('*'));
    assert.equal(allowed.has('*'), false);
    assert.equal(matchesInboundWhatsAppGroup({ chatId: G1, groupPolicy: 'allowlist', groupAllowedUsers: allowed, sessionDir: dir }), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
