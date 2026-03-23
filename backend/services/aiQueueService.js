import { env } from '../config/env.js';

/**
 * Service to execute queued AI requests safely within the rate limit pool.
 * Uses an in-memory system to manage 4-5 concurrent users easily.
 */
class AILocalQueue {
    constructor(maxConcurrent = 3) { // Slightly smaller pool size to prevent bursting per minute.
        this.maxConcurrent = maxConcurrent;
        this.currentRunning = 0;
        this.queue = [];
    }

    async enqueue(taskFn, requestTimeoutMs = 30000) {
        if (!env.aiQueueEnabled) {
            return await taskFn(); // Opt out, execute directly.
        }

        return new Promise((resolve, reject) => {
            const queueItem = {
                task: async () => {
                    try {
                        const result = await taskFn();
                        resolve(result);
                    } catch (err) {
                        reject(err);
                    }
                },
                timeout: null
            };

            const runTimeout = setTimeout(() => {
                const index = this.queue.indexOf(queueItem);
                if (index > -1) {
                    this.queue.splice(index, 1);
                    reject(new Error(`[Queue Timeout] Request exceeded ${requestTimeoutMs}ms before processing.`));
                    this.processNext();
                }
            }, requestTimeoutMs);

            queueItem.timeout = runTimeout;

            this.queue.push(queueItem);
            this.processNext();
        });
    }

    processNext() {
        if (this.currentRunning >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift();
        if (item.timeout) clearTimeout(item.timeout);

        this.currentRunning++;
        console.log(`[Queue Runner] Processing AI request. Current active: ${this.currentRunning}`);

        item.task().finally(() => {
            this.currentRunning--;
            this.processNext();
        });
    }
}

export const aiQueueService = new AILocalQueue();
