import type { DocPage } from '../types';

export function exportPageToMarkdown(page: DocPage): string {
  if (page.viewMode === 'document') {
    return page.markdownBody;
  }

  let md = `---\ntitle: ${page.title}\ncategory: ${page.category}\n---\n\n`;

  for (const block of page.blocks) {
    switch (block.type) {
      case 'text':
        md += `${block.content}\n\n`;
        break;
      case 'steps':
        md += `## Steps\n\n`;
        block.content.forEach((step: string, idx: number) => {
          md += `${idx + 1}. ${step}\n`;
        });
        md += `\n`;
        break;
      case 'media':
        if (block.content.kind === 'image') {
          md += `![${block.content.label}](${block.content.filePath})\n\n`;
        } else {
          md += `<video src="${block.content.filePath}" controls></video>\n\n`;
        }
        break;
      case 'blueprint':
        md += `\`\`\`blueprint\n${block.content.blueprintString}\n\`\`\`\n\n`;
        break;
    }
  }

  return md;
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
