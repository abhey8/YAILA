import mongoose from 'mongoose';
import { env } from './config/env.js';
import { getProfileAnalytics } from './services/profileAnalyticsService.js';
import User from './models/User.js';

const run = async () => {
    try {
        await mongoose.connect(env.mongoUri);
        const user = await User.findOne();
        if (!user) {
            console.log("No user found.");
            process.exit(0);
        }
        console.log("Found user:", user._id);
        const analytics = await getProfileAnalytics(user._id);
        console.log(analytics);
        process.exit(0);
    } catch (e) {
        console.error("ERROR:", e);
        process.exit(1);
    }
}
run();
