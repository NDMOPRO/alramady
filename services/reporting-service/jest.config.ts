import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: false,
    }],
  },
  collectCoverageFrom: [
    'src/services/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: { lines: 80, branches: 70, functions: 80, statements: 80 },
  },
  clearMocks: true,
};

export default config;
