/**
 * 仕様書 8 節の受け入れ基準を dist/ に対して確認する。
 *   npm run build && npm run verify
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
// 未達だが「失敗」ではないもの（外部要因待ち）。合否には数えず、必ず目立たせる。
const pending = (name, ok, detail = '') => results.push({ name, ok, detail, pending: true });
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
// 第1章の実測は運営者の MATLAB 実行待ち。未実測は「失敗」ではなく「保留」として区別する。
// 実行していない出力を実行結果として載せないことが本サイトの存在理由なので、
// 実測が入るまでは pending のままにしておくのが正しい状態。
const ch1 = read('ch/01-coordinates/index.html') ?? '';
const ch1Verified = ch1.includes('実行して出力を確認しています');
if (ch1Verified) {
  check('第1章に実行環境が表示される', true);
} else {
  pending('第1章の実測（運営者の MATLAB 実行待ち）', ch1.includes('未実測'));
}
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

const pendings = results.filter((r) => r.pending);
const failed = results.filter((r) => !r.ok && !r.pending);
for (const r of results) {
  const mark = r.pending ? ' 保留 ' : r.ok ? '  OK  ' : '  NG  ';
  console.log(`${mark} ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
const graded = results.length - pendings.length;
console.log(`\n${graded - failed.length} / ${graded} 項目が合格` + (pendings.length ? `（保留 ${pendings.length} 件）` : ''));
if (pendings.length) console.log('保留は外部要因待ちで、埋まるまでこの計画は完了しない。');
process.exit(failed.length === 0 ? 0 : 1);
