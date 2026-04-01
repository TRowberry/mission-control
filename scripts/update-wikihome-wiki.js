const fs = require('fs');

let rawData = fs.readFileSync('mission-control/temp-wikihome-page.json', 'utf8');
if (rawData.charCodeAt(0) === 0xFEFF) rawData = rawData.slice(1);
const data = JSON.parse(rawData);
const content = data.content.content;

// Insert dashboard screenshot after the welcome paragraph (index 0)
const newContent = [];
for (let i = 0; i < content.length; i++) {
  newContent.push(content[i]);
  if (i === 0) {
    newContent.push({
      type: 'image',
      attrs: {
        src: '/api/files/uploads/2026/03/1774898315017-lppd61.png',
        alt: 'Dashboard',
        title: 'Mission Control Dashboard'
      }
    });
  }
  // Update the last updated callout
  if (content[i].type === 'callout' && JSON.stringify(content[i]).includes('Last updated')) {
    newContent[newContent.length - 1] = {
      type: 'callout',
      attrs: { type: 'info' },
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'This wiki is maintained by Rico (AI agent). Last updated: March 30, 2026'
        }]
      }]
    };
  }
}

const patch = { content: { type: 'doc', content: newContent } };
fs.writeFileSync('mission-control/temp-wikihome-patch.json', JSON.stringify(patch));
console.log('Wiki Home patch created');
