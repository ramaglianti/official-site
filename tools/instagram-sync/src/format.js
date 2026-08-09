// Instagram のキャプション(SNS向けの改行・ハッシュタグ多め)を、
// 読みやすいブログ記事の HTML に整形する。

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 半角/全角スペースを跨がないハッシュタグを拾う(半角#・全角＃、日本語タグに対応)。
const HASHTAG_RE = /[#＃][^\s#＃、。,.!！?？]+/gu;

// 意味のある文字(文字・数字)を含むか。含まなければ「.」やスペーサー行とみなす。
function hasMeaning(text) {
  return /[\p{L}\p{N}]/u.test(text);
}

// Instagram で余白づくりに使われる「.」だけ等の装飾行(中身が文字・数字を持たない行)。
function isSpacerLine(line) {
  const t = line.trim();
  return t !== "" && !hasMeaning(t.replace(HASHTAG_RE, ""));
}

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

// 本文からタイトルを作る(先頭の「意味のある行」を短く切り出す)。
// 「.」やスペーサー行・ハッシュタグだけの行は飛ばす。
function deriveTitle(bodyLines, timestamp) {
  for (const line of bodyLines) {
    const clean = line.replace(HASHTAG_RE, "").trim();
    if (clean && hasMeaning(clean)) {
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
// - ハッシュタグだけの行(末尾のタグ羅列)や「.」だけのスペーサー行は本文から除去する
// - 空行で区切られたブロックを <p> にし、ブロック内の改行は <br> にする
function captionToParagraphs(caption) {
  if (!caption) return { html: "", lines: [] };
  const normalized = caption.replace(/\r\n?/g, "\n");
  const keptLines = [];
  for (const line of normalized.split("\n")) {
    // ハッシュタグだけ/「.」などスペーサーだけの行(文字・数字を持たない行)は捨てる
    if (isSpacerLine(line)) continue;
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
