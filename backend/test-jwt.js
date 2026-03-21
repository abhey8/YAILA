import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import User from './models/User.js';
import { exec } from 'child_process';

const run = async () => {
    try {
        await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 2000 });
        const user = await User.findOne();
        if (!user) {
            console.log("No user found.");
            process.exit(0);
        }
        const token = jwt.sign({ id: user._id }, env.jwtSecret, { expiresIn: '1d' });
        
        exec(`curl -s http://localhost:5001/api/dashboard/profile-analytics -H "Authorization: Bearer ${token}"`, (err, stdout) => {
            console.log("RESPONSE:", stdout);
            exec(`curl -s http://localhost:5001/api/auth/profile -H "Authorization: Bearer ${token}"`, (err2, stdout2) => {
                console.log("PROFILE:", stdout2);
                process.exit(0);
            });
        });
    } catch (e) {
        console.error("ERROR:", e);
        process.exit(1);
    }
}
run();
