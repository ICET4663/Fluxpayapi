export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'bad_request', message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, 'unauthorized', message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found') {
    return new AppError(404, 'not_found', message);
  }

  static conflict(message: string) {
    return new AppError(409, 'conflict', message);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new AppError(429, 'too_many_requests', message);
  }
}
