'use strict';

/**
 * Standardized error handling middleware for the REST API.
 *
 * Every error response uses the same envelope:
 * {
 *   success: false,
 *   error: {
 *     code: 'VALIDATION_ERROR',
 *     message: 'Validation failed',
 *     details: [ { path: 'body.email', message: 'Invalid email' } ]
 *   }
 * }
 *
 * Mount order in app.js:
 *   app.use('/api', routes);
 *   app.use(notFoundHandler);
 *   app.use(errorHandler);
 */

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Operational error with an HTTP status code.
 * Throw this anywhere in services/controllers.
 */
class ApiError extends Error {
  constructor(statusCode, message, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Unauthorized', details) {
    return new ApiError(401, message, 'UNAUTHORIZED', details);
  }

  static forbidden(message = 'Forbidden', details) {
    return new ApiError(403, message, 'FORBIDDEN', details);
  }

  static notFound(message = 'Resource not found', details) {
    return new ApiError(404, message, 'NOT_FOUND', details);
  }

  static conflict(message = 'Conflict', details) {
    return new ApiError(409, message, 'CONFLICT', details);
  }

  static validation(message = 'Validation failed', details) {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }

  static internal(message = 'Internal server error', details) {
    return new ApiError(500, message, 'INTERNAL_ERROR', details);
  }
}

/**
 * Wrap async route handlers so rejected promises
 * are forwarded to errorHandler instead of crashing the process.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** 404 for unmatched routes. Mount AFTER all routes. */
function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND'));
}

/** Central error handler. Mount LAST. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.name === 'ZodError' || Array.isArray(err.issues)) {
    // zod: flatten issues into a consistent details array
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = (err.issues || []).map((issue) => ({
      path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path || ''),
      message: issue.message,
    }));
  } else if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    // body-parser: malformed JSON body
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains malformed JSON';
  } else if (err.code === 11000) {
    // MongoDB duplicate key
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const fields = Object.keys(err.keyValue || {}).join(', ');
    message = fields ? `Duplicate value for: ${fields}` : 'Duplicate key error';
    details = err.keyValue;
  } else if (err.name === 'ValidationError' && err.errors && typeof err.errors === 'object') {
    // Mongoose schema validation
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    // Mongoose invalid ObjectId / cast failure
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid value for '${err.path}': ${err.value}`;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token has expired';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token';
  }

  // Never leak internals in production for unexpected 500s
  if (statusCode >= 500 && NODE_ENV === 'production' && !err.isOperational) {
    message = 'Internal server error';
    details = undefined;
  }

  const log = statusCode >= 500 ? console.error : console.warn;
  log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${statusCode} ${code}: ${message}`);
  if (statusCode >= 500 && err.stack) log(err.stack);

  const payload = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  // Include stack trace only outside production to ease debugging
  if (NODE_ENV !== 'production' && statusCode >= 500 && err.stack) {
    payload.error.stack = err.stack;
  }

  res.status(statusCode).json(payload);
}

module.exports = { ApiError, asyncHandler, notFoundHandler, errorHandler };