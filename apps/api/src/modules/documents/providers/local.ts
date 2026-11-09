import type { StorageProvider } from './types.js';

export const localStorageProvider: StorageProvider = {
  name: 'local',
  async getUploadUrl({ key, mimeType }) {
    // In dev/mock mode, return a simulated pre-signed upload URL
    return {
      uploadUrl: `/api/v1/documents/mock-upload/${encodeURIComponent(key)}`,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
    };
  },
  async getDownloadUrl({ key }) {
    return {
      downloadUrl: `/api/v1/documents/mock-download/${encodeURIComponent(key)}`,
    };
  },
};
