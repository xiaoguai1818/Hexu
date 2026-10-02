import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
const output=resolve(process.env.HEXU_REPORT_DIR??'ci-results/browser');
export default defineConfig({
  testDir:'../test/browser',testMatch:'**/*.spec.mjs',forbidOnly:true,fullyParallel:false,workers:1,retries:0,timeout:30000,globalTimeout:240000,
  outputDir:output+'/artifacts',reporter:[['list'],['json',{outputFile:output+'/results.json'}],['junit',{outputFile:output+'/junit.xml'}],['html',{outputFolder:output+'/html',open:'never'}]],
  use:{baseURL:process.env.HEXU_TEST_URL??'http://127.0.0.1:8080',browserName:process.env.HEXU_BROWSER??'chromium',trace:'retain-on-failure',screenshot:'only-on-failure',viewport:{width:1440,height:1000}},
});
