import type { Config } from 'jest';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const config: Config = {
  rootDir,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: {
        warnOnly: false,
        ignoreCodes: [151002],
      },
    }],
  },
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  forceExit: true,
  passWithNoTests: true,
};
export default config;
