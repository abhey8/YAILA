# Backend Architecture

## Folder Layout

```text
backend/
├── config/                 # environment configuration
├── controllers/            # thin HTTP handlers
├── jobs/                   # scheduled background jobs
├── lib/                    # shared errors, logging, math, async wrapper
├── middleware/             # auth + error middleware
├── models/                 # mongoose schemas
├── repositories/           # data access layer
├── routes/                 # HTTP routing
├── services/               # AI/domain logic
└── utils/                  # low-level helpers like PDF parsing
```

## New Schemas

- `Document`: ingestion status, chunk count, concept count, metadata.
- `DocumentChunk`: chunk text, summary, keywords, embedding, semantic/sliding-window metadata.
- `Concept`: adjacency-list knowledge graph node with prerequisites and embedding.
- `ConceptMastery`: per-student per-concept mastery/confusion state.
- `UserProgress`: time spent, chat frequency, failures, roadmap pointer.
- `LearningSession`: active recall tutor history and grading.
- `Roadmap`: generated ordered plan with recommended actions.

## Adaptive Services

### 1. Document Ingestion

File: [documentIngestionService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/documentIngestionService.js)

Flow:

1. Parse uploaded PDF text.
2. Build semantic paragraph groups.
3. Apply sliding-window chunking with overlap.
4. Generate embeddings with Gemini `text-embedding-004`.
5. Generate chunk summaries and keywords.
6. Store chunks in MongoDB.
7. Extract concept graph with prerequisite edges.
8. Seed baseline mastery records.
9. Generate initial roadmap.

### 2. Retrieval-Augmented Chat

Files:

- [retrievalService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/retrievalService.js)
- [chatService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/chatService.js)

Behavior:

- Query embedding generation.
- Semantic top-k search over stored chunk embeddings.
- Re-ranking using semantic score + lexical overlap.
- Prompt assembly with retrieved chunks + recent conversation memory.
- Analytics and mastery updates from matched concepts.

### 3. Knowledge Graph

File: [knowledgeGraphService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/knowledgeGraphService.js)

Behavior:

- LLM extracts concepts, subtopics, prerequisite relationships, difficulty, importance.
- Concepts are persisted as graph nodes with adjacency lists.
- Related concepts are linked using keyword overlap.
- Graph API returns `nodes` + `edges` for visualization.

### 4. Personalized Roadmaps

File: [roadmapService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/roadmapService.js)

Behavior:

- Reads graph dependencies and concept mastery.
- Adds performance, chat activity, and failure pressure.
- Produces ordered roadmap items with reasons and estimated study time.
- Weekly regeneration job runs in [roadmapRegenerationJob.js](/Users/abheydua2025/Desktop/sesd_proj/backend/jobs/roadmapRegenerationJob.js).

### 5. Weak Concept Detection

Files:

- [quizService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/quizService.js)
- [masteryService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/masteryService.js)

Behavior:

- Quiz questions are tagged with concept references and embeddings.
- Mastery score uses accuracy, score contribution, and recency.
- Weakness signals propagate to similar concepts using cosine similarity.
- APIs expose weak concepts and recommended revision chunks.

### 6. Active Recall Tutor

File: [activeRecallService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/activeRecallService.js)

Behavior:

- Starts from weakest available concept.
- Generates conceptual free-text questions.
- Grades answers with rubric-driven structured LLM evaluation.
- Returns score, feedback, hint, and follow-up question.
- Persists session history and updates mastery.

### 7. Confusion Prediction

File: [confusionService.js](/Users/abheydua2025/Desktop/sesd_proj/backend/services/confusionService.js)

Signals:

- high time spent
- repeated quiz failures
- repeated AI questions on same concept

Output:

- confusion score
- revision trigger flag
- easier explanation trigger flag

## API Surface

### Existing flows upgraded

- `POST /api/documents`
- `GET /api/documents`
- `GET /api/documents/:id`
- `DELETE /api/documents/:id`
- `GET /api/ai/document/:id/summary`
- `GET /api/ai/document/:id/confusion`
- `POST /api/ai/explain`
- `GET /api/ai/chat/:id`
- `POST /api/ai/chat/:id`
- `POST /api/flashcards/generate/:id`
- `GET /api/flashcards/document/:id`
- `POST /api/quizzes/generate/:id`
- `GET /api/quizzes/document/:id`
- `GET /api/quizzes/:id`
- `POST /api/quizzes/:id`

### New adaptive endpoints

- `GET /api/graph/document/:id`
- `GET /api/roadmaps/document/:id`
- `POST /api/roadmaps/document/:id/regenerate`
- `GET /api/concepts/document/:id/weak`
- `GET /api/concepts/document/:id/recommendations`
- `POST /api/recall/document/:id/session`
- `POST /api/recall/session/:id/answer`

## Frontend Integration Notes

### Roadmap UI

- Call `GET /api/roadmaps/document/:id`.
- Render `items[]` in priority order.
- Use `reason`, `estimatedMinutes`, and `recommendedResources`.

### Weak Concept Dashboard

- Call `GET /api/concepts/document/:id/weak`.
- Show mastery/confusion trends.
- Pair with `GET /api/concepts/document/:id/recommendations`.

### Knowledge Graph Visualization

- Call `GET /api/graph/document/:id`.
- Use `nodes` and `edges` directly for Cytoscape, React Flow, or D3.

### Active Recall Session UI

- Start with `POST /api/recall/document/:id/session`.
- Display latest `exchanges[-1].question`.
- Submit answer to `POST /api/recall/session/:id/answer`.
- Render `score`, `feedback`, `hint`, and `followUpQuestion`.

### Adaptive Chat

- `POST /api/ai/chat/:id` now returns:
  - `reply`
  - `retrievedChunks`
  - `concepts`

Use `retrievedChunks` to show source grounding in the UI.

## Example Test Flows

### RAG Ingestion + Chat

1. Register/login.
2. Upload a PDF with `POST /api/documents`.
3. Verify `ingestionStatus=completed`, `chunkCount>0`, `conceptCount>0`.
4. Ask a targeted question with `POST /api/ai/chat/:id`.
5. Confirm retrieved chunks are returned and grounded in the answer.

### Knowledge Graph

1. Upload a concept-heavy PDF.
2. Call `GET /api/graph/document/:id`.
3. Verify nodes exist and prerequisite edges are populated.

### Roadmap

1. Upload a PDF.
2. Call `GET /api/roadmaps/document/:id`.
3. Attempt a low-scoring quiz.
4. Call `POST /api/roadmaps/document/:id/regenerate`.
5. Verify weak concepts moved up in the plan.

### Weak Concept Detection

1. Generate a quiz.
2. Intentionally miss answers on a concept cluster.
3. Call `GET /api/concepts/document/:id/weak`.
4. Call `GET /api/concepts/document/:id/recommendations`.
5. Verify weak concepts and chunk-backed revision material are returned.

### Active Recall

1. Start a session with `POST /api/recall/document/:id/session`.
2. Submit a weak answer.
3. Verify the response includes `score`, `feedback`, `hint`, and `followUpQuestion`.
4. Repeat until the session status becomes `completed`.

### Confusion Prediction

1. Chat repeatedly about the same concept.
2. Fail related quiz questions.
3. Call `GET /api/ai/document/:id/confusion`.
4. Verify concept confusion scores increase and revision triggers appear.

## Run Instructions

```bash
cd backend
npm install
npm run dev
```

Then verify:

```bash
curl http://localhost:5001/api/health
```
