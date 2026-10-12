export class AppError extends Error {
  constructor(statusCode, message, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function notFound(message = 'Resource not found.') {
  return new AppError(404, message, 'NOT_FOUND');
}

export function unauthorized(message = 'Authentication required.') {
  return new AppError(401, message, 'UNAUTHORIZED');
}

export function forbidden(message = 'You do not have permission to perform this action.') {
  return new AppError(403, message, 'FORBIDDEN');
}
