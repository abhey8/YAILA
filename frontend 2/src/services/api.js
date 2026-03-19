import axios from 'axios';

// Ensure the backend URL is properly retrieved from environment and falls back securely
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
};

export const documentApi = {
  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    // Uses the API_BASE_URL instead of proxy fallback
    const response = await axios.post(`${API_BASE_URL}/documents`, formData, {
      ...getAuthHeaders(),
      headers: {
        ...getAuthHeaders().headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  // Status check for asynchronous document ingestion
  getIngestionStatus: async (documentId) => {
    const response = await axios.get(`${API_BASE_URL}/documents/${documentId}`, getAuthHeaders());
    // Assume response contains an ingestionStatus field like 'pending', 'processing', 'completed', 'failed'
    return response.data; 
  },

  getDocuments: async () => {
    const response = await axios.get(`${API_BASE_URL}/documents`, getAuthHeaders());
    return response.data;
  },

  getDocument: async (documentId) => {
    const response = await axios.get(`${API_BASE_URL}/documents/${documentId}`, getAuthHeaders());
    return response.data;
  },

  deleteDocument: async (documentId) => {
    const response = await axios.delete(`${API_BASE_URL}/documents/${documentId}`, getAuthHeaders());
    return response.data;
  }
};

export const graphApi = {
  getKnowledgeGraph: async (documentId) => {
    const response = await axios.get(`${API_BASE_URL}/graph/document/${documentId}`, getAuthHeaders());
    return response.data;
  }
};

export const roadmapApi = {
  getRoadmap: async (documentId) => {
      const response = await axios.get(`${API_BASE_URL}/roadmaps/document/${documentId}`, getAuthHeaders());
      return response.data;
  },
  
  regenerateRoadmap: async (documentId) => {
      const response = await axios.post(`${API_BASE_URL}/roadmaps/document/${documentId}/regenerate`, {}, getAuthHeaders());
      return response.data;
  }
};

export const recallApi = {
    startSession: async (documentId) => {
        const response = await axios.post(`${API_BASE_URL}/recall/document/${documentId}/session`, {}, getAuthHeaders());
        return response.data;
    },
    submitAnswer: async (sessionId, answer) => {
        const response = await axios.post(`${API_BASE_URL}/recall/session/${sessionId}/answer`, { answer }, getAuthHeaders());
        return response.data;
    }
};

export const confusionApi = {
    getDocumentConfusion: async (documentId) => {
         const response = await axios.get(`${API_BASE_URL}/ai/document/${documentId}/confusion`, getAuthHeaders());
         return response.data;
    }
};

export const conceptApi = {
    getWeakConcepts: async (documentId) => {
         const response = await axios.get(`${API_BASE_URL}/concepts/document/${documentId}/weak`, getAuthHeaders());
         return response.data;
    },
    getRecommendations: async (documentId) => {
         const response = await axios.get(`${API_BASE_URL}/concepts/document/${documentId}/recommendations`, getAuthHeaders());
         return response.data;
    }
};

export const aiApi = {
    chat: async (documentId, message, history = []) => {
        const response = await axios.post(`${API_BASE_URL}/ai/chat/${documentId}`, { message, history }, getAuthHeaders());
        return response.data;
    },
    getHistory: async (documentId) => {
        const response = await axios.get(`${API_BASE_URL}/ai/chat/${documentId}`, getAuthHeaders());
        return response.data;
    },
    getSummary: async (documentId, regenerate = false) => {
        const query = regenerate ? '?regenerate=true' : '';
        const response = await axios.get(`${API_BASE_URL}/ai/document/${documentId}/summary${query}`, getAuthHeaders());
        return response.data;
    }
};

export const flashcardApi = {
    getFavorites: async () => {
        const response = await axios.get(`${API_BASE_URL}/flashcards/favorites`, getAuthHeaders());
        return response.data;
    },
    getByDocument: async (documentId) => {
        const response = await axios.get(`${API_BASE_URL}/flashcards/document/${documentId}`, getAuthHeaders());
        return response.data;
    },
    generate: async (documentId, regenerate = false) => {
        const query = regenerate ? '?regenerate=true' : '';
        const response = await axios.post(`${API_BASE_URL}/flashcards/generate/${documentId}${query}`, { regenerate }, getAuthHeaders());
        return response.data;
    },
    toggleFavorite: async (flashcardId) => {
        const response = await axios.put(`${API_BASE_URL}/flashcards/${flashcardId}/favorite`, {}, getAuthHeaders());
        return response.data;
    },
    delete: async (flashcardId) => {
        const response = await axios.delete(`${API_BASE_URL}/flashcards/${flashcardId}`, getAuthHeaders());
        return response.data;
    }
};

export const quizApi = {
    generate: async (documentId, config) => {
        const response = await axios.post(`${API_BASE_URL}/quizzes/generate/${documentId}`, config, getAuthHeaders());
        return response.data;
    },
    getQuiz: async (quizId) => {
        const response = await axios.get(`${API_BASE_URL}/quizzes/${quizId}`, getAuthHeaders());
        return response.data;
    },
    submitAttempt: async (quizId, answers) => {
        const response = await axios.post(`${API_BASE_URL}/quizzes/${quizId}`, { answers }, getAuthHeaders());
        return response.data;
    }
};
