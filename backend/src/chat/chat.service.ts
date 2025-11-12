import { Inject, Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Book } from '../books/book.schema';
import { REDIS } from '../common/redis.provider';
import type Redis from 'ioredis';
import axios from 'axios';
import { QDRANT } from '../common/qdrant.provider';
import type { QdrantClient } from '@qdrant/js-client-rest';

interface OllamaEmbeddingResponse {
  embedding: number[];
  [key: string]: any;
}

interface OllamaGenerateResponse {
  response: string;
  [key: string]: any;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly CACHE_TTL = 60 * 60 * 24; // 24 hours
  private readonly modelName = 'llama3.2:latest';
  private readonly embeddingModel = 'nomic-embed-text';
  private readonly MAX_CHUNKS = 4;

  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @Inject(REDIS) private readonly redisClient: Redis,
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
  ) {}

  /** ---------- Helpers ---------- */
  private normalizeQuestion(question: string): string {
    return question.trim().toLowerCase();
  }

  private async getCachedAnswer(question: string, bookId: string): Promise<string | null> {
    const key = `chat:${bookId}:${this.normalizeQuestion(question)}`;
    const cached = await this.redisClient.get(key);
    return cached ? JSON.parse(cached).answer : null;
  }

  private async setCachedAnswer(question: string, bookId: string, data: any) {
    const key = `chat:${bookId}:${this.normalizeQuestion(question)}`;
    await this.redisClient.set(key, JSON.stringify(data), 'EX', this.CACHE_TTL);
  }

  private getCollectionName(book: Book): string {
    return `${book.title}_${book.grade}_${book.subject}`
      .replace(/\s+/g, '_')
      .replace(/[^\w_]/g, '')
      .toLowerCase();
  }

  /** ---------- Option C: Extract Unit Title ---------- */
  private extractUnitTitle(question: string): string | null {
    const match = question.match(/unit\s*\d+/i);
    return match ? match[0].trim() : null;
  }

  /** ---------- Search Relevant Chunks ---------- */
  private async searchRelevantChunks(question: string, bookId: string, limit = 10): Promise<string[]> {
    const book = await this.bookModel.findById(bookId);
    if (!book) throw new Error('Book not found');

    const collectionName = this.getCollectionName(book);

    // Generate embedding
    const embedResponse = await axios.post<OllamaEmbeddingResponse>('http://localhost:11434/api/embeddings', {
      model: this.embeddingModel,
      prompt: question,
    });
    const queryVector = embedResponse.data.embedding;
    if (!queryVector || !Array.isArray(queryVector)) return [];

    // Option C: filter by chapter/unit if query contains a unit
    const unitTitle = this.extractUnitTitle(question);
    const filterMust: any[] = [{ key: 'bookId', match: { value: bookId } }];
    if (unitTitle) {
      filterMust.push({ key: 'chapterTitle', match: { value: unitTitle } });
    }

    const results = await this.qdrant.search(collectionName, {
      vector: queryVector,
      limit,
      filter: { must: filterMust },
    });

    if (!results || results.length === 0) return [];

    return results
      .map((r: any) => r.payload?.text)
      .filter((t) => t && t.trim().length > 0);
  }

  /** ---------- Build Prompt ---------- */
  private buildPrompt(question: string, contexts: string[], bookTitle: string): string {
    const contextText = contexts
      .slice(0, this.MAX_CHUNKS)
      .map((ctx, i) => `Context ${i + 1}: ${ctx}`)
      .join('\n\n');

    return `You are an educational AI assistant helping a student studying "${bookTitle}".
Use only the provided context to answer accurately.
If the question is not covered in the context, clearly say it's not in the book and provide a brief general explanation.

${contextText}

Question: ${question}

Answer:`;
  }

  /** ---------- Call LLM ---------- */
  private async callLLM(prompt: string, maxTokens = 512): Promise<string> {
    try {
      const response = await axios.post<OllamaGenerateResponse>(
        'http://localhost:11434/api/generate',
        { model: this.modelName, prompt, stream: false, max_tokens: maxTokens },
        { timeout: 120000 },
      );
      return response.data.response.trim() || 'No response from model';
    } catch (error: any) {
      this.logger.error('❌ Ollama error:', error.response?.data || error.message);
      return `⚠️ Ollama error: ${error.response?.data?.error || error.message}`;
    }
  }

  /** ---------- Main Ask Function ---------- */
  async ask(question: string, bookId: string) {
    const cached = await this.getCachedAnswer(question, bookId);
    if (cached) return { ok: true, source: 'cache', answer: cached };

    const book = await this.bookModel.findById(bookId);
    if (!book) throw new Error('Book not found');

    const allChunks = await this.searchRelevantChunks(question, bookId, 12);
    const validContexts = allChunks.slice(0, this.MAX_CHUNKS);

    let answer: string;
    let source: 'rag' | 'general';

    if (validContexts.length === 0) {
      answer = await this.callLLM(
        `The user asked: "${question}". This topic was not found in the uploaded book "${book.title}". Provide a short, accurate general educational explanation.`,
        512,
      );
      source = 'general';
    } else {
      const prompt = this.buildPrompt(question, validContexts, book.title);
      answer = await this.callLLM(prompt, 512);
      source = 'rag';
    }

    if (!answer.includes('⚠️ Ollama error')) {
      await this.setCachedAnswer(question, bookId, { answer, contexts: validContexts });
    }

    return { ok: true, source, answer, contexts: validContexts };
  }
}