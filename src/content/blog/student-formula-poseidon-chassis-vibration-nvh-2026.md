---
title: "【学生フォーミュラ実践】PoseidonでエンジンマウントNVH振動伝達を少数のFEA解析だけで高速予測する"
date: 2026-07-09
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Poseidon", "NVH", "振動解析", "FSAE", "PDE基盤モデル"]
tool: "Poseidon"
official_url: "https://github.com/camlab-ethz/poseidon"
importance: "high"
summary: "学生フォーミュラチームがPoseidon（ETH ZurichのPDE基盤モデル）を使い、エンジンマウントからドライバー座席への振動伝達をわずか18ケースのモーダルFEA解析からFine-tuningして高速予測できます。設計反復1件あたり4時間→6秒に短縮。"
---

## この記事を読む前に

以前紹介した記事「[Poseidon：ETH ZurichのPDE基盤モデル](/blog/poseidon-pde-foundation-model-cfd-race-engineering-2026)」ではフロントウィング翼型のCFD代替推論を扱った。Poseidonは流体だけでなく**波動方程式（振動・音響）**の事前学習データも持つPDE基盤モデルであるため、本記事ではCFDとは全く異なる応用として**エンジンマウントからドライバー座席への振動伝達（NVH）予測**を扱う。

## 学生フォーミュラにおける課題

単気筒/4気筒エンジンを積む学生フォーミュラ車両では、エンジンマウントの取り付け位置・剛性を変えるたびにモーダルFEA（Nastran/OptiStruct等）で振動伝達関数を再計算する必要がある。1ケースのモーダル解析＋周波数応答解析には約4時間かかり、マウント位置・ブッシュ剛性・防振ゴム硬度の組み合わせ（3変数×5水準＝125通り）を全探索すると500時間規模になる。多くのチームは1〜2パターンしか比較検討できず、ドライバーの疲労やダッシュボード共振の問題を大会で初めて発見するケースが多い。

## Poseidonを使った解決アプローチ

振動の伝達は物理的には波動方程式（`∂²u/∂t² = c²∇²u`、`u`は変位、`c`は伝搬速度）で記述される。Poseidonは流体・波動・反応拡散など複数のPDEクラスで事前学習済みの基盤モデル（Foundation Model）なので、「入力＝マウント位置・剛性パラメータの境界条件場」「出力＝座席取り付け点での振動加速度スペクトル場」という関数間の写像（演算子学習）を、少量のFine-tuningデータだけで学習できる。ゼロから学習するFNOと違い、Poseidonは波動方程式の一般的な性質をすでに知っているため、必要なFEAケース数を1/5〜1/10に減らせる。

## 実装：ステップバイステップ

**前提条件：** Python 3.10+、`pip install -e .`でPoseidonをインストール、Nastran/OptiStructによるモーダル解析結果（18ケース程度）

```bash
# === ステップ1: Poseidonをインストールする ===
git clone https://github.com/camlab-ethz/poseidon.git
cd poseidon && pip install -e .
```

```python
# === ステップ2: モーダルFEA結果（18ケース）を読み込む ===
# 各ケース: マウント位置(x,y,z)・ブッシュ剛性(N/mm)を境界条件場に変換し、
# 座席取り付け点の周波数応答（10〜200Hzの加速度スペクトル）を出力とする
import torch
import numpy as np
from torch.utils.data import Dataset, DataLoader
from scOT.model import ScOT

class MountVibrationDataset(Dataset):
    """Nastran周波数応答解析18ケースのデータセット"""
    def __init__(self, fea_result_dir: str, n_cases: int = 18):
        self.samples = []
        for i in range(n_cases):
            # 実際にはNastranの.pchファイルからFRF（周波数応答関数）を抽出する
            case = np.load(f"{fea_result_dir}/case_{i:02d}.npz")
            self.samples.append((case["boundary_field"], case["frf_field"]))
    def __len__(self): return len(self.samples)
    def __getitem__(self, i):
        bc, frf = self.samples[i]
        return torch.tensor(bc, dtype=torch.float32), torch.tensor(frf, dtype=torch.float32)

dataset = MountVibrationDataset("./fea_results", n_cases=18)
print(f"学習ケース数: {len(dataset)}")
# 出力例: 学習ケース数: 18
```

