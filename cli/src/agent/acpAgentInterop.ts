import { convertAgentMessage } from './messageConverter';
import type { AgentMessage, McpServerStdio } from './types';

type AgentMessageBufferRole = 'assistant' | 'tool' | 'result' | 'status';

type ForwardAcpAgentMessageOptions = {
  sendStructuredMessage: (message: unknown) => void;
  addMessage: (message: string, role: AgentMessageBufferRole) => void;
};

export function toAcpMcpServers(
  config: Record<string, { command: string; args: string[] }>
): McpServerStdio[] {
  return Object.entries(config).map(([name, entry]) => ({
    name,
    command: entry.command,
    args: entry.args,
    env: []
  }));
}

export function forwardAcpAgentMessage(
  message: AgentMessage,
  options: ForwardAcpAgentMessageOptions
): void {
  const converted = convertAgentMessage(message);
  if (converted) {
    options.sendStructuredMessage(converted);
  }

  switch (message.type) {
    case 'text':
      options.addMessage(message.text, 'assistant');
      return;
    case 'tool_call':
      options.addMessage(`Tool call: ${message.name}`, 'tool');
      return;
    case 'tool_result':
      options.addMessage('Tool result received', 'result');
      return;
    case 'plan':
      options.addMessage('Plan updated', 'status');
      return;
    case 'error':
      options.addMessage(message.message, 'status');
      return;
    case 'turn_complete':
      options.addMessage('Turn complete', 'status');
      return;
    default: {
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}
