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
  [17, 2, '17-brake-balance', 'ブレーキ①：ブレーキバランスと減速度配分', '前後の制動力配分と、荷重移動を含めた最適配分。', ['13-load-transfer', '10-combined-slip']],
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
  [35, 5, '35-kalman-sideslip', '状態推定②：拡張カルマンフィルタによる車体すべり角推定', '直接測れない横すべり角を、モデルとセンサから推定する。車両運動は非線形なので実務では拡張版（EKF）を使う。', ['34-sensors-observability']],
  [36, 5, '36-pid-limits', '制御設計①：PID とゲインチューニングの限界', 'なぜ手探りのゲイン調整が行き詰まるのかを、モデルの言葉で説明する。', ['35-kalman-sideslip']],
  [37, 5, '37-lqr', '制御設計②：状態フィードバックと LQR', '重み行列で挙動を設計する。PIDとの違い。', ['36-pid-limits']],
  [38, 5, '38-traction-control', '制御設計③：トラクションコントロール', 'スリップ率を目標値に保つ。タイヤモデルと直結する制御。', ['37-lqr', '07-tire-slip']],
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
    '{/* この章はまだ執筆していません。8ブロックのテンプレートに沿って書きます。 */}',
    '',
  ].join('\n');
  writeFileSync(path, fm, 'utf8');
  created++;
}
console.log(`生成: ${created} 件 / スキップ（既存）: ${skipped} 件 / 合計 ${CH.length} 章`);
