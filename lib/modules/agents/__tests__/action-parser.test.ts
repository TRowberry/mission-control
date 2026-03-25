import { describe, it, expect } from 'vitest';
import { 
  parseActions, 
  getActionsRequiringApproval,
  getActionDescriptions,
  ACTION_REGISTRY,
  ParsedAction
} from '../action-parser';

describe('Action Parser', () => {
  describe('parseActions', () => {
    describe('XML format', () => {
      it('parses basic XML action', () => {
        const content = '<action type="message" target="channel-general">Hello world</action>';
        const result = parseActions(content);
        
        expect(result.parseMethod).toBe('xml');
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].type).toBe('message');
        expect(result.actions[0].targetId).toBe('channel-general');
        expect(result.actions[0].payload).toEqual({ text: 'Hello world' });
      });

      it('parses XML action with JSON payload', () => {
        const content = '<action type="create_task">{"title": "New task", "projectId": "proj-1"}</action>';
        const result = parseActions(content);
        
        expect(result.actions[0].type).toBe('create_task');
        expect(result.actions[0].payload).toEqual({ title: 'New task', projectId: 'proj-1' });
      });

      it('parses multiple XML actions', () => {
        const content = `
          <action type="message" target="channel-general">First message</action>
          <action type="message" target="channel-ops">Second message</action>
        `;
        const result = parseActions(content);
        
        expect(result.actions).toHaveLength(2);
        expect(result.actions[0].targetId).toBe('channel-general');
        expect(result.actions[1].targetId).toBe('channel-ops');
      });
    });

    describe('JSON format', () => {
      it('parses JSON block in markdown fence', () => {
        const content = '```json\n{"action": "message", "channel": "general", "text": "Hello"}\n```';
        const result = parseActions(content);
        
        expect(result.parseMethod).toBe('json');
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].type).toBe('message');
        expect(result.actions[0].payload.text).toBe('Hello');
      });

      it('parses array of actions in JSON block', () => {
        const content = '```json\n[{"action": "message", "text": "Hi"}, {"action": "wait", "seconds": 5}]\n```';
        const result = parseActions(content);
        
        expect(result.actions).toHaveLength(2);
        expect(result.actions[0].type).toBe('message');
        expect(result.actions[1].type).toBe('wait');
      });

      it('parses JSON with type instead of action', () => {
        const content = '```json\n{"type": "create_task", "title": "Test", "projectId": "p1"}\n```';
        const result = parseActions(content);
        
        expect(result.actions[0].type).toBe('create_task');
      });
    });

    describe('Function call format', () => {
      it('parses function call style', () => {
        const content = 'message({ channel: "general", text: "Hello" })';
        const result = parseActions(content);
        
        expect(result.parseMethod).toBe('function');
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].type).toBe('message');
        expect(result.actions[0].payload.text).toBe('Hello');
      });

      it('parses multiple function calls', () => {
        const content = `
          message({ channel: "general", text: "First" });
          wait({ seconds: 2 });
          message({ channel: "ops", text: "Second" });
        `;
        const result = parseActions(content);
        
        expect(result.actions).toHaveLength(3);
        expect(result.actions[0].type).toBe('message');
        expect(result.actions[1].type).toBe('wait');
        expect(result.actions[2].type).toBe('message');
      });

      it('ignores common non-action functions', () => {
        const content = 'console.log({ message: "debug" }); message({ text: "real" })';
        const result = parseActions(content);
        
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].type).toBe('message');
      });
    });

    describe('Simple format', () => {
      it('parses ACTION: format', () => {
        const content = 'ACTION: message TARGET: channel-general DATA: {"text": "Hello"}';
        const result = parseActions(content);
        
        expect(result.parseMethod).toBe('simple');
        expect(result.actions[0].type).toBe('message');
        expect(result.actions[0].targetId).toBe('channel-general');
        expect(result.actions[0].payload.text).toBe('Hello');
      });

      it('parses ACTION without TARGET or DATA', () => {
        const content = 'ACTION: respond';
        const result = parseActions(content);
        
        expect(result.actions[0].type).toBe('respond');
        expect(result.actions[0].targetId).toBeUndefined();
      });

      it('parses multiple simple actions', () => {
        const content = `
          ACTION: message TARGET: ch1 DATA: {"text": "one"}
          ACTION: message TARGET: ch2 DATA: {"text": "two"}
        `;
        const result = parseActions(content);
        
        expect(result.actions).toHaveLength(2);
      });
    });

    describe('Fallback', () => {
      it('treats plain text as respond action', () => {
        const content = 'This is just a plain text response without any action markers.';
        const result = parseActions(content);
        
        expect(result.parseMethod).toBe('fallback');
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].type).toBe('respond');
        expect(result.actions[0].payload.text).toBe(content);
        expect(result.actions[0].confidence).toBe(0.5);
      });
    });

    describe('Action type normalization', () => {
      it('normalizes send to message', () => {
        const content = '<action type="send">Hello</action>';
        const result = parseActions(content);
        expect(result.actions[0].type).toBe('message');
      });

      it('normalizes createTask to create_task', () => {
        const content = '<action type="createTask">{"title": "T"}</action>';
        const result = parseActions(content);
        expect(result.actions[0].type).toBe('create_task');
      });

      it('normalizes reply to respond', () => {
        const content = '<action type="reply">Hi</action>';
        const result = parseActions(content);
        expect(result.actions[0].type).toBe('respond');
      });

      it('marks unknown types', () => {
        const content = '<action type="unknownAction">data</action>';
        const result = parseActions(content);
        expect(result.actions[0].type).toBe('unknown');
      });
    });
  });

  describe('Validation', () => {
    it('validates required fields', () => {
      const content = '<action type="message">{}</action>';
      const result = parseActions(content);
      
      expect(result.actions[0].validationErrors).toBeDefined();
      expect(result.actions[0].validationErrors).toContain('Missing required field: channel');
      expect(result.actions[0].validationErrors).toContain('Missing required field: text');
      expect(result.actions[0].confidence).toBe(0.6);
    });

    it('passes validation for complete payload', () => {
      const content = '<action type="message">{"channel": "general", "text": "Hi"}</action>';
      const result = parseActions(content);
      
      expect(result.actions[0].validationErrors).toBeUndefined();
      expect(result.actions[0].confidence).toBe(0.9);
    });
  });

  describe('Approval flags', () => {
    it('marks fetch as requiring approval', () => {
      const content = '<action type="fetch">{"url": "https://example.com"}</action>';
      const result = parseActions(content);
      
      expect(result.actions[0].requiresApproval).toBe(true);
    });

    it('marks code as requiring approval', () => {
      const content = '<action type="code">{"language": "js", "code": "console.log(1)"}</action>';
      const result = parseActions(content);
      
      expect(result.actions[0].requiresApproval).toBe(true);
    });

    it('marks message as not requiring approval', () => {
      const content = '<action type="message">{"channel": "gen", "text": "Hi"}</action>';
      const result = parseActions(content);
      
      expect(result.actions[0].requiresApproval).toBe(false);
    });

    it('marks unknown as requiring approval', () => {
      const content = '<action type="danger">data</action>';
      const result = parseActions(content);
      
      expect(result.actions[0].requiresApproval).toBe(true);
    });
  });

  describe('getActionsRequiringApproval', () => {
    it('filters actions needing approval', () => {
      const actions: ParsedAction[] = [
        { type: 'message', payload: {}, confidence: 0.9, requiresApproval: false },
        { type: 'fetch', payload: {}, confidence: 0.9, requiresApproval: true },
        { type: 'respond', payload: {}, confidence: 0.9, requiresApproval: false },
        { type: 'code', payload: {}, confidence: 0.9, requiresApproval: true },
      ];
      
      const needsApproval = getActionsRequiringApproval(actions);
      
      expect(needsApproval).toHaveLength(2);
      expect(needsApproval[0].type).toBe('fetch');
      expect(needsApproval[1].type).toBe('code');
    });
  });

  describe('getActionDescriptions', () => {
    it('returns formatted descriptions', () => {
      const descriptions = getActionDescriptions();
      
      expect(descriptions).toContain('Available actions:');
      expect(descriptions).toContain('message:');
      expect(descriptions).toContain('fetch:');
      expect(descriptions).toContain('(requires approval)');
    });
  });

  describe('ACTION_REGISTRY', () => {
    it('has all expected action types', () => {
      const expectedTypes = [
        'message', 'create_task', 'update_task', 'complete_task',
        'fetch', 'search', 'respond', 'think', 'code', 'wait', 'unknown'
      ];
      
      for (const type of expectedTypes) {
        expect(ACTION_REGISTRY[type as keyof typeof ACTION_REGISTRY]).toBeDefined();
      }
    });

    it('has payload schemas for most types', () => {
      expect(ACTION_REGISTRY.message.payloadSchema).toBeDefined();
      expect(ACTION_REGISTRY.create_task.payloadSchema).toBeDefined();
      expect(ACTION_REGISTRY.fetch.payloadSchema).toBeDefined();
    });
  });
});
