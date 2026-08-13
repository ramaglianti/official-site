# Instagram → Shopify 同期パイプライン

So_thing. の Instagram 投稿(画像＋キャプション)を取得し、Shopify のブログ記事として
**下書き(draft)**で自動作成する仕組みです。GEO(生成AIエンジン最適化)のために、
Instagram に溜まっている一次情報を、AIクローラーが読める自社ドメインのテキストへ移すのが目的です。

- 実行環境: **GitHub Actions**(毎週自動 ＋ 手動実行)
- 記事の状態: **下書き**で作成 → 人が確認して公開(誤字・文体を整えてから公開できる)
- 画像: Instagram のCDN URLは数日で失効するため、**Shopify Files に取り込んで永続URL化**してから記事に埋め込む
- 二重投稿防止: 取り込み済みメディアIDを `data/imported.json` に記録

```
tools/instagram-sync/
  sync.js            エントリポイント
  src/
    config.js        環境変数の読み込み・検証
    instagram.js     Instagram Graph API から投稿取得
    format.js        キャプション → 記事HTMLへ整形(ハッシュタグ除去など)
    shopify.js       画像ホスティング＋ブログ記事作成
    state.js         取り込み済みIDの管理
  data/imported.json 取り込み済みメディアID(自動更新)
  .env.example       ローカル実行用の設定サンプル
```

---

## 全体の流れ

1. **Instagram Graph API** で自分の投稿一覧(キャプション＋画像URL)を取得
2. 未取り込みの投稿を選ぶ(`data/imported.json` で判定)
3. 画像を **Shopify Files** に取り込み、永続URLを得る
4. キャプションを整形して **ブログ記事(下書き)** を作成
5. 取り込み済みIDを記録し、コミットして次回に備える

---

## セットアップ

必要な値は3つ(＋任意1つ)。すべて GitHub のリポジトリ Secrets に登録します。

| Secret 名 | 内容 |
|---|---|
| `IG_ACCESS_TOKEN` | Instagram API(Instagramログイン方式)のアクセストークン |
| `SHOPIFY_STORE` | `xxxxx.myshopify.com` 形式のストアドメイン |
| `SHOPIFY_CLIENT_ID` | Dev Dashboard アプリの「資格情報」クライアントID |
| `SHOPIFY_CLIENT_SECRET` | Dev Dashboard アプリの「資格情報」シークレット |
| `SHOPIFY_BLOG_ID` | (任意)特定ブログに入れたい場合のみ。未設定なら先頭のブログ |

> **Shopify のトークンについて**: Dev Dashboard で作成したアプリには静的な Admin API トークンが無く、
> 実行のたびに `client_id` + `client_secret` を `POST /admin/oauth/access_token`(`grant_type=client_credentials`)
> で交換して24時間有効のトークンを取得します。コードが自動で行うので、手動更新は不要です。

> このパイプラインは **Instagram ログイン方式(`graph.instagram.com`)** を使います。
> Facebookページ連携は不要で、`IG_USER_ID` も不要(API が `me` で自分の投稿を返す)。
> 用意するのは `IG_ACCESS_TOKEN` だけです。

### A. Instagram アクセストークンの取得

前提: **Instagram をプロアカウント(ビジネス/クリエイター)**にしておく
(Instagram アプリ > 設定 > アカウントの種類とツール、から切替)。

