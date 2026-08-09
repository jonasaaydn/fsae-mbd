// 記事を「学生が今日どこまで手を出せるか」＝段（Ladder）に自動分類する。
//
// 設計の要点（なぜこう作るか）:
//  1. 段は frontmatter に書かせない。自己申告のメタデータはこのサイトで既に2度死んでいる
//     （importance は 346/350 が high、mbd_relevance は low が 0本）。必ず「良い側」にインフレする。
//     だから段はコードが本文から算出する。
//  2. 段は3つのゲートの最大値で決める。入手可能性だけ、実行可能性だけで判定すると必ず嘘をつく。
//     （実例: 入手性だけ見ると PyPI に存在しないパッケージの記事に「今すぐ無料」が付き、
//       実行可能性だけ見ると商用FEAの記事に「実測済」が付く）
//  3. 証拠が無ければ L4 に倒す（fail-safe）。「難しそうに見える」誤りは機会損失で済むが、
//     「できると言われて出来ない」誤りは信頼を壊す。
//  4. 判定に使うのはコードフェンス・前提条件セクション・frontmatter/slug のみ。
//     散文中でツール名に言及しただけの記事が誤って上段に落ちるのを防ぐ。
//  5. 記事は 350/350 が CRLF。走査前に必ず改行を正規化する（しないと無言で全滅する）。

export type Rung = 0 | 1 | 2 | 3 | 4;

export interface RungInfo {
  rung: Rung;
  /** UI に出すラベル（短い） */
  label: string;
  /** バッジ横に出す説明 */
  tagline: string;
}

export const RUNGS: Record<Rung, RungInfo> = {
  0: { rung: 0, label: 'ブラウザだけ', tagline: 'インストール不要。共用PCでもできます' },
  1: { rung: 1, label: '今日・自分のPC', tagline: '費用0円。pip install だけで動きます' },
  2: { rung: 2, label: '週末・環境構築', tagline: '費用0円。環境構築か大きめのダウンロードが要ります' },
  3: { rung: 3, label: 'シーズン・申請', tagline: '無償だが申請・承認、または大学のマシンが要ります' },
  4: { rung: 4, label: '業界地図', tagline: '企業ライセンス前提。実行ではなく「知る」ための記事' },
};

export interface RungResult {
  rung: Rung;
  /** なぜこの段になったかの理由（UIに出して学生が自分で検算できるようにする） */
  reason: string;
  gates: { license: Rung; compute: Rung; input: Rung };
  /** 従量課金APIを使う記事（学生は課金できないので最低 L3 に固定する） */
  paidApi: boolean;
}

/** 誤判定を1行で直すための逃げ道。slug → 段 */
export const RUNG_OVERRIDES: Record<string, Rung> = {};

// ─────────────────────────────────────────────
// ゲート辞書
// ─────────────────────────────────────────────

/** 辞書の要素。文字列は部分一致、正規表現はそのまま照合する */
type Matcher = string | RegExp;

/** ライセンスゲート: そのツールを学生が入手できるか */
const LICENSE: Record<Rung, Matcher[]> = {
  4: [
    'SimAI', 'GeomAI', 'Neural Concept', 'PhysicsX', 'Monolith', 'Flexcompute', 'AutoInsight',
    'Rescale', 'Emmi AI', 'Digital Twin Composer', 'Saphira', 'HEEDS', 'dSPACE', 'GT-SUITE',
    'ASCMO', 'VI-CarRealTime', 'CarMaker', 'Synera', '3DEXPERIENCE', 'SIMULIA', 'Luminary Cloud',
  ],
  3: [
    'MATLAB', 'Simulink', 'Simscape', 'Vehicle Dynamics Blockset', 'Powertrain Blockset',
    'Ansys', 'Fluent', 'optiSLang', 'SpaceClaim', 'STAR-CCM', 'Simcenter',
    'SOLIDWORKS', 'Abaqus', 'SimScale', 'HyperWorks', 'Altair', 'nTop', 'CST',
  ],
  2: [
    'OpenFOAM', 'SU2', 'CalculiX', 'Elmer', 'FreeCAD', 'Gmsh', 'ParaView', 'OpenModelica',
    'Octave', 'Scilab', 'Xcos', 'Ollama', 'LM Studio', 'ROS2', 'ros2', 'WSL', 'Docker',
    'conda', 'CUDA', 'foamlib', 'DeepXDE', 'neuraloperator', 'OpenVSP', 'blueCFD', 'PyTorch',
  ],
  1: [
    'numpy', 'scipy', 'pandas', 'matplotlib', 'scikit-learn', 'sklearn', 'xgboost', 'lightgbm',
    'optuna', 'fastf1', 'casadi', 'python-control', 'gpytorch', 'neuralfoil', 'pysindy',
    'commonroad', 'statsmodels', 'seaborn', 'pip install',
  ],
  0: [
    'claude.ai', 'ChatGPT', 'Gemini', 'NotebookLM', 'Colab', 'Kaggle', 'Onshape',
    'SimScale Community', 'Hugging Face', 'ブラウザだけ', 'ブラウザのみ',
  ],
};

/** 計算資源ゲート: そのPCで回せるか */
const COMPUTE: Record<Rung, Matcher[]> = {
  4: ['HPC', 'クラスタ', 'A100', 'H100', 'スーパーコンピュータ', '数千万セル', '1億'],
  3: ['CUDA', 'RTX', 'VRAM', 'GPU必須', '専用GPU', '24GB', 'ワークステーション', 'NVIDIA GPU が必要'],
  2: ['Colab', 'Kaggle', '無料GPU', 'T4', 'WSL2', 'GBのダウンロード', '数GB'],
  1: ['CPUのみ', 'ノートPC', 'GPU不要', 'GPUは不要'],
  0: [],
};

