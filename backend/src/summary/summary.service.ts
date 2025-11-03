// src/summary/summary.service.ts
import { Injectable, Logger, Inject, InternalServerErrorException } from '@nestjs/common';
import { Model } from 'mongoose';
import axios from 'axios';
import { QDRANT } from '../common/qdrant.provider';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { InjectModel } from '@nestjs/mongoose';
import { Book } from '../books/book.schema';

interface OllamaResponse {
  response?: string;
  output_text?: string;
  output?: string;
  [key: string]: any; // Allow for other properties
}

export interface ChapterSummary {
  chapter: string;
  summary: string;
  chunksUsed: number;
  createdAt?: Date;
}

@Injectable()
export class SummarizeService {
  private readonly logger = new Logger(SummarizeService.name);

  constructor(
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
    @InjectModel(Book.name) private readonly bookModel: Model<Book>,
  ) {}

  // Build collection name to match preprocessing
  private getCollectionName(book: any): string {
    return `${book.title}_${book.grade}_${book.subject}`
      .replace(/\s+/g, '_')
      .replace(/[^\w_]/g, '')
      .toLowerCase();
  }

  // Normalize input chapter string for robust matching
  private normalizeChapterInput(chapter: string) {
    if (!chapter) return '';
    return chapter
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')   // collapse repeated spaces
      .replace(/[:\r\n]+/g, ' ')
      .trim();
  }

  // Try to parse a numeric index if the user passed "unit 1", "unit1", "1", etc.
  private parseChapterIndex(chapter: string): number | null {
    if (!chapter) return null;
    // Try "unit 1" or just "1"
    const digits = chapter.match(/(\d+)\s*$/);
    if (digits && digits[1]) return parseInt(digits[1], 10);
    return null;
  }

  // Main method
  async summarizeBook(bookId: string, chapter: string): Promise<ChapterSummary> {
    // Basic checks
    if (!bookId) throw new InternalServerErrorException('bookId is required');
    if (!chapter) throw new InternalServerErrorException('chapter is required');

    const book = await this.bookModel.findById(bookId).lean();
    if (!book) throw new InternalServerErrorException(`Book not found for id ${bookId}`);

    const collectionName = this.getCollectionName(book);
    this.logger.log(`📚 Summarizing "${chapter}" from collection: ${collectionName}`);

    // Normalize input
    const normalizedChapter = this.normalizeChapterInput(chapter);
    const parsedIndex = this.parseChapterIndex(chapter);

    // Confirm collection exists
    const collections = await this.qdrant.getCollections();
    const collNames = (collections?.collections || []).map((c: any) => c.name);
    this.logger.debug(`Available Qdrant collections: ${JSON.stringify(collNames)}`);

    if (!collNames.includes(collectionName)) {
      // helpful debug message
      this.logger.error(`❌ Collection "${collectionName}" not found in Qdrant`);
      throw new InternalServerErrorException(`No collection found for bookId "${bookId}". Expected collection: "${collectionName}"`);
    }

    // Build initial filter: must bookId, should match normalizedChapterTitle or chapterTitle (exact normalized)
    const baseFilter: any = {
      must: [
        { key: 'bookId', match: { value: bookId } },
      ],
      should: [
        { key: 'normalizedChapterTitle', match: { value: normalizedChapter } },
        { key: 'chapterTitle', match: { value: normalizedChapter } },
      ],
    };

    // If index parsed, add as a should clause as well
    if (parsedIndex !== null) {
      baseFilter.should.push({ key: 'chapterIndex', match: { value: parsedIndex } });
    }

    this.logger.debug(`🧩 Using Qdrant filter: ${JSON.stringify(baseFilter, null, 2)}`);

    // Query Qdrant
    let scrollResponse: any;
    try {
      scrollResponse = await this.qdrant.scroll(collectionName, {
        filter: baseFilter,
        limit: 2000,
        with_payload: true,
      });
    } catch (err: any) {
      this.logger.error(`🚨 Qdrant scroll failed: ${err?.message || err}`);
      throw new InternalServerErrorException(`Failed to query Qdrant: ${err?.message || err}`);
    }

    const points = scrollResponse?.points || [];
    this.logger.debug(`📦 Qdrant returned ${points.length} points for initial filter.`);

    // If nothing found, try a safer fallback: search all chunks for book and try to match titles fuzzily
    if (!points.length) {
      this.logger.warn(`⚠️ No direct matches for "${normalizedChapter}". Trying fuzzy fallback (scanning payloads).`);

      let fallbackScroll: any;
      try {
        fallbackScroll = await this.qdrant.scroll(collectionName, {
          filter: { must: [{ key: 'bookId', match: { value: bookId } }] },
          limit: 500,
          with_payload: true,
        });
      } catch (err: any) {
        this.logger.error(`🚨 Qdrant fallback scroll failed: ${err?.message || err}`);
        throw new InternalServerErrorException(`Failed to query Qdrant during fallback: ${err?.message || err}`);
      }

      const allPoints = fallbackScroll?.points || [];
      this.logger.debug(`🔎 Fallback scanned ${allPoints.length} points (first page)`);

      // collect unique payload chapter titles for debug
      const uniqueTitles = new Map<string, any>();
      for (const p of allPoints) {
        const pt = p.payload || {};
        const storedTitle = (pt.normalizedChapterTitle || (pt.chapterTitle || '')).toString();
        const norm = storedTitle.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!uniqueTitles.has(norm)) uniqueTitles.set(norm, pt);
      }

      // try to find best match by substring
      let matchedNormTitle: string | null = null;
      for (const key of uniqueTitles.keys()) {
        if (key.includes(normalizedChapter) || normalizedChapter.includes(key)) {
          matchedNormTitle = key;
          break;
        }
      }

      // If not found, try loose "words" matching
      if (!matchedNormTitle) {
        const words = normalizedChapter.split(/\s+/).filter(Boolean);
        for (const key of uniqueTitles.keys()) {
          const matches = words.filter(w => key.includes(w));
          if (matches.length >= Math.max(1, Math.floor(words.length / 2))) {
            matchedNormTitle = key;
            break;
          }
        }
      }

      if (matchedNormTitle) {
        this.logger.log(`✅ Fuzzy match found: "${matchedNormTitle}". Re-querying by normalized title.`);
        // Re-query Qdrant for the matched normalized chapter title
        try {
          const retryResp = await this.qdrant.scroll(collectionName, {
            filter: {
              must: [
                { key: 'bookId', match: { value: bookId } },
                { key: 'normalizedChapterTitle', match: { value: matchedNormTitle } },
              ],
            },
            limit: 2000,
            with_payload: true,
          });
          const retryPoints = retryResp?.points || [];
          if (retryPoints.length) {
            this.logger.log(`✅ Found ${retryPoints.length} chunks for fuzzy-matched chapter "${matchedNormTitle}"`);
            // replace points with these
            return await this._generateAndSaveSummary(bookId, chapter, retryPoints);
          } else {
            this.logger.warn('⚠️ Re-query after fuzzy match returned 0 results.');
          }
        } catch (err: any) {
          this.logger.error(`🚨 Re-query failed: ${err?.message || err}`);
        }
      }

      // If still nothing, provide helpful debug info
      const sampleTitles = Array.from(uniqueTitles.keys()).slice(0, 10);
      this.logger.error(`❌ No chunks found for chapter "${chapter}". Sample stored chapter titles: ${JSON.stringify(sampleTitles, null, 2)}`);
      throw new InternalServerErrorException(
        `No chunks found for chapter "${chapter}". Available chapter names (sample): ${JSON.stringify(sampleTitles.slice(0, 10))}`
      );
    }

