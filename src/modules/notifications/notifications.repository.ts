import { query, queryOne, type Queryable } from '../../db/pool.ts';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

function map(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: row.metadata,
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}

/** Best-effort: a failed notification must never fail the operation that produced it. */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  client?: Queryable,
) {
  try {
    await query(
      `insert into notifications (user_id, type, title, body, metadata) values ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, metadata ? JSON.stringify(metadata) : null],
      client,
    );
  } catch (err) {
    console.error('notification write failed:', err instanceof Error ? err.message : err);
  }
}

export async function listNotifications(userId: string, limit: number, offset: number) {
  const rows = await query<NotificationRow>(
    `select id, type, title, body, metadata, read_at, created_at
       from notifications where user_id = $1 order by created_at desc limit $2 offset $3`,
    [userId, limit, offset],
  );
  const counts = await queryOne<{ total: number; unread: number }>(
    `select count(*)::int as total, count(*) filter (where read_at is null)::int as unread
       from notifications where user_id = $1`,
    [userId],
  );
  return { items: rows.map(map), total: counts?.total ?? 0, unread: counts?.unread ?? 0 };
}

export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  const row = await queryOne(
    `update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning id`,
    [id, userId],
  );
  return row !== null;
}

export async function markAllNotificationsRead(userId: string) {
  await query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [userId]);
}
