// sdk/vite.config.ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        'collabdoc-sdk': resolve(__dirname, 'src/index.ts'),
        'react': resolve(__dirname, 'src/react/useCollabDoc.ts'),
      },
      name: 'CollabDocSDK',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format}.js`,
    },
    rollupOptions: {
      // React is the only true external — users always have it.
      // yjs + socket.io-client are bundled so users don't need to install them.
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});