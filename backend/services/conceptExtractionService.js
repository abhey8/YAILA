import { generateJson, embedTexts } from './aiService.js';
import { conceptRepository } from '../repositories/conceptRepository.js';
import { logger } from '../lib/logger.js';

const extractionPrompt = (chunks) => `Analyze the following academic chunks and extract the core concepts.
Identify only:
- Definitions
- Formulas
- Key Ideas
- Core Headings

Chunks:
${chunks.map((c, i) => `Excerpt ${i+1}:\n${c.content}`).join('\n\n')}

Return a JSON array of objects with the following schema:
- name (string, title case)
- description (string, 1-2 sentences strictly based on the text)
- chunkIndex (number, the index of the excerpt it came from, 0-based)
- importance (number, 0.0 to 1.0)
- slug (string, url friendly lowercase separated by hyphens)

Rules:
- Ignore narrative filler, intro text, and table of contents.
- Keep the description strictly tied to the academic material.
- Only return a maximum of 8 concepts per batch.`;

export const extractConceptsFromChunks = async (documentId, userId, chunks) => {
    try {
        if (!chunks || chunks.length === 0) return;

        logger.info(`[Concept Extraction] Starting parallel extraction for document ${documentId}`);

        // Batch chunks to avoid massive token costs (batch size of 5 chunks)
        const BATCH_SIZE = 5;
        const conceptPromises = [];

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            
            conceptPromises.push((async () => {
                try {
                    const extracted = await generateJson(extractionPrompt(batch));
                    if (!extracted || !Array.isArray(extracted)) return [];

                    // Embed ALL concepts in one shot for this batch to save time/requests
                    const conceptTexts = extracted.map(e => `${e.name}: ${e.description}`);
                    const embeddings = await embedTexts(conceptTexts);

                    return extracted.map((concept, index) => {
                        const sourceChunk = batch[concept.chunkIndex] || batch[0];
                        return {
                            document: documentId,
                            user: userId,
                            name: concept.name,
                            slug: concept.slug || concept.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            description: concept.description,
                            importance: concept.importance || 0.5,
                            embedding: embeddings[index] || [],
                            chunkRefs: [sourceChunk._id] // Link back to the DB chunk
                        };
                    });
                } catch (batchErr) {
                    logger.warn(`[Concept Extraction] Batch failed: ${batchErr.message}`);
                    return [];
                }
            })());
        }

        const results = await Promise.all(conceptPromises);
        const finalConcepts = results.flat().filter(c => c && c.embedding.length > 0);

        if (finalConcepts.length > 0) {
            await conceptRepository.createMany(finalConcepts);
            logger.info(`[Concept Extraction] Successfully saved ${finalConcepts.length} concepts.`);
        }
        
    } catch (err) {
        logger.error(`[Concept Extraction] Overall extraction failed: ${err.message}`);
    }
};
