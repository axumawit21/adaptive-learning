// src/chat/chat.service.ts
import { Inject, Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import * as math from 'mathjs';
import { Book } from '../books/book.schema';
import { REDIS } from '../common/redis.provider';
import type Redis from 'ioredis';
import { QDRANT } from '../common/qdrant.provider';
import type { QdrantClient } from '@qdrant/js-client-rest';

// TS types
interface EmbeddingResponse {
  embedding: number[];
}

interface LLMResponse {
  response: string;
}

interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: {
    text: string;
    bookId: string;
    [key: string]: any;
  };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly CACHE_TTL = 60 * 60 * 24; // 24h

  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
    @Inject(REDIS) private readonly redisClient: Redis,
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
  ) {}

  // --- Cache helpers
  private normalizeQuestion(question: string): string {
    return question.trim().toLowerCase();
  }

  private async getCachedAnswer(question: string, bookId: string): Promise<string | null> {
    const key = `chat:${bookId}:${this.normalizeQuestion(question)}`;
    const cached = await this.redisClient.get(key);
    return cached ? JSON.parse(cached).answer : null;
  }

  private async setCachedAnswer(question: string, bookId: string, data: any, ttl = this.CACHE_TTL) {
    const key = `chat:${bookId}:${this.normalizeQuestion(question)}`;
    await this.redisClient.set(key, JSON.stringify(data), 'EX', ttl);
  }

  // --- Normalize collection names
  private getCollectionName(title: string, grade: string, subject: string): string {
    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
    const cleanGrade = grade.toLowerCase().replace(/\s+/g, '_');
    const cleanSubject = subject.toLowerCase().replace(/\s+/g, '_');
    return `${cleanTitle}_${cleanGrade}_${cleanSubject}`;
  }

  // --- Generate embeddings
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      this.logger.log('🚀 Generating embedding...');
      const res = await axios.post<EmbeddingResponse>('http://localhost:11434/api/embeddings', {
        model: 'nomic-embed-text:latest',
        prompt: text,
      });

      if (!res.data?.embedding) throw new Error('No embedding returned');
      this.logger.log('✅ Embedding generated successfully.');
      return res.data.embedding;
    } catch (err: any) {
      this.logger.error(`❌ Failed to generate embedding: ${err.message}`);
      throw new Error('Embedding generation failed');
    }
  }

  // --- Call LLM
  private async callLLM(prompt: string, timeout = 120000): Promise<string> {
    try {
      this.logger.log(`💬 Sending prompt (length ${prompt.length}) to Mistral...`);
      const res = await axios.post<LLMResponse>(
        'http://localhost:11434/api/generate',
        { model: 'mistral:latest', prompt, stream: false, max_tokens: 100 },
        { timeout },
      );

      if (!res.data?.response) throw new Error('No response from LLM');
      this.logger.log('✅ Response generated successfully.');
      return res.data.response.trim();
    } catch (err: any) {
      this.logger.error(`❌ Failed to call LLM: ${err.message}`);
      return `⚠️ Error calling local LLM: ${err.message}`;
    }
  }

  // --- Cosine similarity
  private cosineSimilarity(vecA: number[], vecB: number[]) {
    const dotProduct = Number(math.dot(vecA, vecB));
    const normA = Number(math.norm(vecA));
    const normB = Number(math.norm(vecB));
    return dotProduct / (normA * normB);
  }

  // --- Search relevant chunks in Qdrant with score check
private async searchRelevantChunks(
  question: string,
  bookId: string,
  limit = 4,
  useFilter = true
): Promise<{ text: string; score: number }[]> {
  const book = await this.bookModel.findById(bookId);
  if (!book) throw new Error('Book not found');

  const collectionName = this.getCollectionName(book.title, book.grade, book.subject);
  this.logger.log(`🔍 Searching in Qdrant collection: ${collectionName} (limit=${limit})`);

  // Generate embedding
  const embedRes = await axios.post('http://localhost:11434/api/embeddings', {
    model: 'nomic-embed-text:latest',
    prompt: question,
  }, { timeout: 20000 });

  const queryVector = (embedRes.data as any)?.embedding;
  if (!queryVector) throw new Error('Embedding generation failed');

  // Build search request
  const searchRequest: any = { vector: queryVector, limit };
  if (useFilter) {
    searchRequest.filter = { must: [{ key: 'bookId', match: { value: bookId } }] };
  }

  // Perform search
  const resultsRaw = await this.qdrant.search(collectionName, searchRequest);

  // Map results
  const results = (resultsRaw as any[]).map(r => ({
    text: r.payload?.text ?? '',
    score: r.score ?? 0,
  }));

  this.logger.log(`🔹 Qdrant returned ${results.length} result(s)`);
  return results;
}
  // --- Build LLM prompt
  private buildPrompt(question: string, contexts: string[], bookTitle: string): string {
    const contextText = contexts
      .map((ctx, i) => `Context ${i + 1}: ${ctx.slice(0, 500)}...`)
      .join('\n\n');

    return `You are an educational AI assistant helping a student studying "${bookTitle}". 
Use only the provided context to answer accurately.
If the question is not covered in the context, clearly say it's not in the book and provide a brief general explanation.

${contextText}

Question: ${question}

Answer:`;
  }

  // --- Main ask function with multiple chunk filtering
async ask(question: string, bookId: string) {
  // 1️⃣ Check cache
  const cached = await this.getCachedAnswer(question, bookId);
  if (cached) return { source: 'cache', answer: cached, contexts: [] };

  const book = await this.bookModel.findById(bookId);
  if (!book) throw new InternalServerErrorException('Book not found');

  // 2️⃣ Get top chunks
  const results = await this.searchRelevantChunks(question, bookId, 2); // get top 5
  const SIMILARITY_THRESHOLD = 0.7;

  // Filter chunks by threshold
  const validContexts = results
    .filter(r => r.score >= SIMILARITY_THRESHOLD)
    .map(r => r.text);

  let answer: string;
  let source: 'rag' | 'general';

  if (validContexts.length === 0) {
    // No relevant chunks → general fallback
    const generalPrompt = `You are an educational AI assistant helping a student studying "${book.title}". 
The user asked: "${question}". This topic was not found in the uploaded book. Provide a brief general educational explanation.`;

    answer = await this.callLLM(generalPrompt);
    source = 'general';
  } else {
    // Use RAG context
    const prompt = this.buildPrompt(question, validContexts, book.title);
    answer = await this.callLLM(prompt);
    source = 'rag';
  }

  // 3️⃣ Cache result
  await this.setCachedAnswer(question, bookId, { answer, contexts: validContexts });

  // 4️⃣ Return
  return { source, answer, contexts: validContexts };
}
}