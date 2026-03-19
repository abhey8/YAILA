import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';

const generateToken = (id) => {
    return jwt.sign({ id }, env.jwtSecret, { expiresIn: '30d' });
};

export const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password, age, studySpecifications } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
        throw new AppError('User already exists', 400, 'USER_EXISTS');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ 
        name, 
        email, 
        password: hashedPassword,
        age,
        studySpecifications 
    });

    if (!user) {
        throw new AppError('Invalid user data', 400, 'INVALID_USER_DATA');
    }

    res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        age: user.age,
        studySpecifications: user.studySpecifications,
        profilePic: user.profilePic,
        token: generateToken(user._id)
    });
});

export const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!(user && (await bcrypt.compare(password, user.password)))) {
        throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        age: user.age,
        studySpecifications: user.studySpecifications,
        profilePic: user.profilePic,
        token: generateToken(user._id)
    });
});

export const getUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    res.json({ 
        _id: user._id, 
        name: user.name, 
        email: user.email,
        age: user.age,
        studySpecifications: user.studySpecifications,
        profilePic: user.profilePic
    });
});

export const updateUserProfile = asyncHandler(async (req, res) => {
    const { name, email, currentPassword, newPassword, age, studySpecifications, profilePic } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
            throw new AppError('Email is already in use', 400, 'EMAIL_IN_USE');
        }
        user.email = email;
    }

    if (name) {
        user.name = name;
    }
    
    if (age !== undefined) {
        user.age = age;
    }

    if (studySpecifications !== undefined) {
        user.studySpecifications = studySpecifications;
    }

    if (profilePic !== undefined) {
        user.profilePic = profilePic;
    }

    if (newPassword) {
        if (!currentPassword) {
            throw new AppError('Current password is required', 400, 'CURRENT_PASSWORD_REQUIRED');
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
    }

    const updatedUser = await user.save();

    res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        age: updatedUser.age,
        studySpecifications: updatedUser.studySpecifications,
        profilePic: updatedUser.profilePic
    });
});
