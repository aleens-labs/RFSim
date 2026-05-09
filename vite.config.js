const { defineConfig } = require("vite");

module.exports = defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
  },
});
