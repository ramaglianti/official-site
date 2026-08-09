// Instagram のキャプション(SNS向けの改行・ハッシュタグ多め)を、
// 読みやすいブログ記事の HTML に整形する。

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 半角/全角スペースを跨がないハッシュタグを拾う(日本語タグにも対応)。
const HASHTAG_RE = /#[^\s#、。,.!！?？]+/gu;

export function extractHashtags(caption) {
  if (!caption) return [];
  const found = caption.match(HASHTAG_RE) || [];
  const seen = new Set();
  const tags = [];
  for (const raw of found) {
    const tag = raw.slice(1).trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

// 本文からタイトルを作る(先頭の意味のある行を短く切り出す)。
function deriveTitle(bodyLines, timestamp) {
  const firstLine = bodyLines.find((l) => l.trim().length > 0);
  if (firstLine) {
    const clean = firstLine.replace(HASHTAG_RE, "").trim();
    if (clean) {
      return clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
    }
  }
  const d = new Date(timestamp);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return `So_thing. Instagram ${ymd}`;
}

// キャプションを段落 HTML に変換する。
// - 行全体がハッシュタグだけの行(末尾のタグ羅列)は本文から除去する
// - 空行で区切られたブロックを <p> にし、ブロック内の改行は <br> にする
function captionToParagraphs(caption) {
  if (!caption) return { html: "", lines: [] };
  const normalized = caption.replace(/\r\n?/g, "\n");
  const keptLines = [];
  for (const line of normalized.split("\n")) {
    const withoutTags = line.replace(HASHTAG_RE, "").trim();
    // ハッシュタグだけの行(除去後に中身が無い)は捨てる
    if (line.trim() && withoutTags === "") continue;
    keptLines.push(line);
  }

  const blocks = [];
  let buffer = [];
  const flush = () => {
    if (buffer.length) {
      blocks.push(buffer.join("\n"));
      buffer = [];
    }
  };
  for (const line of keptLines) {
    if (line.trim() === "") flush();
    else buffer.push(line);
  }
  flush();

  const html = blocks
    .map((block) => {
      const inner = escapeHtml(block).replace(/\n/g, "<br>\n");
      return `<p>${inner}</p>`;
    })
    .join("\n");

  return { html, lines: keptLines };
}

// 記事本文 HTML を組み立てる。
// imageUrls は Shopify にホスティング済みの永続URL、permalink は出典リンク。
export function buildArticle({ caption, imageUrls, permalink, timestamp, altBase }) {
  const { html: bodyHtml, lines } = captionToParagraphs(caption);
  const title = deriveTitle(lines, timestamp);
  const tags = extractHashtags(caption);

  const [featured, ...rest] = imageUrls;
  const alt = escapeHtml(altBase || title);

  const galleryHtml = rest
    .map(
      (url, i) =>
        `<p><img src="${url}" alt="${alt}（${i + 2}）" loading="lazy"></p>`
    )
    .join("\n");

  const sourceHtml = permalink
    ? `<p><a href="${permalink}" target="_blank" rel="noopener nofollow">Instagram でこの投稿を見る</a></p>`
    : "";

  const parts = [bodyHtml, galleryHtml, sourceHtml].filter(Boolean);

  return {
    title,
    tags,
    featuredImage: featured || null,
    bodyHtml: parts.join("\n"),
  };
}
