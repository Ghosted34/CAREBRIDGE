export interface StorageProvider {
  name: string;
  getUploadUrl(opts: {
    key: string;
    mimeType: string;
    expiresInSeconds: number;
  }): Promise<{ uploadUrl: string; method: string; headers?: Record<string, string> }>;
  getDownloadUrl(opts: { key: string; expiresInSeconds: number }): Promise<{ downloadUrl: string }>;
}
