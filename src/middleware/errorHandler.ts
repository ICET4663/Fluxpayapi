import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.ts';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // Malformed JSON bodies surface from express.json with this type.
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Request body is not valid JSON' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } });
}
