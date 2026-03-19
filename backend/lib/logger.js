const baseLog = (level, message, meta = {}) => {
    const payload = {
        level,
        message,
        ...meta,
        timestamp: new Date().toISOString()
    };

    const line = JSON.stringify(payload);
    if (level === 'error') {
        console.error(line);
        return;
    }

    if (level === 'warn') {
        console.warn(line);
        return;
    }

    console.log(line);
};

export const logger = {
    info: (message, meta) => baseLog('info', message, meta),
    warn: (message, meta) => baseLog('warn', message, meta),
    error: (message, meta) => baseLog('error', message, meta)
};
