import { describe, expect, it, vi } from 'vitest';
import { forwardAcpAgentMessage, toAcpMcpServers } from './acpAgentInterop';

describe('acpAgentInterop', () => {
  it('converts MCP bridge config into ACP stdio descriptors', () => {
    expect(toAcpMcpServers({
      viby: { command: 'node', args: ['bridge.js'] }
    })).toEqual([
      {
        name: 'viby',
        command: 'node',
        args: ['bridge.js'],
        env: []
      }
    ]);
  });

  it('forwards structured agent messages and presentation text through one helper', () => {
    const sendStructuredMessage = vi.fn();
    const addMessage = vi.fn();

    forwardAcpAgentMessage({
      type: 'tool_call',
      id: 'call-1',
      name: 'ReadFile',
      input: { path: '/tmp/file.ts' },
      status: 'pending'
    }, {
      sendStructuredMessage,
      addMessage
    });

    expect(sendStructuredMessage).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith('Tool call: ReadFile', 'tool');
  });
});
