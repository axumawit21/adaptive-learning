import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
const pdfParseImport = require('pdf-parse');
const pdfParse = pdfParseImport.default || pdfParseImport;
import axios from 'axios';
import { QDRANT } from '../common/qdrant.provider';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { Book } from './book.schema';
import { randomUUID } from 'crypto';




@Injectable()
export class PreprocessService {
  private readonly logger = new Logger(PreprocessService.name);
  private getCollectionName(grade: string, subject: string): string {
  const cleanGrade = grade.toLowerCase().replace(/\s+/g, '_');
  const cleanSubject = subject.toLowerCase().replace(/\s+/g, '_');
  return `${cleanGrade}_${cleanSubject}_chunks`;
}


  constructor(
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
  ) {}

  // ✅ Split text into overlapping chunks
 // ✅ Improved semantic chunking — by paragraph
// ✅ Smart chunking: paragraph-based, but safe for embedding limits (~500 tokens)
chunkText(text: string, maxChunkSize = 700): string[] {
  const paragraphs = text
    .split(/\n\s*\n|(\r?\n){2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + ' ' + paragraph).length > maxChunkSize) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
    } else {
      currentChunk += ' ' + paragraph;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Safety split: ensure no chunk exceeds ~700 characters
  const safeChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > maxChunkSize) {
      for (let i = 0; i < chunk.length; i += maxChunkSize) {
        safeChunks.push(chunk.slice(i, i + maxChunkSize));
      }
    } else {
      safeChunks.push(chunk);
    }
  }

  return safeChunks;
}



  // ✅ Ensure collection exists in Qdrant 
  async ensureCollection(collectionName: string, vectorSize = 768) {
  try {
    const collections = await this.qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === collectionName);
    if (exists) return;

    await this.qdrant.createCollection(collectionName, {
      vectors: { size: vectorSize, distance: 'Cosine' },
    });
    this.logger.log(`✅ Created Qdrant collection "${collectionName}"`);
  } catch (error) {
    this.logger.error('❌ Error ensuring collection:', error.message);
    throw error;
  }
}


  // ✅ Generate embeddings via Ollama (nomic-embed-text)
  // ✅ Generate embeddings via Ollama (nomic-embed-text)
async getEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (const text of texts) {
    try {
      const response = await axios.post('http://localhost:11434/api/embeddings', {
        model: 'nomic-embed-text',
        prompt: text,
      });

      if (response.data?.embedding) {
        embeddings.push(response.data.embedding);
      } else {
        this.logger.error('❌ No embedding returned:', response.data);
      }
    } catch (error) {
      const message =
        error.response?.data ||
        error.message ||
        'Unknown embedding error';
      this.logger.error(
        `❌ Embedding generation failed for text snippet: "${text.slice(0, 80)}..."`,
      );
      this.logger.error(message);
    }
  }

  return embeddings;
}

  

  // ✅ Main processing logic
  async processBook(bookId: string) {
    const book = await this.bookModel.findById(bookId);
    if (!book) throw new Error('Book not found');
    if (!book.filePath) throw new Error('No file path for this book');

    const collectionName = this.getCollectionName(book.grade, book.subject);
await this.ensureCollection(collectionName);


    const buffer = fs.readFileSync(book.filePath);
    const pdfData = await (pdfParse as any)(buffer);
    const text = pdfData.text.replace(/\s+/g, ' ').trim();
    const chunks = this.chunkText(text, 1000);

    this.logger.log(`📚 "${book.title}" split into ${chunks.length} chunks`);
    this.logger.log(`📏 Avg chunk length: ${
  chunks.reduce((a, c) => a + c.length, 0) / chunks.length
}`);

    const BATCH = 4;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await this.getEmbeddings(batch);

      const points = embeddings
  .map((vec, idx) => ({
    id: randomUUID(), // ✅ generates a valid UUID
    vector: vec,
    payload: {
      bookId,
      title: book.title,
      chunkIndex: i + idx,
      text: batch[idx],
    },
  }))
  .filter(p => p.vector && p.vector.length > 0);
      await this.qdrant.upsert(collectionName, {
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload
        }))
      });
      this.logger.log(`📥 Stored ${points.length} vectors in Qdrant`);
    }

    book.set({ embeddingsIndexed: true, chunksCount: chunks.length });
    await book.save();

    this.logger.log(`✅ Finished processing "${book.title}"`);
  }
}
