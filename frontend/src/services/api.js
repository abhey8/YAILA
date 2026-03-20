import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    if (!config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

export const documentApi = {
  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  getDocuments: async () => {
    const response = await apiClient.get('/documents');
    return response.data;
  },
  getDocument: async (documentId) => {
    const response = await apiClient.get(`/documents/${documentId}`);
    return response.data;
  },
  deleteDocument: async (documentId) => {
    const response = await apiClient.delete(`/documents/${documentId}`);
    return response.data;
  },
};

export const dashboardApi = {
  getStats: async () => {
    const response = await apiClient.get('/dashboard/stats');
    return response.data;
  },
};

export const graphApi = {
  getKnowledgeGraph: async (documentId) => {
    const response = await apiClient.get(`/graph/document/${documentId}`);
    return response.data;
  },
};

export const roadmapApi = {
  getRoadmap: async (documentId) => {
    const response = await apiClient.get(`/roadmaps/document/${documentId}`);
    return response.data;
  },
  regenerateRoadmap: async (documentId, reason) => {
    const response = await apiClient.post(`/roadmaps/document/${documentId}/regenerate`, {
      reason,
    });
    return response.data;
  },
};

export const recallApi = {
  startSession: async (documentId) => {
    const response = await apiClient.post(`/recall/document/${documentId}/session`);
    return response.data;
  },
  submitAnswer: async (sessionId, answer) => {
    const response = await apiClient.post(`/recall/session/${sessionId}/answer`, { answer });
    return response.data;
  },
};

export const confusionApi = {
  getDocumentConfusion: async (documentId) => {
    const response = await apiClient.get(`/ai/document/${documentId}/confusion`);
    return response.data;
  },
};

export const conceptApi = {
  getWeakConcepts: async (documentId) => {
    const response = await apiClient.get(`/concepts/document/${documentId}/weak`);
    return response.data;
  },
  getRecommendations: async (documentId) => {
    const response = await apiClient.get(`/concepts/document/${documentId}/recommendations`);
    return response.data;
  },
};

export const aiApi = {
  chat: async (documentId, message, history = []) => {
    const response = await apiClient.post(`/ai/chat/${documentId}`, { message, history });
    return response.data;
  },
  getHistory: async (documentId) => {
    const response = await apiClient.get(`/ai/chat/${documentId}`);
    return response.data;
  },
  getSummary: async (documentId, regenerate = false) => {
    const query = regenerate ? '?regenerate=true' : '';
    const response = await apiClient.get(`/ai/document/${documentId}/summary${query}`);
    return response.data;
  },
  explain: async ({ text, mode, documentId }) => {
    const response = await apiClient.post('/ai/explain', { text, mode, documentId });
    return response.data;
  },
};

export const flashcardApi = {
  getFavorites: async () => {
    const response = await apiClient.get('/flashcards/favorites');
    return response.data;
  },
  getByDocument: async (documentId) => {
    const response = await apiClient.get(`/flashcards/document/${documentId}`);
    return response.data;
  },
  generate: async (documentId, regenerate = false) => {
    const query = regenerate ? '?regenerate=true' : '';
    const response = await apiClient.post(`/flashcards/generate/${documentId}${query}`, { regenerate });
    return response.data;
  },
  toggleFavorite: async (flashcardId) => {
    const response = await apiClient.put(`/flashcards/${flashcardId}/favorite`);
    return response.data;
  },
  delete: async (flashcardId) => {
    const response = await apiClient.delete(`/flashcards/${flashcardId}`);
    return response.data;
  },
};

export const quizApi = {
  generate: async (documentId, config) => {
    const response = await apiClient.post(`/quizzes/generate/${documentId}`, config);
    return response.data;
  },
  getByDocument: async (documentId) => {
    const response = await apiClient.get(`/quizzes/document/${documentId}`);
    return response.data;
  },
  getQuiz: async (quizId) => {
    const response = await apiClient.get(`/quizzes/${quizId}`);
    return response.data;
  },
  submitAttempt: async (quizId, answers) => {
    const response = await apiClient.post(`/quizzes/${quizId}`, { answers });
    return response.data;
  },
};

export { apiClient };
