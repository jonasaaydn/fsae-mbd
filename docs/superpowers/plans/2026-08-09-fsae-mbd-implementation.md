# 学生フォーミュラのモデルベース開発 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI応用の記事サイト（記事364本）を全消去し、学生フォーミュラ車両のMBD開発を教える48章構成の教科書サイトへ作り替える。今回は基盤・骨格・第1章まで。

**Architecture:** Astro v4 静的サイト。章は `src/content/chapters/` の MDX。段や重要度のような自己申告メタデータは持たせず、`prereq` / `software` / `toolbox` / `math` という事実だけを持たせて、目次・前提ナビ・必要環境表示をそこから自動生成する。図は `src/components/figures/` の SVG コンポーネントとして部品化し、章をまたいで再利用する。

**Tech Stack:** Astro 4.16 / @astrojs/mdx / @astrojs/sitemap 3.4.1 / Pagefind / GitHub Pages / MATLAB・Simulink（章のコード検証用）

## Global Constraints

- **仕様書**: `docs/superpowers/specs/2026-08-09-fsae-mbd-design.md`。矛盾したら仕様書が正。
- **この計画の範囲**: サイト基盤・48章分の骨格ファイル・第1章の実行検証つき公開・ビジュアル設計まで。**第2章以降の執筆は含まない**。
- **段（rung）や重要度を frontmatter に書かせない**。自己申告メタデータは `importance`(346/350がhigh)・`mbd_relevance`(lowが0本) で2度死んでいる。
- **数値には出所を付ける**。許容するのは (1) 自分で実行した値 (2) 一次ソースURL付きの値 (3) 空欄「あなたの環境: ___」の3つだけ。
- **実行していない出力を「実行すると以下が出力されます」と書かない**。未実行なら「出力の形式（未実測）」。
- **記事は 350/350 が CRLF**。ファイルを機械処理するときは改行を保つ。
- **`@astrojs/sitemap` は 3.4.x に固定**（3.5+ は Astro 5 必須でビルドが落ちる）。
- **内部リンクは必ず `import.meta.env.BASE_URL` を使う**（絶対パスは GitHub Pages のサブパス配下で404）。
- **テストフレームワークは無い**。各タスクの検証は `npm run build` の成功と、生成物 `dist/` への実アサーション（grep）で行う。
- 図の色規則: **速度＝青 `#2563eb` / 力＝赤 `#dc2626` / 幾何＝黒 `#0f172a`**。破線は基準・補助線。

---

## 前提条件（Task 1 より前に完了していること）

- [ ] **記事生成ルーティンを停止する**（運営者の作業）

  claude.ai/code/routines で、記事を生成するルーティン6本（text / 8am / 12pm /
  student-midnight / student-8am / student-12pm）と roundup・glossary・QA・weekly を停止する。
  **linkcheck だけ残す**。

  **なぜ Task 8 より前でなければならないか**: Task 8 で `src/content/blog/` を削除するが、
  その後にルーティンが発火すると GitHub API 経由で削除したディレクトリに記事を書き戻す。
  さらに Task 9 でリポジトリを改称すると、ルーティンは旧名 `mbd-ai-lab` を叩き続けて
  失敗するか、予期しない場所に書き込む。

- [x] **main ブランチで直接作業することに運営者が同意済み**（2026-08-09）。
  デプロイが main への push で発火し、Task 9・12 の本番検証がそのまま行えるため。

---

## File Structure

| ファイル | 責務 |
|---|---|
| `src/content/config.ts` | 章コレクションのスキーマ定義 |
| `src/utils/parts.ts` | 6つの部の定義（番号・ローマ数字・題・V字工程） |
| `src/utils/chapters.ts` | 章の取得・整列・前提解決（全ページが使う唯一の入口） |
| `src/content/chapters/*.mdx` | 章本体。48ファイル |
| `src/pages/curriculum.astro` | 目次。部ごとに全章を並べる |
| `src/pages/ch/[slug].astro` | 章ページ。前提ナビと必要環境ブロック |
| `src/pages/notation.astro` | 記号表 |
| `src/pages/software.astro` | 必要なソフトと入手方法 |
| `src/pages/index.astro` | 全体像と進捗 |
| `src/components/figures/FigureFrame.astro` | 図の共通枠（番号・キャプション・SVG定義） |
| `src/components/figures/*.astro` | 個別の図 |
| `scripts/scaffold-chapters.mjs` | 48章の骨格ファイル生成（1回だけ実行） |
| `scripts/verify-site.mjs` | 受け入れ基準の自動確認 |

---

## Task 1: MDX統合と章コレクションのスキーマ

**Files:**
- Modify: `package.json`（依存追加）
- Modify: `astro.config.mjs:1-24`（mdx 統合を登録）
- Modify: `src/content/config.ts:1-39`（chapters コレクションを追加。blog は残す）
- Create: `src/content/chapters/01-coordinates.mdx`（疎通確認用の最小1章）

**Interfaces:**
- Produces: `chapters` コレクション。フィールドは `part:number, chapter:number, title:string, summary:string, status:'planned'|'draft'|'published', prereq:string[], software:string[], toolbox:string[], math:string[], verified_on?:string, verified_env?:string`

- [ ] **Step 1: MDX を追加する**

```bash
npm install @astrojs/mdx
```

- [ ] **Step 2: astro.config.mjs に統合を登録する**

`astro.config.mjs` の import 行と `integrations` 配列を次のようにする。**`base` はこのタスクでは変更しない**（Task 9 で行う）。

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://jonasaaydn.github.io',
  base: '/mbd-ai-lab/',
  integrations: [
    mdx(),
    sitemap({
      changefreq: 'daily',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: false,
    },
  },
});
```

- [ ] **Step 3: 章コレクションのスキーマを追加する**

`src/content/config.ts` の末尾、`export const collections` の直前に次を挿入し、`collections` に `chapters` を足す。既存の `blog` はこの時点では消さない（Task 8 で消す。先に消すとビルドが落ちる）。

```ts
// 章（教科書本体）。段や重要度のような自己申告の評価値は持たせない。
// 事実（何が必要か・いつ実行したか）だけを持たせ、表示はコードが組み立てる。
const chapters = defineCollection({
  type: 'content',
  schema: z.object({
    part: z.number().int().min(1).max(6),
    chapter: z.number().int().min(1).max(48),
    title: z.string(),
    summary: z.string(),
    /** planned=未執筆（目次には出る） / draft=執筆中 / published=公開 */
    status: z.enum(['planned', 'draft', 'published']),
    /** 前提章の slug */
    prereq: z.array(z.string()).default([]),
    software: z.array(z.string()).default([]),
    /** 必要な MATLAB Toolbox。入手可否に直結するので明示する */
    toolbox: z.array(z.string()).default([]),
    math: z.array(z.string()).default([]),
    /** 実際にコードを実行して出力を確認した日（YYYY-MM-DD）。実行した時だけ書く */
    verified_on: z.string().optional(),
    verified_env: z.string().optional(),
  }),
});

export const collections = { blog, chapters };
```

既存末尾の `export const collections = { blog };` は削除する。

- [ ] **Step 4: 疎通確認用の章を1つ作る**

`src/content/chapters/01-coordinates.mdx` を作成する。

```mdx
---
part: 1
chapter: 1
title: "座標系と符号規約"
summary: "ISO と SAE で符号が違う。実測データを読む前にこれを確認しないと、結論が反転する。"
status: "draft"
prereq: []
software: ["MATLAB R2024b"]
toolbox: []
math: ["線形代数"]
---

## この章でできるようになること

車両座標系を定義し、ISO と SAE の符号規約の違いを説明できる。
```

- [ ] **Step 5: ビルドが通ることを確認する**

```bash
npm run build
```

期待: 成功し、`dist/` が生成される。`chapters` はまだページ化していないのでURLは出ない。

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json astro.config.mjs src/content/config.ts src/content/chapters/01-coordinates.mdx
git commit -m "feat: MDX統合と章コレクションのスキーマを追加"
```

---

## Task 2: 部の定義と章の取得ユーティリティ

**Files:**
- Create: `src/utils/parts.ts`
- Create: `src/utils/chapters.ts`

**Interfaces:**
- Consumes: Task 1 の `chapters` コレクション
- Produces:
  - `PARTS: Part[]`（`{ id:number, roman:string, title:string, subtitle:string, vphase:string }`）
  - `getSortedChapters(): Promise<ChapterEntry[]>` — `chapter` 昇順
  - `getChaptersByPart(): Promise<{ part: Part, chapters: ChapterEntry[] }[]>`
  - `getPrereqChapters(entry): Promise<ChapterEntry[]>` — `prereq` の slug を実体に解決
  - `getNextChapters(entry): Promise<ChapterEntry[]>` — その章を `prereq` に持つ章の逆引き
  - `getProgress(): Promise<{ total:number, published:number, byPart: Record<number,{total:number,published:number}> }>`

- [ ] **Step 1: 部の定義を書く**

`src/utils/parts.ts` を作成する。

