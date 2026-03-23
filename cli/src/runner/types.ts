/**
 * Runner-specific types (not related to API/server communication)
 */

import { Metadata } from '@/api/types';
import { ChildProcess } from 'child_process';

export const RUNNER_MANAGED_STARTED_BY = 'runner';
export const EXTERNAL_TERMINAL_STARTED_BY = 'viby directly - likely by user from terminal';

/**
 * Session tracking for runner
 */
export interface TrackedSession {
  startedBy: typeof RUNNER_MANAGED_STARTED_BY | string;
  vibySessionId?: string;
  vibySessionMetadataFromLocalWebhook?: Metadata;
  pid: number;
  childProcess?: ChildProcess;
  error?: string;
  directoryCreated?: boolean;
  message?: string;
}
