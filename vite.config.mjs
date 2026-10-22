import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중에는 /api 요청을 npm run dev:api 로 띄운 서버(3100)로 보내요
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3100' } },
});
