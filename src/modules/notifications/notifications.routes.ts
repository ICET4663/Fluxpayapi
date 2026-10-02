import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth.ts';
import { validateQuery } from '../../middleware/validate.ts';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { AppError } from '../../utils/AppError.ts';
import { listNotificationsQuerySchema } from './notifications.schema.ts';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from './notifications.repository.ts';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  validateQuery(listNotificationsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const { items, total, unread } = await listNotifications(req.user!.id, limit, offset);
    res.json({ notifications: items, total, unread, limit, offset });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    await markAllNotificationsRead(req.user!.id);
    res.json({ message: 'All notifications marked as read' });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw AppError.notFound('Notification not found');
    const found = await markNotificationRead(req.user!.id, id);
    if (!found) throw AppError.notFound('Notification not found');
    res.json({ message: 'Notification marked as read' });
  }),
);
