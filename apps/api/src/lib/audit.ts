import type { Db } from '../db/pool.js';

export interface AuditEntry {
  actorUserId: number | null;
  action: string; // UPPER_SNAKE, e.g. CARE_REQUEST_CREATED
  entityType: string; // snake_case table-ish name, e.g. care_request
  entityId: number;
  ip?: string | null;
  metadata?: Record<string, unknown>; // never put clinical text here
}

/** Write an audit row. Pass the transaction connection so it commits/rolls back with the change. */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.execute(
    `INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id, ip_address, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      e.actorUserId,
      e.action,
      e.entityType,
      e.entityId,
      e.ip ?? null,
      e.metadata ? JSON.stringify(e.metadata) : null,
    ],
  );
}
