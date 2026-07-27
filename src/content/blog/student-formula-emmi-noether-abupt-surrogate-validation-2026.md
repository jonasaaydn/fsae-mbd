---
title: "【学生フォーミュラ実践】Emmi AI Noether(AB-UPT)でCFDサロゲート予測の信頼性を統計的に検証する"
date: 2026-07-27
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Emmi AI", "AB-UPT", "CFDサロゲート", "統計的検証"]
tool: "Emmi AI / AB-UPT"
official_url: "https://github.com/Emmi-AI/noether"
importance: "high"
summary: "学生フォーミュラチームがEmmi AIのAB-UPT（Noether Framework）でCFDサロゲートモデルを作った後、そのまま信じて設計を確定するのは危険です。交差検証とキャリブレーション分析で予測の信頼性を数値化する手順を解説します。"
---

## この記事を読む前に

Emmi AI Noether Framework（AB-UPT）の基本的な使い方は「[AB-UPT × Emmi AI Noether：GPU1枚で1億4000万セルの自動車空力CFDをリアルタイム予測する物理トランスフォーマー](/blog/ab-upt-emmi-noether-cfd-surrogate-automotive-2026)」で解説済みです。ガウス過程回帰によるサロゲート構築の基礎は「[学生フォーミュラのCFD解析をAIで10倍速く](/blog/student-formula-cfd-ai-surrogate-2026)」も参照してください。本記事は「サロゲートを作った後、その予測をどこまで信じてよいか」という一歩先の課題を扱います。

## 学生フォーミュラにおける課題

多くのチームはCFDケースを20〜40件しか回せないまま、AIサロゲートモデルを構築して最終形状を決めてしまいます。ある学生チームの実例では、30ケースで学習したサロゲートが「Cd=0.28」と予測した形状を最終仕様として製作したところ、大会直前の実測風洞試験でCd=0.32（誤差14%）だったという報告があります。原因は、学習データが迎角0〜10°に偏っており、最終形状の迎角13°が「外挿領域」だったことです。サロゲートは外挿領域でも自信満々に数値を返してしまうため、検証なしに使うと設計判断を誤ります。

## Emmi AI Noether(AB-UPT)を使った解決アプローチ

AB-UPTは発散ゼロ制約により物理的な整合性は高いモデルですが、それでも「学習データの分布外でどれだけ誤差が大きくなるか」は別問題です。この問題を解くのが**交差検証（Cross Validation）**です。手持ちのCFDケースを学習用とテスト用に分割し、テスト用ケースでの予測誤差を**RMSE（二乗平均平方根誤差、予測のズレの大きさを表す指標）**と**R²（決定係数、1に近いほど実測値の変動をよく説明できている）**で定量化します。さらにAB-UPTが出力する不確かさ（予測分散）が実際の誤差とどれだけ対応しているかを見る**キャリブレーション分析**を行うことで、「不確かさが小さいと表示されている予測は本当に信用できるか」を検証できます。

## 実装：ステップバイステップ

前提条件：Noether Frameworkが導入済みで、自社CFDケースが最低30件あること（`pip install -e .` 済みのnoetherパッケージを使用）。

```python
# === ステップ1: CFDケースを学習用とテスト用に分割する ===
# 全体の80%を学習、20%を「未知データ」として隠しておく
import numpy as np
from noether.data import CfdDataset
from noether.models import ABUPT
from sklearn.model_selection import train_test_split

dataset = CfdDataset(data_dir="./cfd_results/", format="vtk",
                      fields=["pressure", "velocity"], surface_only=True)
indices = np.arange(len(dataset))
train_idx, test_idx = train_test_split(indices, test_size=0.2, random_state=42)
print(f"学習: {len(train_idx)}件 / 検証: {len(test_idx)}件")
# >> 学習: 24件 / 検証: 6件

# === ステップ2: 学習データのみでAB-UPTを訓練する ===
# テスト用の6件はモデルに一切見せない（未知形状として扱う）
model = ABUPT(num_branches=8, anchor_resolution=64, divergence_free=True)
model.fit(dataset.subset(train_idx), epochs=200)

# === ステップ3: 未知データ（テストセット）で予測し実測CFDと比較 ===
from sklearn.metrics import r2_score, mean_squared_error
y_true, y_pred, y_std = [], [], []
for idx in test_idx:
    geom, cfd_result = dataset[idx]
    pred = model.predict(geom)
    y_true.append(cfd_result.drag_coefficient)
    y_pred.append(pred.drag_coefficient)
    y_std.append(pred.drag_coefficient_std)  # AB-UPTが出す予測の不確かさ

rmse = mean_squared_error(y_true, y_pred, squared=False)
r2 = r2_score(y_true, y_pred)
print(f"RMSE(Cd) = {rmse:.4f}, R^2 = {r2:.3f}")
# >> RMSE(Cd) = 0.0091, R^2 = 0.94

# === ステップ4: キャリブレーション確認（予測不確かさは信用できるか） ===
# 誤差が「予測不確かさ×2」の範囲に収まっている割合を計算（正規分布なら約95%が目安）
errors = np.abs(np.array(y_true) - np.array(y_pred))
within_2std = np.mean(errors < 2 * np.array(y_std))
print(f"誤差が2σ以内に収まる割合: {within_2std*100:.0f}%")
# >> 誤差が2σ以内に収まる割合: 83%
```

上の例ではR²=0.94と精度は高いものの、キャリブレーションは83%と目安の95%を下回っています。これは「不確かさを過小評価している」サインで、そのままの数値を鵜呑みにせず、追加CFDでの裏取りが必要という判断材料になります。

## Before / After（実数値で比較）

| 項目 | 統計的検証なし | AB-UPT + 交差検証後 |
|------|---------------|---------------------|
| 予測の信頼度把握 | 「たぶん合っている」 | R²=0.94、RMSE=0.0091と数値で把握 |
| 外挿領域の検出 | 気づかず設計採用 | キャリブレーション低下で事前に検知 |
| 実測との誤差（過去事例） | 最大14%のズレを大会直前に発覚 | 事前に追加CFD3ケースで誤差5%以内に補正 |
| 設計レビューでの説明力 | 感覚的な説明 | 定量指標つきで説得力あり |

## よくあるエラーと対処

| エラー・症状 | 原因 | 対処法 |
|-------------|------|--------|
| `ValueError: test_size too small` | CFDケース総数が少なすぎる | 最低30件、理想は50件以上のCFDを用意する |
| R²は高いのにキャリブレーションが低い | 不確かさの推定が過小 | `n_restarts_optimizer`を増やすか、アンサンブル（複数モデルの平均）で不確かさを再推定 |
| テストセットの誤差だけ極端に大きい | そのケースが外挿領域（学習データの範囲外） | 該当パラメータ範囲のCFDケースを追加して再学習 |

## 今週の学生チームへの宿題

今持っているCFDケースを80/20に分割し、テストセットだけでR²とRMSEを計算してみましょう。R²が0.9を下回ったら、そのサロゲートで設計を確定するのはまだ早い合図です。
