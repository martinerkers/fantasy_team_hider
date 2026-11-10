const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: { channel: 'chrome', headless: true },
  reporter: 'list'
});
