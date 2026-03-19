# Adaptive AI Learning Platform

This repository now exposes an adaptive-learning backend on top of the retained Figma frontend in `Student learn front`. The backend ingests uploaded PDFs into chunk embeddings, builds a concept graph, tracks per-student mastery, generates roadmaps, predicts confusion, and supports active recall tutoring.

The primary implementation details and API contract live in [backend/ADAPTIVE_PLATFORM.md](/Users/abheydua2025/Desktop/sesd_proj/backend/ADAPTIVE_PLATFORM.md).

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
GROK_API_KEY=xai-your-api-key-here
GROK_CHAT_MODEL=grok-2-latest
GROK_EMBEDDING_MODEL=v1
EMBEDDING_DIMENSIONS=256
RETRIEVAL_TOP_K=6
ROADMAP_REFRESH_HOURS=168
```

### Frontend

Use the retained Figma frontend:

```bash
cd frontend
npm install
npm run dev
```

Point it at the backend if you add API wiring:

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
