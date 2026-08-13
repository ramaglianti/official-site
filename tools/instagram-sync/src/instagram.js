import { config } from "./config.js";

const FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "children{id,media_type,media_url,thumbnail_url}",
].join(",");

// Instagram Graph API から投稿を取得する(新しい順)。
// skipIds(取り込み済み)は飛ばし、未取り込みが limit 件集まるまで古い方へページをたどる。
// これにより実行を繰り返すだけで全履歴を最後まで遡れる(古い投稿もいずれ到達する)。
export async function fetchRecentMedia(limit, skipIds = new Set()) {
  const { accessToken, graphVersion } = config.instagram;
  const collected = [];
  // Instagram ログイン方式: graph.instagram.com の /me/media を使う。1ページ最大50件。
  let url =
    `https://graph.instagram.com/${graphVersion}/me/media` +
    `?fields=${encodeURIComponent(FIELDS)}` +
    `&limit=50` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  let pages = 0;
  const MAX_PAGES = 60; // 安全上限(~3000投稿分)。無限ループ・過剰リクエスト防止。
  while (url && collected.length < limit && pages < MAX_PAGES) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.error) {
      const e = json.error || {};
      const detail = [
        e.message && `message="${e.message}"`,
        e.code != null && `code=${e.code}`,
        e.error_subcode != null && `subcode=${e.error_subcode}`,
        e.type && `type=${e.type}`,
        e.fbtrace_id && `fbtrace_id=${e.fbtrace_id}`,
      ]
        .filter(Boolean)
        .join(" / ");
      throw new Error(
        `Instagram API エラー (HTTP ${res.status}): ${detail || res.statusText}`
      );
    }
    for (const item of json.data || []) {
      if (skipIds.has(item.id)) continue; // 取り込み済みは飛ばす
      collected.push(item);
      if (collected.length >= limit) break;
    }
    url = json.paging?.next || null;
    pages++;
  }
  return collected;
}

// 投稿から表示可能な画像URLの一覧を取り出す。
// 動画は静止画サムネイルで代用する。
export function imageUrlsOf(media) {
  const urls = [];
  const pick = (m) => {
    if (m.media_type === "VIDEO") return m.thumbnail_url || null;
    return m.media_url || null;
  };
  if (media.media_type === "CAROUSEL_ALBUM" && media.children?.data) {
    for (const child of media.children.data) {
      const u = pick(child);
      if (u) urls.push(u);
    }
  } else {
    const u = pick(media);
    if (u) urls.push(u);
  }
  return urls;
}
