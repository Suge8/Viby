import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        assetsInlineLimit: 0,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('/node_modules/')) return
                    if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/'))
                        return 'react'
                    if (id.includes('/motion/') || id.includes('/framer-motion/')) return 'motion'
                    if (id.includes('/@lottiefiles/') || id.includes('/lottie-web/')) return 'lottie'
                    if (id.includes('/@tauri-apps/')) return 'tauri'
                    if (id.includes('/@viby/protocol/')) return 'protocol'
                    return 'vendor'
                },
            },
        },
    },
})
