import UserProgress from '../models/UserProgress.js';

export const progressRepository = {
    getOrCreate: async (userId) => {
        let progress = await UserProgress.findOne({ user: userId });
        if (!progress) {
            progress = await UserProgress.create({ user: userId, documents: [] });
        }

        return progress;
    },
    save: (progress) => progress.save()
};
