const pageId = "cmn7mjxkp000v13qnzyncsm7h";
const apiKey = "mc_agent_b90e00ceacd7c243f3e32d94a872896c";

// Images
const agentsList = "/api/files/uploads/2026/03/1774898308518-x13vlu.png";
const agentEdit = "/api/files/uploads/2026/03/1774898314566-txbwjq.png";

async function main() {
  // Get current page
  const res = await fetch(`http://10.0.0.206:3000/api/pages/${pageId}`, {
    headers: { "X-API-Key": apiKey }
  });
  const page = await res.json();
  
  // Find and update the content
  const content = page.content;
  
  // Find the callout index and replace it with images
  const newContent = content.content.map(node => {
    if (node.type === "callout" && node.content?.[0]?.content?.[0]?.text?.includes("Screenshots to be added")) {
      // Replace with images
      return [
        { type: "paragraph", content: [{ type: "text", text: "Screenshots of the Agents UI:", marks: [{ type: "bold" }] }] },
        { type: "image", attrs: { src: agentsList, alt: "Agents List", title: "Settings > Agents" } },
        { type: "paragraph", content: [{ type: "text", text: "The agent edit modal:", marks: [{ type: "bold" }] }] },
        { type: "image", attrs: { src: agentEdit, alt: "Agent Edit Modal", title: "Edit Agent Dialog" } }
      ];
    }
    return node;
  }).flat();
  
  // Update the page
  const updateRes = await fetch(`http://10.0.0.206:3000/api/pages/${pageId}`, {
    method: "PATCH",
    headers: { 
      "X-API-Key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: { type: "doc", content: newContent }
    })
  });
  
  console.log("Status:", updateRes.status);
  const result = await updateRes.json();
  console.log("Result:", JSON.stringify(result).slice(0, 300));
}

main().catch(console.error);
