import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ローカル実行時のみ、同ディレクトリの .env を読み込む。
// GitHub Actions では Secrets が環境変数として渡るため .env は不要。
function loadDotenv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "..", ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `環境変数 ${name} が設定されていません。README のセットアップ手順を確認してください。`
    );
  }
  return value;
}

export const config = {
  instagram: {
    // Instagram ログイン方式(graph.instagram.com)を使うため IG_USER_ID は不要。
    // API が "me" でログイン中アカウント自身の投稿を返す。
    accessToken: required("IG_ACCESS_TOKEN"),
    graphVersion: process.env.IG_GRAPH_VERSION || "v21.0",
  },
  shopify: {
    store: required("SHOPIFY_STORE"), // 例: so-thing.myshopify.com
    // Dev Dashboard アプリは client credentials grant でアクセストークンを都度取得する
    clientId: required("SHOPIFY_CLIENT_ID"),
    clientSecret: required("SHOPIFY_CLIENT_SECRET"),
    apiVersion: process.env.SHOPIFY_API_VERSION || "2026-07",
    blogId: process.env.SHOPIFY_BLOG_ID || null, // 未指定なら自動解決
  },
  // 1回の実行で取り込む最大件数(初回の大量取り込み・レート制限を避ける)
  maxPosts: Number(process.env.MAX_POSTS || 10),
  // true の場合、Shopify への書き込みを行わず動作内容だけ表示する
  dryRun: /^(1|true|yes)$/i.test(process.env.DRY_RUN || ""),
  // 記事を published(即時公開)にするか。既定は下書き。
  publish: /^(1|true|yes)$/i.test(process.env.PUBLISH || ""),
};

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
