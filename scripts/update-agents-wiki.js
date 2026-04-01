const fs = require('fs');

// Read the page content, removing BOM if present
let rawData = fs.readFileSync('mission-control/temp-agents-page.json', 'utf8');
if (rawData.charCodeAt(0) === 0xFEFF) {
  rawData = rawData.slice(1);
}
const data = JSON.parse(rawData);
const content = data.content.content;

// Find and replace the callout
const newContent = content.flatMap(node => {
  if (node.type === 'callout' && JSON.stringify(node).includes('Screenshots')) {
    return [
      { type: 'paragraph', content: [{ type: 'text', text: 'Screenshots of the Agents UI:', marks: [{ type: 'bold' }] }] },
      { type: 'image', attrs: { src: '/api/files/uploads/2026/03/1774898308518-x13vlu.png', alt: 'Agents List', title: 'Settings > Agents list view' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'The agent edit modal:', marks: [{ type: 'bold' }] }] },
      { type: 'image', attrs: { src: '/api/files/uploads/2026/03/1774898314566-txbwjq.png', alt: 'Agent Edit Modal', title: 'Edit Agent dialog' } }
    ];
  }
  return [node];
});

const patch = { content: { type: 'doc', content: newContent } };
fs.writeFileSync('mission-control/temp-agents-patch.json', JSON.stringify(patch));
console.log('Patch file created: mission-control/temp-agents-patch.json');
