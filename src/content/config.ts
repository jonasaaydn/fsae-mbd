import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    category: z.string(),
    tags: z.array(z.string()),
    tool: z.string().optional(),
    // 自動記事ルーティンが URL の無い記事に official_url: "" を出力するため、
    // 空文字列・空白のみは「未指定(undefined)」として扱い、ビルドが落ちないようにする。
    // 値がある場合のみ URL 形式を検証する。
    official_url: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().url().optional()
    ),
    importance: z.enum(['high', 'medium', 'low']),
    summary: z.string(),

    // ── 「学生が今日できるか」を示すための項目（すべて任意・既存記事は無改修で通る）──
    // 段(rung)・入手可能性はここに書かせない。自己申告のメタデータは必ず良い側にインフレするため
    // （importance は 346/350 が high、mbd_relevance は low が0本になった）、段はコードで算出する。
    /** 必要なもの（例: ["Python 3.12", "pip install scikit-learn"]） */
    needs: z.array(z.string()).optional(),
    /** 記事を始める前に必要な入力（例: "自チームの走行CSV" / "不要（記事内で生成）"） */
    inputs: z.string().optional(),
    /** 実行環境: "ブラウザ" | "ノートPC(CPUのみ)" | "無料GPU(Colab)" | "専用GPU" | "大学WS・企業HPC" */
    compute: z.string().optional(),
    /** 実作業の目安（分）。読了時間ではない */
    timebox: z.number().optional(),
    /** 実際にコードを実行して出力を確認した日付（YYYY-MM-DD）。実行した時だけ書く */
    run_log: z.string().optional(),
    /** 実行環境の記録（例: "python 3.12.10 / numpy 2.4.6 / 実行 2.9秒"） */
    run_env: z.string().optional(),
  }),
});

export const collections = { blog };
