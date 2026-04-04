import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { documentRepository } from '../repositories/documentRepository.js';
import { chunkRepository } from '../repositories/chunkRepository.js';
import { retrieveRelevantChunks } from '../services/retrievalService.js';
import { resetVectorStoreCache } from '../services/vectorStores/vectorStoreFactory.js';

test('retrieveRelevantChunks merges vector and lexical hits without duplicate spam', async () => {
    const snapshot = {
        geminiApiKey: env.geminiApiKey,
        localEmbeddingFallbackEnabled: env.localEmbeddingFallbackEnabled,
        vectorStoreProvider: env.vectorStoreProvider,
        retrievalContextRadius: env.retrievalContextRadius
    };
    const originals = {
        listOwnedDocumentsByIds: documentRepository.listOwnedDocumentsByIds,
        vectorSearch: chunkRepository.vectorSearch,
        lexicalSearchByDocuments: chunkRepository.lexicalSearchByDocuments,
        listAdjacentByDocument: chunkRepository.listAdjacentByDocument
    };

    const documentId = new mongoose.Types.ObjectId();
    env.geminiApiKey = '';
    env.localEmbeddingFallbackEnabled = true;
    env.vectorStoreProvider = 'mongo';
    env.retrievalContextRadius = 1;
    resetVectorStoreCache();

    documentRepository.listOwnedDocumentsByIds = async () => [{
        _id: documentId,
        title: 'Logic Notes'
    }];

    chunkRepository.vectorSearch = async () => ([
        {
            _id: new mongoose.Types.ObjectId(),
            document: documentId,
            user: 'user-1',
            vectorId: 'doc:0',
            chunkIndex: 2,
            content: 'A biconditional means both directions hold: if p then q and if q then p.',
            summary: 'Biconditional definition',
            keywords: ['biconditional'],
            sectionTitle: 'Logic',
            pageStart: 2,
            pageEnd: 2,
            semanticScore: 0.94
        }
    ]);

    chunkRepository.lexicalSearchByDocuments = async () => ([
        {
            _id: new mongoose.Types.ObjectId(),
            document: documentId,
            user: 'user-1',
            chunkIndex: 3,
            content: 'If and only if is another way to say biconditional.',
            summary: 'Near-duplicate phrasing',
            keywords: ['biconditional'],
            sectionTitle: 'Logic',
            pageStart: 3,
            pageEnd: 3,
            embedding: [0.1, 0.2]
        },
        {
            _id: new mongoose.Types.ObjectId(),
            document: documentId,
            user: 'user-1',
            chunkIndex: 10,
            content: 'Quantifiers include for all and there exists.',
            summary: 'Quantifier overview',
            keywords: ['quantifier'],
            sectionTitle: 'Quantifiers',
            pageStart: 10,
            pageEnd: 10,
            embedding: [0.2, 0.1]
        }
    ]);

    chunkRepository.listAdjacentByDocument = async () => ([
        {
            _id: new mongoose.Types.ObjectId(),
            document: documentId,
            user: 'user-1',
            chunkIndex: 4,
            content: 'This supporting explanation gives the same law with a truth-table example.',
            summary: 'Supporting explanation',
            keywords: ['truth table'],
            sectionTitle: 'Logic',
            pageStart: 4,
            pageEnd: 4
        }
    ]);

    try {
        const results = await retrieveRelevantChunks({
            userId: 'user-1',
            documentIds: [documentId],
            query: 'what does biconditional mean?',
            topK: 3
        });

        assert.ok(results.length >= 1);
        assert.equal(results[0].documentTitle, 'Logic Notes');
        assert.ok(results.every((chunk) => chunk.sectionTitle));
        const logicChunks = results.filter((chunk) => chunk.sectionTitle === 'Logic');
        assert.ok(logicChunks.length <= 2);
    } finally {
        Object.assign(env, snapshot);
        resetVectorStoreCache();
        documentRepository.listOwnedDocumentsByIds = originals.listOwnedDocumentsByIds;
        chunkRepository.vectorSearch = originals.vectorSearch;
        chunkRepository.lexicalSearchByDocuments = originals.lexicalSearchByDocuments;
        chunkRepository.listAdjacentByDocument = originals.listAdjacentByDocument;
    }
});
