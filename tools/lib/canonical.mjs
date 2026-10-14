// Canonical JSON serialization and hashing (controls appendix A).
// Stable key order, UTF-8, no whitespace. Serialization version is recorded
// alongside every hash so a future change cannot silently alter identities.

import { createHash } from 'node:crypto';

export const SERIALIZATION_VERSION = 'cjson-1';

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function hashObject(value) {
  return sha256(Buffer.from(canonicalize(value), 'utf8'));
}

export function hashBytes(buffer) {
  return sha256(buffer);
}

// Fields excluded from the immutable envelope hash: receipt-only identities and
// transient timestamps live outside the envelope (appendix A).
export function envelopeForHash(brief) {
  const copy = JSON.parse(JSON.stringify(brief));
  if (copy.identity) {
    delete copy.identity.orca;
    delete copy.identity.created_at;
  }
  return copy;
}

export function briefHash(brief) {
  return hashObject(envelopeForHash(brief));
}