```ts
// 6つの部。V字モデルの工程に対応する。
export interface Part {
  id: number;
  roman: string;
  title: string;
  subtitle: string;
  /** V字モデル上の位置（トップページで工程を示すのに使う） */
  vphase: string;
}

export const PARTS: Part[] = [
  { id: 1, roman: 'I',   title: '車両運動から始める', subtitle: '全体像を先に立てる',        vphase: 'モデリング' },
  { id: 2, roman: 'II',  title: 'モデルの中身を作り込む', subtitle: 'タイヤ・空力・ブレーキ・操作系・エンジン', vphase: 'モデリング' },
  { id: 3, roman: 'III', title: 'モデルを信じてよくする', subtitle: '同定と検証',            vphase: '検証' },
  { id: 4, roman: 'IV',  title: '車の速さを予測する',   subtitle: 'ラップタイムシミュレーション', vphase: '解析' },
  { id: 5, roman: 'V',   title: '車を賢くする',         subtitle: '制御設計',                vphase: '設計' },
  { id: 6, roman: 'VI',  title: '実装して確かめる',     subtitle: 'SIL / HIL / DIL',        vphase: '実装・検証' },
];

export function getPart(id: number): Part {
  const p = PARTS.find((x) => x.id === id);
  if (!p) throw new Error(`未定義の部: ${id}`);
  return p;
}
```

- [ ] **Step 2: 章の取得ユーティリティを書く**

`src/utils/chapters.ts` を作成する。全ページはここだけを使い、`getCollection('chapters')` を直接呼ばない。

```ts
import { getCollection, type CollectionEntry } from 'astro:content';
import { PARTS, getPart, type Part } from './parts';

export type ChapterEntry = CollectionEntry<'chapters'>;

/** 章番号の昇順。全ページで並び順を統一するための唯一の入口 */
export async function getSortedChapters(): Promise<ChapterEntry[]> {
  const all = await getCollection('chapters');
  return all.sort((a, b) => a.data.chapter - b.data.chapter);
}

export async function getChaptersByPart(): Promise<{ part: Part; chapters: ChapterEntry[] }[]> {
  const sorted = await getSortedChapters();
  return PARTS.map((part) => ({
    part,
    chapters: sorted.filter((c) => c.data.part === part.id),
  }));
}

/** prereq の slug を章の実体に解決する。存在しない slug は無視する */
export async function getPrereqChapters(entry: ChapterEntry): Promise<ChapterEntry[]> {
  const sorted = await getSortedChapters();
  return entry.data.prereq
    .map((slug) => sorted.find((c) => c.slug === slug))
    .filter((c): c is ChapterEntry => Boolean(c));
}

/** この章を prereq に持つ章（＝次に読む章）を逆引きする */
export async function getNextChapters(entry: ChapterEntry): Promise<ChapterEntry[]> {
  const sorted = await getSortedChapters();
  return sorted.filter((c) => c.data.prereq.includes(entry.slug));
}

export async function getProgress() {
  const sorted = await getSortedChapters();
  const isPub = (c: ChapterEntry) => c.data.status === 'published';
  const byPart: Record<number, { total: number; published: number }> = {};
  for (const part of PARTS) {
    const list = sorted.filter((c) => c.data.part === part.id);
    byPart[part.id] = { total: list.length, published: list.filter(isPub).length };
  }
  return { total: sorted.length, published: sorted.filter(isPub).length, byPart };
}

export { PARTS, getPart };
export type { Part };
```

- [ ] **Step 3: 型が通ることを確認する**

```bash
npx astro check 2>&1 | tail -20
```

期待: `chapters.ts` / `parts.ts` に関するエラーが出ない。既存ページの警告は無視してよい。

- [ ] **Step 4: コミット**

```bash
git add src/utils/parts.ts src/utils/chapters.ts
git commit -m "feat: 部の定義と章の取得ユーティリティを追加"
```

---

## Task 3: 目次ページ `/curriculum/`

**Files:**
- Create: `src/pages/curriculum.astro`

**Interfaces:**
- Consumes: `getChaptersByPart()`, `getProgress()`, `PARTS`（Task 2）
- Produces: `/curriculum/` に全48章が部ごとに並ぶ。未執筆章も表示される

- [ ] **Step 1: 目次ページを書く**

`src/pages/curriculum.astro` を作成する。`status` が `published` 以外の章はリンクにせず、テキストとして出す（リンク切れを作らない）。

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getChaptersByPart, getProgress } from '../utils/chapters';

const base = import.meta.env.BASE_URL;
const groups = await getChaptersByPart();
const progress = await getProgress();

const STATUS_LABEL = { planned: '準備中', draft: '執筆中', published: '' } as const;
---

<BaseLayout
  title="目次"
  description="学生フォーミュラ車両のMBD開発を、車両運動から DIL シミュレータまで48章で扱う教科書の目次です。"
  canonicalPath="/curriculum/"
