import { defineCollection, z } from 'astro:content';

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

export const collections = { chapters };
