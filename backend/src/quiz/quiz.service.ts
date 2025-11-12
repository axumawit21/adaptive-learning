import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { Quiz } from './quiz.schema';

interface GenerateQuizDto {
  grade: string;
  subject: string;
  unit: string;
  topic: string;
  num_questions?: number;
  title?: string;
  bookId: string;
}

interface OllamaResponse {
  output?: string;
  response?: string;
  message?: {
    content: string;
  };
}

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);
  private readonly qdrant: QdrantClient;

  constructor(@InjectModel(Quiz.name) private readonly quizModel: Model<Quiz>) {
    this.qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
    });
  }

  /** Generate quiz for a topic */
  async generateQuiz(dto: GenerateQuizDto) {
    const { title, grade, subject, unit, topic, num_questions = 5, bookId } = dto;

    // Step 1: Generate embedding for topic
    const topicEmbedding = await this.getTopicSeedEmbedding(topic);

    // Step 2: Determine Qdrant collection name
    const collectionName = `${title}_${grade}_${subject}`.replace(/\s+/g, '_').toLowerCase();

    // Step 3: Search Qdrant for top relevant chunks
    const searchRes = await this.qdrant.search(collectionName, {
      vector: topicEmbedding,
      limit: 20,
      with_payload: true,
    });

    const chunks = searchRes
      .map((hit) => hit.payload?.text)
      .filter((text): text is string => typeof text === 'string');

    if (chunks.length === 0) {
      throw new Error('No relevant textbook chunks found for this topic.');
    }

    // Step 4: Build prompt for controlled quiz generation
    const prompt = this.buildQuizPrompt(topic, chunks, num_questions);

    // Step 5: Call LLM
    const llmOutput = await this.callLLM(prompt);

    // Step 6: Parse output into JSON
    const questions = this.parseLLMOutput(llmOutput);

    // Step 7: Save quiz to MongoDB
    const quizDoc = await this.quizModel.create({
      grade,
      subject,
      unit,
      topic,
      title,
      bookId,
      questions,
      createdAt: new Date(),
    });

    return quizDoc;
  }

  /** Find latest quiz by topic */
  async findQuizByTopic(subject: string, topic: string) {
    return await this.quizModel
      .findOne({ subject, topic })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Fetch all quizzes */
  async findAllQuizzes() {
    return await this.quizModel.find().sort({ createdAt: -1 }).exec();
  }

  /** Generate embedding using Ollama */
  private async getTopicSeedEmbedding(text: string): Promise<number[]> {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama embedding error: ${res.status} - ${errText}`);
    }

    const data = (await res.json()) as { embedding: number[] };

    if (!Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama.');
    }

    return data.embedding;
  }

  /** Build controlled prompt for LLM */
  private buildQuizPrompt(topic: string, chunks: string[], num_questions: number) {
    return `
You are a helpful, student-friendly quiz generator.You are an expert educational content creator helping Ethiopian students.
### RULES:
- Use ONLY the given text below. Do not include general knowledge.
- Each question must have exactly 4 options labeled A, B, C, D.
- Provide the correct answer as BOTH the letter and the full text (e.g., "B. Desert climate").
- Provide a clear hint and a short explanation (1–2 sentences) strictly from the textbook.
- At the end of each explanation, include the **exact subtopic source** in this format:
  👉 "(Source: <unit title> > <subtopic title>)"
- If the text does not contain enough information for a question, skip it.
⚠️ IMPORTANT: Only use the following textbook content to create the quiz. 
Do NOT use your own knowledge or external information. The answers must be directly based on this content.

Topic: ${topic}
Textbook content: ${chunks.join('\n\n')}
Generate ${num_questions} clear multiple-choice questions.
Each question must have:
- Question text
- 4 options labeled A-D
- Correct answer
- Friendly hint
- Full explanation for incorrect answers

Return strictly in JSON format like:
[
  {
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "answer": "A",
    "hint": "...",
    "explanation": "..."
  }
]
`;
  }

  /** Call LLM safely */
  private async callLLM(prompt: string): Promise<string> {
    try {
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
      
      // Log the request details for debugging
      this.logger.debug(`Calling Ollama API at ${ollamaUrl}/api/chat with model: ${model}`);
      
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          stream: false, // Ensure we get a complete response
          options: {
            temperature: 0.7,
            max_tokens: 1500,
          },
        }),
      });

      const responseText = await res.text();
      
      if (!res.ok) {
        this.logger.error(`Ollama API error: ${res.status} - ${responseText}`);
        throw new Error(`LLM call failed: ${res.status} - ${responseText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        this.logger.error('Failed to parse Ollama response as JSON:', responseText);
        throw new Error(`Failed to parse LLM response: ${e.message}`);
      }

      // Handle different response formats
      let content = '';
      if (data.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
      } else if (data.response) {
        content = data.response;
      } else if (data.message?.content) {
        content = data.message.content;
      } else {
        this.logger.warn('Unexpected response format from Ollama:', JSON.stringify(data, null, 2));
        content = responseText; // Fallback to raw response
      }

      if (!content) {
        throw new Error('No content returned from LLM');
      }

      this.logger.debug('Successfully received response from Ollama');
      return content;
    } catch (err) {
      this.logger.error('LLM call failed', err?.message ?? err);
      throw err;
    }
  }

  /** Parse LLM output into quiz questions */
  private parseLLMOutput(llmOutput: string) {
    try {
      let output = llmOutput.trim();

      // Remove starting and ending quotes if returned as escaped string
      if (output.startsWith('"') && output.endsWith('"')) {
        output = output.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }

      // Extract JSON array
      const start = output.indexOf('[');
      const end = output.lastIndexOf(']') + 1;
      if (start === -1 || end === -1) {
        throw new Error('No JSON array found in LLM output');
      }

      const jsonString = output.slice(start, end);
      const parsed = JSON.parse(jsonString);

      if (!Array.isArray(parsed)) {
        throw new Error('Output is not an array');
      }

      return parsed.map((q: any) => ({
        question: q.question || 'No question text',
        options: Array.isArray(q.options) ? q.options : [],
        answer: q.answer || '',
        hint: q.hint || '',
        explanation: q.explanation || '',
      }));
    } catch (err) {
      this.logger.error('Failed to parse LLM output', err.message);
      throw new Error('Failed to parse quiz from LLM output');
    }
  }
}