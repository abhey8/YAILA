import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, env.jwtSecret);

            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                throw new AppError('Not authorized, user not found', 401, 'AUTH_USER_NOT_FOUND');
            }

            next();
        } catch (error) {
            next(new AppError('Not authorized, token failed', 401, 'AUTH_TOKEN_FAILED'));
        }
        return;
    }

    if (!token) {
        next(new AppError('Not authorized, no token', 401, 'AUTH_NO_TOKEN'));
    }
};
