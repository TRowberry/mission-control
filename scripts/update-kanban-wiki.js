const fs = require('fs');

// Read the page content, removing BOM if present
let rawData = fs.readFileSync('mission-control/temp-kanban-page.json', 'utf8');
if (rawData.charCodeAt(0) === 0xFEFF) {
  rawData = rawData.slice(1);
}
const data = JSON.parse(rawData);
const content = data.content.content;

// Insert screenshot after the intro paragraph (index 1)
const newContent = [];
for (let i = 0; i < content.length; i++) {
  newContent.push(content[i]);
  // After the intro paragraph, add the screenshot
  if (i === 1) {
    newContent.push({
      type: 'image',
      attrs: {
        src: '/api/files/uploads/2026/03/1774898335211-ucfxdg.png',
        alt: 'Kanban Board',
        title: 'Kanban board with columns and tasks'
      }
    });
  }
}

const patch = { content: { type: 'doc', content: newContent } };
fs.writeFileSync('mission-control/temp-kanban-patch.json', JSON.stringify(patch));
console.log('Patch file created: mission-control/temp-kanban-patch.json');
