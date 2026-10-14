import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// React transforma JSX; singlefile integra JS y CSS en el HTML distribuible.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
})
