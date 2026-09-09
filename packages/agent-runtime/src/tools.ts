import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

export function createDemoTools(now: () => Date = () => new Date()): ToolSet {
  return {
    getCurrentUtcTime: tool({
      description: 'Return the current time as an ISO 8601 UTC timestamp.',
      inputSchema: z.object({
        timezone: z.literal('UTC').describe('Must be UTC.'),
      }),
      execute: async () => now().toISOString(),
    }),
  };
}
