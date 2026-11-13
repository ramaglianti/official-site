// Instagram の長期アクセストークンを延長(refresh)する。
// 成功したら新トークンを TOKEN_OUT_FILE に書き出す(ワークフローがそれをSecretへ保存)。
// どんな失敗でもパイプライン本体は止めない(警告のみ・exit 0)。
import { writeFileSync } from "node:fs";

const accessToken = process.env.IG_ACCESS_TOKEN;
const graphVersion = process.env.IG_GRAPH_VERSION || "v21.0";
const outFile = process.env.TOKEN_OUT_FILE;

async function main() {
  if (!accessToken) {
    console.warn("IG_ACCESS_TOKEN 未設定。トークン延長をスキップします。");
    return;
  }
  // Instagram ログイン方式の長期トークン延長エンドポイント。
  // 条件: トークンが有効で、発行から24時間以上経過していること。延長後は約60日有効。
  const url =
    `https://graph.instagram.com/${graphVersion}/refresh_access_token` +
    `?grant_type=ig_refresh_token` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  let json = {};
  try {
    const res = await fetch(url);
    json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      console.warn(
        `トークン延長をスキップ (HTTP ${res.status}): ${JSON.stringify(json.error || json)}`
      );
      return;
    }
  } catch (e) {
    console.warn("トークン延長エラー:", e.message);
    return;
  }

  if (outFile) writeFileSync(outFile, json.access_token, "utf8");
  const days = Math.round((json.expires_in || 0) / 86400);
  console.log(`Instagramトークンを延長しました(有効 約${days}日)。`);
}

main();
