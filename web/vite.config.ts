import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Mỗi lần build sinh một mã phiên bản; app so sánh với /version.json để biết có bản mới
const BUILD = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const versionFile = (): Plugin => ({
  name: 'version-file',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }); }
});

// base './' để chạy được ở https://<user>.github.io/<repo>/
export default defineConfig({ plugins: [react(), versionFile()], base: './', define: { __BUILD__: JSON.stringify(BUILD) } });
