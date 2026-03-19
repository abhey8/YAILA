import Document from '../models/Document.js';
import Roadmap from '../models/Roadmap.js';
import { logger } from '../lib/logger.js';
import { generateRoadmap } from '../services/roadmapService.js';

export const startRoadmapRegenerationJob = () => {
    const intervalMs = 60 * 60 * 1000; // Hourly check

    setInterval(async () => {
        try {
            const documents = await Document.find({ ingestionStatus: 'completed' });
            for (const document of documents) {
                // Find latest roadmap for this document
                const latestRoadmap = await Roadmap.findOne({ document: document._id })
                    .sort({ validUntil: -1 });

                // Only regenerate if the roadmap has expired or doesn't exist
                if (!latestRoadmap || new Date() > latestRoadmap.validUntil) {
                    try {
                        await generateRoadmap(document.user, document._id, 'weekly-refresh');
                    } catch (error) {
                        logger.warn('Roadmap refresh failed', {
                            documentId: document._id.toString(),
                            error: error.message
                        });
                    }
                }
            }
        } catch (error) {
            logger.error('Error in roadmap regeneration job', { error: error.message });
        }
    }, intervalMs);
};
