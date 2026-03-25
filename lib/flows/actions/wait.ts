import { ActionHandler, ActionResult } from './index';

export const waitAction: ActionHandler = async (config, input): Promise<ActionResult> => {
  const { duration = 1000, unit = 'ms' } = config;

  let waitMs = duration;
  
  switch (unit) {
    case 's':
    case 'seconds':
      waitMs = duration * 1000;
      break;
    case 'm':
    case 'minutes':
      waitMs = duration * 60 * 1000;
      break;
    case 'ms':
    case 'milliseconds':
    default:
      waitMs = duration;
  }

  // Cap at 5 minutes to prevent runaway waits
  waitMs = Math.min(waitMs, 5 * 60 * 1000);

  await new Promise(resolve => setTimeout(resolve, waitMs));

  return {
    output: {
      ...input,
      _waited: waitMs,
    },
  };
};
