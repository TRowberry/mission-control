import { ActionHandler, ActionResult } from './index';

export const transformAction: ActionHandler = async (config, input): Promise<ActionResult> => {
  const { template, jsonPath, mapping } = config;

  let output: any = input;

  // Apply JSON path extraction if specified
  if (jsonPath) {
    output = extractJsonPath(input, jsonPath);
  }

  // Apply mapping if specified
  if (mapping && typeof mapping === 'object') {
    const mapped: any = {};
    for (const [key, path] of Object.entries(mapping)) {
      if (typeof path === 'string') {
        mapped[key] = extractJsonPath(output, path);
      }
    }
    output = mapped;
  }

  // Apply template string if specified
  if (template) {
    output = resolveTemplate(template, output);
  }

  return { output };
};

function extractJsonPath(data: any, path: string): any {
  if (!path) return data;
  
  // Handle array access like "items[0]" or "data.trends[*].name"
  const parts = path.split('.');
  let result = data;

  for (const part of parts) {
    if (result === undefined || result === null) return undefined;

    // Check for array access
    const arrayMatch = part.match(/^(\w+)\[([^\]]+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      result = result[key];
      
      if (index === '*') {
        // Map over all array items
        if (Array.isArray(result)) {
          // Continue path resolution for each item
          const remainingPath = parts.slice(parts.indexOf(part) + 1).join('.');
          if (remainingPath) {
            return result.map(item => extractJsonPath(item, remainingPath));
          }
          return result;
        }
      } else {
        result = result?.[parseInt(index, 10)];
      }
    } else {
      result = result[part];
    }
  }

  return result;
}

function resolveTemplate(template: string, data: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = extractJsonPath(data, path.trim());
    if (value === undefined) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}
