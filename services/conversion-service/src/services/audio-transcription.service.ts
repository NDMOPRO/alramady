/**
 * Audio Transcription Service — Rasid Platform
 * تحويل الصوت إلى نص باستخدام OpenAI Whisper API
 */

import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  words: Array<{ word: string; start: number; end: number }>;
}

const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav',
  'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/flac',
];

const MAX_WHISPER_SIZE = 25 * 1024 * 1024; // 25MB

export class AudioTranscriptionService {
  constructor(private prisma: PrismaClient) {}

  async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string
  ): Promise<TranscriptionResult> {
    if (!SUPPORTED_AUDIO_TYPES.includes(mimeType)) {
      throw new Error(`Unsupported audio type: ${mimeType}. Supported: ${SUPPORTED_AUDIO_TYPES.join(', ')}`);
    }

    const ext = this.mimeToExtension(mimeType);

    if (audioBuffer.length > MAX_WHISPER_SIZE) {
      return this.transcribeLargeFile(audioBuffer, ext, language);
    }

    return this.transcribeChunk(audioBuffer, ext, language);
  }

  async transcribeAndExtractData(
    audioBuffer: Buffer,
    mimeType: string
  ): Promise<{ transcription: TranscriptionResult; extractedData: Record<string, unknown>[] }> {
    const transcription = await this.transcribeAudio(audioBuffer, mimeType);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a data extraction specialist. Extract structured data from the transcribed text. Return a JSON array of objects with key-value pairs representing the extracted information. Extract names, dates, numbers, locations, and any structured data mentioned.',
        },
        {
          role: 'user',
          content: `Extract structured data from this transcription:\n\n${transcription.text}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    let extractedData: Record<string, unknown>[] = [];
    try {
      const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}');
      extractedData = Array.isArray(parsed.data) ? parsed.data : [parsed];
    } catch {
      extractedData = [{ rawText: transcription.text }];
    }

    return { transcription, extractedData };
  }

  private async transcribeChunk(
    audioBuffer: Buffer,
    ext: string,
    language?: string
  ): Promise<TranscriptionResult> {
    const tempPath = join(process.env.TEMP ?? '/tmp', `whisper_${randomBytes(8).toString('hex')}.${ext}`);

    try {
      await writeFile(tempPath, audioBuffer);

      const file = await import('fs').then((fs) => fs.createReadStream(tempPath));

      const transcription = await openai.audio.transcriptions.create({
        file: file as unknown as File,
        model: 'whisper-1',
        language: language ?? undefined,
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });

      const result = transcription as unknown as Record<string, unknown>;

      return {
        text: String(result.text ?? ''),
        language: String(result.language ?? language ?? 'unknown'),
        duration: Number(result.duration ?? 0),
        words: ((result.words ?? []) as Array<Record<string, unknown>>).map((w) => ({
          word: String(w.word ?? ''),
          start: Number(w.start ?? 0),
          end: Number(w.end ?? 0),
        })),
      };
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  private async transcribeLargeFile(
    audioBuffer: Buffer,
    ext: string,
    language?: string
  ): Promise<TranscriptionResult> {
    const inputPath = join(process.env.TEMP ?? '/tmp', `whisper_input_${randomBytes(8).toString('hex')}.${ext}`);
    const outputPattern = join(process.env.TEMP ?? '/tmp', `whisper_chunk_${randomBytes(8).toString('hex')}`);

    try {
      await writeFile(inputPath, audioBuffer);

      // Split into 20MB chunks using ffmpeg
      const chunkDuration = 600; // 10 minutes per chunk
      await execAsync(
        `ffmpeg -i "${inputPath}" -f segment -segment_time ${chunkDuration} -c copy "${outputPattern}_%03d.${ext}" -y`,
        { timeout: 120000 }
      );

      // Find generated chunks
      const { readdir } = await import('fs/promises');
      const dir = process.env.TEMP ?? '/tmp';
      const chunkPrefix = outputPattern.split('/').pop() ?? '';
      const files = await readdir(dir);
      const chunkFiles = files
        .filter((f) => f.startsWith(chunkPrefix) && f.endsWith(`.${ext}`))
        .sort();

      const allText: string[] = [];
      const allWords: Array<{ word: string; start: number; end: number }> = [];
      let totalDuration = 0;
      let detectedLanguage = language ?? 'unknown';

      for (let i = 0; i < chunkFiles.length; i++) {
        const chunkPath = join(dir, chunkFiles[i]);
        const { readFile } = await import('fs/promises');
        const chunkBuffer = await readFile(chunkPath);
        const chunkResult = await this.transcribeChunk(chunkBuffer, ext, language);

        allText.push(chunkResult.text);
        if (chunkResult.language !== 'unknown') {
          detectedLanguage = chunkResult.language;
        }

        const timeOffset = i * chunkDuration;
        for (const word of chunkResult.words) {
          allWords.push({
            word: word.word,
            start: word.start + timeOffset,
            end: word.end + timeOffset,
          });
        }
        totalDuration += chunkResult.duration;

        await unlink(chunkPath).catch(() => {});
      }

      return {
        text: allText.join(' '),
        language: detectedLanguage,
        duration: totalDuration,
        words: allWords,
      };
    } finally {
      await unlink(inputPath).catch(() => {});
    }
  }

  private mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'mp4',
      'audio/wav': 'wav',
      'audio/x-m4a': 'm4a',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
    };
    return map[mimeType] ?? 'mp3';
  }
}
