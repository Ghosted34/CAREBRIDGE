import { localStorageProvider } from './local.js';
import { createS3StorageProvider } from './s3.js';
import type { StorageProvider } from './types.js';

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageInstance) return storageInstance;

  const providerType = process.env.STORAGE_PROVIDER ?? 'local';
  if (providerType === 's3' && process.env.STORAGE_S3_BUCKET) {
    storageInstance = createS3StorageProvider({
      bucket: process.env.STORAGE_S3_BUCKET,
      region: process.env.STORAGE_S3_REGION ?? 'eu-west-1',
      endpoint: process.env.STORAGE_S3_ENDPOINT,
    });
  } else {
    storageInstance = localStorageProvider;
  }

  return storageInstance;
}
