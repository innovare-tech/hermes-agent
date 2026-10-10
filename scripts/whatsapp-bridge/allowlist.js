import path from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

export function normalizeWhatsAppIdentifier(value) {
  return String(value || '')
    .trim()
    .replace(/:.*@/, '@')
    .replace(/@.*/, '')
    .replace(/^\+/, '');
}

// Grupos liberados pelo painel (Canais → Escutar): ``<session>/group-allowlist.json`` (lista de JIDs),
// relido quando muda — ativar um grupo não exige reiniciar a ponte. Existindo, o arquivo é a lista
// inteira (o painel já semeou com o WHATSAPP_GROUP_ALLOWED_USERS); ausente, vale a env.
export const GROUP_ALLOWLIST_FILE = 'group-allowlist.json';
let groupFileCache = { file: '', mtimeMs: -1, set: null };

export function groupAllowlist(sessionDir, envAllowed) {
  const file = path.join(sessionDir, GROUP_ALLOWLIST_FILE);
  let mtimeMs;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return envAllowed;
  }
  if (groupFileCache.file !== file || groupFileCache.mtimeMs !== mtimeMs) {
    try {
      const ids = JSON.parse(readFileSync(file, 'utf8'));
      groupFileCache = { file, mtimeMs, set: parseAllowedUsers((Array.isArray(ids) ? ids : []).join(',')) };
    } catch {
      // Arquivo ilegível: fica com a última lista boa; nunca abre para todos.
      return groupFileCache.file === file && groupFileCache.set ? groupFileCache.set : new Set();
    }
  }
  return groupFileCache.set;
}

export function parseAllowedUsers(rawValue) {
  return new Set(
    String(rawValue || '')
      .split(',')
      .map((value) => normalizeWhatsAppIdentifier(value))
      .filter(Boolean)
  );
}

function readMappingFile(sessionDir, identifier, suffix = '') {
  const filePath = path.join(sessionDir, `lid-mapping-${identifier}${suffix}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const normalized = normalizeWhatsAppIdentifier(parsed);
    return normalized || null;
  } catch {
    return null;
  }
}

export function expandWhatsAppIdentifiers(identifier, sessionDir) {
  const normalized = normalizeWhatsAppIdentifier(identifier);
  if (!normalized) {
    return new Set();
  }

  // Walk both phone->LID and LID->phone mapping files so allowlists can use
  // either form transparently in bot mode.
  const resolved = new Set();
  const queue = [normalized];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || resolved.has(current)) {
      continue;
    }

    resolved.add(current);

    for (const suffix of ['', '_reverse']) {
      const mapped = readMappingFile(sessionDir, current, suffix);
      if (mapped && !resolved.has(mapped)) {
        queue.push(mapped);
      }
    }
  }

  return resolved;
}

export function matchesAllowedSender(senderId, senderAltId, allowedUsers, sessionDir) {
  // WhatsApp Multi-Device can expose a first-contact sender as an opaque LID
  // before it persists LID mapping files. Baileys supplies the same sender's
  // phone JID separately (key.remoteJidAlt for DMs, key.participantAlt in
  // groups), so consult it as an additional alias without changing the
  // allowlist itself (#63415, #72529).
  return matchesAllowedUser(senderId, allowedUsers, sessionDir)
    || matchesAllowedUser(senderAltId, allowedUsers, sessionDir);
}

export function matchesInboundWhatsAppGroup({
  chatId,
  groupPolicy,
  groupAllowedUsers,
  sessionDir,
}) {
  if (groupPolicy === 'disabled' || groupPolicy === 'pairing') {
    return false;
  }
  if (groupPolicy === 'allowlist') {
    return matchesAllowedUser(chatId, groupAllowedUsers, sessionDir);
  }
  return groupPolicy === 'open';
}

export function matchesAllowedUser(senderId, allowedUsers, sessionDir) {
  // Empty allowlist = NO ONE allowed (secure default, #8389).  Operators
  // who want an open bot must set ``WHATSAPP_ALLOWED_USERS=*`` explicitly.
  // Previous behaviour (empty → return true) let any stranger DM the
  // bridge and trigger a Python-side pairing-code reply.
  if (!allowedUsers || allowedUsers.size === 0) {
    return false;
  }

  // "*" means allow everyone (consistent with SIGNAL_GROUP_ALLOWED_USERS)
  if (allowedUsers.has('*')) {
    return true;
  }

  const aliases = expandWhatsAppIdentifiers(senderId, sessionDir);
  for (const alias of aliases) {
    if (allowedUsers.has(alias)) {
      return true;
    }
  }

  return false;
}
