import { config, sleep } from "./config.js";

const { store, clientId, clientSecret, apiVersion } = config.shopify;
const GRAPHQL_URL = `https://${store}/admin/api/${apiVersion}/graphql.json`;
const TOKEN_URL = `https://${store}/admin/oauth/access_token`;

// Dev Dashboard アプリのアクセストークンは client credentials grant で都度取得する
// (静的トークンは無く、client_id + client_secret を交換する。有効約24時間)。
let cachedToken = null;
async function getAccessToken() {
  if (cachedToken) return cachedToken;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Shopify トークン取得エラー (HTTP ${res.status}): ${text}`);
  }
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Shopify トークン取得エラー (HTTP ${res.status}): ${JSON.stringify(json)}`
    );
  }
  cachedToken = json.access_token;
  return cachedToken;
}

// Shopify Admin API はすべて GraphQL で呼ぶ。
// (Dev Dashboard で作成した新しいアプリは REST が使えず GraphQL 前提のため)
async function shopifyGraphql(query, variables) {
  const token = await getAccessToken();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Shopify GraphQL エラー (HTTP ${res.status}): ${text}`);
  }
  if (!res.ok || json.errors) {
    throw new Error(
      `Shopify GraphQL エラー (HTTP ${res.status}): ${JSON.stringify(json.errors || text)}`
    );
  }
  return json.data;
}

// 記事を書き込むブログを決める。SHOPIFY_BLOG_ID 未指定なら先頭のブログを使う。
export async function resolveBlogId() {
  const configured = config.shopify.blogId;
  if (configured) {
    return configured.startsWith("gid://")
      ? configured
      : `gid://shopify/Blog/${configured}`;
  }
  const data = await shopifyGraphql(
    `query { blogs(first: 20) { nodes { id title } } }`
  );
  const blogs = data.blogs?.nodes || [];
  if (blogs.length === 0) {
    throw new Error(
      "Shopify にブログがありません。管理画面 > オンラインストア > ブログ記事 で先にブログを作成してください。"
    );
  }
  return blogs[0].id; // gid://shopify/Blog/xxxxx
}

// 画像URL(Instagram CDN 等)を Shopify Files に取り込み、永続URLを返す。
// fileCreate は非同期処理なので READY になるまでポーリングする。
export async function hostImage(sourceUrl, alt) {
  const create = await shopifyGraphql(
    `mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus alt ... on MediaImage { image { url } } }
        userErrors { field message }
      }
    }`,
    {
      files: [
        { originalSource: sourceUrl, contentType: "IMAGE", alt: alt || "" },
      ],
    }
  );

  const errs = create.fileCreate.userErrors;
  if (errs && errs.length) {
    throw new Error(`fileCreate 失敗: ${JSON.stringify(errs)}`);
  }
  const file = create.fileCreate.files[0];

  // READY になり image.url が付くまで待つ(最大 ~30 秒)
  let url = file.image?.url || null;
  let status = file.fileStatus;
  const id = file.id;
  for (let i = 0; i < 15 && (status !== "READY" || !url); i++) {
    await sleep(2000);
    const data = await shopifyGraphql(
      `query($id: ID!) {
        node(id: $id) { ... on MediaImage { fileStatus image { url } } }
      }`,
      { id }
    );
    status = data.node?.fileStatus;
    url = data.node?.image?.url || url;
    if (status === "FAILED") throw new Error(`画像の取り込みに失敗: ${sourceUrl}`);
  }
  if (!url) throw new Error(`画像URLを取得できませんでした: ${sourceUrl}`);
  return url;
}

// ブログ記事を作成する。既定は下書き(isPublished:false)。
// 表紙画像は image 欄に、公開日(並び順の基準)は publishDate に投稿日を設定する。
export async function createArticle(blogId, { title, bodyHtml, tags, summary, featuredImage, publishDate }) {
  const article = {
    blogId,
    title,
    body: bodyHtml,
    tags: tags || [],
    isPublished: config.publish,
    author: { name: "So_thing." },
  };
  if (summary) article.summary = summary; // 一覧用の抜粋
  // 公開する場合は投稿日を公開日に設定(過去日OK)。ブログはこの日付の新しい順に並ぶ。
  if (config.publish && publishDate) article.publishDate = publishDate;
  if (featuredImage) {
    article.image = { url: featuredImage, altText: title };
  }

  const data = await shopifyGraphql(
    `mutation articleCreate($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id title handle isPublished }
        userErrors { code field message }
      }
    }`,
    { article }
  );
  const errs = data.articleCreate.userErrors;
  if (errs && errs.length) {
    throw new Error(`記事作成 失敗: ${JSON.stringify(errs)}`);
  }
  return data.articleCreate.article;
}

// ブログ内の全記事を取得(ページング)。id/title/summary/body を返す。
export async function getAllArticles(blogId) {
  const all = [];
  let cursor = null;
  do {
    const data = await shopifyGraphql(
      `query($id: ID!, $cursor: String) {
        blog(id: $id) {
          articles(first: 50, after: $cursor) {
            nodes { id title summary body }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: blogId, cursor }
    );
    const conn = data.blog?.articles;
    if (!conn) break;
    all.push(...conn.nodes);
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (cursor);
  return all;
}

// 記事の抜粋(summary)を更新する。
export async function updateArticleSummary(id, summary) {
  const data = await shopifyGraphql(
    `mutation($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id }
        userErrors { field message }
      }
    }`,
    { id, article: { summary } }
  );
  const errs = data.articleUpdate.userErrors;
  if (errs && errs.length) {
    throw new Error(`記事更新 失敗: ${JSON.stringify(errs)}`);
  }
  return data.articleUpdate.article;
}
