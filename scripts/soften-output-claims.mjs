/**
 * 一度きりの機械置換：実行していない出力を「実行結果」と断定している表現を修正する。
 *
 * 背景:
 *   模範記事 student-formula-cfd-ai-surrogate-2026.md を実際に実行したところ、
 *   掲載値（迎角9.3°）と実測値（0.1°）が完全に食い違っていた。
 *   「実行すると以下が出力されます」は実行の裏付けなく書かれており、350本に複製されている。
 *
 * 方針:
 *   - 記事の主張を弱めるのではなく、事実に合わせる（未実測なら未実測と書く）
 *   - frontmatter に run_log がある記事（＝実行検証済み）は対象外
 *   - CRLF を保持したまま置換する（記事は 350/350 が CRLF）
 *   - --dry で差分だけ確認できる
 *
 * 使い方:
 *   node scripts/soften-output-claims.mjs --dry   # 変更内容の確認のみ
 *   node scripts/soften-output-claims.mjs         # 実際に書き換え
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BLOG_DIR = join(process.cwd(), 'src', 'content', 'blog');
const DRY = process.argv.includes('--dry');

/** 断定表現 → 未実測であることを明示する表現 */
const RULES = [
  {
    // 「実行すると以下が出力されます」系（見出し・本文の両方）
    pattern: /実行すると(?:、)?以下(?:のような)?(?:が|の)?出力(?:され(?:ます|る)|が得られます|例)/g,
    replace: '出力の形式は次のようになります（未実測）',
  },
  {
    pattern: /実行すると(?:、)?次(?:のような)?(?:が|の)?出力(?:され(?:ます|る)|が得られます)/g,
    replace: '出力の形式は次のようになります（未実測）',
  },
  {
    // 「以下のような結果が得られます」
    pattern: /以下のような結果が得られます/g,
    replace: '出力の形式は次のようになります（未実測）',
  },
];

/** 見出し「### 実行結果」等（run_log が無い＝未実測の記事のみ） */
const HEADING_RULE = {
  pattern: /^(#{2,4})\s*(?:実行結果|実行例|出力結果|実行してみた結果)\s*$/gm,
  replace: (_m, hashes) => `${hashes} 出力の形式（未実測）`,
};

const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
let changedFiles = 0;
let totalReplacements = 0;
const changed = [];

for (const name of files) {
  const path = join(BLOG_DIR, name);
  const original = readFileSync(path, 'utf8');

  // 実行検証済みの記事（run_log あり）は事実なので触らない
  if (/^run_log:\s*\S/m.test(original)) continue;

  // CRLF を保持するため、判定は LF 正規化した写しで行い、置換は原文に対して行う
  let out = original;
  let count = 0;

  for (const rule of RULES) {
    out = out.replace(rule.pattern, () => {
      count++;
      return rule.replace;
    });
  }
  out = out.replace(HEADING_RULE.pattern, (...args) => {
    count++;
    return HEADING_RULE.replace(...args);
  });

  if (count > 0) {
    changedFiles++;
    totalReplacements += count;
    changed.push(`  ${name} (${count}箇所)`);
    if (!DRY) writeFileSync(path, out, 'utf8');
  }
}

console.log(`対象記事: ${files.length} 本`);
console.log(`${DRY ? '[dry-run] 変更予定' : '変更した'}記事: ${changedFiles} 本 / 置換 ${totalReplacements} 箇所`);
if (changed.length) console.log(changed.join('\n'));
if (DRY) console.log('\n実際に書き換えるには --dry を外して再実行してください。');
