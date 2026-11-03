export const notFound = (req, res, next) => {
  const error = new Error(`Resource not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Internal Server Error';

  // Handle PostgreSQL / PostgREST specific error codes
  if (err.code === '23505') {
    // Unique violation
    statusCode = 400;
    message = 'A record with these details already exists.';
  } else if (err.code === '23503') {
    // Foreign key violation
    statusCode = 400;
    message = 'Referenced resource does not exist.';
  } else if (err.code === '22P02') {
    // Invalid text representation (e.g. invalid UUID)
    statusCode = 400;
    message = 'Invalid ID or format provided.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

export default { notFound, errorHandler };
