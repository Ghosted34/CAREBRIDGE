import type { Db, Row } from '../../db/pool.js';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import type { Ctx } from '../../lib/http.js';
import type { Pagination } from '../../lib/validate.js';
import type { ProviderRole } from '../../types.js';
import * as repo from './notifications.repo.js';
import { render, TEMPLATES, type Payload, type TemplateKey } from './templates.js';

// Clinical text must never be stored in a notification payload.
const FORBIDDEN_KEYS = ['description', 'clinical_summary', 'service_type', 'notes'];

/**
 * Queue a notification for each user, on every channel the template uses.
 * Call with the transaction connection so notifications commit (or roll back) with the change
 * that caused them (transactional outbox). In-app rows are delivered immediately; SMS/email rows
 * are picked up by the worker (src/worker.ts).
 */
export async function notify(db: Db, userIds: number[], template: TemplateKey, payload: Payload) {
  for (const key of FORBIDDEN_KEYS) {
    if (key in payload) throw new Error(`Notification payload must not contain "${key}"`);
  }
  const unique = [...new Set(userIds)];
  for (const userId of unique) {
    for (const channel of TEMPLATES[template].channels) {
      await repo.insert(db, {
        user_id: userId,
        channel,
        template_key: template,
        payload,
        status: channel === 'in_app' ? 'sent' : 'queued',
      });
    }
  }
}

/** Active staff of a provider (optionally only some roles) — the people to tell about it. */
export async function providerStaffIds(
  db: Db,
  providerId: number,
  roles: readonly ProviderRole[] = ['owner', 'clinician', 'scheduler', 'receptionist'],
) {
  const [rows] = await db.query<Row[]>(
    `SELECT pu.user_id FROM provider_users pu JOIN users u ON u.id = pu.user_id
      WHERE pu.provider_id = ? AND u.status = 'active' AND pu.provider_role IN (?)`,
    [providerId, roles],
  );
  return rows.map((r) => r.user_id as number);
}

export async function providerName(db: Db, providerId: number) {
  const [rows] = await db.execute<Row[]>('SELECT display_name FROM providers WHERE id = ?', [
    providerId,
  ]);
  return (rows[0]?.display_name as string | undefined) ?? 'Your provider';
}

// ---- inbox ----

export async function inbox(c: Ctx, f: { unread?: boolean } & Pagination) {
  const rows = await repo.inbox(pool, c.user.id, { ...f, unreadOnly: !!f.unread });
  return rows.map((r) => {
    const payload = (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Payload;
    const { title, body, link } = render(r.template_key, payload);
    return {
      id: r.id,
      type: r.template_key,
      title,
      body,
      link,
      read_at: r.read_at,
      created_at: r.created_at,
    };
  });
}

export const unreadCount = (c: Ctx) => repo.unreadCount(pool, c.user.id);

export async function markRead(c: Ctx, id: number) {
  if (!(await repo.markRead(pool, c.user.id, id))) throw AppError.notFound('Notification');
  return { id, read: true };
}

export async function markAllRead(c: Ctx) {
  return { updated: await repo.markAllRead(pool, c.user.id) };
}