    // If points found, generate and save summary
    return await this._generateAndSaveSummary(bookId, chapter, points);
  }

  // Helper: generate summary text using Ollama then save to MongoDB, returns ChapterSummary
  private async _generateAndSaveSummary(bookId: string, chapter: string, points: any[]): Promise<ChapterSummary> {
    const collectionCount = points.length;
    this.logger.log(`✂ Combining ${collectionCount} chunks for summarization...`);

    const joinedText = points
      .map(p => (p.payload?.text as string) || '')
      .filter(Boolean)
      .join('\n\n');

    // truncate long text to avoid token issues (adjust as needed)
    const MAX_CHARS = 12000;
    const textToSend = joinedText.length > MAX_CHARS ? joinedText.slice(0, MAX_CHARS) : joinedText;

    // Keep the prompt structure you requested
    const prompt = `
You are an educational AI assistant.
Summarize the following chapter titled "${chapter}" clearly for students.
Use engaging formatting such as bullet points, numbered lists, and emojis.
Focus on the key ideas, main definitions, and examples.
Avoid repetition or unnecessary text.

Text:
${textToSend}

Return the summary in this structured format:
- 📘 **Main Topic:**
- 🔹 **Key Concepts:**
- 💡 **Important Ideas:**
- 🧠 **Examples or Applications:**
- 🎯 **Conclusion:**
`;

    this.logger.log('🤖 Calling local LLM (Ollama / Mistral) to generate summary...');
    let summary: string;
    try {
      const res = await axios.post<OllamaResponse>(
        `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`,
        {
          model: 'mistral:7b',
          prompt,
          stream: false,
          max_tokens: 800,
        },
        { timeout: 5000000 },
      );

      // Handle different Ollama response formats
      const responseData = res.data;
      summary = (responseData.response || responseData.output_text || responseData.output || '').toString().trim();
      if (!summary) {
        this.logger.warn('⚠️ LLM returned empty summary body; saving fallback text.');
        summary = 'No summary was generated by the model.';
      }
    } catch (err: any) {
      this.logger.error(`💥 LLM call failed: ${err?.message || err}`);
      throw new InternalServerErrorException(`Failed to generate summary: ${err?.message || err}`);
    }

    // Save to book document (append to summaries array)
    try {
      await this.bookModel.updateOne(
        { _id: bookId },
        {
          $push: {
            summaries: {
              chapter,
              summary,
              createdAt: new Date(),
            },
          },
        },
      );
      this.logger.log(`💾 Saved summary for "${chapter}" to Book ${bookId}`);
    } catch (err: any) {
      this.logger.error(`❌ Failed to save summary to MongoDB: ${err?.message || err}`);
      // Not fatal for client response; we continue
    }

    return {
      chapter,
      summary,
      chunksUsed: points.length,
      createdAt: new Date(),
    };
  }
}
