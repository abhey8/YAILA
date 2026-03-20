# Adaptive AI Learning Platform

This repository now exposes an adaptive-learning backend and the integrated YAILA frontend. The backend ingests uploaded PDFs into chunk embeddings, builds a concept graph, tracks per-student mastery, generates roadmaps, predicts confusion, and supports active recall tutoring.

The primary implementation details and API contract live in [ADAPTIVE_PLATFORM.md](/Users/abheydua2025/Desktop/sesd_proj/backend/ADAPTIVE_PLATFORM.md).

## Run

### Backend

```bash
cd backend
npm install
npm run dev
```

Required environment variables in `backend/.env`:

```env
PORT=5001
MONGO_URI=mongodb://localhost:27017/ai-learning-assistant
JWT_SECRET=replace-this
GEMINI_API_KEY=your-gemini-api-key
GEMINI_CHAT_MODEL=gemini-2.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
RETRIEVAL_TOP_K=6
ROADMAP_REFRESH_HOURS=168
```

### Frontend

Use the integrated frontend:

```bash
cd frontend
npm install
npm run dev
```

Point it at the backend:

```env
VITE_API_URL=http://localhost:5001/api
```

Core new frontend data sources:

- `GET /api/graph/document/:id`
- `GET /api/roadmaps/document/:id`
- `POST /api/roadmaps/document/:id/regenerate`
- `GET /api/concepts/document/:id/weak`
- `GET /api/concepts/document/:id/recommendations`
- `GET /api/ai/document/:id/confusion`
- `POST /api/recall/document/:id/session`
- `POST /api/recall/session/:id/answer`

## Smoke Check

```bash
curl http://localhost:5001/api/health
```
