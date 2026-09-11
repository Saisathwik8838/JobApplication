import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './test/browser', use: { headless: true }, reporter: 'list' });
