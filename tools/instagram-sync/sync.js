import { config } from "./src/config.js";
import { fetchRecentMedia, imageUrlsOf } from "./src/instagram.js";
import { buildArticle } from "./src/format.js";
import { resolveBlogId, hostImage, createArticle } from "./src/shopify.js";
import { loadImported, saveImported } from "./src/state.js";

async function main() {
  const imported = loadImported();
  console.log(`取り込み済み: ${imported.size} 件 / dryRun=${config.dryRun} / publish=${config.publish}`);
  // 診断: 値の中身は出さず、ストア名とトークン長・末尾4文字だけ確認(欠け・取り違え検出用)
  const tok = config.shopify.adminToken;
  console.log(
    `診断: SHOPIFY_STORE="${config.shopify.store}" / token長=${tok.length} / token末尾=${tok.slice(-4)}`
  );

  // 取り込み済みを除いて maxPosts 件に達するよう、多めに取得してから絞る。
  const media = await fetchRecentMedia(config.maxPosts * 3);
  const pending = media
    .filter((m) => !imported.has(m.id))
    .filter((m) => imageUrlsOf(m).length > 0) // 画像なし(単独動画等)は対象外
    .slice(0, config.maxPosts);

  console.log(`新規候補: ${pending.length} 件`);
  if (pending.length === 0) {
    console.log("新規投稿はありません。");
    return;
  }

  const blogId = config.dryRun ? "(dry-run)" : await resolveBlogId();
  let created = 0;

  for (const m of pending) {
    const imageUrls = imageUrlsOf(m);
    const draft = buildArticle({
      caption: m.caption,
      imageUrls, // まだ Instagram の一時URL
      permalink: m.permalink,
      timestamp: m.timestamp,
      altBase: "So_thing.",
    });

    console.log(`\n─ ${m.id} :: ${draft.title}`);
    console.log(`  画像 ${imageUrls.length} 枚 / タグ ${draft.tags.length} 個`);

    if (config.dryRun) {
      created++;
      continue;
    }

    // Instagram の一時URLを Shopify Files に取り込み、永続URLへ差し替える。
    const hosted = [];
    for (const url of imageUrls) {
      hosted.push(await hostImage(url, draft.title));
    }
    const finalArticle = buildArticle({
      caption: m.caption,
      imageUrls: hosted,
      permalink: m.permalink,
      timestamp: m.timestamp,
      altBase: "So_thing.",
    });

    const article = await createArticle(blogId, {
      title: finalArticle.title,
      bodyHtml: finalArticle.bodyHtml,
      tags: finalArticle.tags,
      publishedAt: m.timestamp,
    });
    console.log(`  ✓ 記事作成 (id=${article.id}, published=${article.isPublished})`);

    imported.add(m.id);
    saveImported(imported); // 途中失敗しても既取り込み分は保持
    created++;
  }

  console.log(`\n完了: ${created} 件処理しました。`);
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
