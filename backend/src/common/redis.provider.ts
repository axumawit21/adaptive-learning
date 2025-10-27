// src/common/redis.provider.ts
import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = 'REDIS_CLIENT';

export const redisProvider: Provider = {
  provide: REDIS,
  useFactory: () => {
    // Read from env if you want
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = Number(process.env.REDIS_PORT || 6379);
    const client = new Redis({ host, port });
    client.on('error', (err) => {
      console.error('Redis error', err);
    });
    return client;
  },
};
