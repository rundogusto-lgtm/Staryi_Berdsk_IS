// vitest.config.js — настройки тестов и отчёта о покрытии.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    // Тестовые базы создаются заново при каждом прогоне, поэтому
    // watch-режим запускает файлы последовательно, а не параллельно.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Фронтенд исполняется в браузере и юнит-тестами не покрывается:
      // он проверяется ручным и интеграционным прогоном в браузере.
      exclude: ['src/public/**', 'src/server.js', 'src/seed.js'],
    },
  },
});