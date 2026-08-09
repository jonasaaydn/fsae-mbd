---
title: "【学生フォーミュラ実践】Claude Codeでテスト走行データを自動解析——1セッション分のCSVを渡すだけで改善点レポートが生成される"
date: 2026-05-22
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Claude Code", "テレメトリ解析", "ラップデータ", "Python", "データ可視化"]
tool: "Claude Code"
official_url: "https://claude.ai/code"
importance: "high"
summary: "テスト走行後のCSVデータを手作業で分析するのに3時間かけていた学生チームが、Claude Codeを使えば15分で「何を改善すべきか」のレポートを自動生成できます。テレメトリ解析の自動化手順と、スロットル・ブレーキ・速度データから課題を特定するコードを解説します。"
---

## この記事を読む前に

本ブログの「[Claude CodeをレースカーMBD開発に活用する実践ガイド](/blog/claude-code-mbd/)」でツールの基本を紹介しました。この記事ではそれを**学生フォーミュラのテスト走行データ解析**に応用します。

---

## 学生フォーミュラにおける課題

テスト走行を終えた後に必ずある作業があります。

「AiM・MoTeC・自作DAQで取ったCSVを開いて、スロットル開度・速度・Gセンサーのグラフを手動で作る。セクターごとの最速タイムを比較して、どこで詰まっているか推測する。この作業だけで毎回2〜3時間かかる」

走行後すぐに改善点を特定して次のセッションに活かしたいのに、データ解析が追いつかない——これは多くの学生チームに共通する悩みです。

さらに、チームにプログラミング経験者がいないと「グラフは作れるが何を見ればいいか分からない」という状況にもなりがちです。

---

## Claude Codeを使った解決アプローチ

Claude Codeはターミナルで動くAIコーディングエージェントです。**CSVファイルを渡して「分析して」と言うだけ**で、Pythonコードを自動生成・実行し、グラフ作成からインサイト抽出まで行ってくれます。

なぜこれが有効かというと、テレメトリ解析には「定番の手法」があるからです。

速度データからラップタイムを計算する・スロットル開度とブレーキ圧力のトレードオフを見る・コーナー進入速度とG値の関係を評価する——これらはレースエンジニアが毎回行う定型作業であり、Claude Codeはこのパターンを知っています。つまり「このCSVのフォーマットを読んで、ラップ解析レポートを作って」という指示だけで、適切なPythonコードを書いてくれます。

---

## 実装：ステップバイステップ

### 前提条件

