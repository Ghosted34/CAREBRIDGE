import type { StorageProvider } from './types.js';

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
}

export function createS3StorageProvider(config: S3Config): StorageProvider {
  return {
    name: 's3',
    async getUploadUrl({ key, mimeType, expiresInSeconds }) {
      const endpoint =
        config.endpoint ??
        `https://${config.bucket}.s3.${config.region ?? 'us-east-1'}.amazonaws.com`;
      const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
      return {
        uploadUrl: `${endpoint}/${encodeURIComponent(key)}?X-Amz-Expires=${expires}`,
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
      };
    },
    async getDownloadUrl({ key, expiresInSeconds }) {
      const endpoint =
        config.endpoint ??
        `https://${config.bucket}.s3.${config.region ?? 'us-east-1'}.amazonaws.com`;
      const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
      return {
        downloadUrl: `${endpoint}/${encodeURIComponent(key)}?X-Amz-Expires=${expires}`,
      };
    },
  };
}
