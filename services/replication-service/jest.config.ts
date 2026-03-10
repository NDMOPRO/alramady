import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: 'tsconfig.json',
      diagnostics: {
        ignoreCodes: [151002],
      },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  forceExit: true,
  passWithNoTests: true,
};
export default config;
