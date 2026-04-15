export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AgentEvent {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  request: {
    model?: string;
    messages: unknown[];
    tools: unknown[];
    system?: string;
  };
  response: {
    id?: string;
    model?: string;
    stopReason?: string;
    content: unknown[];
    usage: {
      input_tokens: number;
      output_tokens: number;
    } | null;
  };
  toolCalls: ToolCall[];
}
