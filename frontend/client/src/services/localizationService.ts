import { apiCall } from './apiClient';
const B = '/api/v1/localization';

export const localizationService = {
  translateText: (data: { text: string; sourceLang?: string; targetLang?: string }) => apiCall(`${B}/translate`, { method: 'POST', body: data }),
  detectLanguage: (text: string) => apiCall(`${B}/detect`, { method: 'POST', body: { text } }),
  applyRtl: (text: string) => apiCall(`${B}/rtl`, { method: 'POST', body: { text } }),
  arabize: (text: string) => apiCall(`${B}/arabize`, { method: 'POST', body: { text } }),
};