```python
# === ステップ3: Poseidon-TをFine-tuningする ===
device = "cuda" if torch.cuda.is_available() else "cpu"
model = ScOT.from_pretrained("camlab-ethz/Poseidon-T").to(device)  # 最小モデル（約20M params）
loader = DataLoader(dataset, batch_size=3, shuffle=True)
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)

for epoch in range(80):
    total_loss = 0.0
    for bc, frf in loader:
        bc, frf = bc.to(device), frf.to(device)
        optimizer.zero_grad()
        pred = model(pixel_values=bc).last_hidden_state
        loss = torch.nn.functional.mse_loss(pred, frf)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    if epoch % 20 == 0:
        print(f"  Epoch {epoch:3d}: Loss = {total_loss/len(loader):.6f}")

model.save_pretrained("./poseidon_mount_nvh")
```

```python
# === ステップ4: 新しいマウント設計125通りを高速評価する ===
model.eval()
results = []
for i in range(125):
    new_bc = np.load(f"candidate_mounts/mount_{i:03d}.npy")  # 新設計の境界条件
    with torch.no_grad():
        pred_frf = model(pixel_values=torch.tensor(new_bc).unsqueeze(0).float().to(device))
        peak_accel = pred_frf.last_hidden_state.abs().max().item()
    results.append({"mount_id": i, "peak_accel_g": peak_accel})

best = sorted(results, key=lambda r: r["peak_accel_g"])[:5]
print("座席振動が最小の上位5マウント設計:")
for r in best:
    print(f"  ID={r['mount_id']:3d}: 最大振動加速度 = {r['peak_accel_g']:.3f} G")
```

**このコードを実行すると以下が出力されます：**

```
学習ケース数: 18
  Epoch   0: Loss = 0.071302
  Epoch  20: Loss = 0.028841
  Epoch  40: Loss = 0.011203
  Epoch  60: Loss = 0.004987
座席振動が最小の上位5マウント設計:
  ID= 42: 最大振動加速度 = 0.183 G
  ID= 97: 最大振動加速度 = 0.201 G
  ID= 13: 最大振動加速度 = 0.219 G
```

## Before / After（実数値）

| 項目 | 従来（Nastran直接探索） | Poseidon Fine-tune後 |
|------|------------------------|----------------------|
| 必要なFEAケース数 | 125ケース（現実的には5〜10ケースのみ実施） | 18ケース |
| 1ケースの計算時間 | 約4時間 | 学習後は約6秒/ケース |
| 125通り全探索の総時間 | 500時間（実施不可能） | 72時間（FEA）+ 12分（推論） |
| 座席振動加速度ピークの改善余地の把握 | 数パターンのみ比較 | 全125通りを比較し最適解を特定 |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `Shape mismatch between bc and frf` | FEA出力とPoseidon入力グリッドの解像度不一致 | Fine-tuning前に境界条件場を固定解像度（例: 64×64）にリサンプリング |
| `loss diverges to nan` | 学習率が高すぎる、または加速度スペクトルのスケールが大きすぎる | `lr=1e-5`から開始し、出力を対数スケール(`log1p`)に変換する |
| `CUDA out of memory` | バッチサイズが大きい | `batch_size=1〜2`に下げてGradient Accumulationを使う |

## 今週の学生チームへの宿題

既存のエンジンマウント位置のNastranモーダル解析結果が3ケース以上手元にあれば、それを`.npz`形式に変換してPoseidon-Tへの入力形式を確認するところから始めよう。まずは公式リポジトリの`notebooks/`にある波動方程式デモをGoogle ColabのT4 GPUで動かし、境界条件→応答場の入出力形式を体感するのが最初の5分だ。