/** 入力ゲート: 記事を始めるのに何が要るか（学生の詰まりどころ） */
const INPUT: Record<Rung, Matcher[]> = {
  4: ['既存CFDデータ', '既存のCFD結果', '商用ソルバの', 'Fluentの結果', 'STAR-CCM+のケース'],
  3: [/(\d{2,})\s*ケース(?:分|の)?(?:のCFD|のFEA|を事前)/, '事前に用意', 'を回し終えている', 'Abaqus を実行済み'],
  2: ['DrivAerML', 'DrivAerNet', 'AhmedML', 'AirfRANS', 'データセットをダウンロード'],
  1: ['自チームの走行CSV', 'AiM', 'MoTeC', 'FastF1', 'UIUC', 'airfoiltools'],
  0: ['記事内で生成', '合成データ', '入力データは不要'],
};

/** 従量課金API（学生は課金できない）→ 最低 L3 */
const PAID_API: Matcher[] = [
  'APIキー', 'api_key', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY',
  'RESCALE_API_KEY', '従量課金', 'クレジットを消費',
  'import anthropic', 'import openai', 'from anthropic', 'from openai',
];

// ─────────────────────────────────────────────
// 本文の走査
// ─────────────────────────────────────────────

/** 記事は 350/350 が CRLF。ここを通さないとコードフェンスの走査が全滅する。 */
export function normalize(body: string): string {
  return body.replace(/\r\n/g, '\n');
}

/** コードフェンスの中身だけを取り出す */
export function extractFences(body: string): string {
  const out: string[] = [];
  for (const m of body.matchAll(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g)) out.push(m[1]);
  return out.join('\n');
}

/** 「前提条件」「必要なもの」「この記事を読む前に」セクションの中身 */
export function extractPrereqSections(body: string): string {
  const out: string[] = [];
  const re = /^#{2,4}[ \t]*(?:前提条件|必要なもの|この記事を読む前に|準備するもの|動作環境)[^\n]*\n([\s\S]*?)(?=^#{2,4}[ \t]|$(?![\s\S]))/gm;
  for (const m of body.matchAll(re)) out.push(m[1]);
  return out.join('\n');
}

/** 「この記事を読む前に」から内部リンクを抜き、前提記事の数を数える */
export function extractPrereqLinks(body: string): string[] {
  const section = extractPrereqSections(normalize(body));
  const links = section.match(/\]\((?:\/mbd-ai-lab)?\/blog\/([a-z0-9-]+)\/?\)/g) ?? [];
  return [...new Set(links.map((l) => l.replace(/.*\/blog\/([a-z0-9-]+)\/?\)/, '$1')))];
}

function hits(haystack: string, needles: Matcher[]): string | null {
  for (const n of needles) {
    if (typeof n === 'string') {
      if (haystack.toLowerCase().includes(n.toLowerCase())) return n;
    } else if (n.test(haystack)) {
      return n.source;
    }
  }
  return null;
}

/** 辞書を上段から順に見て、最初に当たった段を返す（当たらなければ null） */
function gateOf(haystack: string, dict: Record<Rung, Matcher[]>): { rung: Rung; hit: string } | null {
  for (const r of [4, 3, 2, 1, 0] as Rung[]) {
    const found = hits(haystack, dict[r] ?? []);
    if (found) return { rung: r, hit: found };
  }
  return null;
}

export interface ClassifyInput {
  slug: string;
  data: { title?: string; tool?: string; tags?: string[] };
  body: string;
}

/**
 * 段を算出する。
 * rung = max(license, compute, input)。paidApi なら最低 L3。証拠が無ければ L4。
 */
export function classifyRung(post: ClassifyInput): RungResult {
  const override = RUNG_OVERRIDES[post.slug];
  const body = normalize(post.body);

  // 判定に使う面を限定する（散文の言及は無視）
  const subject = [post.slug, post.data.title ?? '', post.data.tool ?? '', (post.data.tags ?? []).join(' ')].join(' ');
  const fences = extractFences(body);
  const prereq = extractPrereqSections(body);
  const scanned = `${subject}\n${fences}\n${prereq}`;

  const paidApi = Boolean(hits(scanned, PAID_API));

  const lic = gateOf(scanned, LICENSE);
  const cmp = gateOf(scanned, COMPUTE);
  const inp = gateOf(scanned, INPUT);

  // fail-safe はライセンスゲートにだけ効かせる。
  // 「どのツールが要るか読み取れない」＝入手できるか判断できない、なので L4 に倒す（迷ったら上）。
  // 一方で「GPUの記載が無い」「入力データの記載が無い」は"制約が無い"のであって
  // "HPCが要る"ではない。ここまで L4 に倒すと全記事が L4 になり、段が情報を失う。
  const gates = {
    license: (lic?.rung ?? 4) as Rung,
    compute: (cmp?.rung ?? 0) as Rung,
    input: (inp?.rung ?? 0) as Rung,
  };

  let rung = Math.max(gates.license, gates.compute, gates.input) as Rung;
  if (paidApi && rung < 3) rung = 3;
  if (override !== undefined) rung = override;

  const parts: string[] = [];
  if (lic) parts.push(`ツール: ${lic.hit}`);
  else parts.push('ツールの記載を確認できず');
  if (cmp) parts.push(`環境: ${cmp.hit}`);
  if (inp) parts.push(`入力: ${inp.hit}`);
  if (paidApi) parts.push('従量課金API');
  if (override !== undefined) parts.push('手動指定');

  return { rung, reason: parts.join(' / '), gates, paidApi };
}
