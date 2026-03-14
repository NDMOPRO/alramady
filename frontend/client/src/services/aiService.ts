import { apiCall, streamResponse } from './apiClient';
const B = '/api/v1/ai';

export const aiService = {
  askAssistant: (data: { query: string; context?: unknown }) => apiCall(`${B}/assistant/ask`, { method: 'POST', body: data }),
  streamChat: (message: string, conversationId?: number, onChunk?: (text: string) => void, onDone?: (data?: unknown) => void, onError?: (error: string) => void) =>
    streamResponse('/api/chat/stream', { message, conversationId }, onChunk || (() => {}), onDone, onError),
  listConversations: () => apiCall('/api/chat/conversations'),
  createConversation: (title?: string) => apiCall('/api/chat/conversations', { method: 'POST', body: { title } }),
  getMessages: (conversationId: number) => apiCall(`/api/chat/conversations/${conversationId}/messages`),
  deleteConversation: (id: number) => apiCall(`/api/chat/conversations/${id}`, { method: 'DELETE' }),
  intentParse: (data: { query: string; context?: unknown }) => apiCall(`${B}/intent/parse`, { method: 'POST', body: data }),
  knowledgeSearch: (query: string) => apiCall(`${B}/knowledge/search?q=${encodeURIComponent(query)}`),
};
