import { api } from './client.js';

export const aiApi = {
  // silent: a background suggestion must not light the global progress bar.
  suggestList: async (title, description, signal) => {
    const result = await api.post('/api/ai/list-suggestion', { title, description: description || null }, { signal, silent: true });
    return Number.isInteger(result?.listId) ? result.listId : null;
  },
  setEnabled: enabled => api.patch('/api/ai/settings', { enabled }),
};
