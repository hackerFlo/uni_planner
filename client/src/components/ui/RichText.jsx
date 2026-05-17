import { useMemo } from 'react';

const URL_SPLIT_RE = /((?:https?:\/\/|www\.)[^\s<>"')\]]+|[\w-]+\.(?:com|net|org|io|edu|gov|app|dev|me|info)(?:\/[^\s<>"')\]]*)?)/g;
const URL_TEST_RE = /^(?:https?:\/\/|www\.|[\w-]+\.(?:com|net|org|io|edu|gov|app|dev|me|info))/;

function toHref(url) {
  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

function renderText(text, keyPrefix) {
  const parts = text.split(URL_SPLIT_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    URL_TEST_RE.test(part) ? (
      <a
        key={`${keyPrefix}-${i}`}
        href={toHref(part)}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        className="underline decoration-dotted hover:decoration-solid"
      >
        {part}
      </a>
    ) : part
  );
}

function renderNode(node, key) {
  if (node.nodeType === Node.TEXT_NODE) {
    return renderText(node.textContent, key);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map((child, i) =>
    renderNode(child, `${key}-${i}`)
  );

  if (tag === 'strong') return <strong key={key}>{children}</strong>;
  if (tag === 'em') return <em key={key}>{children}</em>;
  if (tag === 'br') return <br key={key} />;
  if (tag === 'ul') return <ul key={key} className="list-['-_'] pl-5 my-0">{children}</ul>;
  if (tag === 'li') return <li key={key}>{children}</li>;

  // Unknown tags: keep children, drop tag (shouldn't appear after sanitization)
  return <span key={key}>{children}</span>;
}

export default function RichText({ text, className }) {
  const content = useMemo(() => {
    if (!text) return null;
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return Array.from(doc.body.childNodes).map((node, i) => renderNode(node, String(i)));
  }, [text]);

  if (!content) return null;
  return <div className={className}>{content}</div>;
}
