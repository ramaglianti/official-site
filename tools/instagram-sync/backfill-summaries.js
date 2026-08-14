import { config } from "./src/config.js";
import {
  resolveBlogId,
  getAllArticles,
  updateArticleSummary,
} from "./src/shopify.js";

// 既存記事の本文HTMLから、一覧用の抜粋(先頭 maxLen 文字)を生成する。
// 画像・リンク(出典)・タグを取り除いてテキストだけにする。
function summaryFromBody(html, maxLen = 100) {
  const text = (html || "")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<a[^>]*>[\s\S]*?<\/a>/gi, " ") // リンク(出典など)を除去
    .replace(/<[^>]+>/g, " ") // 残りのタグを除去
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

async function main() {
  // FORCE=true で、既に抜粋がある記事も上書きする(文字数変更時などに使う)。
  const force = /^(1|true|yes)$/i.test(process.env.FORCE || "");
  const maxLen = Number(process.env.SUMMARY_LEN || 100);

  const blogId = await resolveBlogId();
  const articles = await getAllArticles(blogId);
  console.log(
    `記事 ${articles.length} 件を確認 / dryRun=${config.dryRun} / force=${force} / 文字数=${maxLen}`
  );

  let updated = 0;
  for (const a of articles) {
    if (a.summary && a.summary.trim() && !force) continue; // 既に抜粋あり
    const summary = summaryFromBody(a.body, maxLen);
    if (!summary) continue;

    if (config.dryRun) {
      console.log(`(dry) ${a.title} :: ${summary}`);
      updated++;
      continue;
    }
    await updateArticleSummary(a.id, summary);
    console.log(`✓ ${a.title}`);
    updated++;
  }
  console.log(`完了: ${updated} 件の抜粋を更新しました。`);
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
