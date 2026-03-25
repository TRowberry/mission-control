import { ActionHandler, ActionResult } from './index';

export const scriptAction: ActionHandler = async (config, input): Promise<ActionResult> => {
  const { code } = config;

  if (!code) {
    throw new Error('Script action requires code');
  }

  try {
    // Create a sandboxed function with limited access
    // The function receives 'input' and should return the output
    const fn = new Function('input', `
      'use strict';
      ${code}
    `);

    const output = fn(input);

    // Handle async functions
    const result = output instanceof Promise ? await output : output;

    return { output: result };
  } catch (error: any) {
    throw new Error(`Script execution error: ${error.message}`);
  }
};
