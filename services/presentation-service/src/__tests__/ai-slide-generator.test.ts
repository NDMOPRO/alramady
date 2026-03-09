// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCreatePresentation = jest.fn();
const mockAddSlide = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: [
                  '```json',
                  JSON.stringify({
                    title: 'Board Update',
                    theme: {
                      primaryColor: '#003366',
                      secondaryColor: '#ffffff',
                      fontFamily: 'Arial',
                      backgroundColor: '#f5f7fa',
                    },
                    slides: [
                      {
                        layout: 'title',
                        title: 'Board Update',
                        subtitle: 'Customer Churn Reduction and Margin Expansion',
                        notes: 'Intro notes',
                      },
                      {
                        layout: 'content',
                        title: 'Key Initiatives',
                        body: 'Reduce churn and improve margin.',
                        notes: 'Execution notes',
                      },
                    ],
                  }),
                  '```',
                ].join('\n'),
              },
            },
          ],
          usage: { total_tokens: 321 },
        }),
      },
    },
  })),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    dataset: { findUnique: jest.fn().mockResolvedValue(null) },
    presentation: { findUnique: jest.fn(), update: jest.fn() },
    slide: { findMany: jest.fn(), update: jest.fn() },
  })),
}));

jest.mock('../services/slide-builder.service.js', () => ({
  createPresentation: (...args: unknown[]) => mockCreatePresentation(...args),
  addSlide: (...args: unknown[]) => mockAddSlide(...args),
  addChart: jest.fn(),
}));

import * as aiSlideGenerator from '../services/ai-slide-generator.service.js';

describe('AI Slide Generator Service', () => {
  beforeEach(() => {
    mockCreatePresentation.mockReset();
    mockAddSlide.mockReset();
    mockCreatePresentation.mockResolvedValue({
      id: 'presentation-1',
      name: 'Board Update',
      slides: [],
    });
    mockAddSlide
      .mockResolvedValueOnce({ id: 'slide-1', slideIndex: 0, layout: 'title' })
      .mockResolvedValueOnce({ id: 'slide-2', slideIndex: 1, layout: 'content' });
  });

  it('parses fenced JSON responses and persists slides for generateFromText', async () => {
    const result = await aiSlideGenerator.generateFromText(
      'Create a board update about churn reduction.',
      { slideCount: 2, style: 'professional', language: 'en' },
      'tenant-1',
      'user-1'
    );

    expect(mockCreatePresentation).toHaveBeenCalledWith(
      'Board Update',
      expect.objectContaining({ primaryColor: '#003366' }),
      undefined,
      'tenant-1',
      'user-1'
    );
    expect(mockAddSlide).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      presentationId: 'presentation-1',
      name: 'Board Update',
      slideCount: 2,
      tokensUsed: 321,
    });
  });
});
