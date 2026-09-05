import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'tests/browser', use:{baseURL:'http://127.0.0.1:5186',headless:true}, webServer:{command:'bun run dev',url:'http://127.0.0.1:5186',reuseExistingServer:!process.env.CI},workers:2 });