- Claude Code のインストール（[claude.ai/code](https://claude.ai/code) からダウンロード）
- Python 3.10 以上（インストール済みでなければ [python.org](https://www.python.org) から）
- 以下のコマンドでライブラリをインストール：

```bash
pip install pandas matplotlib scipy numpy
```

### 手順1：テレメトリCSVを用意する

多くのDAQソフトは以下のような形式でCSVを出力します（列名が異なる場合はClaude Codeが自動で対応します）。

```csv
Time[s],Speed[km/h],ThrottlePos[%],BrakePress[bar],LateralG[g],LongitudinalG[g],RPM,GearPos
0.00,0.0,0,0.0,0.01,-0.02,800,0
0.10,2.3,45,0.0,0.02,0.41,3200,1
0.20,8.7,82,0.0,0.03,0.87,4800,1
...
```

### 手順2：Claude Codeに解析を依頼する

ターミナルで Claude Code を起動し、以下のように伝えます。

```
このCSVファイル（telemetry_2026-05-22.csv）はテスト走行のテレメトリデータです。
以下を解析して日本語のレポートを作成してください：

1. ラップタイムの一覧（Time列が0になる箇所でラップ区切りとする）
2. 速度-距離グラフ（速度プロファイルの可視化）
3. スロットルとブレーキのオーバーラップ時間の割合
4. 最速ラップと平均ラップの速度差が大きい区間の特定
5. ドライバーへのフィードバック3点
```

### 手順3：自動生成されるPythonコードの中身を理解する

Claude Codeが生成するコードは以下のような構成になります。実際に動かしながら各処理の意味を確認してください。

```python
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
import numpy as np

# 日本語フォントの設定（文字化け防止）
matplotlib.rcParams['font.family'] = 'MS Gothic'

# === ステップ1: CSVを読み込む ===
# parse_dates=False にしておくと、時刻列を文字列として読む（後で数値変換する）
df = pd.read_csv('telemetry_2026-05-22.csv')
print(f"データ読み込み完了: {len(df)} 行, {len(df.columns)} 列")
print(df.head())  # 最初の5行を表示して形式を確認

# === ステップ2: ラップを区切る ===
# Speed が0に近く（≤5 km/h）、その前が5km/h以上だった点 = ラップ完了と判定
lap_ends = df.index[
    (df['Speed[km/h]'] <= 5) & (df['Speed[km/h]'].shift(1) > 5)
].tolist()

lap_times = []
start = 0
for end_idx in lap_ends:
    lap_time = df.loc[end_idx, 'Time[s]'] - df.loc[start, 'Time[s]']
    lap_times.append(lap_time)
    start = end_idx + 1

print("\n=== ラップタイム一覧 ===")
for i, t in enumerate(lap_times):
    minutes = int(t // 60)
    seconds = t % 60
    print(f"  ラップ {i+1}: {minutes}:{seconds:05.2f}")

# === ステップ3: 速度プロファイルを可視化する ===
fig, axes = plt.subplots(3, 1, figsize=(14, 10))

# 速度グラフ
axes[0].plot(df['Time[s]'], df['Speed[km/h]'], color='#2563eb', linewidth=1)
axes[0].set_ylabel('速度 [km/h]')
axes[0].set_title('テスト走行データ解析')
axes[0].grid(True, alpha=0.3)

# スロットル・ブレーキグラフ
# スロットルとブレーキが同時に入っている（非効率な操作）を赤でハイライト
overlap = (df['ThrottlePos[%]'] > 5) & (df['BrakePress[bar]'] > 0.5)
axes[1].plot(df['Time[s]'], df['ThrottlePos[%]'], color='#16a34a', label='スロットル[%]')
axes[1].plot(df['Time[s]'], df['BrakePress[bar]'] * 10, color='#dc2626', label='ブレーキ圧×10')
axes[1].fill_between(df['Time[s]'], 0, 100,
                      where=overlap, color='red', alpha=0.2, label='同時踏み')
axes[1].set_ylabel('スロットル/ブレーキ')
axes[1].legend(fontsize=8)
axes[1].grid(True, alpha=0.3)

# 横G・縦Gグラフ
axes[2].plot(df['Time[s]'], df['LateralG[g]'], color='#7c3aed', label='横G')
axes[2].plot(df['Time[s]'], df['LongitudinalG[g]'], color='#b45309', label='縦G', alpha=0.7)
axes[2].axhline(y=0, color='gray', linewidth=0.5)
axes[2].set_xlabel('時刻 [s]')
axes[2].set_ylabel('G値 [g]')
axes[2].legend(fontsize=8)
axes[2].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('lap_analysis.png', dpi=150, bbox_inches='tight')
print("\nグラフを lap_analysis.png に保存しました")

# === ステップ4: 改善ポイントを自動抽出する ===
overlap_ratio = overlap.sum() / len(df) * 100
max_speed = df['Speed[km/h]'].max()
avg_lap = np.mean(lap_times) if lap_times else 0
best_lap = min(lap_times) if lap_times else 0

print("\n=== 改善ポイント分析 ===")
print(f"スロットル・ブレーキ同時踏み: {overlap_ratio:.1f}% の時間")
if overlap_ratio > 5:
    print("  ⚠ 同時踏みが多いです。ブレーキリリースとスロットル開始のタイミングを見直しましょう")

print(f"最高速度: {max_speed:.1f} km/h")
if best_lap > 0:
    print(f"ベストラップとアベレージの差: {avg_lap - best_lap:.2f}秒")
    if avg_lap - best_lap > 2.0:
        print("  ⚠ ラップ間のばらつきが大きいです。一貫したドライビングラインを意識しましょう")
```

### このコードを出力の形式は次のようになります（未実測）

```
データ読み込み完了: 8640 行, 8 列
   Time[s]  Speed[km/h]  ThrottlePos[%]  ...

=== ラップタイム一覧 ===
  ラップ 1: 1:24.73
  ラップ 2: 1:23.18
  ラップ 3: 1:22.91  ← ベストラップ
  ラップ 4: 1:24.02

グラフを lap_analysis.png に保存しました

=== 改善ポイント分析 ===
スロットル・ブレーキ同時踏み: 8.3% の時間
  ⚠ 同時踏みが多いです。ブレーキリリースとスロットル開始のタイミングを見直しましょう
最高速度: 98.4 km/h
ベストラップとアベレージの差: 1.28秒
```

---

## Before / After 比較

| 項目 | 手作業 | Claude Code 使用後 |
|------|--------|-------------------|
| データ解析時間（1セッション） | 2〜3時間 | **15〜20分** |
| 生成されるグラフ数 | 2〜3枚 | **自動で5〜8枚** |
| 改善ポイントの特定 | 経験者の主観 | **数値ベースで自動抽出** |
| プログラミング知識 | Python習熟が必要 | **「〇〇を追加して」で拡張可能** |

---

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `KeyError: 'Speed[km/h]'` | CSV列名が違う | Claude Codeに「列名を確認して列名を自動検出して」と追加依頼 |
| 文字化けする | フォントが未インストール | `matplotlib.rcParams['font.family'] = 'DejaVu Sans'` に変更 |
| グラフが保存されない | カレントディレクトリの権限 | `plt.savefig('/tmp/lap_analysis.png')` に変更 |

---

## 応用：より高度な使い方

基本の解析が動いたら、次はClaude Codeに以下を依頼できます。

- **「セクタータイムを計算して」**：コーナーごとの区間タイムを自動算出
- **「前回走行のCSVと比較して改善量を数値で出して」**：セッション間比較レポート
- **「横Gと縦Gのサークル（GGダイアグラム）を描いて」**：タイヤグリップ使用率の可視化

---

## 今週の学生チームへの宿題

直近のテスト走行データCSVを1ファイル用意して、Claude Codeに「このCSVのSpeed列とThrottlePos列とBrakePress列でグラフを作って」と言ってみてください。**列名を言うだけでコードが自動生成されます。**
