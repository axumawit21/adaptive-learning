import { Provider } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

export const QDRANT = 'QDRANT_CLIENT';

export const qdrantProvider: Provider = {
  provide: QDRANT,
  useFactory: async () => {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    const client = new QdrantClient({ url });
    console.log('✅ Connected to Qdrant at', url);
    return client;
  },
};