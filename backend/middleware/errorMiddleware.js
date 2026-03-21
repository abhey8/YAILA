import { isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFound = (req, res, next) => {
    const error = new Error(`Not found: ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
};

export const errorHandler = (error, req, res, next) => {
    const statusCode = isAppError(error) ? error.statusCode : (error.statusCode || 500);
    import('fs').then(fs => fs.appendFileSync('debug_errors.log', JSON.stringify({ message: error.message, stack: error.stack, time: new Date() }) + '\n'));
    logger.error(error.message, {
        statusCode,
        code: error.code || 'UNHANDLED_ERROR',
        path: req.originalUrl
    });

    res.status(statusCode).json({
        message: error.message,
        code: error.code || 'UNHANDLED_ERROR',
        details: error.details || null
    });
};
