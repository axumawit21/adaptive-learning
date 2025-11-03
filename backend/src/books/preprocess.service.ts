// src/books/preprocess.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book } from './book.schema';
import * as fs from 'fs';
import * as path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';
import pdfParse from 'pdf-parse';

interface ChapterPayload {
  bookId: string;
  bookTitle: string;
  grade: string;
  subject: string;
  chapterTitle: string;
  normalizedChapterTitle: string;
  chapterIndex: number;
  subchunkIndex: number;
  text: string;
}

@Injectable()
export class PreprocessService {
  private readonly logger = new Logger(PreprocessService.name);
  private qdrant: QdrantClient;

  constructor(@InjectModel(Book.name) private readonly bookModel: Model<Book>) {
    this.qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
    });
  }

  /** Main preprocessing */
  async preprocessBook(bookId: string) {
    const book = await this.bookModel.findById(bookId).lean(true);
    if (!book) throw new Error('Book not found');

    const fullPath = path.resolve(book.filePath);
    if (!fs.existsSync(fullPath)) throw new Error('File not found on disk');

    let content = '';
    if (fullPath.endsWith('.pdf')) {
      const buffer = fs.readFileSync(fullPath);
      const data = await pdfParse(buffer);
      content = data.text;
    } else {
      content = fs.readFileSync(fullPath, 'utf-8');
    }

    this.logger.log(`📄 Book content length: ${content.length}`);

    const toc = this.extractTOC(content);
    this.logger.log(`📖 TOC detected: ${toc.map(t => `Unit ${t.unitNum}: ${t.title}`).join(' | ')}`);

    const units = this.splitByUnits(content, toc);
    this.logger.log(`📚 Units found: ${units.length}`);

    const unitChunks = this.subchunkUnits(units);
    const collectionName = `${book.title}_${book.grade}_${book.subject}`.replace(/\s+/g, '_').replace(/[^\w_]/g, '').toLowerCase();
    await this.ensureQdrantCollection(collectionName);

    let totalPoints = 0;
    let globalIndex = 1;

    // 1️⃣ Process each unit in parallel batches
    for (let unitIndex = 0; unitIndex < unitChunks.length; unitIndex++) {
      const unit = unitChunks[unitIndex];
      const texts = unit.chunks.map(c => c.text);

      // Parallel embedding generation in batches
      const batchSize = 20; 
      const embeddings: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batchTexts = texts.slice(i, i + batchSize);
        const batchEmbeddings = await Promise.all(batchTexts.map(t => this.generateEmbedding(t)));
        embeddings.push(...batchEmbeddings);
      }

      const points = embeddings.map((vector, subIndex) => {
        const payload: ChapterPayload = {
          bookId: book._id.toString(),
          bookTitle: book.title,
          grade: book.grade,
          subject: book.subject,
          chapterTitle: unit.title,
          normalizedChapterTitle: unit.title.trim().toLowerCase(),
          chapterIndex: unitIndex + 1,
          subchunkIndex: subIndex + 1,
          text: unit.chunks[subIndex].text,
        };

        return {
          id: globalIndex++,
          vector,
          payload: payload as unknown as Record<string, unknown>,
        };
      });

      await this.qdrant.upsert(collectionName, { points });
      totalPoints += points.length;

      this.logger.log(`✅ Stored ${points.length} subchunks for "${unit.title}" (Unit ${unitIndex + 1})`);
    }

    this.logger.log(`🎉 Finished preprocessing "${book.title}" (${totalPoints} subchunks total)`);

    return { message: 'Preprocessing completed successfully', totalPoints };
  }

  /** Extract TOC strictly based on Unit headings */
  private extractTOC(content: string): { unitNum: number; title: string }[] {
    const lines = content.split('\n').slice(0, 300);
    const toc: { unitNum: number; title: string }[] = [];
    const seenUnits = new Set<number>();
    const tocRegex = /^Unit\s*(\d+)\s*[:.\-]?\s*(.+)$/i;

    for (const line of lines) {
      const match = line.trim().match(tocRegex);
      if (match) {
        const unitNum = parseInt(match[1], 10);
        const title = match[2].trim();
        if (!seenUnits.has(unitNum)) {
          toc.push({ unitNum, title });
          seenUnits.add(unitNum);
        }
      }
    }
    return toc;
  }

  /** Split book content into units based on TOC */
  private splitByUnits(content: string, toc: { unitNum: number; title: string }[]) {
    const lines = content.split('\n');
    const unitsMap: Map<number, { title: string; text: string }> = new Map();
    const unitRegex = /^Unit\s*(\d+)\s*[:.\-]?\s*(.+)$/i;
    let currentUnitNum: number | null = null;

    for (const line of lines) {
      const match = line.trim().match(unitRegex);
      if (match) {
        const unitNum = parseInt(match[1], 10);
        const tocEntry = toc.find(t => t.unitNum === unitNum);
        if (tocEntry) {
          currentUnitNum = unitNum;
          if (!unitsMap.has(unitNum)) unitsMap.set(unitNum, { title: tocEntry.title, text: '' });
        } else {
          currentUnitNum = null;
        }
      } else if (currentUnitNum !== null) {
        const unit = unitsMap.get(currentUnitNum)!;
        unit.text += line + '\n';
      }
    }

    return Array.from(unitsMap.values());
  }

  /** Subchunk units into AI-friendly chunks with overlap */
 /** Subchunk units into AI-friendly chunks with overlap (optimized for Mistral) */
