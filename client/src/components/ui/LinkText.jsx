const URL_SPLIT_RE = /((?:https?:\/\/|www\.)[^\s<>"')\]]+|[\w-]+\.(?:com|net|org|io|edu|gov|app|dev|me|info)(?:\/[^\s<>"')\]]*)?)/g;
const URL_TEST_RE = /^(?:https?:\/\/|www\.|[\w-]+\.(?:com|net|org|io|edu|gov|app|dev|me|info))/;

function toHref(url) {
  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

export default function LinkText({ text, className }) {
  if (!text) return null;
  const parts = text.split(URL_SPLIT_RE);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        URL_TEST_RE.test(part) ? (
          <a
            key={i}
            href={toHref(part)}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className="underline decoration-dotted hover:decoration-solid"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </span>
  );
}
