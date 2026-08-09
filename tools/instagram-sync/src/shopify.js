import { config, sleep } from "./config.js";

const { store, adminToken, apiVersion } = config.shopify;
const REST_BASE = `https://${store}/admin/api/${apiVersion}`;
const GRAPHQL_URL = `${REST_BASE}/graphql.json`;

async function shopifyRest(path, { method = "GET", body } = {}) {
  const res = await fetch(`${REST_BASE}${path}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": adminToken,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(
      `Shopify REST エラー (${res.status}) ${method} ${path}: ${text}`
    );
  }
  return json;
}

async function shopifyGraphql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": adminToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL エラー: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// 記事を書き込むブログを決める。SHOPIFY_BLOG_ID 未指定なら先頭のブログを使う。
export async function resolveBlogId() {
  if (config.shopify.blogId) return config.shopify.blogId;
  const { blogs } = await shopifyRest("/blogs.json");
  if (!blogs || blogs.length === 0) {
    throw new Error(
      "Shopify にブログがありません。管理画面 > オンラインストア > ブログ記事 で先にブログを作成してください。"
    );
  }
  return String(blogs[0].id);
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

// ブログ記事を作成する。既定は下書き(published:false)。
export async function createArticle(blogId, { title, bodyHtml, tags, featuredImage, publishedAt }) {
  const article = {
    title,
    body_html: bodyHtml,
    tags: (tags || []).join(", "),
    published: config.publish,
    published_at: config.publish ? publishedAt : undefined,
    author: "So_thing.",
  };
  if (featuredImage) {
    article.image = { src: featuredImage, alt: title };
  }
  const { article: created } = await shopifyRest(
    `/blogs/${blogId}/articles.json`,
    { method: "POST", body: { article } }
  );
  return created;
}
