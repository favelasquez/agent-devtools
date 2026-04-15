import { AgentEvent, ToolCall } from '../types';
import { randomUUID } from 'crypto';

export function parseAnthropicEvent(
  req: any,
  requestBody: any,
  responseBody: any,
  statusCode: number
): AgentEvent {
  const toolCalls: ToolCall[] = [];

  if (responseBody?.content && Array.isArray(responseBody.content)) {
    for (const block of responseBody.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }
  }

  return {
    id: randomUUID(),
    timestamp: Date.now(),
    method: req.method,
    path: req.path,
    statusCode,

    request: {
      model: requestBody?.model,
      messages: requestBody?.messages ?? [],
      tools: requestBody?.tools ?? [],
      system: requestBody?.system,
    },
    response: {
      id: responseBody?.id,
      model: responseBody?.model,
      stopReason: responseBody?.stop_reason,
      content: responseBody?.content ?? [],
      usage: responseBody?.usage ?? null,
    },
    toolCalls,
  };
}

export function parseAnthropicSSE(
  req: any,
  requestBody: any,
  sseBuffer: string,
  statusCode: number
): AgentEvent {
  const toolCalls: ToolCall[] = [];
  const contentBlocks: any[] = [];
  const toolInputBuffers: Record<number, string> = {};
  let messageId: string | undefined;
  let model: string | undefined;
  let stopReason: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const line of sseBuffer.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;

    try {
      const evt = JSON.parse(data);
      switch (evt.type) {
        case 'message_start':
          messageId = evt.message?.id;
          model = evt.message?.model;
          inputTokens = evt.message?.usage?.input_tokens ?? 0;
          break;
        case 'content_block_start':
          contentBlocks[evt.index] = { ...evt.content_block };
          if (evt.content_block.type === 'tool_use') toolInputBuffers[evt.index] = '';
          break;
        case 'content_block_delta':
          if (evt.delta.type === 'text_delta') {
            contentBlocks[evt.index].text = (contentBlocks[evt.index].text ?? '') + evt.delta.text;
          } else if (evt.delta.type === 'input_json_delta') {
            toolInputBuffers[evt.index] = (toolInputBuffers[evt.index] ?? '') + evt.delta.partial_json;
          }
          break;
        case 'content_block_stop':
          if (contentBlocks[evt.index]?.type === 'tool_use') {
            try {
              contentBlocks[evt.index].input = JSON.parse(toolInputBuffers[evt.index] ?? '{}');
            } catch {
              contentBlocks[evt.index].input = {};
            }
          }
          break;
        case 'message_delta':
          stopReason = evt.delta?.stop_reason;
          outputTokens = evt.usage?.output_tokens ?? 0;
          break;
      }
    } catch {
      // skip malformed SSE line
    }
  }

  for (const block of contentBlocks) {
    if (block?.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input ?? {} });
    }
  }

  return {
    id: randomUUID(),
    timestamp: Date.now(),
    method: req.method,
    path: req.path,
    statusCode,

    request: {
      model: requestBody?.model,
      messages: requestBody?.messages ?? [],
      tools: requestBody?.tools ?? [],
      system: requestBody?.system,
    },
    response: {
      id: messageId,
      model,
      stopReason,
      content: contentBlocks.filter(Boolean),
      usage: inputTokens || outputTokens ? { input_tokens: inputTokens, output_tokens: outputTokens } : null,
    },
    toolCalls,
  };
}
