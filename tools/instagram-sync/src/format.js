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

// タイトルは投稿日を「YYYY.MM.DD」形式(日本時間)で作る。
function deriveTitle(bodyLines, timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}.${get("month")}.${get("day")}`;
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

  // 先頭画像は記事の「表紙画像」に使う(createArticle 側で image 欄に設定)。
  // 本文には2枚目以降(ギャラリー)を埋め込む(表紙との重複を避ける)。
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
