/**
 * middleware/errorHandler.js
 *
 * Centralised Express error handler — catches any error passed via next(err)
 * and returns a clean JSON response. In production, sensitive details are hidden.
 */

const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === "production";

  console.error(`[Error] ${err.message}`, isProduction ? "" : err.stack);

  return res.status(statusCode).json({
    success: false,
    error: err.message || "Internal Server Error",
    ...(isProduction ? {} : { stack: err.stack }),
  });
};

module.exports = errorHandler;
