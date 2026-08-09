---
title: "【学生フォーミュラ実践】Luminary Cloud SHIFT-SUVでサイドポッド形状のCdを1秒推論する"
date: 2026-07-07
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Luminary Cloud", "SHIFT-SUV", "空力最適化", "サイドポッド", "DoMINO"]
tool: "Luminary Cloud SHIFT-SUV"
official_url: "https://huggingface.co/datasets/luminary-shift/SUV"
importance: "high"
summary: "学生フォーミュラのサイドポッド・ボディワーク形状は冷却とCd(抗力)のトレードオフで多くのCFDケースが必要になります。無料公開されている物理AI基盤モデルSHIFT-SUVを使えば、STLジオメトリから抗力係数を約1秒で推論でき、数十バリアントの比較検討をCFDなしで一晩で終わらせられます。"
---

## この記事を読む前に

本ブログの「[SHIFT-SUV：Honda×NVIDIA共同開発の自動車空力物理AI基盤モデルを無料で試す方法](/blog/luminary-cloud-shift-suv-physics-ai-foundation-model-automotive-aero-2026)」でツールの基本機能を紹介しました。この記事ではそれを学生フォーミュラのサイドポッド・ボディワーク形状検討に応用します。

## 学生フォーミュラにおける課題

サイドポッドはラジエター冷却風の取り込み口であると同時に、車体の抗力(Cd)に大きく影響する部位だ。「開口部を大きくすれば冷却は楽になるが抗力が増える」というトレードオフを、限られたCFDケース数(多くのチームで1シーズン10〜20ケース程度)の中で探るのは難しい。1ケースのフルCFD(DDES相当)には数時間かかるため、卒業設計や大会直前の忙しい時期には形状比較が5〜6案で打ち切られてしまうことが多く、最終形状の根拠が「時間内に試せた中で一番マシだったもの」になりがちだ。

## Luminary Cloud SHIFT-SUVを使った解決アプローチ

SHIFT-SUVは、Luminary CloudがHondaとNVIDIAと共同開発した自動車外部空力の物理AI基盤モデルで、DDES相当のCFDシミュレーション1,000件超で事前学習済みだ。中身はNVIDIA PhysicsNeMoの「DoMINOアーキテクチャ」で、これは車体表面のSTLジオメトリ(3D形状データ)をそのまま入力として受け取り、ニューラルネットワークで抗力係数Cd・揚力係数Clと表面圧力場を直接予測する仕組みだ。CFDのように格子(メッシュ)を切って方程式を反復計算する必要がなく、学習済みの重みに形状を代入するだけなので推論が約1秒で終わる。ロードカー(AeroSUV)のデータで学習されたモデルだが、CC-BY-NC-4.0で無料公開されているため、学生フォーミュラのボディワークのような大幅に異なる形状でも「相対比較(どの形状がマシか)」の傾向を掴む一次スクリーニングには十分使える。

## 実装:ステップバイステップ

前提条件: Python 3.10以上、STL形式のボディワークCADモデル。

```bash
# === 前提条件のインストール ===
pip install trimesh torch nvidia-physicsnemo pandas
git lfs install
# サンプルデータセット(99件、約2GB)。挙動確認用
git clone https://huggingface.co/datasets/luminary-shift/SUV-sample
```

```python
# === ステップ1: サイドポッド形状バリアントを一括評価する ===
# CADで開口部の大きさ・角度を変えた10形状をSTLでエクスポート済みとする
import torch, trimesh, pandas as pd
from pathlib import Path
from physicsnemo.models.domino import DoMINO

# === ステップ2: 学習済みモデルをロードする ===
# HuggingFaceから重みを自動ダウンロード。GPU無しでも動作する
device = "cuda" if torch.cuda.is_available() else "cpu"
model = DoMINO.from_pretrained("luminary-shift/shift-suv-v1").to(device)
model.eval()

results = []
stl_files = sorted(Path("bodywork_variants/").glob("sidepod_*.stl"))

# === ステップ3: 各バリアントを推論してCd・Clを取得する ===
for stl_path in stl_files:
    mesh  = trimesh.load(str(stl_path))
    verts = torch.tensor(mesh.vertices,       dtype=torch.float32).unsqueeze(0).to(device)
    norms = torch.tensor(mesh.vertex_normals, dtype=torch.float32).unsqueeze(0).to(device)
    with torch.no_grad():
        preds = model({"vertices": verts, "normals": norms})
    results.append({"variant": stl_path.stem, "Cd": preds["Cd"].item(), "Cl": preds["Cl"].item()})
    print(f"{stl_path.stem}: Cd={preds['Cd'].item():.4f}, Cl={preds['Cl'].item():.4f}")

# === ステップ4: 結果をCSVに保存し最小Cdの形状を特定する ===
df = pd.DataFrame(results)
df.to_csv("sidepod_aero_study.csv", index=False)
print(f"最小Cd: {df['Cd'].min():.4f} ({df.loc[df['Cd'].idxmin(), 'variant']})")
```

このコードを出力の形式は次のようになります（未実測）:

```
sidepod_01: Cd=0.3421, Cl=-0.0512
sidepod_02: Cd=0.3298, Cl=-0.0487
sidepod_03: Cd=0.3105, Cl=-0.0433
...
最小Cd: 0.3105 (sidepod_03)
```

## Before / After(実数値で比較)

| 項目 | ツールなし(フルCFDのみ) | SHIFT-SUV使用後 |
|------|-----------|----------------|
| 1バリアントの評価時間 | 4〜8時間 | 約1秒 |
| シーズン中に比較できる形状案数 | 5〜6通り | 50通り以上 |
| Cd相対比較の信頼度 | ケース数不足で判断が難しい | 全案を同条件で一括比較可能 |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `ModuleNotFoundError: physicsnemo` | nvidia-physicsnemo未インストール | `pip install nvidia-physicsnemo` を実行 |
| Cd予測値が実測と大きくズレる | ボディワーク形状が学習データ(AeroSUV)から大きく外れている | 絶対値ではなく形状間の相対比較(どちらがマシか)として使う |
| STL読み込みでメッシュが破綻する | CADエクスポート時の法線・穴の不整合 | エクスポート前にメッシュ修復(Meshmixer等)でwatertight化する |

## 今週の学生チームへの宿題

今週末のテスト走行前に、手元にあるサイドポッドのSTLファイル1つを使って `model.from_pretrained("luminary-shift/shift-suv-v1")` からCd推論を1回実行してみてください。

---

*Source: [SHIFT-SUV Dataset | Luminary Cloud on Hugging Face](https://huggingface.co/datasets/luminary-shift/SUV)*
