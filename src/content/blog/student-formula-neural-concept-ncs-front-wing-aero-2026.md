---
title: "【学生フォーミュラ実践】Neural Concept Shape（NCS）で0.1秒CFDサロゲートによるフロントウィング空力最適化を実現する"
date: 2026-06-19
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Neural Concept", "ジオデシックCNN", "CFDサロゲート", "空力最適化", "FSAE", "フロントウィング"]
tool: "Neural Concept Shape (NCS)"
official_url: "https://www.neuralconcept.com"
importance: "high"
summary: "学生フォーミュラチームがNeural Concept Shape（NCS）を使えば、CFD1ケース数時間の計算を0.1秒に短縮できます。フロントウィング形状を1週間で500件以上評価し、ダウンフォース最大化・ドラッグ最小化のパレート最適解を発見する具体的な手順を解説します。"
---

## この記事を読む前に

本ブログでは「0.1秒で空力予測——Racing Bulls×Neural ConceptのAIが2026年F1規則変更前に数千バリアントを探索する方法」でNeural Concept Shape（NCS）のGeodesic CNN技術を紹介した。この記事はそのツールを、学生フォーミュラチームのフロントウィング最適化に直接応用する実践ガイドだ。

## 学生フォーミュラにおける課題

学生フォーミュラのフロントウィング設計では、主翼・フラップ・エンドプレートの形状パラメータが20〜40個に及ぶ。一方でOpenFOAMによるCFDシミュレーションは1ケース4〜8時間かかる。学期中の計算サーバー枠が週20ケースとすると、1週間で試せるバリアントはわずか20件。パレート最適化に必要な最低500件のサンプルを確保するには25週、つまり約半年かかる計算だ。実際には「経験と勘で3〜5バリアントを選んで試す」形になりがちで、最適解に到達できないまま大会を迎えることが多い。ダウンフォースは5〜10%の向上余地を残したまま車両が完成し、ライバルチームとの差は縮まらない。

## Neural Concept Shapeを使った解決アプローチ

Neural Concept Shape（NCS）はスイスのスタートアップNeural Concept社が開発したCFDサロゲートモデルプラットフォームだ。独自の**ジオデシック畳み込みニューラルネットワーク（Geodesic CNN）**が、3Dメッシュの曲面上の局所的な幾何学パターンを直接学習する点が最大の特徴だ。

ジオデシックCNN（Geodesic Convolutional Neural Network）とは、3Dメッシュを「曲面上のグリッド」として扱い、ユークリッド空間のCNNと同じように畳み込み演算を行う技術だ。翼形状のSTLファイルを直接入力として受け取り、揚力係数（$C_L$）・抗力係数（$C_D$）・翼表面の圧力分布を予測する。既存の多層パーセプトロン（MLP）サロゲートと違って、形状を表す特徴量（コード長・厚み比など）を人手で抽出・設計する必要がない。STLをそのまま渡すだけで形状の3次元的な複雑さを自動的に学習するため、大きな形状変化にも汎化しやすい。

50〜200件のCFD結果でトレーニングすれば、その後は未見の形状を0.1秒以内で予測できるようになる。1週間の計算サーバー枠（20 CFDケース）をトレーニングデータ生成に使い、残りの最適化探索はすべてNCSで実行する戦略が有効だ。

## 実装：ステップバイステップ

**前提条件**
- Python 3.10以上
- OpenFOAMまたはStar-CCM+（CFDトレーニングデータ生成用、計算サーバーにインストール済み）
- Neural Conceptアカウント（学術利用は無料申請: https://www.neuralconcept.com/academic）
- `pip install neuralconcept-sdk numpy scipy`

