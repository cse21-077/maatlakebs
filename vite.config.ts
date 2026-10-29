import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function readRequestBody(req: any) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function fileExists(url: URL) {
  try {
    await fs.promises.access(url);
    return true;
  } catch {
    return false;
  }
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), {
        name: 'local-api-dev-middleware',
        configureServer(server) {
          server.middlewares.use(async (req: any, res: any, next: any) => {
            if (!req.url?.startsWith('/api/')) {
              return next();
            }

            const requestUrl = new URL(req.url, 'http://localhost');
            const route = requestUrl.pathname.slice('/api/'.length).split('/').filter(Boolean).join('/');
            if (!route) {
              return next();
            }

            const apiFile = new URL(`./api/${route}.js`, import.meta.url);
            if (!(await fileExists(apiFile))) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `Local API route not found: /api/${route}` }));
              return;
            }

            try {
              const rawBody = await readRequestBody(req);
              if (rawBody) {
                const contentType = req.headers['content-type'] || '';
                if (contentType.includes('application/json')) {
                  req.body = JSON.parse(rawBody);
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                  req.body = Object.fromEntries(new URLSearchParams(rawBody));
                } else {
                  req.body = rawBody;
                }
              }
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to parse request body', message: String(err) }));
              return;
            }

            req.query = Object.fromEntries(requestUrl.searchParams.entries());

            let statusCode = 200;
            const resProxy = {
              status(code: number) {
                statusCode = code;
                return this;
              },
              json(payload: any) {
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(statusCode);
                res.end(JSON.stringify(payload));
                return this;
              },
              setHeader: res.setHeader.bind(res),
              end: res.end.bind(res),
            };

            try {
              const module = await import(`${apiFile.toString()}?t=${Date.now()}`);
              if (typeof module.default !== 'function') {
                throw new Error('API module default export must be a function');
              }
              await module.default(req, resProxy);
            } catch (err) {
              console.error('[local-api-dev] error', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Local API handler error', message: String(err) }));
            }
          });
        }
      }],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
