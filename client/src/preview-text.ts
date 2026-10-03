/**
 * Turn the invitation's markdown into readable text for the preview.
 *
 * The preview exists so the operator can read the wording before generating, so
 * this renders the copy as it reads — bold, headings, links — rather than
 * showing markdown syntax.
 *
 * It is deliberately not a general markdown parser. It handles exactly the
 * constructs renderInvitation emits (see server/src/render.ts), and anything it
 * does not recognise passes through as literal text, which is the safe default
 * for something an operator proofreads. Styling a construct it missed would
 * show it as noise; hiding it would hide copy. The one exception is the cover,
 * which is emitted as raw HTML: its tags are dropped so the wording they wrap
 * is still read (see server/src/cover.ts).
 */

export type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'link'; value: string; href: string };

export type BlockNode =
  | { kind: 'heading'; inline: InlineNode[] }
  | { kind: 'paragraph'; inline: InlineNode[] };

/** Inline pattern: `code`-free, so a stray asterisk survives as text. */
const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

/** The entities the cover emits, plus the numeric forms. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, name: string) => {
    const key = name.toLowerCase();
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)));
    return ENTITIES[key] ?? match;
  });
}

/**
 * The readable text of one line of raw HTML.
 *
 * The cover (server/src/cover.ts) is written as markup because its layout is
 * its content: a framed photograph, names, a date. The operator proofreads the
 * wording, so the tags are dropped and what remains is shown; an element that
 * carries no text — the photograph, a wrapper — contributes nothing rather than
 * a line of angle brackets.
 */
function htmlText(line: string): string {
  return decodeEntities(line.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

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
 * One line is one block, which is all the copy needs: every block the renderer
 * emits — the greeting, the intro, each paragraph of the personal note, the
 * closing — is a single line, so no construct spans lines.
 */
export function parseMarkdown(markdown: string): BlockNode[] {
  const blocks: BlockNode[] = [];

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();

    if (line.trim() === '') continue;

    if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', inline: parseInline(line.slice(3)) });
    } else if (line.startsWith('<')) {
      // Raw HTML: the cover. Its tags are layout, but the words inside them are
      // copy the guest reads, so they are shown with the markup stripped and an
      // empty element is skipped entirely.
      const text = htmlText(line);
      if (text !== '') {
        blocks.push({ kind: 'paragraph', inline: [{ kind: 'text', value: text }] });
      }
    } else {
      blocks.push({ kind: 'paragraph', inline: parseInline(line) });
    }
  }

  return blocks;
}