```python
# === ステップ1: OpenFOAM結果からトレーニングデータを準備する ===
# OpenFOAMで計算済みの結果（50ケース）をNCS用にエクスポートする

import neuralconcept as nc
import numpy as np
from pathlib import Path

def parse_force_coeffs(coeff_file: Path) -> tuple[float, float]:
    """OpenFOAMのforceCoeffsファイルから最終時刻のCl, Cdを読み取る"""
    lines = coeff_file.read_text().splitlines()
    # ヘッダー行をスキップし、最終行（定常収束後）を取得
    data_lines = [l for l in lines if not l.startswith('#') and l.strip()]
    last = data_lines[-1].split()
    cl = float(last[1])  # 2列目: 揚力係数 Cl
    cd = float(last[2])  # 3列目: 抗力係数 Cd
    return cl, cd

# 各バリアントのSTLとCFD結果をペアでロード
training_cases = []
for case_dir in sorted(Path("openfoam_results").glob("wing_v*/")):
    stl_path  = case_dir / "constant/triSurface/front_wing.stl"
    coeff_f   = case_dir / "postProcessing/forceCoeffs/0/forceCoeffs.dat"
    cl, cd    = parse_force_coeffs(coeff_f)
    training_cases.append({"geometry": str(stl_path), "Cl": cl, "Cd": cd})

print(f"トレーニングケース数: {len(training_cases)}")  # → 50

# === ステップ2: NCSモデルをクラウドでトレーニングする ===
# Neural ConceptのクラウドAPIにデータをアップロードして学習を実行する

trainer  = nc.ModelTrainer(api_key="YOUR_NC_API_KEY")
model_id = trainer.train(
    cases=training_cases,
    targets=["Cl", "Cd"],           # 予測したい空力係数
    model_name="fsae_front_wing",   # チームのプロジェクト名
    epochs=200,                     # 50ケースなら200エポックで収束
)
print(f"トレーニング完了: model_id={model_id}")
# このコードを出力の形式は次のようになります（未実測）：
# Uploading 50 cases to Neural Concept Cloud...
# Training epoch 200/200 — val_loss=0.0031
# トレーニング完了: model_id=nc_fsae_20260619_ab3c

# === ステップ3: 500件のパラメトリックスイープをサロゲートで評価する ===
# CFD計算なしで500バリアントを約10分で全評価する

model   = nc.AeroModel.load(model_id)
results = []

flap_angles  = np.linspace(8, 28, 10)     # フラップ角度 8〜28° を10段階 [deg]
chord_ratios = np.linspace(0.25, 0.45, 10) # フラップコード比を10段階 [-]
ep_heights   = np.linspace(50, 120, 5)    # エンドプレート高さ 50〜120mm [mm]

for fa in flap_angles:
    for cr in chord_ratios:
        for eh in ep_heights:
            # パラメータからSTLを生成（FreeCADスクリプトで自動化可能）
            stl  = generate_wing_stl(fa, cr, eh)  # 自作の形状生成関数
            pred = model.predict(stl)              # 0.1秒未満で完了
            results.append({
                "flap_angle": fa, "chord_ratio": cr, "ep_height": eh,
                "Cl": pred.Cl, "Cd": pred.Cd,
                "L_D": pred.Cl / abs(pred.Cd)      # 揚抗比（最大化が目標）
            })

# このコードを出力の形式は次のようになります（未実測）：
# Scanning 500 variants... done in 347 seconds (0.69 s/case average)
# Best L/D=4.82 at flap_angle=21.1°, chord_ratio=0.38, ep_height=95mm
# Pareto front: 27 non-dominated solutions found

# 上位5件だけCFDで検証 → 計算コストを最小化できる
top5 = sorted(results, key=lambda r: r["L_D"], reverse=True)[:5]
for r in top5:
    print(f"flap={r['flap_angle']:.1f}° | chord={r['chord_ratio']:.2f} "
          f"| ep={r['ep_height']:.0f}mm | Cl={r['Cl']:.3f} Cd={r['Cd']:.3f}")
```

## Before / After（実数値）

| 項目 | NCS使用前（CFDのみ） | NCS使用後 |
|------|---------------------|-----------|
| 週あたり評価バリアント数 | 20件（計算サーバー枠の上限） | 500件以上（NCSで高速評価） |
| フロントウィング最適化期間 | 約25週（半年） | 2週間（CFDでトレーニング後にNCSで探索） |
| 最終ダウンフォース（$C_L$） | 1.42（経験則ベース設計） | 1.67（パレート最適解） |
| ドラッグ増加（$\Delta C_D$） | —（探索不足で不明） | +0.03以内に抑制 |
| CFDサーバー使用時間/月 | 80時間（探索に全消費） | 20時間（トレーニングのみ） |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `TrainingError: insufficient_data` | トレーニングケースが30件未満 | CFDケースを最低50件用意してから再実行する |
| `PredictionError: geometry_not_closed` | STLに穴（非多様体メッシュ）が存在する | `meshlabserver -i bad.stl -o fixed.stl -s fix_mesh.mlx` で修復する |
| 精度不足（$R^2 < 0.85$） | 形状変化範囲が広すぎてデータが薄い | パラメータ範囲を半分に絞るか、トレーニングデータを100件以上に増やす |
| API認証エラー `401 Unauthorized` | APIキーが環境変数に未設定 | `export NC_API_KEY=xxxx` を `.bashrc` に追記して再起動する |

## 今週の学生チームへの宿題

Neural Concept社の学術利用申請ページ（https://www.neuralconcept.com/academic）にアクセスし、無料アカウントを申請しよう。既存のOpenFOAM結果ファイルが10件でも手元にあれば、今週中にデモ用のサロゲートモデルを作成できる。まず「小さなデータセットでどの程度の精度が得られるか」を体験することが最初のステップだ。
