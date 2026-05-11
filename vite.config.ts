import fs from 'node:fs';
import nodePath from 'node:path';
import { defineConfig, loadEnv, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function snowstormCachePlugin(cacheFilePath: string): Plugin {
  const absPath = nodePath.resolve(cacheFilePath);

  function readCache(): Record<string, unknown> {
    try {
      return JSON.parse(fs.readFileSync(absPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  function writeCache(cache: Record<string, unknown>): void {
    fs.writeFileSync(absPath, JSON.stringify(cache, null, 2));
  }

  return {
    name: 'snowstorm-cache',
    configureServer(server) {
      server.middlewares.use('/__snowstorm_cache', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(readCache()));
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk; });
          req.on('end', () => {
            try {
              const { key, value } = JSON.parse(body);
              const cache = readCache();
              cache[key] = value;
              writeCache(cache);
              res.statusCode = 200;
              res.end('ok');
            } catch {
              res.statusCode = 400;
              res.end('bad request');
            }
          });
          return;
        }

        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [
      react(),
      env.VITE_SNOWSTORM_CACHE_FILE ? snowstormCachePlugin(env.VITE_SNOWSTORM_CACHE_FILE) : null,
    ].filter(Boolean),
  };
});
