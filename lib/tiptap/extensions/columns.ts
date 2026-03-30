import { Node, mergeAttributes } from '@tiptap/core';

// Columns container (holds multiple column nodes)
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column+',
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: element => parseInt(element.getAttribute('data-columns') || '2', 10),
        renderHTML: attributes => ({
          'data-columns': attributes.count,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="columns"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        class: 'grid gap-4',
        style: `grid-template-columns: repeat(${HTMLAttributes['data-columns'] || 2}, 1fr)`,
      }),
      0,
    ];
  },
});

// Single column within columns container
export const Column = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="column"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        class: 'min-w-0',
      }),
      0,
    ];
  },
});

export default { Columns, Column };
