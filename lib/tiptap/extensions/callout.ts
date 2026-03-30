import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutType = 'info' | 'warning' | 'success' | 'error';

const calloutStyles: Record<CalloutType, string> = {
  info: 'bg-blue-500/10 border-blue-500/50 text-blue-200',
  warning: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-200',
  success: 'bg-green-500/10 border-green-500/50 text-green-200',
  error: 'bg-red-500/10 border-red-500/50 text-red-200',
};

const calloutIcons: Record<CalloutType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  success: '✅',
  error: '❌',
};

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info' as CalloutType,
        parseHTML: element => (element.getAttribute('data-callout-type') || 'info') as CalloutType,
        renderHTML: attributes => ({
          'data-callout-type': attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const type = (HTMLAttributes['data-callout-type'] || 'info') as CalloutType;
    const styles = calloutStyles[type] || calloutStyles.info;
    
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        class: `rounded-lg border-l-4 p-4 my-4 ${styles}`,
      }),
      0,
    ];
  },
});

export default Callout;
