import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// strictPort:true => Vite uses exactly 5173 (or fails) so the origin you
// allow-list on the gateway (http://localhost:5173) always matches.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_DEV_PROXY_TARGET

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
              secure: true,
              configure(proxy) {
                proxy.on('proxyRes', (proxyRes) => {
                  const cookies = proxyRes.headers['set-cookie']
                  if (!cookies) return
                  proxyRes.headers['set-cookie'] = cookies.map((cookie) =>
                    cookie
                      .replace(/;\s*Domain=[^;]+/gi, '')
                      .replace(/;\s*Secure/gi, ''),
                  )
                })
              },
            },
          }
        : undefined,
    },
    preview: { port: 5173, strictPort: true },
  }
})
