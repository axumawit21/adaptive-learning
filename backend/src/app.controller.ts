import { Controller, Get, Inject } from '@nestjs/common';
import { QDRANT } from './common/qdrant.provider';
import type { QdrantClient } from '@qdrant/js-client-rest';

@Controller()
export class AppController {
  constructor(@Inject(QDRANT) private readonly qdrant: QdrantClient) {}

  @Get('test-qdrant')
  async testQdrant() {
    try {
      const result = await this.qdrant.getCollections();
      return result;
    } catch (error) {
      return {
        message: '❌ Qdrant connection failed',
        error: error.message,
      };
    }
  }
}