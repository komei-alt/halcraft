import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      preserveEntrySignatures: 'allow-extension',
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          minSize: 18_000,
          groups: [
            {
              name: 'three-core',
              test: /node_modules\/three\//,
              entriesAware: true,
            },
            {
              name: 'r3f-vendor',
              test: /node_modules\/(@react-three|postprocessing|three-stdlib|maath)/,
              entriesAware: true,
            },
            {
              name: 'react-vendor',
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 2,
            },
            {
              name: 'network-vendor',
              test: /node_modules\/(socket\.io-client|engine\.io-client)/,
            },
          ],
        },
      },
    },
  },
})