>
  <article class="toc container">
    <header class="toc-head">
      <h1>目次</h1>
      <p class="toc-progress">全 {progress.total} 章のうち {progress.published} 章を公開しています。</p>
    </header>

    {groups.map(({ part, chapters }) => (
      <section class="part">
        <h2 class="part-title">
          <span class="part-roman">第{part.roman}部</span>
          {part.title}
          <span class="part-count">{progress.byPart[part.id].published} / {progress.byPart[part.id].total} 章</span>
        </h2>
        <p class="part-sub">{part.subtitle}</p>
        <ol class="ch-list">
          {chapters.map((c) => (
            <li class:list={['ch-item', `is-${c.data.status}`]}>
              <span class="ch-num">{c.data.chapter}</span>
              {c.data.status === 'published' ? (
                <a href={`${base}ch/${c.slug}/`} class="ch-title">{c.data.title}</a>
              ) : (
                <span class="ch-title">{c.data.title}</span>
              )}
              {c.data.status !== 'published' && (
                <span class="ch-status">{STATUS_LABEL[c.data.status]}</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    ))}
  </article>
</BaseLayout>

<style>
  .toc { max-width: 820px; padding-top: 3rem; padding-bottom: 4rem; }
  .toc-head h1 { font-size: 2rem; margin: 0 0 0.5rem; color: var(--color-navy); }
  .toc-progress { color: var(--color-text-muted); margin: 0 0 2.5rem; }
  .part { margin-bottom: 2.75rem; }
  .part-title {
    display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap;
    font-size: 1.25rem; color: var(--color-navy); margin: 0 0 0.25rem;
    border-left: 4px solid var(--color-accent); padding-left: 0.65rem;
  }
  .part-roman { font-size: 0.8rem; letter-spacing: 0.08em; color: var(--color-accent); }
  .part-count { margin-left: auto; font-size: 0.78rem; color: var(--color-text-muted); font-weight: 500; }
  .part-sub { font-size: 0.88rem; color: var(--color-text-muted); margin: 0 0 0.9rem 0.9rem; }
  .ch-list { list-style: none; padding: 0 0 0 0.9rem; margin: 0; }
  .ch-item {
    display: flex; align-items: baseline; gap: 0.7rem;
    padding: 0.45rem 0; border-bottom: 1px solid var(--color-border);
  }
  .ch-num {
    flex-shrink: 0; width: 2rem; text-align: right;
    font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text-subtle);
  }
  .ch-title { font-size: 0.95rem; }
  .is-planned .ch-title, .is-draft .ch-title { color: var(--color-text-muted); }
  .ch-status {
    margin-left: auto; flex-shrink: 0;
    font-size: 0.7rem; color: var(--color-text-muted);
    border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    padding: 0.1em 0.5em;
  }
</style>
```

- [ ] **Step 2: ビルドして生成を確認する**

```bash
npm run build && ls dist/curriculum/index.html
```

期待: `dist/curriculum/index.html` が存在する。

- [ ] **Step 3: 目次に章が出ていることを確認する**

```bash
grep -c '座標系と符号規約' dist/curriculum/index.html
```

期待: `1`以上。

- [ ] **Step 4: コミット**

```bash
git add src/pages/curriculum.astro
git commit -m "feat: 目次ページを追加（未執筆章も表示する）"
```

---

## Task 4: 章ページ `/ch/[slug]/` と前提ナビ

**Files:**
- Create: `src/pages/ch/[slug].astro`

**Interfaces:**
- Consumes: `getSortedChapters()`, `getPrereqChapters()`, `getNextChapters()`, `getPart()`（Task 2）
- Produces: `/ch/<slug>/` の静的ページ。冒頭に「この章に必要なもの」、末尾に「次に読む」

- [ ] **Step 1: 章ページを書く**

`src/pages/ch/[slug].astro` を作成する。前提章が未公開のときはリンクにせず「準備中」と出す。

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { getSortedChapters, getPrereqChapters, getNextChapters, getPart } from '../../utils/chapters';

export async function getStaticPaths() {
  const chapters = await getSortedChapters();
  return chapters.map((entry) => ({ params: { slug: entry.slug }, props: { entry } }));
}

const base = import.meta.env.BASE_URL;
const { entry } = Astro.props;
const { Content } = await entry.render();
const d = entry.data;
const part = getPart(d.part);
const prereqs = await getPrereqChapters(entry);
const nexts = await getNextChapters(entry);
const isPublished = d.status === 'published';
---

<BaseLayout
  title={`第${d.chapter}章 ${d.title}`}
  description={d.summary}
  ogType="article"
  canonicalPath={`/ch/${entry.slug}/`}
>
  <article class="ch container">
    <header class="ch-head">
      <p class="ch-part">第{part.roman}部　{part.title}</p>
      <h1><span class="ch-no">第{d.chapter}章</span>{d.title}</h1>
      <p class="ch-summary">{d.summary}</p>
    </header>

    {!isPublished && (
      <p class="ch-notice">この章はまだ執筆中です。目次で全体像を確認できます。</p>
    )}

    <section class="needs">
      <h2 class="needs-title">この章に必要なもの</h2>
      <dl class="needs-dl">
        <dt>ソフトウェア</dt>
        <dd>{d.software.length ? d.software.join(' / ') : '不要'}</dd>
        <dt>Toolbox</dt>
        <dd>{d.toolbox.length ? d.toolbox.join(' / ') : '不要'}</dd>
        <dt>前提の数学</dt>
        <dd>{d.math.length ? d.math.join(' / ') : '特になし'}</dd>
        <dt>前提の章</dt>
        <dd>
          {prereqs.length === 0 ? 'なし' : prereqs.map((p) => (
            p.data.status === 'published'
              ? <a href={`${base}ch/${p.slug}/`}>第{p.data.chapter}章 {p.data.title}</a>
              : <span class="pending">第{p.data.chapter}章 {p.data.title}（準備中）</span>
          ))}
        </dd>
      </dl>
    </section>

    {isPublished && (
      <div class="ch-body prose" data-pagefind-body>
        <Content />
      </div>
    )}

    {d.verified_on && (
      <p class="verified">
        このコードは {d.verified_on} に実行して出力を確認しています（{d.verified_env}）。
      </p>
    )}

    {nexts.length > 0 && (
      <nav class="next">
        <h2 class="next-title">次に読む</h2>
        <ul>
          {nexts.map((n) => (
            <li>
              {n.data.status === 'published'
                ? <a href={`${base}ch/${n.slug}/`}>第{n.data.chapter}章 {n.data.title}</a>
                : <span class="pending">第{n.data.chapter}章 {n.data.title}（準備中）</span>}
            </li>
          ))}
        </ul>
      </nav>
    )}

    <a href={`${base}curriculum/`} class="back">← 目次に戻る</a>
  </article>
</BaseLayout>

<style>
  .ch { max-width: 780px; padding-top: 3rem; padding-bottom: 4rem; }
  .ch-part { font-size: 0.78rem; letter-spacing: 0.06em; color: var(--color-accent); margin: 0 0 0.5rem; }
  .ch-head h1 { font-size: 1.9rem; line-height: 1.35; color: var(--color-navy); margin: 0 0 0.75rem; }
  .ch-no { display: block; font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.3rem; }
  .ch-summary { color: var(--color-text-muted); line-height: 1.8; margin: 0 0 1.75rem; }
  .ch-notice {
    background: #fffbeb; border: 1px solid #fed7aa; border-radius: var(--radius-md);
    padding: 0.8rem 1rem; font-size: 0.9rem; color: #92400e;
  }
  .needs {
    border: 1px solid var(--color-border); border-radius: var(--radius-lg);
    padding: 1.1rem 1.3rem; margin-bottom: 2rem; background: var(--color-bg-subtle, #f8fafc);
  }
  .needs-title { font-size: 0.95rem; color: var(--color-navy); margin: 0 0 0.7rem; }
  .needs-dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.4rem 1rem; margin: 0; font-size: 0.88rem; }
  .needs-dl dt { color: var(--color-text-muted); }
  .needs-dl dd { margin: 0; }
  .needs-dl dd a { display: block; }
  .pending { color: var(--color-text-muted); }
  .verified {
    font-size: 0.82rem; color: var(--color-text-muted);
    border-left: 3px solid var(--color-accent); padding-left: 0.8rem; margin-top: 2rem;
  }
  .next { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
  .next-title { font-size: 1rem; color: var(--color-navy); margin: 0 0 0.6rem; }
  .next ul { list-style: none; padding: 0; margin: 0; line-height: 2; }
  .back { display: inline-block; margin-top: 2.5rem; font-size: 0.88rem; }
  @media (max-width: 560px) {
    .needs-dl { grid-template-columns: 1fr; gap: 0.15rem; }
    .needs-dl dt { margin-top: 0.5rem; font-size: 0.78rem; }
  }
</style>
```

- [ ] **Step 2: ビルドして章ページの生成を確認する**

```bash
npm run build && ls dist/ch/01-coordinates/index.html
```

期待: ファイルが存在する。

- [ ] **Step 3: 「必要なもの」ブロックが出ることを確認する**

```bash
grep -c 'この章に必要なもの' dist/ch/01-coordinates/index.html
```

期待: `1`。

- [ ] **Step 4: コミット**

```bash
git add src/pages/ch/[slug].astro
git commit -m "feat: 章ページと前提ナビを追加"
```

---

## Task 5: 図コンポーネントの基盤

**Files:**
- Create: `src/components/figures/FigureFrame.astro`
- Create: `src/components/figures/CoordinateSystem.astro`

**Interfaces:**
- Produces:
  - `<FigureFrame number="1-1" caption="...">` — 図番号とキャプションを付ける共通枠。矢印マーカー定義（`#arrow-geo` / `#arrow-vel` / `#arrow-force`）を内包する
  - `<CoordinateSystem convention="ISO" | "SAE" />` — 車両座標系の図

- [ ] **Step 1: 図の共通枠を書く**

`src/components/figures/FigureFrame.astro` を作成する。色規則と矢印マーカーをここに集約し、個別の図が再定義しないようにする。

```astro
---
interface Props {
  /** 図番号。例 "1-1" */
  number: string;
  caption: string;
  /** SVG の viewBox。既定は 560x340 */
  viewBox?: string;
}
const { number, caption, viewBox = '0 0 560 340' } = Astro.props;
---

<figure class="fig">
  <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={caption}>
    <defs>
      <marker id="arrow-geo" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#0f172a"/>
      </marker>
      <marker id="arrow-vel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#2563eb"/>
      </marker>
      <marker id="arrow-force" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#dc2626"/>
      </marker>
    </defs>
    <slot />
  </svg>
  <figcaption>
    <span class="fig-no">図 {number}</span>
    {caption}
  </figcaption>
</figure>

<style>
  .fig { margin: 2rem 0; }
  .fig svg { display: block; width: 100%; height: auto; }
  figcaption {
    font-size: 0.85rem; color: var(--color-text-muted);
    line-height: 1.75; margin-top: 0.6rem;
  }
  .fig-no { font-weight: 700; color: var(--color-navy); margin-right: 0.5rem; }
  /* 図の共通クラス。個別の図はこれを使い、色を直接書かない */
  .fig :global(.geo)   { stroke: #0f172a; stroke-width: 1.8; fill: none; }
  .fig :global(.guide) { stroke: #0f172a; stroke-width: 1.4; fill: none; stroke-dasharray: 6 5; }
  .fig :global(.vel)   { stroke: #2563eb; stroke-width: 2.6; fill: none; }
  .fig :global(.force) { stroke: #dc2626; stroke-width: 2.6; fill: none; }
  .fig :global(.body)  { fill: #e2e8f0; stroke: #0f172a; stroke-width: 2; }
  .fig :global(.dot)   { fill: #0f172a; }
  .fig :global(text)   { font-family: system-ui, sans-serif; font-size: 13px; fill: #0f172a; }
  .fig :global(.lbl-vel)   { fill: #2563eb; }
  .fig :global(.lbl-force) { fill: #dc2626; }
  .fig :global(.lbl-sub)   { fill: #475569; font-size: 11px; }
  .fig :global(.sym)   { font-style: italic; font-size: 15px; }
</style>
```

- [ ] **Step 2: 座標系の図を書く**

`src/components/figures/CoordinateSystem.astro` を作成する。第1章で使う。ISO と SAE を切り替えられるようにし、両者の違いを1つの部品で示す。

```astro
---
import FigureFrame from './FigureFrame.astro';

interface Props {
  convention?: 'ISO' | 'SAE';
  number: string;
}
const { convention = 'ISO', number } = Astro.props;

// ISO 8855 は Z-up（y 左・z 上）、従来の SAE J670e は Z-down（y 右・z 下）
const isISO = convention === 'ISO';
const yLabel = isISO ? '左' : '右';
const zText  = isISO ? 'z は上向き（紙面手前）' : 'z は下向き（紙面裏）';
const caption = isISO
  ? '車両座標系（ISO 8855）。x 前方・y 左・z 上向き（Z-up）。'
  : '車両座標系（従来の SAE J670e）。x 前方・y 右・z 下向き（Z-down）。ISO と y・z の向きが逆になる。';
---

<FigureFrame number={number} caption={caption} viewBox="0 0 560 300">
  <!-- 車体（上面図の簡略形） -->
  <rect class="body" x="180" y="110" width="200" height="80" rx="14" />
  <line class="guide" x1="280" y1="70" x2="280" y2="230" />

  <!-- x 軸（前方） -->
  <line class="geo" x1="280" y1="150" x2="440" y2="150" marker-end="url(#arrow-geo)" />
  <text class="sym" x="448" y="155">x</text>
  <text class="lbl-sub" x="448" y="171">前方</text>

  <!-- y 軸 -->
  <line class="geo" x1="280" y1="150" x2="280" y2={isISO ? 50 : 250} marker-end="url(#arrow-geo)" />
  <text class="sym" x="292" y={isISO ? 58 : 248}>y</text>
  <text class="lbl-sub" x="292" y={isISO ? 74 : 264}>{yLabel}</text>

  <!-- 原点 -->
  <circle class="dot" cx="280" cy="150" r="4" />
  <text class="lbl-sub" x="292" y="140">重心（原点）</text>

  <!-- z の向きの注記 -->
  <text class="lbl-sub" x="80" y="150">{zText}</text>

  <!-- 規約名 -->
  <text x="80" y="60" font-weight="700">{convention}</text>
</FigureFrame>
```

- [ ] **Step 3: 疎通確認用の章に図を差し込む**

`src/content/chapters/01-coordinates.mdx` の本文末尾に次を追加する。

```mdx
import CoordinateSystem from '../../components/figures/CoordinateSystem.astro';

<CoordinateSystem number="1-1" convention="ISO" />
```

（import 文はフロントマター直後、本文の先頭に置く）

- [ ] **Step 4: `status` を published にして図が描画されることを確認する**

`01-coordinates.mdx` の `status` を `"published"` に変更してからビルドする。

```bash
npm run build && grep -c 'arrow-geo' dist/ch/01-coordinates/index.html
```

期待: `1`以上（SVG が埋め込まれている）。

- [ ] **Step 5: 図の描画結果を目視で確認する**

```bash
npm run dev
```

ブラウザで `http://localhost:4321/mbd-ai-lab/ch/01-coordinates/` を開き、次を確認する。**この目視確認は必須手順**（試作時にラベルの枠外はみ出しと文字の重なりが発生したため）。

- ラベルが枠外にはみ出していない
- 矢印と文字が重なっていない
- 軸の向きが ISO 8855（x 前方・y 左・z 上）になっている

確認できたら `Ctrl+C` で dev サーバーを止める。

- [ ] **Step 6: コミット**

```bash
git add src/components/figures/ src/content/chapters/01-coordinates.mdx
git commit -m "feat: 図コンポーネントの基盤と座標系の図を追加"
```

---

## Task 6: 48章の骨格ファイル生成

**Files:**
- Create: `scripts/scaffold-chapters.mjs`
- Create: `src/content/chapters/*.mdx`（47ファイル。01 は既存）

**Interfaces:**
- Consumes: Task 1 のスキーマ
- Produces: 48章すべてが `status: planned`（01 のみ `published`）で存在する

- [ ] **Step 1: 生成スクリプトを書く**

`scripts/scaffold-chapters.mjs` を作成する。既存ファイルは上書きしない（第1章を壊さないため）。

```js
/**
 * 48章の骨格ファイルを生成する（1回だけ実行）。
 * 既存ファイルは上書きしない。
 *   node scripts/scaffold-chapters.mjs
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'src', 'content', 'chapters');
mkdirSync(DIR, { recursive: true });

// [章番号, 部, slug, タイトル, 概要, 前提章slug[]]
const CH = [
  [1, 1, '01-coordinates', '座標系と符号規約', 'ISO と SAE で符号が違う。実測データを読む前にこれを確認しないと、結論が反転する。', []],
  [2, 1, '02-cornering-stiffness', 'タイヤが力を出す仕組みとコーナリングスティフネス', 'タイヤは滑らないと力を出さない。線形領域を1つの係数で表す。', ['01-coordinates']],
  [3, 1, '03-bicycle-model', '線形2輪モデルと状態方程式', '左右輪をまとめた最小のモデルで、車がどう曲がるかを状態方程式に落とす。', ['02-cornering-stiffness']],
  [4, 1, '04-steady-state-cornering', '定常円旋回とスタビリティファクタ', 'アンダーステアとオーバーステアを、感覚ではなく式で判定する。', ['03-bicycle-model']],
  [5, 1, '05-transient-response', '過渡応答：ヨーレート応答と応答遅れ', 'ハンドルを切ってから車が向きを変えるまでの遅れを定量化する。', ['03-bicycle-model']],
  [6, 1, '06-model-limits', 'このモデルの限界', 'タイヤの飽和・荷重移動・空力・制動。線形2輪モデルが説明できないことの地図。', ['04-steady-state-cornering', '05-transient-response']],
  [7, 2, '07-tire-slip', 'タイヤ①：スリップ率とスリップ角、非線形領域へ', '線形近似が破綻する領域に入る。スリップの定義を厳密にする。', ['06-model-limits']],
  [8, 2, '08-magic-formula', 'タイヤ②：Magic Formula の構造', 'B・C・D・E が曲線の何を決めるか。荷重感度をどう表すか。', ['07-tire-slip']],
  [9, 2, '09-tire-fitting', 'タイヤ③：実測データからの係数同定と外挿の限界', '非線形最小二乗で係数を決め、残差から信用できない領域を見つける。', ['08-magic-formula']],
  [10, 2, '10-combined-slip', 'タイヤ④：複合スリップと摩擦円', '縦と横の力は同時に最大にできない。制動しながら曲がるときの扱い。', ['09-tire-fitting']],
  [11, 2, '11-tire-load-temp', 'タイヤ⑤：荷重依存・温度・摩耗を実務でどう扱うか', 'データが足りない現実の中で、どこまでモデル化しどこで諦めるか。', ['10-combined-slip']],
  [12, 2, '12-suspension-kinematics', 'サスペンション①：運動学', 'キャンバ・トー・ロールセンタ・瞬間中心。ジオメトリが接地状態を決める。', ['06-model-limits']],
  [13, 2, '13-load-transfer', 'サスペンション②：荷重移動とロール剛性配分', '前後の荷重移動配分がアンダー／オーバーを支配する仕組み。', ['12-suspension-kinematics']],
  [14, 2, '14-spring-damper-arb', 'サスペンション③：スプリング・ダンパ・アンチロールバー', 'ライドとロールを分けて考える。減衰の効き方。', ['13-load-transfer']],
  [15, 2, '15-aero-basics', '空力①：ダウンフォースとドラッグを車両モデルにどう入れるか', 'CFDを解く話ではない。係数として接地荷重に効かせる。', ['06-model-limits']],
  [16, 2, '16-aero-map', '空力②：エアロマップと接地荷重への反映', '車高・レーキ・ヨー角に依存する空力を表にして扱う。', ['15-aero-basics']],
  [17, 2, '17-brake-balance', 'ブレーキ①：ブレーキバランスと減速度配分', '前後の制動力配分と、荷重移動を含めた最適配分。', ['13-load-transfer']],
  [18, 2, '18-brake-thermal', 'ブレーキ②：熱とフェード', '温度で摩擦係数が変わる。周回とともに効きが変化する。', ['17-brake-balance']],
  [19, 2, '19-steering-kinematics', '操作系①：ステアリング運動学', 'ラック比とアッカーマン。ハンドル角と実舵角の関係。', ['12-suspension-kinematics']],
  [20, 2, '20-steering-feedback', '操作系②：コンプライアンスとステアリング反力トルク', 'ドライバーに何が伝わるか。DIL の手応えの元になる量。', ['19-steering-kinematics']],
  [21, 2, '21-engine-torque-map', 'エンジン①：トルクマップと回転数依存', 'スロットル開度と回転数からトルクを決める表。', ['06-model-limits']],
  [22, 2, '22-driveline', 'エンジン②：駆動系（クラッチ・ギヤ比・最終減速・LSD）', 'エンジン出力が路面に届くまで。差動制限が旋回に効く仕組み。', ['21-engine-torque-map']],
  [23, 2, '23-full-vehicle-model', '統合：非線形4輪モデル', '全要素を結合し、第6章で挙げた限界がどう解消されたかを確認する。', ['11-tire-load-temp', '14-spring-damper-arb', '16-aero-map', '18-brake-thermal', '20-steering-feedback', '22-driveline']],
  [24, 3, '24-parameter-acquisition', 'パラメータの入手：測れるもの・測れないもの', '学生チームの装備で何が測れるか。測れない値をどう扱うか。', ['23-full-vehicle-model']],
  [25, 3, '25-inertia-identification', '慣性諸元の同定', '重量配分とヨー慣性モーメントを、限られた設備で求める。', ['24-parameter-acquisition']],
  [26, 3, '26-validation-maneuvers', '実車データとの突き合わせ', 'ステップステア・スラローム・制動。何を走らせて何を比べるか。', ['25-inertia-identification']],
  [27, 3, '27-model-validity', 'モデル妥当性の判断基準', 'どこまで合えば使ってよいか。合わないときに何を疑うか。', ['26-validation-maneuvers']],
  [28, 4, '28-gg-diagram', 'g-g ダイアグラムと性能包絡線', '車ができることの限界を1枚の図にする。', ['27-model-validity']],
  [29, 4, '29-qss-lap-time', '準定常ラップタイムシミュレーション（QSS）', '最小構成のラップタイム計算。速度プロファイルの作り方。', ['28-gg-diagram']],
  [30, 4, '30-track-model', 'コースモデル', 'センターライン・曲率・走行ライン。コースをどう数値にするか。', ['29-qss-lap-time']],
  [31, 4, '31-transient-lap-time', '過渡を含むラップタイムシミュレーション', '定常近似で落ちる要素を入れる。QSS との差はどこに出るか。', ['30-track-model']],
  [32, 4, '32-minimum-lap-time', '最小ラップタイム最適化', '最適制御としてラップタイムを解く。直接法の考え方。', ['31-transient-lap-time']],
  [33, 4, '33-setup-sensitivity', 'セットアップ感度解析とトレードオフの読み方', 'どのパラメータを動かすと何秒変わるか。数字で優先順位を付ける。', ['32-minimum-lap-time']],
  [34, 5, '34-sensors-observability', '状態推定①：センサ構成と可観測性', '何を測れば何が分かるか。測れない量を推定する条件。', ['27-model-validity']],
  [35, 5, '35-kalman-sideslip', '状態推定②：カルマンフィルタによる車体すべり角推定', '直接測れない横すべり角を、モデルとセンサから推定する。', ['34-sensors-observability']],
  [36, 5, '36-pid-limits', '制御設計①：PID とゲインチューニングの限界', 'なぜ手探りのゲイン調整が行き詰まるのかを、モデルの言葉で説明する。', ['35-kalman-sideslip']],
  [37, 5, '37-lqr', '制御設計②：状態フィードバックと LQR', '重み行列で挙動を設計する。PIDとの違い。', ['36-pid-limits']],
  [38, 5, '38-traction-control', '制御設計③：トラクションコントロール', 'スリップ率を目標値に保つ。タイヤモデルと直結する制御。', ['37-lqr']],
  [39, 5, '39-mpc', '制御設計④：モデル予測制御（MPC）', '先を見て決める制御。ラップタイム最適化との接続。', ['38-traction-control']],
  [40, 6, '40-discretization-realtime', '離散化とリアルタイム実行', '固定ステップとソルバ制約。実時間で回すための条件。', ['23-full-vehicle-model']],
  [41, 6, '41-sil', 'SIL テスト', '制御ロジックをモデルの中で検証する。', ['40-discretization-realtime']],
  [42, 6, '42-code-generation', 'コード生成の基礎', 'モデルから実装コードへ。生成コードの読み方。', ['41-sil']],
  [43, 6, '43-hil', 'HIL テスト', '実機のECUを、模擬した車両と繋いで試す。', ['42-code-generation']],
  [44, 6, '44-dil-requirements', 'DIL①：必要なモデル要件（リアルタイム性・レイテンシ予算）', 'ドライバーが乗れるシミュレータに必要な速度と遅れの上限。', ['40-discretization-realtime']],
  [45, 6, '45-dil-force-feedback', 'DIL②：ステアリング反力とペダル特性', 'ドライバーに力をどう返すか。手応えが操作を決める。', ['44-dil-requirements', '20-steering-feedback']],
  [46, 6, '46-dil-cueing', 'DIL③：映像・音・モーションのキューイング', '限られた可動範囲で、加速度感をどう伝えるか。', ['45-dil-force-feedback']],
  [47, 6, '47-vehicle-test-plan', '実車テスト計画とデータ取得', '限られた走行機会で何を取るか。計測計画の立て方。', ['27-model-validity']],
  [48, 6, '48-data-correlation', '実車データとシミュレーションの突き合わせ', '合わない差をどう読み、モデルとセットアップのどちらを疑うか。', ['47-vehicle-test-plan', '33-setup-sensitivity']],
];

let created = 0, skipped = 0;
for (const [chapter, part, slug, title, summary, prereq] of CH) {
  const path = join(DIR, `${slug}.mdx`);
  if (existsSync(path)) { skipped++; continue; }
  const fm = [
    '---',
    `part: ${part}`,
    `chapter: ${chapter}`,
    `title: "${title}"`,
    `summary: "${summary}"`,
    'status: "planned"',
    `prereq: [${prereq.map((s) => `"${s}"`).join(', ')}]`,
    'software: []',
    'toolbox: []',
    'math: []',
    '---',
    '',
    '<!-- この章はまだ執筆していません。8ブロックのテンプレートに沿って書きます。 -->',
    '',
  ].join('\n');
  writeFileSync(path, fm, 'utf8');
  created++;
}
console.log(`生成: ${created} 件 / スキップ（既存）: ${skipped} 件 / 合計 ${CH.length} 章`);
```

- [ ] **Step 2: 生成して章数を確認する**

```bash
node scripts/scaffold-chapters.mjs
ls src/content/chapters/*.mdx | wc -l
```

期待: 「生成: 47 件 / スキップ（既存）: 1 件 / 合計 48 章」と表示され、ファイル数が `48`。

- [ ] **Step 3: ビルドと目次の章数を確認する**

```bash
npm run build
grep -o '<li class="ch-item' dist/curriculum/index.html | wc -l
```

期待: `48`。（`grep -c 'ch-item'` は使わない。この文字列は Astro のスコープ付き
`<style>` にも出るため、実際の章数より多く数えてしまう）

- [ ] **Step 4: 前提章の slug がすべて実在することを確認する**

```bash
node -e "
const {readdirSync,readFileSync}=require('fs');
const dir='src/content/chapters';
const slugs=new Set(readdirSync(dir).map(f=>f.replace(/\.mdx$/,'')));
let bad=0;
for(const f of readdirSync(dir)){
  const m=readFileSync(dir+'/'+f,'utf8').match(/^prereq:\s*\[(.*)\]/m);
  if(!m||!m[1].trim())continue;
  for(const s of m[1].split(',').map(x=>x.trim().replace(/\"/g,''))){
    if(s&&!slugs.has(s)){console.log('未定義の前提:',f,'->',s);bad++;}
  }
}
console.log(bad===0?'前提章はすべて実在します':'不整合 '+bad+' 件');
"
```

期待: 「前提章はすべて実在します」。

- [ ] **Step 5: コミット**

```bash
git add scripts/scaffold-chapters.mjs src/content/chapters/
git commit -m "feat: 48章の骨格ファイルを生成"
```

---

## Task 7: 記号表とソフトウェアのページ

**Files:**
- Create: `src/pages/notation.astro`
- Create: `src/pages/software.astro`

**Interfaces:**
- Produces: `/notation/` と `/software/`

- [ ] **Step 1: 記号表ページを書く**

`src/pages/notation.astro` を作成する。全章が参照する共通言語になるので、記号は表として持ち、章から追記しやすい形にする。

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';

// 全章で使う記号の定義。章を書くたびにここへ追記する。
const GROUPS = [
  {
    title: '座標系と車体の運動',
    rows: [
      ['x', '車両前後方向（前方が正）', 'm'],
      ['y', '車両横方向（ISO 8855 では左が正）', 'm'],
      ['z', '車両上下方向（ISO 8855 では上が正）', 'm'],
      ['V', '車速（重心の速度）', 'm/s'],
      ['β', '車体すべり角', 'rad'],
      ['r', 'ヨーレート', 'rad/s'],
      ['a_y', '横加速度', 'm/s²'],
    ],
  },
  {
    title: 'タイヤ',
    rows: [
      ['α', 'スリップ角', 'rad'],
      ['κ', 'スリップ率', '—'],
      ['F_x', 'タイヤ前後力', 'N'],
      ['F_y', 'タイヤ横力（コーナリングフォース）', 'N'],
      ['F_z', 'タイヤ接地荷重', 'N'],
      ['C_α', 'コーナリングスティフネス', 'N/rad'],
      ['μ', '摩擦係数', '—'],
    ],
  },
  {
    title: '車両諸元',
    rows: [
      ['m', '車両質量', 'kg'],
      ['I_z', 'ヨー慣性モーメント', 'kg·m²'],
      ['l_f', '重心〜前軸距離', 'm'],
      ['l_r', '重心〜後軸距離', 'm'],
      ['L', 'ホイールベース（l_f + l_r）', 'm'],
      ['h', '重心高', 'm'],
      ['δ', '前輪実舵角', 'rad'],
    ],
  },
  {
    title: '空力',
    rows: [
      ['C_L', '揚力係数（ダウンフォース側を正として扱う）', '—'],
      ['C_D', '抗力係数', '—'],
      ['A', '前面投影面積', 'm²'],
      ['ρ', '空気密度', 'kg/m³'],
    ],
  },
];
---

<BaseLayout
  title="記号表"
  description="本サイトの全章で使う記号の定義と単位。ISO 8855 を基本とし、SAE J670 との差異を明記します。"
  canonicalPath="/notation/"
>
  <article class="nt container">
    <h1>記号表</h1>
    <p class="lead">
      本サイトは <strong>ISO 8855</strong> の符号規約を基本とします。
      SAE J670 とは y 軸と z 軸の向きが逆になるため、実測データや文献を読むときは
      どちらの規約かを必ず確認してください。ここを取り違えると、結論が反転します。
    </p>

    {GROUPS.map((g) => (
      <section class="grp">
        <h2>{g.title}</h2>
        <table>
          <thead><tr><th>記号</th><th>意味</th><th>単位</th></tr></thead>
          <tbody>
            {g.rows.map(([sym, desc, unit]) => (
              <tr><td class="sym">{sym}</td><td>{desc}</td><td class="unit">{unit}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    ))}
  </article>
</BaseLayout>

<style>
  .nt { max-width: 760px; padding-top: 3rem; padding-bottom: 4rem; }
  .nt h1 { font-size: 2rem; color: var(--color-navy); margin: 0 0 1rem; }
  .lead { line-height: 1.85; color: var(--color-text); margin: 0 0 2.5rem; }
  .grp { margin-bottom: 2.25rem; }
  .grp h2 {
    font-size: 1.15rem; color: var(--color-navy); margin: 0 0 0.7rem;
    border-left: 4px solid var(--color-accent); padding-left: 0.65rem;
  }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--color-border); }
  th { font-size: 0.78rem; color: var(--color-text-muted); font-weight: 600; }
  .sym { font-family: var(--font-mono); font-weight: 600; white-space: nowrap; }
  .unit { font-family: var(--font-mono); color: var(--color-text-muted); white-space: nowrap; }
</style>
```

- [ ] **Step 2: ソフトウェアページを書く**

`src/pages/software.astro` を作成する。学生の入手経路が本題なので、確認日を必ず表示する（制度は変わるため）。

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';

const CHECKED_ON = '2026-08-09';

const ROUTES = [
  {
    name: 'MATLAB / Simulink',
    role: '本サイトの正典。全章の実装例はこれで書きます。',
    route: '学生フォーミュラ参加チームは MathWorks の Student Competition Software Request から申請すると、MATLAB・Simulink を含む多数の製品を無償で使えます（チーム単位・要指導教員）。',
    url: 'https://www.mathworks.com/academia/student-competitions/formula-sae.html',
    note: '個人ではなくチームでの申請になります。まず指導教員に相談してください。',
  },
  {
    name: '大学のキャンパスライセンス',
    role: 'MATLAB / Simulink',
    route: '所属大学が Total Academic Headcount ライセンスを契約している場合、大学のメールアドレスで個人アカウントを作れば無償で使えます。',
    url: 'https://www.mathworks.com/academia/tah-support-program/eligibility.html',
    note: '大学名で検索すると契約状況が確認できます。チーム申請より早い場合があります。',
  },
];
---

<BaseLayout
  title="必要なソフトウェアと入手方法"
  description="本サイトの章で使う MATLAB / Simulink と、学生フォーミュラチームが無償で入手する方法をまとめています。"
  canonicalPath="/software/"
>
  <article class="sw container">
    <h1>必要なソフトウェアと入手方法</h1>
    <p class="lead">
      本サイトの実装例は <strong>MATLAB / Simulink</strong> で書きます。レース車両開発の実務で使われている
      ためで、学んだことがそのまま現場で通用することを優先しました。
      有償のソフトですが、<strong>学生フォーミュラチームには無償の入手経路があります</strong>。
    </p>

    {ROUTES.map((r) => (
      <section class="route">
        <h2>{r.name}</h2>
        <p class="role">{r.role}</p>
        <p class="how">{r.route}</p>
        <p class="note">{r.note}</p>
        <a href={r.url} target="_blank" rel="noopener noreferrer" class="link">申請ページを開く ↗</a>
        <p class="checked">この情報の確認日: {CHECKED_ON}</p>
      </section>
    ))}

    <section class="route">
      <h2>Toolbox について</h2>
      <p class="how">
        章によっては MATLAB 本体に加えて Toolbox が必要になります。各章の冒頭にある
        「この章に必要なもの」に、必要な Toolbox を明記しています。読み始める前に確認してください。
        Toolbox が無い場合の代替手段がある章では、その方法も本文に書きます。
      </p>
    </section>
  </article>
</BaseLayout>

<style>
  .sw { max-width: 760px; padding-top: 3rem; padding-bottom: 4rem; }
  .sw h1 { font-size: 2rem; color: var(--color-navy); margin: 0 0 1rem; }
  .lead { line-height: 1.85; margin: 0 0 2.5rem; }
  .route {
    border: 1px solid var(--color-border); border-radius: var(--radius-lg);
    padding: 1.3rem 1.5rem; margin-bottom: 1.25rem;
  }
  .route h2 { font-size: 1.1rem; color: var(--color-navy); margin: 0 0 0.4rem; }
  .role { font-size: 0.82rem; color: var(--color-accent); margin: 0 0 0.7rem; }
  .how { line-height: 1.8; margin: 0 0 0.6rem; }
  .note { font-size: 0.86rem; color: var(--color-text-muted); margin: 0 0 0.9rem; }
  .link { font-size: 0.9rem; font-weight: 600; }
  .checked { font-size: 0.75rem; color: var(--color-text-subtle); margin: 0.8rem 0 0; }
</style>
```

- [ ] **Step 3: ビルドして生成を確認する**

```bash
npm run build && ls dist/notation/index.html dist/software/index.html
```

期待: 両方存在する。

- [ ] **Step 4: コミット**

```bash
git add src/pages/notation.astro src/pages/software.astro
git commit -m "feat: 記号表とソフトウェア入手ガイドを追加"
```

---

## Task 8: 旧資産の撤去とナビゲーション更新

**Files:**
- Delete: `src/content/blog/`（364ファイル）、`src/data/tools.ts`、`src/data/verified-runs.json`、`src/utils/ladder.ts`、`src/utils/student-themes.ts`、`src/utils/categories.ts`、`src/utils/reading-time.ts`、`src/glossary-data.md`
- Delete: `src/pages/blog/`、`src/pages/categories/`、`src/pages/tools/`、`src/pages/guide/`、`src/pages/glossary.astro`
- Delete: `src/components/ArticleCard.astro`、`src/components/ArticleCTA.astro`、`src/components/ToolCard.astro`、`src/components/CategoryIllustration.astro`
- Delete: `scripts/soften-output-claims.mjs`、`scripts/ladder-report.mjs`
- Modify: `src/content/config.ts`（blog コレクションを削除）
- Modify: `src/components/Header.astro:3-9`（ナビ差し替え）
- Modify: `src/components/Footer.astro`（リンク差し替え）
- Modify: `src/site.config.ts`（サイト名・説明・収益化フィールド削除）
- Modify: `package.json`（`ladder:report` スクリプト削除）
- Modify: `src/pages/index.astro`（暫定の最小構成に。Task 11 でビジュアルを作り込む）
- Modify: `src/pages/about.astro`（旧テーマの記述を全面書き換え）
- Modify: `src/pages/404.astro`（旧テーマへのリンクを差し替え）
- Modify: `src/pages/search.astro`（記事→章に文言変更。Pagefind は引き継ぐ）

**Interfaces:**
- Produces: 旧テーマの資産が存在しない状態。ビルドが通る

- [ ] **Step 1: 旧コンテンツとコードを削除する**

```bash
git rm -r --quiet src/content/blog src/pages/blog src/pages/categories src/pages/tools src/pages/guide
git rm --quiet src/pages/glossary.astro src/glossary-data.md
git rm --quiet src/data/tools.ts src/data/verified-runs.json
git rm --quiet src/utils/ladder.ts src/utils/student-themes.ts src/utils/categories.ts src/utils/reading-time.ts
git rm --quiet src/components/ArticleCard.astro src/components/ArticleCTA.astro src/components/ToolCard.astro src/components/CategoryIllustration.astro
git rm --quiet scripts/soften-output-claims.mjs scripts/ladder-report.mjs
```

- [ ] **Step 2: blog コレクションを削除する**

`src/content/config.ts` から `blog` の定義（`const blog = defineCollection({...});` 全体）を削除し、最終行を次にする。

```ts
export const collections = { chapters };
```

- [ ] **Step 3: サイト設定を書き換える**

`src/site.config.ts` を次の内容に置き換える。収益化フィールド（`noteUrl` / `amazonStorefrontUrl` / `contactUrl`）は削除する。

```ts
// サイト全体の設定（SEO・計測まわり）
export const SITE = {
  origin: 'https://jonasaaydn.github.io',
  base: '/mbd-ai-lab',
  title: '学生フォーミュラのモデルベース開発',
  description:
    '学生フォーミュラ車両のモデルベース開発（MBD）を、車両運動からラップタイムシミュレーション、DILシミュレータまで48章で扱う教科書。実装は MATLAB / Simulink。',

  // Google Analytics 4 の測定ID。空文字なら計測タグを出力しない
  gaMeasurementId: 'G-BEC8KPCN74',

  // Search Console「HTMLタグ」方式の content 値
  googleSiteVerification: 'MB0fOZd-Tv_QOs64LLhOXMLfu1Ci4zZuxeJgV0UY8g8',
} as const;
```

- [ ] **Step 4: ヘッダーのナビを差し替える**

`src/components/Header.astro` の `navLinks`（3〜9行目）を次にする。

```ts
const navLinks = [
  { href: `${base}curriculum`, label: '目次' },
  { href: `${base}notation`, label: '記号表' },
  { href: `${base}software`, label: 'ソフトウェア' },
  { href: `${base}about`, label: 'このサイトについて' },
];
```

同ファイル内のロゴ文言 `MBD×AI Lab` を `学生フォーミュラ MBD` に、`Race Engineering × AI Tools` を `Model-Based Development` に変更する。

- [ ] **Step 5: フッターを差し替える**

`src/components/Footer.astro` の冒頭 import から `CATEGORIES` / `categoryToSlug` の行を削除し、「カテゴリ」列を丸ごと削除する。「サイト」列のリストを次にする。

```astro
<li><a href={base}>ホーム</a></li>
<li><a href={`${base}curriculum`}>目次</a></li>
<li><a href={`${base}notation`}>記号表</a></li>
<li><a href={`${base}software`}>ソフトウェア</a></li>
<li><a href={`${base}about`}>このサイトについて</a></li>
<li><a href={`${base}privacy`}>プライバシーポリシー</a></li>
```

フッターのブランド説明文を次にする。

```
学生フォーミュラ車両のモデルベース開発を、<br />
車両運動から DIL シミュレータまで体系的に扱う教科書です。
```

- [ ] **Step 6: トップページを暫定の最小構成にする**

`src/pages/index.astro` を次の内容に置き換える（作り込みは Task 10）。

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getChaptersByPart, getProgress } from '../utils/chapters';

const base = import.meta.env.BASE_URL;
const groups = await getChaptersByPart();
const progress = await getProgress();
const firstPublished = groups.flatMap((g) => g.chapters).find((c) => c.data.status === 'published');
---

<BaseLayout title="ホーム">
  <section class="hero container">
    <h1>学生フォーミュラのモデルベース開発</h1>
    <p class="lead">
      タイヤが力を出す仕組みから、ラップタイムシミュレーション、ドライバーが乗って評価する
      DIL シミュレータまで。実務のレース車両開発と同じ水準で、順を追って扱います。
    </p>
    <p class="progress">全 {progress.total} 章のうち {progress.published} 章を公開しています。</p>
    <div class="actions">
      {firstPublished && <a href={`${base}ch/${firstPublished.slug}/`} class="btn btn-primary">第1章から読む</a>}
      <a href={`${base}curriculum/`} class="btn btn-outline">目次を見る</a>
    </div>
  </section>

  <section class="parts container">
    {groups.map(({ part, chapters }) => (
      <div class="part">
        <h2>第{part.roman}部　{part.title}</h2>
        <p>{part.subtitle}</p>
        <span class="count">{progress.byPart[part.id].published} / {chapters.length} 章</span>
      </div>
    ))}
  </section>
</BaseLayout>

<style>
  .hero { padding: 4rem 1.25rem 2.5rem; max-width: 760px; }
  .hero h1 { font-size: clamp(1.7rem, 4.5vw, 2.6rem); color: var(--color-navy); margin: 0 0 1rem; line-height: 1.3; }
  .lead { line-height: 1.9; color: var(--color-text); margin: 0 0 1.25rem; }
  .progress { font-size: 0.9rem; color: var(--color-text-muted); margin: 0 0 1.75rem; }
  .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .parts { display: grid; gap: 0.75rem; max-width: 760px; padding-bottom: 4rem; }
  .part { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 1rem 1.2rem; }
  .part h2 { font-size: 1.02rem; color: var(--color-navy); margin: 0 0 0.25rem; }
  .part p { font-size: 0.86rem; color: var(--color-text-muted); margin: 0; }
  .count { font-size: 0.78rem; font-family: var(--font-mono); color: var(--color-text-subtle); }
</style>
```

- [ ] **Step 7: about ページを書き換える**

`src/pages/about.astro` の内容を教科書サイトのものに置き換える。`principles` 配列（10〜27行目）を次にする。

```ts
const principles = [
  {
    title: '実務の水準で書く',
    body: 'モデルの式を示すだけでなく、実測データからの係数同定と、そのモデルをいつ信じてはいけないかまで扱います。',
  },
  {
    title: '実行した結果だけを載せる',
    body: 'コードは実際に実行し、得られた出力をそのまま載せます。実行していない出力を「実行結果」として書きません。',
  },
  {
    title: '必要なものを先に示す',
    body: '各章の冒頭に、必要なソフトウェア・Toolbox・前提の数学・前提の章を明示します。読み始めてから詰まらないようにするためです。',
  },
  {
    title: '順序を守る',
    body: '章は前提順に並びます。車両運動から始め、その限界を示してから各要素を作り込み、最後にDILシミュレータへ到達します。',
  },
];
```

本文の見出しと文章も次の趣旨に書き換える。

- 冒頭リード: 「学生フォーミュラ車両のモデルベース開発を、車両運動からラップタイムシミュレーション、DILシミュレータまで48章で扱う教科書です。」
- 「運営者」節: レース車両のMBDに携わる現役エンジニアが個人で運営している旨（既存の記述を流用）
- 「なぜこのサイトが必要か」節: 車両運動の体系を日本語で、実務の水準で、実行検証つきで扱う教材が無いこと
- 「対象読者」節: 学生フォーミュラでMBD・制御・車両運動を担当する学生。前提知識は微積分・線形代数・常微分方程式

末尾のボタン（`.about-actions`）のリンク先を `${base}curriculum` と `${base}ch/01-coordinates` にする。

- [ ] **Step 8: 404 と検索ページを直す**

`src/pages/404.astro` のリンク先から旧ページ（`blog` 等）を除き、`${base}curriculum` と `${base}` に差し替える。

`src/pages/search.astro` の文言のうち「記事」を「章」に変える（例:「記事を検索」→「章を検索」）。Pagefind の設定自体は変更しない。

- [ ] **Step 9: package.json から不要スクリプトを消す**

`package.json` の `"ladder:report": "node scripts/ladder-report.mjs"` の行を削除する。

- [ ] **Step 10: ビルドが通ることを確認する**

```bash
npm run build
```

期待: 成功する。旧ページが `dist/` に生成されないこと。

- [ ] **Step 11: 旧URLが消えたことを確認する**

```bash
ls dist/blog dist/tools dist/glossary 2>&1 | head -3
```

期待: いずれも「No such file or directory」。

- [ ] **Step 12: コミット**

```bash
git add -A
git commit -m "feat: 旧テーマの資産を撤去し、教科書サイトの構成に置き換え"
```

---

## Task 9: リポジトリ改称とベースパス変更

**Files:**
- Modify: `astro.config.mjs`（`base`）
- Modify: `src/site.config.ts`（`base`）
- Modify: `public/robots.txt`（サイトマップURL）

**Interfaces:**
- Produces: `https://jonasaaydn.github.io/fsae-mbd/` で公開される状態

- [ ] **Step 1: GitHub のリポジトリ名を変更する**

```bash
gh repo rename fsae-mbd --repo jonasaaydn/mbd-ai-lab --yes
```

期待: 成功メッセージ。旧URLは GitHub が自動でリダイレクトする。

- [ ] **Step 2: リモートURLを更新する**

```bash
git remote set-url origin https://github.com/jonasaaydn/fsae-mbd.git
git remote -v
```

期待: `origin` が `fsae-mbd` を指す。

- [ ] **Step 3: ベースパスを変更する**

`astro.config.mjs` の `base: '/mbd-ai-lab/'` を `base: '/fsae-mbd/'` にする。
`src/site.config.ts` の `base: '/mbd-ai-lab'` を `base: '/fsae-mbd'` にする。

- [ ] **Step 4: robots.txt のサイトマップURLを更新する**

`public/robots.txt` を次にする。

```
User-agent: *
Allow: /

Sitemap: https://jonasaaydn.github.io/fsae-mbd/sitemap-index.xml
```

- [ ] **Step 5: 旧ベースパスが残っていないことを確認する**

```bash
npm run build
grep -rl 'mbd-ai-lab' dist/ | head -5
```

期待: 出力なし（1件も残らない）。

- [ ] **Step 6: コミットしてデプロイする**

```bash
git add astro.config.mjs src/site.config.ts public/robots.txt
git commit -m "chore: リポジトリを fsae-mbd に改称しベースパスを変更"
git push origin main
```

- [ ] **Step 7: デプロイ結果を確認する**

```bash
sleep 60 && gh run list --limit 1
curl -s -o /dev/null -w "%{http_code}\n" https://jonasaaydn.github.io/fsae-mbd/curriculum/
```

期待: デプロイが `success`、HTTPステータスが `200`。

---

## Task 10: 第1章の執筆と実行検証

**Files:**
- Modify: `src/content/chapters/01-coordinates.mdx`
- Create: `src/components/figures/SignConvention.astro`

**Interfaces:**
- Consumes: `FigureFrame`（Task 5）
- Produces: 8ブロック構成を満たす最初の章。`verified_on` / `verified_env` を持つ

> **このタスクには運営者の作業が入ります。** MATLAB は Claude の環境では実行できないため、
> Step 4 のコードは運営者が自分の PC で実行し、その出力を Claude に渡してください。
> 出力を受け取るまで `verified_on` / `verified_env` は書きません。

- [ ] **Step 1: ISO と SAE を並べた図を作る**

`src/components/figures/SignConvention.astro` を作成する。第1章の核心は「規約が違うと符号が反転する」ことなので、2つを並べて見せる。

**Task 5 Step 3 で `01-coordinates.mdx` に入れた `<CoordinateSystem number="1-1" convention="ISO" />` は、この `<SignConvention />` に置き換える**（同じ図が二重に出ないようにする）。import 文も差し替える。

```astro
---
import CoordinateSystem from './CoordinateSystem.astro';
---
<div class="pair">
  <CoordinateSystem number="1-1" convention="ISO" />
  <CoordinateSystem number="1-2" convention="SAE" />
</div>
<style>
  .pair { display: grid; gap: 1rem; }
  @media (min-width: 720px) { .pair { grid-template-columns: 1fr 1fr; } }
</style>
```

- [ ] **Step 2: 第1章の本文を8ブロック構成で書く**

`src/content/chapters/01-coordinates.mdx` を次の構成で書く。各見出しは仕様書 3-2 節の8ブロックに対応させる。

1. `## この章でできるようになること` — 車両座標系を定義でき、ISO と SAE の違いを説明でき、規約違いのデータを変換できる
2. `## なぜ必要か` — 実測データや文献の符号を取り違えると、アンダーステアとオーバーステアの判定が逆になる
3. `## 理論` — ISO 8855 と SAE J670 の定義、y と z の反転、変換行列。`<SignConvention />` をここに置く
4. `## 実装` — Step 3 の MATLAB コード
5. `## 実行結果` — Step 4 で得た出力（**運営者が実行するまで書かない**）
6. `## 限界と適用範囲` — 規約は車両座標系だけでなくタイヤ座標系にもあり、両者が独立に選ばれている場合がある。データ提供元に必ず確認する
7. `## 学生チームでの現実解` — ロガーの設定画面で符号を確認する手順、確認できないときは既知の旋回方向で走って符号を実測する
8. `## 次の章へ` — 第2章でこの座標系の上にタイヤ力を載せる

- [ ] **Step 3: 実装ブロックの MATLAB コードを書く**

第1章の `## 実装` に次のコードを載せる。ISO と SAE を相互変換し、同じ物理現象が符号だけ変わることを示す。

```matlab
% ISO 8855 と SAE J670 の相互変換
% ISO 8855: x 前方 / y 左 / z 上向き（Z-up）
% SAE J670e（従来）: x 前方 / y 右 / z 下向き（Z-down）
% → y と z の符号が反転する（x は共通）

T = diag([1, -1, -1]);   % ISO <-> SAE の変換行列（自分自身が逆行列）

% 例: 右旋回中の横加速度と ヨーレート（ISO 表記）
a_y_iso = 8.5;    % m/s^2  左向きが正（ISO 8855）
r_iso   = 0.62;   % rad/s  上から見て反時計回りが正（z 上向きのため）

v_iso = [0; a_y_iso; 0];
v_sae = T * v_iso;

fprintf('--- 同じ右旋回を2つの規約で表す ---\n');
fprintf('ISO: a_y = %+.2f m/s^2,  r = %+.3f rad/s\n', a_y_iso, r_iso);
fprintf('SAE: a_y = %+.2f m/s^2,  r = %+.3f rad/s\n', v_sae(2), -r_iso);
fprintf('\n変換行列 T:\n');
disp(T);
fprintf('T*T = I か: %d\n', isequal(T*T, eye(3)));
```

- [ ] **Step 4: 運営者に実行を依頼し、出力を受け取る**

運営者に次を伝える。

> 第1章のコードを MATLAB で実行して、コマンドウィンドウの出力をそのまま貼ってください。
> あわせて `version` の結果（MATLAB のバージョン）も教えてください。

受け取るまでこのタスクは完了しない。**出力を推測して書いてはいけない。**

- [ ] **Step 5: 受け取った出力を「実行結果」ブロックに貼る**

`## 実行結果` に、受け取った出力をそのまま ```text ブロックで貼り、直後に実行環境を1行書く。

```
実行環境: MATLAB R20XXx / Windows 11
```

- [ ] **Step 6: frontmatter を更新する**

`01-coordinates.mdx` の frontmatter を次にする（`verified_on` は実行した日付）。

```yaml
status: "published"
software: ["MATLAB R2024b"]
toolbox: []
math: ["線形代数"]
verified_on: "YYYY-MM-DD"
verified_env: "MATLAB R2024b / Windows 11"
```

- [ ] **Step 7: ビルドして検証表示を確認する**

```bash
npm run build
grep -c '実行して出力を確認しています' dist/ch/01-coordinates/index.html
```

期待: `1`。

- [ ] **Step 8: 図を目視で確認する**

```bash
npm run dev
```

`http://localhost:4321/fsae-mbd/ch/01-coordinates/` を開き、ISO と SAE の図が並び、ラベルのはみ出しと重なりが無いことを確認する。確認後 `Ctrl+C`。

- [ ] **Step 9: コミット**

```bash
git add src/content/chapters/01-coordinates.mdx src/components/figures/SignConvention.astro
git commit -m "feat: 第1章「座標系と符号規約」を実行検証つきで公開"
```

---

## Task 11: ビジュアル設計

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/layouts/BaseLayout.astro`、`src/components/Header.astro`、`src/components/Footer.astro`、`src/pages/index.astro`、`src/pages/curriculum.astro`、`src/pages/ch/[slug].astro`

**Interfaces:**
- Consumes: Task 3・4・7・8 で作ったページ
- Produces: 教科書としての視覚的な一貫性

- [ ] **Step 1: frontend-design スキルを起動する**

`frontend-design` スキルを呼び、次を伝える。

> 対象: 学生フォーミュラのモデルベース開発を扱う教科書サイト。トップ・目次・章ページ・記号表。
> 読者は工学系の学生で、数式・図・コードを長時間読む。可読性と、章を読み進める感覚が最優先。
> 図の色規則（速度＝青 #2563eb / 力＝赤 #dc2626 / 幾何＝黒 #0f172a）は決定済みで、
> サイトの配色はこれと衝突してはいけない。
> 既存の紺＋赤アクセントは AI ニュースサイト時代のもので、引き継ぐ必要はない。

- [ ] **Step 2: 提示された方向性で実装する**

スキルが出した配色・タイポグラフィ・レイアウトに従って CSS を書く。**図の3色と衝突しないこと**を必ず確認する。

- [ ] **Step 3: ビルドして全ページを目視確認する**

```bash
npm run build && npm run dev
```

`/`・`/curriculum/`・`/ch/01-coordinates/`・`/notation/`・`/software/` を開き、次を確認する。

- 数式・コードブロック・表が読みやすい
- 図の3色がサイトの配色に埋もれていない
- 画面幅 390px（スマートフォン）で横スクロールが発生しない

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "feat: 教科書サイトのビジュアル設計を適用"
```

---

## Task 12: 受け入れ確認と最終デプロイ

**Files:**
- Create: `scripts/verify-site.mjs`
- Modify: `package.json`（`verify` スクリプト追加）

**Interfaces:**
- Consumes: すべてのタスクの成果物
- Produces: 仕様書 8 節の受け入れ基準を自動確認する手段

- [ ] **Step 1: 受け入れ確認スクリプトを書く**

`scripts/verify-site.mjs` を作成する。仕様書 8 節の10項目のうち、機械的に確認できるものを検査する。

```js
/**
 * 仕様書 8 節の受け入れ基準を dist/ に対して確認する。
 *   npm run build && npm run verify
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const read = (p) => (existsSync(join(DIST, p)) ? readFileSync(join(DIST, p), 'utf8') : null);

// 1. 主要ページが生成されている
for (const p of ['curriculum/index.html', 'notation/index.html', 'software/index.html', 'index.html']) {
  check(`ページ生成: /${p.replace('/index.html', '/')}`, existsSync(join(DIST, p)));
}

// 2. 48章すべてがページ化されている（planned も 404 にならない）
const chDir = join(DIST, 'ch');
const chCount = existsSync(chDir) ? readdirSync(chDir).length : 0;
check('48章すべてがページ化されている', chCount === 48, `実際: ${chCount}`);

// 3. 目次に48章が並び、6部すべての見出しが出ている
// 注意: 'ch-item' という文字列は Astro のスコープ付き <style> にも出るため、
// 素朴に数えると実際より多くなる。開始タグに固定して数える。
const toc = read('curriculum/index.html') ?? '';
const tocItems = (toc.match(/<li class="ch-item/g) ?? []).length;
check('目次に48章が並ぶ', tocItems === 48, `実際: ${tocItems}`);
const tocParts = (toc.match(/<h2 class="part-title"/g) ?? []).length;
check('目次に6部の見出しが出ている', tocParts === 6, `実際: ${tocParts}`);

// 4. 未執筆章が「準備中」として成立している
const planned = read('ch/48-data-correlation/index.html') ?? '';
check('未執筆章が準備中として表示される', planned.includes('執筆中です'));

// 5. 旧ベースパスが残っていない
let stale = 0;
const walk = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.html') && readFileSync(p, 'utf8').includes('mbd-ai-lab')) stale++;
  }
};
if (existsSync(DIST)) walk(DIST);
check('旧ベースパス mbd-ai-lab が残っていない', stale === 0, `残存: ${stale} ファイル`);

// 6. 検証済みの章にだけ実行環境が表示される
const ch1 = read('ch/01-coordinates/index.html') ?? '';
check('第1章に実行環境が表示される', ch1.includes('実行して出力を確認しています'));
check('未執筆章に実行環境が表示されない', !planned.includes('実行して出力を確認しています'));

// 7. 禁止表現が存在しない
let banned = 0;
const walkBanned = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) walkBanned(p);
    else if (f.name.endsWith('.html') && readFileSync(p, 'utf8').includes('実行すると以下が出力され')) banned++;
  }
};
if (existsSync(DIST)) walkBanned(DIST);
check('「実行すると以下が出力されます」が存在しない', banned === 0, `検出: ${banned} ファイル`);

// 8. 図が埋め込まれている
check('第1章に図が埋め込まれている', ch1.includes('arrow-geo'));

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '  OK  ' : '  NG  '} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
console.log(`\n${results.length - failed.length} / ${results.length} 項目が合格`);
process.exit(failed.length === 0 ? 0 : 1);
```

- [ ] **Step 2: package.json にスクリプトを追加する**

`"preview": "astro preview"` の後に次を足す。

```json
"verify": "node scripts/verify-site.mjs"
```

- [ ] **Step 3: 受け入れ確認を実行する**

```bash
npm run build && npm run verify
```

期待: すべての項目が `OK` で終了コード 0。NG があれば該当タスクに戻って直す。

- [ ] **Step 4: コミットしてデプロイする**

```bash
git add scripts/verify-site.mjs package.json
git commit -m "feat: 受け入れ基準の確認スクリプトを追加"
git push origin main
```

- [ ] **Step 5: 本番で最終確認する**

```bash
gh run watch --exit-status
for p in "" "curriculum/" "ch/01-coordinates/" "notation/" "software/"; do
  printf "%-22s %s\n" "/$p" "$(curl -s -o /dev/null -w '%{http_code}' https://jonasaaydn.github.io/fsae-mbd/$p)"
done
```

期待: すべて `200`。

- [ ] **Step 6: Search Console に新URLを登録する**

運営者に次を依頼する。

> Search Console で `https://jonasaaydn.github.io/fsae-mbd/` を URL プレフィックスとして追加し、
> 所有権確認（HTMLタグは既に埋め込み済み）のあと、サイトマップ `sitemap-index.xml` を送信してください。

- [ ] **Step 7: ルーティンが停止していることを確認する**

停止は前提条件（Task 1 より前）で完了しているはずなので、ここでは結果を確認する。

```bash
git log --oneline --since='7 days ago' --grep='自動記事追加' | wc -l
```

期待: `0`。1件以上あれば停止できていないので、運営者に再確認を依頼する。

---

## 完了条件

- `npm run build && npm run verify` がすべて合格する
- `https://jonasaaydn.github.io/fsae-mbd/` の5ページが 200 を返す
- 第1章が実行検証つきで公開されている
- 47章が `planned` として目次に並び、章ページが 404 にならない
- 旧記事364本とAIテーマの資産がリポジトリに存在しない