private subchunkUnits(units: { title: string; text: string }[]) {
  const maxWords = 200; // ✅ smaller chunks for faster inference
  const overlap = 50;   // ✅ small overlap for context continuity
  const unitChunks: { title: string; chunks: { text: string }[] }[] = [];
  const unitRegex = /^Unit\s*(\d+)\s*[:.\-]?\s*(.+)$/i;
  const sectionRegex = /^(\d+(\.\d+)+)\s+(.+)$/;

  for (const unit of units) {
    const lines = unit.text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const chunks: { text: string }[] = [];
    let currentChunkWords: string[] = [];
    let currentHeading = unit.title;

    const pushChunk = () => {
      if (currentChunkWords.length > 0) {
        const chunkText = `${currentHeading}\n${currentChunkWords.join(' ')}`.trim();
        if (chunkText.length > 50) { // skip empty fragments
          chunks.push({ text: chunkText });
        }
        currentChunkWords = [];
      }
    };

    for (const line of lines) {
      // Detect new unit or section headings
      if (line.match(unitRegex)) {
        pushChunk();
        currentHeading = line.replace(unitRegex, '$2').trim();
        continue;
      }

      const sectionMatch = line.match(sectionRegex);
      if (sectionMatch) currentHeading = `${sectionMatch[1]} ${sectionMatch[3]}`;

      const words = line.split(/\s+/);
      // Check if chunk exceeds max size
      if (currentChunkWords.length + words.length > maxWords && currentChunkWords.length > 0) {
        pushChunk();
        // Keep overlap to preserve context
        currentChunkWords = currentChunkWords.slice(-overlap);
      }

      currentChunkWords = currentChunkWords.concat(words);
    }

    pushChunk();

    this.logger.log(`📦 "${unit.title}" → ${chunks.length} chunks (avg ${Math.round(unit.text.split(/\s+/).length / chunks.length)} words per chunk)`);

    unitChunks.push({ title: unit.title, chunks });
  }

  return unitChunks;
}

  /** Generate embeddings via Ollama */
  private async generateEmbedding(text: string) {
    const res = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
    });

    if (!res.ok) throw new Error(`Ollama embedding error: ${res.status}`);
    const data = (await res.json()) as { embedding: number[] };
    return data.embedding;
  }

  /** Ensure Qdrant collection exists */
  private async ensureQdrantCollection(collectionName: string) {
    const collections = await this.qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === collectionName);
    if (!exists) {
      await this.qdrant.createCollection(collectionName, {
        vectors: { size: 768, distance: 'Cosine' },
      });
      this.logger.log(`🆕 Created Qdrant collection: ${collectionName}`);
    }
  }
}
