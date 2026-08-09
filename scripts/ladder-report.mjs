/**
 * 段（Ladder）分類の結果を確認するためのレポート。
 * UI に出す前に、350本がどう分類されるか・誤判定が無いかを人が目で確かめるために使う。
 *
 *   npm run ladder:report            # 分布と代表例
 *   npm run ladder:report -- --all   # 全記事の判定を一覧
 *   npm run ladder:report -- --rung 1  # 特定の段だけ一覧
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transform } from 'esbuild';

const BLOG = join(process.cwd(), 'src', 'content', 'blog');

// ladder.ts をそのまま単一の情報源として使う（Astro が依存している esbuild で TS を落とす）
const tsSource = readFileSync(join(process.cwd(), 'src', 'utils', 'ladder.ts'), 'utf8');
const { code: jsSource } = await transform(tsSource, { loader: 'ts', format: 'esm' });
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(jsSource, 'utf8').toString('base64')}`
);
const { classifyRung, extractPrereqLinks, RUNGS } = mod;

function parseFrontmatter(raw) {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim().replace(/^["']|["']$/g, '');
    if (v.startsWith('[')) {
      v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    data[kv[1]] = v;
  }
  return { data, body: m[2] };
}

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const onlyRung = args.includes('--rung') ? Number(args[args.indexOf('--rung') + 1]) : null;

const files = readdirSync(BLOG).filter((f) => f.endsWith('.md'));
const results = [];

for (const name of files) {
  const raw = readFileSync(join(BLOG, name), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const slug = name.replace(/\.md$/, '');
  const r = classifyRung({ slug, data, body });
  results.push({
    slug,
    title: data.title ?? '',
    rung: r.rung,
    reason: r.reason,
    gates: r.gates,
    paidApi: r.paidApi,
    verified: Boolean(data.run_log),
    prereq: extractPrereqLinks(body).length,
  });
}

const total = results.length;
console.log(`\n記事 ${total} 本の段分布\n${'─'.repeat(60)}`);
for (const r of [0, 1, 2, 3, 4]) {
  const list = results.filter((x) => x.rung === r);
  const pct = ((list.length / total) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(list.length / total * 40));
  console.log(`L${r} ${RUNGS[r].label.padEnd(9, '　')} ${String(list.length).padStart(3)}本 (${pct.padStart(5)}%) ${bar}`);
}

const verified = results.filter((x) => x.verified);
const today = results.filter((x) => x.rung <= 1 && x.verified);
console.log(`${'─'.repeat(60)}`);
console.log(`実測済(run_log あり)     : ${verified.length} 本`);
console.log(`「今日の一歩」(L0/L1∧実測): ${today.length} 本`);
console.log(`従量課金API検出           : ${results.filter((x) => x.paidApi).length} 本`);
console.log(`前提記事を要求する記事     : ${results.filter((x) => x.prereq > 0).length} 本`);

if (onlyRung !== null) {
  console.log(`\nL${onlyRung} の記事一覧\n${'─'.repeat(60)}`);
  for (const x of results.filter((r) => r.rung === onlyRung)) {
    console.log(`  ${x.slug}\n     ${x.reason}`);
  }
} else if (showAll) {
  console.log(`\n全記事\n${'─'.repeat(60)}`);
  for (const x of results.sort((a, b) => a.rung - b.rung)) {
    console.log(`L${x.rung} ${x.verified ? '✓' : ' '} ${x.slug}  [${x.reason}]`);
  }
} else {
  for (const r of [0, 1, 2]) {
    const list = results.filter((x) => x.rung === r).slice(0, 5);
    if (!list.length) continue;
    console.log(`\nL${r} の例（先頭5本）`);
    for (const x of list) console.log(`  ${x.verified ? '✓' : ' '} ${x.slug}\n     ${x.reason}`);
  }
  console.log('\n--all で全件、--rung N で段別の一覧が出ます。');
}
