// Starter articles use section arrays; the editor uses Tiptap documents.
export function editableDocument(content) {
  if (!Array.isArray(content)) return content;
  return { type: "doc", content: content.flatMap((section) => [
    ...(section.heading ? [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: section.heading }] }] : []),
    ...section.paragraphs.map((text) => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) })),
  ]) };
}

export function articlePlainText(node) {
  if (!node) return "";
  return [node.text ?? "", ...(node.content ?? []).map(articlePlainText)].filter(Boolean).join(" ").trim();
}
