export function extractMarkdownHeadings(markdown: string, limit = 12): string[] {
  const headings: string[] = [];
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const level = match[1].length;
    const title = match[2].replace(/#+$/, "").trim();
    if (!title) continue;

    headings.push(`${"  ".repeat(level - 1)}- ${title}`);
  }

  return headings.slice(-limit);
}
