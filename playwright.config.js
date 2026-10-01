import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',timeout:90000,use:{baseURL:process.env.YATZY_TEST_URL||'http://127.0.0.1:5173',headless:true,launchOptions:process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}},workers:1});
