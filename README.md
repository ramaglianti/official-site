# Ramaglianti 統合トップサイト

デザイン事務所 Ramaglianti / ジュエリーブランド So_thing. / スペシャルティコーヒー Caffè Ramaglianti
の3事業をまとめた1ページサイトです。維持費0円のGitHub Pagesでの公開を前提にしています。

## ファイル構成

```
index.html              ← このサイトの全て（HTML/CSS/JSを1ファイルに内包）
assets/ramaglianti-logo.png  ← ロゴ画像（ヘッダー・フッターで使用）
README.md               ← このファイル
```

`index.html` と `assets` フォルダは必ず同じ階層に置いてください（相対パスで読み込んでいます）。
外部リクエストはGoogle Fonts（無料CDN）のみで、サーバーサイドの処理は一切ありません。

配色は全ページ共通でネイビー `#192243`（ロゴと同色）＋白のみを使用しています。

## GitHub Pagesでの公開手順（無料）

1. GitHubで新しいリポジトリを作成します（例: `ramaglianti-top`）。Publicでも Privateでも公開可能です。
2. このフォルダの `index.html` をリポジトリの一番上の階層にアップロードします。
   - GitHubの画面右上の「Add file」→「Upload files」からドラッグ＆ドロップでもOKです。
3. リポジトリの `Settings` → 左メニューの `Pages` を開きます。
4. `Source` を `Deploy from a branch` にし、Branchを `main`（フォルダは `/root`）に設定して `Save`。
5. 数分待つと `https://<あなたのGitHubユーザー名>.github.io/ramaglianti-top/` で公開されます。

### 独自ドメインを使う場合（任意）
`so-thing-jp.com` や `caffe.ramaglianti.com` と対になる形で、例えば `ramaglianti.com` のような
親ドメインをお持ちの場合は、同じ`Pages`設定画面の「Custom domain」に入力し、
ドメイン管理画面側でCNAME（またはApexならAレコード）をGitHub Pages向けに設定してください。
ドメイン費用（年間数千円程度）以外は引き続き0円です。

## あとで調整しやすい場所

- **ロゴ画像の差し替え**
  `assets/ramaglianti-logo.png` を新しいファイルに上書き（同じファイル名）すれば、
  ヘッダー・フッター両方に自動で反映されます。表示サイズを変えたい場合は
  `index.html` 内の `.logo-img { height:22px; }` と `.logo-img--footer { height:20px; }` を調整してください。

- **文章・連絡先の変更**
  日本語のコピーやメールアドレス・電話番号・住所はすべて `index.html` 内に直接書かれています。
  該当のテキストを検索して書き換えるだけで反映されます。

- **配色**
  ファイル冒頭の `:root { --paper:#FFFFFF; --ink:#192243; ... }` を
  変更すると、サイト全体の配色に反映されます。

## 動作確認

ダブルクリックしてブラウザで開くだけでそのまま確認できます（ローカルサーバー不要）。
