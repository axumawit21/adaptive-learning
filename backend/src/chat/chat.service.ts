// src/chat/chat.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Book } from '../books/book.schema';
import { REDIS } from '../common/redis.provider';
import type Redis from 'ioredis';
import * as fs from 'fs';
import * as pdfParse from 'pdf-parse';
import * as _ from 'lodash';
import axios from 'axios';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    @InjectModel(Book.name) private bookModel: Model<Book>,
    @Inject(REDIS) private readonly redisClient: Redis,
  ) {}

    private readonly CACHE_TTL = 60 * 60 * 24; // 24 hours

  private normalizeQuestion(question: string): string {
    return question.trim().toLowerCase();
  }

  private async getCachedAnswer(question: string): Promise<string | null> {
    const normalized = this.normalizeQuestion(question);
    const cached = await this.redisClient.get(`chat:${normalized}`);
    return cached ? JSON.parse(cached).answer : null;
  }

  private async setCachedAnswer(question: string, data: any, ttl: number = this.CACHE_TTL): Promise<void> {
    const normalized = this.normalizeQuestion(question);
    await this.redisClient.set(`chat:${normalized}`, JSON.stringify(data), 'EX', ttl);
  }

  private chunkText(text: string, chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
  }

  private async scoreChunk(question: string, chunk: string): Promise<number> {
    // Simple TF-IDF based scoring
    const questionTerms = new Set(question.toLowerCase().split(/\s+/));
    const chunkTerms = chunk.toLowerCase().split(/\s+/);
    
    let score = 0;
    for (const term of questionTerms) {
      const termCount = chunkTerms.filter(t => t === term).length;
      score += termCount;
    }
    return score / questionTerms.size;
  }

  private async retrieveRelevantContexts(question: string, limit: number = 3): Promise<string[]> {
    // Get all books from the database
    const books = await this.bookModel.find().exec();
    const allChunks: {text: string, score: number}[] = [];

    // Score chunks from all books
    for (const book of books) {
      const chunks = this.chunkText(book.content || '');
      for (const chunk of chunks) {
        const score = await this.scoreChunk(question, chunk);
        allChunks.push({ text: chunk, score });
      }
    }

    // Sort by score and take top N
    return allChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(chunk => chunk.text);
  }

  private buildPrompt(question: string, contexts: string[]): string {
    const contextText = contexts
      .map((ctx, i) => `Context ${i + 1}: ${ctx}`)
      .join('\n\n');

    return `You are a helpful AI assistant. Use the following context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.

${contextText}

Question: ${question}

Answer:`;
  }

  // ✨ Mistral 7B (Ollama) version of callLLM
  async callLLM(prompt: string) {
    try {
      // Ollama runs locally by default on port 11434
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'mistral:latest', // or 'mistral:7b'
        prompt,
        stream: false,
      });

      // Ollama returns { response: "text..." }
      const answer = response.data?.response || 'No response from model';
      return answer.trim();
    } catch (error) {
      this.logger.error('❌ Ollama/Mistral error:', error.message);
      return `⚠️ Error calling local LLM: ${error.message}`;
    }
  }

  // 🧠 Ask function (unchanged, just calls the updated callLLM)
  async ask(question: string) {
    const cached = await this.getCachedAnswer(question);
    if (cached) return { source: 'cache', answer: cached };

    const contexts = await this.retrieveRelevantContexts(question, 4);
    let answer: string;

   if (contexts.length === 0) {
    // 🚨 Out of context — explicitly mention this
    const generalAnswer = await this.callLLM(
      `The user asked: "${question}". This topic was not found in the uploaded curriculum materials. 
       Please provide a brief and general educational explanation.`
    );

    answer =
      `⚠️ This topic is not found in your curriculum materials.\n\n` +
      generalAnswer;
  } else {
    const prompt = this.buildPrompt(question, contexts);
    answer = await this.callLLM(prompt);
  }

  const cacheData = { answer, contexts };
  await this.setCachedAnswer(question, cacheData, 86400);

  return {
    source: contexts.length === 0 ? 'general' : 'rag',
    answer,
    contexts,
  };
}
}