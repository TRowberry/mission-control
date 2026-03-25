import { ActionHandler, ActionResult } from './index';

export const fetchAction: ActionHandler = async (config, input): Promise<ActionResult> => {
  const { url, method = 'GET', headers = {}, body } = config;

  if (!url) {
    throw new Error('Fetch action requires a URL');
  }

  // Replace template variables in URL and body
  const resolvedUrl = resolveTemplate(url, input);
  const resolvedBody = body ? resolveTemplate(
    typeof body === 'string' ? body : JSON.stringify(body),
    input
  ) : undefined;

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (method !== 'GET' && resolvedBody) {
    fetchOptions.body = resolvedBody;
  }

  const response = await fetch(resolvedUrl, fetchOptions);
  
  let responseData: any;
  const contentType = response.headers.get('content-type');
  
  if (contentType?.includes('application/json')) {
    responseData = await response.json();
  } else {
    responseData = await response.text();
  }

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  return {
    output: {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseData,
    },
  };
};

function resolveTemplate(template: string, data: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = path.trim().split('.').reduce((obj: any, key: string) => obj?.[key], data);
    return value !== undefined ? String(value) : match;
  });
}
