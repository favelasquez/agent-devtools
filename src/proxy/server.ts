import express from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { broadcast } from '../events/broadcaster';
import { parseAnthropicEvent, parseAnthropicSSE } from './parser';

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
          if (req.body && req.body.length) {
            proxyReq.setHeader('Content-Length', req.body.length);
            proxyReq.write(req.body);
          }
        },
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req: any) => {
          try {
            const contentType = proxyRes.headers['content-type'] ?? '';
            const requestBody = req.body ? JSON.parse(req.body.toString()) : {};
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
