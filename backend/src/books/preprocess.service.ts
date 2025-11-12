
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book } from './book.schema';
import * as fs from 'fs';
import * as path from 'path';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import { bookStructure } from './book-structure';

interface ChapterPayload {
  bookId: string;
  unit: string;
  subchunk_index: number;
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

  /** Main preprocessing entry */
  async preprocessBook(bookId: string) {
    type BookWithId = Book & { _id: Types.ObjectId };
    const book = (await this.bookModel.findById(bookId).exec()) as BookWithId;
    if (!book) throw new Error('Book not found');

    const fullPath = path.resolve(book.filePath);
    if (!fs.existsSync(fullPath)) throw new Error('File not found on disk');

    // Extract text from PDF or plain text
    let content = '';
    if (fullPath.endsWith('.pdf')) {
      const buffer = fs.readFileSync(fullPath);
      const data = await pdfParse(buffer);
      content = data.text;
    } else {
      content = fs.readFileSync(fullPath, 'utf-8');
    }

    this.logger.log(`📄 Book content length: ${content.length}`);

    // Extract TOC (Unit only)
    const toc = this.extractTOC(content);
    this.logger.log(
      `📖 TOC detected: ${toc.map((t) => `Unit ${t.unitNum}: ${t.title}`).join(' | ')}`
    );

    // Split units and merge duplicates
    const units = this.splitByUnits(content, toc);
    this.logger.log(`📚 Units found: ${units.length}`);
    units.forEach((u, i) =>
      this.logger.log(`Unit ${i + 1}: ${u.title}, length: ${u.text.length}`)
    );

    const unitChunks = this.subchunkUnitsByStructure(content, book.title);

    const collectionName = `${book.grade}_${book.subject}`
      .replace(/\s+/g, '_')
      .replace(/[^\w_]/g, '')
      .toLowerCase();

    await this.ensureQdrantCollection(collectionName);

    let totalPoints = 0;

    // Upload subchunks sequentially
    for (const unit of unitChunks) {
      const texts = unit.chunks.map((c) => c.text);
      const embeddings = await this.generateEmbeddings(texts);

      const points = embeddings.map((vector, idx) => ({
        id: uuidv4(),
        vector,
        payload: {
          bookId: book._id.toString(),
          unit: unit.title,
          subchunk_index: idx,
          text: unit.chunks[idx].text,
        } as Record<string, unknown>,
      }));

      await this.qdrant.upsert(collectionName, { points });
      totalPoints += points.length;

      this.logger.log(`✅ Stored ${points.length} subchunks for ${unit.title}`);
    }

    this.logger.log(
      `🎉 Finished preprocessing "${book.title}" (${totalPoints} subchunks stored)`
    );

    return { message: 'Preprocessing completed successfully', totalPoints };
  }

  /** Extract TOC strictly based on Unit, normalize titles */
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

  /** Split content into units strictly by TOC and merge duplicates */
  private splitByUnits(content: string, toc: { unitNum: number; title: string }[]) {
    const lines = content.split('\n');
    const unitsMap: Map<number, { title: string; text: string }> = new Map();
    let currentUnitNum: number | null = null;
    const unitRegex = /^Unit\s*(\d+)\s*[:.\-]?\s*(.+)$/i;

    for (const line of lines) {
      const match = line.trim().match(unitRegex);
      if (match) {
        const unitNum = parseInt(match[1], 10);
        const tocEntry = toc.find((t) => t.unitNum === unitNum);
        if (tocEntry) {
          currentUnitNum = unitNum;
          if (!unitsMap.has(unitNum)) {
            unitsMap.set(unitNum, { title: tocEntry.title, text: '' });
          }
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

  /** Split each unit into subchunks */
  /** Split each unit into AI-friendly subchunks with section headings */
/** Split content based exactly on bookStructure (unit + subchapters) */
private subchunkUnitsByStructure(content: string, bookTitle: string) {
  const maxChars = 500; // target characters per chunk
  const unitChunks: {
    title: string;
    chunks: {
      text: string;
      unitTitle: string;
      subChapterTitle: string | null;
      pageStart: number;
      pageEnd: number;
      chunkIndex: number;
    }[];
  }[] = [];

  // Normalize content lines for approximate paging
  const lines = content.replace(/\r\n/g, '\n').split('\n').map(l => l.trim());
  const totalPages = bookStructure[bookStructure.length - 1].pageEnd;
  const linesPerPage = Math.ceil(lines.length / totalPages);

  // Helper: Extract text from a page range
  const getTextByPageRange = (startPage: number, endPage: number): string => {
    const startIdx = (startPage - 1) * linesPerPage;
    const endIdx = Math.min(endPage * linesPerPage, lines.length);
    return lines.slice(startIdx, endIdx).join(' ');
  };

  // Loop through bookStructure
  for (const unit of bookStructure) {
    const chunks: {
      text: string;
      unitTitle: string;
      subChapterTitle: string | null;
      pageStart: number;
      pageEnd: number;
      chunkIndex: number;
    }[] = [];

    // If the unit has subChapters, process each separately
    if (unit.subChapters && unit.subChapters.length > 0) {
      for (const sub of unit.subChapters) {
        const subText = getTextByPageRange(sub.pageStart, sub.pageEnd);
        const subChunks = this.createFixedSizeChunks(subText, maxChars);

        subChunks.forEach((chunkText, index) => {
          chunks.push({
            text: `${unit.title} > ${sub.title}\n${chunkText}`,
            unitTitle: unit.title,
            subChapterTitle: sub.title,
            pageStart: sub.pageStart,
            pageEnd: sub.pageEnd,
            chunkIndex: index + 1,
          });
        });
      }
    } else {
      // Process entire unit if no subChapters
      const unitText = getTextByPageRange(unit.pageStart, unit.pageEnd);
      const unitChunksArray = this.createFixedSizeChunks(unitText, maxChars);

      unitChunksArray.forEach((chunkText, index) => {
        chunks.push({
          text: `${unit.title}\n${chunkText}`,
          unitTitle: unit.title,
          subChapterTitle: null,
          pageStart: unit.pageStart,
          pageEnd: unit.pageEnd,
          chunkIndex: index + 1,
        });
      });
    }

    unitChunks.push({ title: unit.title, chunks });
  }

  return unitChunks;
}

/** Helper to create smaller fixed-size text chunks */
private createFixedSizeChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks;
}



  /** Generate embeddings using Ollama */
  private async generateEmbeddings(texts: string[]) {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const embeddings: number[][] = [];

    for (const text of texts) {
      const res = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: text,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama embedding error: ${res.status} - ${errText}`);
      }

      const data = (await res.json()) as { embedding: number[] };
      embeddings.push(data.embedding);
    }

    return embeddings;
  }

  /** Ensure Qdrant collection exists */
  private async ensureQdrantCollection(collectionName: string) {
    const collections = await this.qdrant.getCollections();
    const exists = collections.collections.some((c) => c.name === collectionName);

    if (!exists) {
      await this.qdrant.createCollection(collectionName, {
        vectors: { size: 768, distance: 'Cosine' },
      });
      this.logger.log(`🆕 Created Qdrant collection: ${collectionName}`);
    }
  }
}
