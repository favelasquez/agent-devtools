import express from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { broadcast } from '../events/broadcaster';
import { parseAnthropicEvent, parseAnthropicSSE } from './parser';

function parseRequestBody(body: unknown): any {
  if (!body) return {};
  if (Buffer.isBuffer(body)) {
    const text = body.toString('utf8').trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (typeof body === 'string') {
    const text = body.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (typeof body === 'object') return body;
  return {};
}

export async function startProxy(port: number): Promise<void> {
  const app = express();

  // Log raw body for parsing
  app.use(express.raw({ type: '*/*', limit: '10mb' }));

  app.use(
    '/',
    createProxyMiddleware({
      target: 'https://api.anthropic.com',
      changeOrigin: true,
      selfHandleResponse: true,
      on: {
        proxyReq: (proxyReq, req: any) => {
          // Re-attach raw body if present
          if (req.body) {
            const bodyBuffer = Buffer.isBuffer(req.body)
              ? req.body
              : typeof req.body === 'string'
                ? Buffer.from(req.body)
                : null;

            if (bodyBuffer && bodyBuffer.length) {
              proxyReq.setHeader('Content-Length', bodyBuffer.length);
              proxyReq.write(bodyBuffer);
            }
          }
        },
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req: any) => {
          try {
            const contentType = proxyRes.headers['content-type'] ?? '';
            const requestBody = parseRequestBody(req.body);
            const statusCode = proxyRes.statusCode ?? 200;
            let event;

            if (contentType.includes('text/event-stream')) {
              event = parseAnthropicSSE(req, requestBody, responseBuffer.toString('utf8'), statusCode);
            } else if (contentType.includes('application/json')) {
              const responseBody = JSON.parse(responseBuffer.toString('utf8'));
              event = parseAnthropicEvent(req, requestBody, responseBody, statusCode);
            }

            if (event) broadcast(event);
          } catch (err) {
            console.error('[agent-devtools] proxy parse error:', err);
          }

          return responseBuffer;
        }),
      },
    })
  );

  return new Promise((resolve) => {
    app.listen(port, resolve);
  });
}
