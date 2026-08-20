// Building the editor's initial content as DOM nodes instead of assigning
// innerHTML.
//
// `descRef.current.innerHTML = todo.description` was the one place in the client
// where stored text became live markup. Everything else renders through
// RichText.jsx, which parses into an inert document and rebuilds React elements
// from tag names alone. That asymmetry is what turned a sanitiser bug into a real
// XSS chain -- an `<img onerror>` that slipped past the sanitiser would fire here
// (and was stopped only by the CSP). Constructing nodes ourselves means markup in
// the stored string can never be interpreted, whatever the sanitiser did.

const ALLOWED_TAGS = new Set(['strong', 'em', 'ul', 'li']);
const VOID_TAGS = new Set(['br']);
// Matches a tag with or without attributes. Attributes are captured only so
// they can be discarded with the tag: a non-allowlisted element must vanish
// whole, not leak its attribute text into the document as prose.
const TOKEN_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return Object.hasOwn(ENTITIES, body) ? ENTITIES[body] : match;
  });
}

// Returns a tree of { text } and { tag, children } specs. Pure, so the shape can
// be tested without a DOM; renderRichTextInto turns it into real nodes.
export function richTextToNodes(html) {
  if (typeof html !== 'string' || html === '') return [];

  const root = { children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  const pushText = (raw) => {
    if (!raw) return;
    top().children.push({ text: decodeEntities(raw) });
  };

  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    pushText(html.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;

    const tag = match[1].toLowerCase();
    const isClosing = match[0][1] === '/';

    if (VOID_TAGS.has(tag)) {
      if (!isClosing) top().children.push({ tag: 'br', children: [] });
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue; // anything else is dropped, never rendered

    if (isClosing) {
      // Only unwind to a matching open tag; a stray close is ignored rather than
      // collapsing the tree, which matters because the client truncates at 5000
      // characters and can cut mid-element.
      const at = stack.findIndex(n => n.tag === tag);
      if (at > 0) stack.length = at;
    } else {
      const node = { tag, children: [] };
      top().children.push(node);
      stack.push(node);
    }
  }
  pushText(html.slice(lastIndex));

  return root.children;
}

export function renderRichTextInto(el, html) {
  el.replaceChildren();
  const append = (parent, specs) => {
    for (const spec of specs) {
      if (spec.text !== undefined) {
        parent.appendChild(document.createTextNode(spec.text));
        continue;
      }
      const child = document.createElement(spec.tag);
      append(child, spec.children);
      parent.appendChild(child);
    }
  };
  append(el, richTextToNodes(html));
}
