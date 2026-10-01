/**
 * Turn the invitation's markdown into readable text for the preview.
 *
 * The preview exists so the operator can read the wording before generating, so
 * this renders the copy as it reads — bold, headings, a blockquote, links —
 * rather than showing markdown syntax.
 *
 * It is deliberately not a general markdown parser. It handles exactly the
 * constructs renderInvitation emits (see server/src/render.ts), and anything it
 * does not recognise passes through as literal text, which is the safe default
 * for something an operator proofreads. Styling a construct it missed would
 * show it as noise; hiding it would hide copy.
 */

export type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'link'; value: string; href: string };

export type BlockNode =
  | { kind: 'title'; inline: InlineNode[] }
  | { kind: 'heading'; inline: InlineNode[] }
  | { kind: 'paragraph'; inline: InlineNode[] }
  | { kind: 'quote'; inline: InlineNode[] };

/** Inline pattern: `code`-free, so a stray asterisk survives as text. */
const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

/** Parse the inline spans of one line. */
export function parseInline(line: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;

  for (const match of line.matchAll(INLINE)) {
    const at = match.index;
    if (at > last) nodes.push({ kind: 'text', value: line.slice(last, at) });

    const [full, linkText, href, strong] = match;
    if (linkText !== undefined && href !== undefined) {
      nodes.push({ kind: 'link', value: linkText, href });
    } else if (strong !== undefined) {
      nodes.push({ kind: 'strong', value: strong });
    }

    last = at + full.length;
  }

  if (last < line.length) nodes.push({ kind: 'text', value: line.slice(last) });
  return nodes;
}

/**
 * Parse the markdown into blocks.
 *
 * A blockquote is one block even when the renderer separates its lines with a
 * bare ">", so the note reads as a single aside — matching how it renders in
 * the PDF rather than how it is stored.
 */
export function parseMarkdown(markdown: string): BlockNode[] {
  const blocks: BlockNode[] = [];

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();

    if (line.trim() === '') continue;

    if (line.startsWith('# ')) {
      blocks.push({ kind: 'title', inline: parseInline(line.slice(2)) });
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', inline: parseInline(line.slice(3)) });
    } else if (line.startsWith('>')) {
      // The "> " prefix is stripped; a bare ">" contributes nothing, which is
      // how a paragraph break inside the note is already represented.
      const content = line.replace(/^>\s?/, '');
      const inline = content === '' ? [] : parseInline(content);

      const previous = blocks[blocks.length - 1];
      if (previous && previous.kind === 'quote' && content !== '') {
        previous.inline.push({ kind: 'text', value: ' ' }, ...inline);
      } else if (previous && previous.kind === 'quote' && content === '') {
        // Ignore: the blank quote line is a separator, not content.
        continue;
      } else if (content !== '') {
        blocks.push({ kind: 'quote', inline });
      }
    } else {
      blocks.push({ kind: 'paragraph', inline: parseInline(line) });
    }
  }

  return blocks;
}
