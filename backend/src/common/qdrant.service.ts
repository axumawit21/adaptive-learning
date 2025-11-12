import { Injectable } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService {
  private client: QdrantClient;

  constructor() {
    this.client = new QdrantClient({
      url: 'http://localhost:6333', // your Qdrant URL
    });
  }

  // Retrieve chapter or subtopic content safely
   async getChapterContext(chapterOrSubtopic: string): Promise<string> {
    try {
      const result = await this.client.search('books', {
        vector: new Array(1536).fill(0), // Replace with your embedding size or use a zero vector
        filter: {
          must: [{ key: 'chapter', match: { value: chapterOrSubtopic } }],
        },
        limit: 5,
      });

    // handle possible null/undefined payloads
    return result
      .filter(r => r.payload != null)
      .map(r => r.payload!.content) // ! tells TS payload is not null
      .join('\n');
  }

  catch (error) {
    console.error('Error fetching chapter context:', error);
    return '';
  }
}

}