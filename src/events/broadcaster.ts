import { WebSocketServer, WebSocket } from 'ws';
import { AgentEvent } from '../types';

let wss: WebSocketServer | null = null;
const eventHistory: AgentEvent[] = [];

export function initWebSocketServer(port: number): void {
  wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    // Send full history to new clients
    ws.send(JSON.stringify({ type: 'history', events: eventHistory }));
  });
}

export function broadcast(event: AgentEvent): void {
  eventHistory.push(event);

  if (!wss) return;

  const message = JSON.stringify({ type: 'event', event });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
