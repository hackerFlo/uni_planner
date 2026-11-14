import { api } from './client.js';

const PATH = '/api/agent-account';

export const agentAccountApi = {
  get: () => api.get(PATH),
  create: (currentPassword, email) => api.post(PATH, { currentPassword, email }),
  resetPassword: currentPassword => api.post(`${PATH}/reset-password`, { currentPassword }),
  setDisabled: disabled => api.patch(PATH, { disabled }),
  signOut: () => api.post(`${PATH}/sign-out`, {}),
  remove: currentPassword => api.delete(PATH, { body: { currentPassword } }),
};

export function accountStatusLabel(account) {
  return account.disabled ? 'Disabled' : 'Active';
}

export function formatAccountTime(value, now = new Date()) {
  const date = value ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Never';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit', minute: '2-digit',
  });
}
