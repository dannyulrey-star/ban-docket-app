import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite is the tool that runs your React app locally during development
// and bundles it into fast, optimized files when you're ready to deploy.
export default defineConfig({
  plugins: [react()],
})
