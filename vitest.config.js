const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.js', 'src/server/**/*.js', 'src/client/**/*.jsx'],
      exclude: ['src/client/main.jsx'],
      thresholds: { statements: 70, functions: 70, lines: 70, branches: 50 }
    }
  }
});
