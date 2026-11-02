import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' để chạy được ở https://<user>.github.io/<repo>/
export default defineConfig({ plugins: [react()], base: './' });
