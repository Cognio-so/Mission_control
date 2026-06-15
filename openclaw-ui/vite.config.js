import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// strictPort:true => Vite uses exactly 5173 (or fails) so the origin you
// allow-list on the gateway (http://localhost:5173) always matches.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: true },
  preview: { port: 5173, strictPort: true },
})
