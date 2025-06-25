// sdk/vite.config.ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/collab-doc.ts'), // Your main SDK entry point
      name: 'CollabDoc', // The global variable name when used as a UMD
      formats: ['umd', 'es'], // Output formats
      fileName: (format) => `collab-doc.${format}.js`,
    },
    rollupOptions: {
      // Make sure external dependencies aren't bundled
      // external: [], // Add any external peer dependencies here
      output: {
        // Provide global variables to use in the UMD build
        globals: {
          // If you had external dependencies, you'd define globals here
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    dts({
      insertTypesEntry: true, // Generate a .d.ts entry file
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});