// src/chat/chat.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Book } from '../books/book.schema';
import { REDIS } from '../common/redis.provider';
import { QDRANT } from '../common/qdrant.provider';
import type Redis from 'ioredis';
import type { QdrantClient } from '@qdrant/js-client-rest';
import axios from 'axios';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly CACHE_TTL = 60 * 60 * 24; // 24 hours
  private readonly collectionName = process.env.QDRANT_COLLECTION || 'books_chunks';

  constructor(
    @InjectModel(Book.name) private bookModel: Model<Book>,
    @Inject(REDIS) private readonly redisClient: Redis,
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
  ) {}

  // 🧠 Normalize + cache helpers
  private normalizeQuestion(question: string): string {
    return question.trim().toLowerCase();
  }

  private async getCachedAnswer(question: string): Promise<string | null> {
    const normalized = this.normalizeQuestion(question);
    const cached = await this.redisClient.get(`chat:${normalized}`);
    return cached ? JSON.parse(cached).answer : null;
  }

  private async setCachedAnswer(
    question: string,
    data: any,
    ttl: number = this.CACHE_TTL,
  ): Promise<void> {
    const normalized = this.normalizeQuestion(question);
    await this.redisClient.set(`chat:${normalized}`, JSON.stringify(data), 'EX', ttl);
  }

  // ✅ Generate embedding via Ollama (nomic-embed-text)
  private async getEmbeddingForQuestion(question: string): Promise<number[]> {
    const res = await axios.post('http://localhost:11434/api/embeddings', {
      model: 'nomic-embed-text',
      prompt: question,
    });
    return res.data.embedding;
  }

  // ✅ Retrieve from Qdrant (semantic search)
  private async retrieveRelevantContexts(question: string, limit = 4): Promise<string[]> {
    try {
      const vector = await this.getEmbeddingForQuestion(question);

      const searchResults = await this.qdrant.search(this.collectionName, {
        vector,
        limit,
        with_payload: true,
      });

      if (!searchResults || searchResults.length === 0) return [];

      const contexts = searchResults
        .filter((item: any) => item.payload?.text)
        .map((item: any) => item.payload.text);

      this.logger.log(`🔍 Retrieved ${contexts.length} context chunks from Qdrant`);
      return contexts;
    } catch (err) {
      this.logger.error('❌ Qdrant search error:', err.message);
      return [];
    }
  }

  // ✅ Build LLM prompt
  private buildPrompt(question: string, contexts: string[]): string {
    const contextText = contexts.map((ctx, i) => `Context ${i + 1}:\n${ctx}`).join('\n---\n');
    return `You are a helpful AI tutor. Use the provided curriculum context to answer the question.
If the question is not covered in the context, say: "This topic is not found in your curriculum materials."
Keep your answer concise and educational.

Context:
${contextText}

Question: ${question}

Answer:`;
  }

  // ✅ Call Mistral (via Ollama)
  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'mistral',
        prompt,
        stream: false,
      });
      return response.data?.response?.trim() || 'No response from model';
    } catch (error) {
      this.logger.error('❌ Ollama/Mistral error:', error.message);
      return `⚠️ Error calling LLM: ${error.message}`;
    }
  }

  // 🧩 Main Ask Function
  async ask(question: string) {
    // 1️⃣ Check Redis cache
    const cached = await this.getCachedAnswer(question);
    if (cached) return { source: 'cache', answer: cached };

    // 2️⃣ Retrieve semantic contexts
    const contexts = await this.retrieveRelevantContexts(question, 4);
    let answer: string;

    if (contexts.length === 0) {
      const generalAnswer = await this.callLLM(
        `The user asked: "${question}". This topic is not found in the uploaded curriculum materials.
         Please give a short, general educational explanation.`,
      );
      answer = `⚠️ This topic is not found in your curriculum materials.\n\n${generalAnswer}`;
    } else {
      const prompt = this.buildPrompt(question, contexts);
      answer = await this.callLLM(prompt);
    }

    // 3️⃣ Cache + return
    const cacheData = { answer, contexts };
    await this.setCachedAnswer(question, cacheData, this.CACHE_TTL);

    return {
      source: contexts.length === 0 ? 'general' : 'rag',
      answer,
      contexts,
    };
  }
}
