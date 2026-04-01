const fs = require('fs');

let rawData = fs.readFileSync('mission-control/temp-channels-page.json', 'utf8');
if (rawData.charCodeAt(0) === 0xFEFF) rawData = rawData.slice(1);
const data = JSON.parse(rawData);
const content = data.content.content;

// Insert screenshot after the intro paragraph (index 1)
const newContent = [];
for (let i = 0; i < content.length; i++) {
  newContent.push(content[i]);
  if (i === 1) {
    newContent.push({
      type: 'image',
      attrs: {
        src: '/api/files/uploads/2026/03/1774898335666-ewqd6r.png',
        alt: 'Chat Channel',
        title: 'Mission Control chat with messages'
      }
    });
  }
}

const patch = { content: { type: 'doc', content: newContent } };
fs.writeFileSync('mission-control/temp-channels-patch.json', JSON.stringify(patch));
console.log('Channels patch created');
