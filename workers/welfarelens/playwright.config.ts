import { defineConfig } from "@playwright/test";
const port=Number(process.env.WELFARELENS_TEST_PORT||3100);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local test port');
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, channel: "msedge", headless: true },
  webServer: {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    env: { ENABLE_CLOUD_ANALYSIS: "false" },
    reuseExistingServer: process.env.WELFARELENS_REUSE_SERVER === 'true',
    timeout: 90000,
  },
});
