// ============================================
// RSDM v2 logger for HalCraft server
// @rosch/rsdm を正本とする互換ランタイム実装。
// ============================================

import { randomUUID, createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 20;
const SENSITIVE_KEY_PARTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'session',
  'vapid',
  'p256dh',
  'auth',
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function truncate(value, maxLength = MAX_STRING_LENGTH) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}

export function sanitizeRsdmPayload(value, key = '') {
  const lowerKey = key.toLowerCase();
  if (SENSITIVE_KEY_PARTS.some((part) => lowerKey.includes(part))) return REDACTED;

  if (typeof value === 'string') {
    if (EMAIL_RE.test(value)) return REDACTED;
    return truncate(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeRsdmPayload(item, key));
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = sanitizeRsdmPayload(childValue, childKey);
    }
    return result;
  }
  return String(value);
}

export function createErrorFingerprint(message, stack = '') {
  return createHash('sha256')
    .update(`${String(message || '').slice(0, 300)}\n${String(stack || '').split('\n').slice(0, 5).join('\n')}`)
    .digest('hex')
    .slice(0, 16);
}

function pruneOldLogs(dir, maxDays = 7) {
  const maxAge = maxDays * 24 * 60 * 60 * 1000;
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    return;
  }
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue;
    const match = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) continue;
    const time = new Date(match[1]).getTime();
    if (!Number.isNaN(time) && Date.now() - time > maxAge) {
      try {
        unlinkSync(join(dir, file));
      } catch {
        // ログ削除失敗でゲームを止めない。
      }
    }
  }
}

class FileTransport {
  constructor({ projectRoot }) {
    this.projectRoot = projectRoot;
    this.dir = resolve(projectRoot, '.rosch/memory/runtime');
    this.maxFileSize = 10 * 1024 * 1024;
    this.currentDate = '';
    this.currentPath = '';
    this.currentSegment = 0;
    this.initialized = false;
  }

  write(entry) {
    if (!this.initialized) this.init();
    const date = entry.ts.slice(0, 10);
    if (date !== this.currentDate) {
      this.currentDate = date;
      this.currentSegment = 0;
      this.currentPath = this.pathFor(date, 0);
    }
    if (existsSync(this.currentPath) && statSync(this.currentPath).size >= this.maxFileSize) {
      this.currentSegment += 1;
      this.currentPath = this.pathFor(date, this.currentSegment);
    }
    appendFileSync(this.currentPath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  pathFor(date, segment) {
    return join(this.dir, `${date}${segment ? `.${segment}` : ''}.jsonl`);
  }

  init() {
    this.initialized = true;
    mkdirSync(this.dir, { recursive: true });
    const gitignore = join(this.projectRoot, '.gitignore');
    try {
      if (existsSync(gitignore)) {
        const content = readFileSync(gitignore, 'utf8');
        if (!content.includes('.rosch/')) appendFileSync(gitignore, '\n# RSDM agent memory\n.rosch/\n', 'utf8');
      } else {
        writeFileSync(gitignore, '# RSDM agent memory\n.rosch/\n', 'utf8');
      }
    } catch {
      // .gitignore 更新失敗でゲームを止めない。
    }
    pruneOldLogs(this.dir);
  }
}

class HttpTransport {
  constructor({ hubUrl, apiKey }) {
    this.hubUrl = String(hubUrl || '').replace(/\/+$/, '');
    this.apiKey = apiKey || '';
    this.buffer = [];
    this.flushing = false;
    this.timer = setInterval(() => {
      void this.flush();
    }, Number(process.env.RSDM_HUB_FLUSH_INTERVAL_MS) || 5000);
    this.timer.unref?.();
  }

  write(entry) {
    if (!this.hubUrl || typeof fetch !== 'function') return;
    this.buffer.push(entry);
    if (this.buffer.length >= (Number(process.env.RSDM_HUB_BATCH_SIZE) || 10)) void this.flush();
  }

  async dispose() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  async flush() {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const entries = this.buffer.splice(0);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      await fetch(`${this.hubUrl}/ingest`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ entries }),
        signal: AbortSignal.timeout(Number(process.env.RSDM_HUB_TIMEOUT_MS) || 5000),
      });
    } catch {
      // RSDM Hub が落ちていてもゲームを止めない。FileTransport に残す。
    } finally {
      this.flushing = false;
    }
  }
}

export class RSDMLogger {
  constructor({ project, env, platform, transports }) {
    this.project = project;
    this.env = env;
    this.platform = platform;
    this.transports = transports;
  }

  event(component, message, fields = {}) {
    this.log('event', 'info', component, message, fields);
  }

  warn(component, message, fields = {}) {
    this.log('event', 'warn', component, message, fields);
  }

  error(component, message, fields = {}) {
    this.log('error', 'error', component, message, fields);
  }

  fatal(component, message, fields = {}) {
    this.log('error', 'fatal', component, message, fields);
  }

  metric(component, message, fields = {}) {
    this.log('metric', 'info', component, message, fields);
  }

  async dispose() {
    await Promise.all(this.transports.map(async (transport) => transport.dispose?.()));
  }

  log(type, severity, component, message, fields) {
    const { contextId, ...rest } = fields || {};
    const payload = sanitizeRsdmPayload({
      message,
      ...rest,
    });
    const entry = {
      v: 2,
      id: randomUUID(),
      ts: new Date().toISOString(),
      env: this.env,
      type,
      severity,
      source: {
        project: this.project,
        component,
        platform: this.platform,
        ...(contextId ? { contextId } : {}),
      },
      payload,
      processed: false,
    };

    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch {
        // ログ基盤がゲームサーバーを落としてはならない。
      }
    }
  }
}

export function createHalcraftLogger(projectRoot) {
  const transports = [new FileTransport({ projectRoot })];
  if (process.env.RSDM_HUB_URL) {
    transports.push(new HttpTransport({
      hubUrl: process.env.RSDM_HUB_URL,
      apiKey: process.env.RSDM_HUB_API_KEY,
    }));
  }

  return new RSDMLogger({
    project: process.env.RSDM_PROJECT || 'halcraft',
    platform: 'node_docker',
    env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    transports,
  });
}
