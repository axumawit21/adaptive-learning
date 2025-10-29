// src/chat/chat.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Book } from '../books/book.schema';
import { REDIS } from '../common/redis.provider';
import type Redis from 'ioredis';
import axios from 'axios';
import { QDRANT } from '../common/qdrant.provider';
import type { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly CACHE_TTL = 60 * 60 * 24; // 24 hours

  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @Inject(REDIS) private readonly redisClient: Redis,
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
  ) {}

  // ✅ Normalize question
  private normalizeQuestion(question: string): string {
    return question.trim().toLowerCase();
  }

  // ✅ Cache helpers
  private async getCachedAnswer(question: string, bookId: string): Promise<string | null> {
    const key = `chat:${bookId}:${this.normalizeQuestion(question)}`;
    const cached = await this.redisClient.get(key);
    return cached ? JSON.parse(cached).answer : null;
  }

  private async setCachedAnswer(question: string, bookId: string, data: any, ttl: number = this.CACHE_TTL): Promise<void> {
    const key = `chat:${bookId}:${this.normalizeQuestion(question)}`;
    await this.redisClient.set(key, JSON.stringify(data), 'EX', ttl);
  }

  // ✅ Dynamic collection naming
  private getCollectionName(grade: string, subject: string): string {
    const cleanGrade = grade.toLowerCase().replace(/\s+/g, '_');
    const cleanSubject = subject.toLowerCase().replace(/\s+/g, '_');
    return `${cleanGrade}_${cleanSubject}_chunks`;
  }

  // ✅ Qdrant semantic retrieval (bookId filtered)
  private async searchRelevantChunks(question: string, bookId: string, limit = 3): Promise<string[]> {
    const book = await this.bookModel.findById(bookId);
    if (!book) throw new Error('Book not found');

    const collectionName = this.getCollectionName(book.grade, book.subject);

    // Generate embedding for question
    const embedResponse = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'nomic-embed-text',
      prompt: question,
    });

    const queryVector = embedResponse.data.embedding;

    const results = await this.qdrant.search(collectionName, {
      vector: queryVector,
      limit,
      filter: {
        must: [
          {
            key: 'bookId',
            match: { value: bookId },
          },
        ],
      },
    });

    if (!results || results.length === 0) {
      this.logger.warn(`⚠️ No relevant chunks found for book ${book.title}`);
      return [];
    }

    return results.map((r: any) => r.payload.text);
  }

  // ✅ Build LLM prompt
  private buildPrompt(question: string, contexts: string[], bookTitle: string): string {
    const contextText = contexts
      .map((ctx, i) => `Context ${i + 1}: ${ctx}`)
      .join('\n\n');

    return `You are an educational AI assistant helping a student studying "${bookTitle}".
Use only the provided context to answer accurately.
If the question is not covered in the context, clearly say it's not in the book and then provide a brief general explanation.

${contextText}

Question: ${question}

Answer:`;
  }

  // ✅ Call local Mistral LLM (Ollama)
  private async callLLM(prompt: string) {
    try {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'mistral:latest',
        prompt,
        stream: false,
      });

      return response.data?.response?.trim() || 'No response from model';
    } catch (error) {
      this.logger.error('❌ Ollama/Mistral error:', error.message);
      return `⚠️ Error calling local LLM: ${error.message}`;
    }
  }

  // ✅ Main Ask Logic
 async ask(question: string, bookId: string) {
  // 🔹 Step 1: Check cache
  const cached = await this.getCachedAnswer(question, bookId);
  if (cached) return { source: 'cache', answer: cached };

  // 🔹 Step 2: Get book
  const book = await this.bookModel.findById(bookId);
  if (!book) throw new Error('Book not found');

  // 🔹 Step 3: Retrieve relevant chunks
  const contexts = await this.searchRelevantChunks(question, bookId, 4);

  // 🔹 Clean up empty or invalid chunks
  const validContexts = (contexts || []).filter(
    (ctx) => typeof ctx === 'string' && ctx.trim().length > 0
  );

  let answer: string;
  let source: 'rag' | 'general';

  if (validContexts.length === 0) {
    // 🚨 No relevant chunks → general answer
    const generalAnswer = await this.callLLM(
      `The user asked: "${question}". This topic was not found in the uploaded book "${book.title}". Provide a short general educational explanation.`
    );

    answer = `⚠️ This topic is not found in your book "${book.title}".\n\n${generalAnswer}`;
    source = 'general';
  } else {
    // ✅ Build prompt with actual book title
    const prompt = this.buildPrompt(question, validContexts, book.title);
    answer = await this.callLLM(prompt);
    source = 'rag';
  }

  // 🔹 Step 4: Cache result
  const cacheData = { answer, contexts: validContexts };
  await this.setCachedAnswer(question, bookId, cacheData);

  return { source, answer, contexts: validContexts };
}
}