1. **Meta for Developers** (https://developers.facebook.com) にログインし、アプリを作成
   (ユースケースは「Instagram」/「Instagramでメッセージとコンテンツを管理」を選ぶ)。
2. アプリのダッシュボード → 左メニューの鉛筆アイコン → **「ユースケースをカスタマイズ」**を開く。
3. 左側で **「Instagramログインによる API設定」** を選ぶ。
4. **「1. 必要なメッセージアクセス許可を追加する」** の **「Add all required permissions」** を押す
   (`instagram_business_basic` などが付く。投稿の読み取りに必要)。
5. **「2. アクセストークンを生成する」** の **「アカウントを追加」** を押す
   → Instagram ログインのポップアップで **So_thing. のアカウントでログイン**して許可
   → 生成された **アクセストークン**をコピー。これが **`IG_ACCESS_TOKEN`**。
   - ※「テスターの役割を割り当てて」と出たら、**「役割(Roles)」タブ**で自分のInstagram
     アカウントをテスターに追加してから、再度「アカウントを追加」する。
6. Webhooks(手順3)や Facebookログイン(手順4)、アプリレビュー(手順5)は今回は不要。

> **トークンの有効期限について**: このトークンは約60日で失効します。運用を止めないために、
> 60日ごとに再生成するか、`graph.instagram.com/refresh_access_token` で更新してください。
> 自動更新の仕組みが必要になったら、パイプラインに更新処理を追加できます(別途相談)。

### B. Shopify 認証情報の取得(Dev Dashboard 方式)

新しい Shopify ストアではカスタムアプリが **Dev Dashboard** に一本化されており、静的な
`shpat_` トークンは発行されません。代わりに **クライアントID + シークレット** を使います。

1. Shopify 管理画面 → **設定 → アプリ → アプリを開発する** → **Dev Dashboard でアプリを開発**。
2. **アプリを作成**(名前は任意)。**「設定(Configuration)」** で Admin API スコープを付与:
   - `write_content` / `read_content`(ブログ記事の作成に必要)
   - `write_files` / `read_files`(画像の取り込みに必要)
3. アプリを **ストアにインストール**(配布/インストールの導線から so-thing ストアへ)。
4. アプリの **「設定」→「資格情報」** にある **クライアントID** と **シークレット(「表示」で確認)** をコピー:
   - クライアントID → `SHOPIFY_CLIENT_ID`
   - シークレット → `SHOPIFY_CLIENT_SECRET`
5. `SHOPIFY_STORE` は **設定 → ドメイン** に表示される `xxxxx.myshopify.com`(独自ドメインではない方)。
6. ブログが無ければ **オンラインストア → ブログ記事** で作成しておく。

> コードは実行時に `POST https://{SHOPIFY_STORE}/admin/oauth/access_token`
> (`grant_type=client_credentials`)でアクセストークン(24時間有効)を取得し、
> `X-Shopify-Access-Token` ヘッダで Admin API(GraphQL)を呼びます。トークンの手動管理は不要です。

### C. GitHub Secrets への登録

リポジトリ → **Settings → Secrets and variables → Actions → New repository secret**
で、上表の値をひとつずつ登録します。

---

## 動かし方

### まず動作確認(書き込みなし)

GitHub の **Actions タブ → 「Instagram → Shopify 同期」→ Run workflow** で、
`dry_run` を `true` にして実行。取得件数・タイトル・画像枚数だけをログ出力し、Shopify には何も書きません。

### 本番実行

`dry_run` を `false`(既定)で Run workflow。ブログに**下書き**が作成されます。
Shopify 管理画面でタイトル・本文・文体を確認し、問題なければ公開してください。

以後は毎週月曜 09:00(JST)に自動実行され、前回以降の新規投稿だけが追加されます。

### 過去投稿の一括取り込み(バックフィル)

初回は反響の大きかった投稿だけを手動で選ぶ方が引用されやすい記事になりますが、
まとめて入れたい場合は `max_posts` を大きく(例: `50`)して実行してください。
`data/imported.json` で重複は自動的に避けられます。

### ローカルで試す場合(任意)

Node 20 以上が必要です。

```bash
cd tools/instagram-sync
cp .env.example .env   # 値を埋める
DRY_RUN=true node sync.js
```

---

## 調整ポイント

- **実行頻度**: `.github/workflows/instagram-sync.yml` の `cron` を変更。
- **即時公開にする**: 環境変数 `PUBLISH=true`。ただし文体・誤字を人が直せる**下書き運用を推奨**。
- **キャプションの整形ルール**: `src/format.js`。行全体がハッシュタグの行を除去し、
  空行区切りを段落にしています。ブランドのトーンに合わせてここを調整できます。
- **タイトルの付け方**: 現在はキャプション先頭行を40字で切り出し。`src/format.js` の `deriveTitle` を編集。

## 注意

- 動画のみの投稿は静止画サムネイルで代用します。画像が無い投稿はスキップします。
- `data/imported.json` はワークフローが自動でコミットします。手動で消すと再取り込みされます。
- Instagram / Shopify の利用規約の範囲での利用にとどめてください(自分のアカウント・自ストアの範囲での運用を想定)。
