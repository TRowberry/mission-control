import { fetchAction } from './fetch';
import { transformAction } from './transform';
import { postMessageAction } from './post-message';
import { conditionAction } from './condition';
import { llmAction } from './llm';
import { scriptAction } from './script';
import { waitAction } from './wait';

export interface ActionContext {
  flowId: string;
  runId: string;
  agentId: string;
  agent?: {
    id: string;
    username: string;
    apiKey?: string;
  };
}

export interface ActionResult {
  output: any;
  tokensUsed?: number;
  cost?: number;
}

export type ActionHandler = (
  config: any,
  input: any,
  context: ActionContext
) => Promise<ActionResult>;

export const actionHandlers: Record<string, ActionHandler> = {
  trigger: async (config, input) => ({ output: input }),
  fetch: fetchAction,
  transform: transformAction,
  'post-message': postMessageAction,
  post: postMessageAction, // alias for UI
  condition: conditionAction,
  llm: llmAction,
  script: scriptAction,
  wait: waitAction,
  delay: waitAction, // alias for UI
};
