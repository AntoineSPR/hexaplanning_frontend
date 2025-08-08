/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/cypress/',
    '<rootDir>/src/app/components/quest-card/',
    '<rootDir>/src/app/components/quest-details/',
    '<rootDir>/src/app/components/quest-container/'
  ],
  clearMocks: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  moduleNameMapper: {
    '^@environments/(.*)$': '<rootDir>/src/environments/$1',
    'src/environments/environment': '<rootDir>/src/__mocks__/environment.ts',
    'src/environments/environment.development': '<rootDir>/src/__mocks__/environment.ts'
  }
};

export default config;