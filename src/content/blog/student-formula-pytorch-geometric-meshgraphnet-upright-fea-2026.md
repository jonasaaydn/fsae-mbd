---
title: "【学生フォーミュラ実践】PyTorch Geometricで作るMeshGraphNet——アップライトFEAを660倍速化して軽量化設計を週末で完成させる"
date: 2026-06-18
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "PyTorch Geometric", "MeshGraphNet", "FEA構造解析", "FSAE"]
tool: "PyTorch Geometric"
official_url: "https://pyg.org/"
importance: "high"
summary: "学生フォーミュラチームがPyTorch GeometricのMeshGraphNetでアップライトFEA解析サロゲートを構築すると、Ansysで2〜3時間かかる1点の構造解析が0.01秒で推論できます。大会前の軽量化イテレーションを5案から1000案以上に拡大できます。"
---

## この記事を読む前に

[「FEAメッシュをグラフに変換して660倍速を実現——X-MeshGraphNetがレース車両構造サロゲートを変える実装ガイド」](/blog/meshgraphnet-gnn-fea-structural-surrogate-racing-2026-06-10)でMeshGraphNetの理論と産業応用を解説しました。この記事では学生フォーミュラチームが実際にアップライトFEA解析サロゲートを構築するコードと手順に絞って解説します。

## 学生フォーミュラにおける課題

学生フォーミュラのアップライト（タイヤを支持するステアリングナックル）は、コーナリング時に最大4〜5Gの横荷重と制動時の縦荷重が複合的に加わります。アルミ削り出し（A6061-T6、降伏応力276MPa）から炭素繊維+アルミインサート構造への軽量化を検討するとき、形状1種につきAnsys Mechanicalで1回の静解析に2〜3時間かかります。

大会前の設計ロック（製作開始）まで2週間しかない状況で評価できる設計案は現実的に10案が限界です。「もう100g削れるはずだが安全率が心配」という板挟みをデータなしで解決するのは困難で、多くのチームが保守的な設計を選びます。MeshGraphNetサロゲートを使えば、この壁を数百倍の速度で突破できます。

## PyTorch Geometricを使った解決アプローチ

MeshGraphNetはFEAのメッシュをグラフ（節点＝グラフノード、要素辺＝エッジ）として扱い、グラフニューラルネットワーク（GNN: Graph Neural Network）でノードごとのvon Mises応力・変位を推論します。

PyTorch Geometric（PyG）はグラフ深層学習の標準ライブラリで、**メッセージパッシング**（隣接ノードの情報を集約して更新する演算）を数行で記述できます。各節点は「位置XYZ・境界条件フラグ」を入力特徴として持ち、隣接節点との情報交換を繰り返すことで、物理的に妥当な応力分布を学習します。学習が完了すれば、新しい形状でも0.01秒で推論できます。

## 実装：ステップバイステップ

**前提条件**
- Python 3.11
- PyTorch 2.4以降、PyTorch Geometric 2.5以降、meshio 5.x

```bash
# PyTorch GeometricとFEAメッシュ読み込みライブラリをインストール
pip install torch==2.4.0 torchvision
pip install torch_geometric
pip install torch_scatter torch_sparse -f https://data.pyg.org/whl/torch-2.4.0+cpu.html
pip install meshio  # VTK形式のFEAメッシュを読み込むためのライブラリ
```

```python
import torch
import torch.nn as nn
import meshio
import numpy as np
from torch_geometric.data import Data, DataLoader
from torch_geometric.nn import MessagePassing
import torch.nn.functional as F

# === ステップ1: FEAメッシュをグラフに変換する ===
# AnsysからVTK Unstructured Grid（.vtu）形式でエクスポートしたメッシュを処理する
def load_fea_as_graph(vtu_path):
    mesh = meshio.read(vtu_path)  # メッシュを読み込む

    # 節点座標を入力特徴量として使う（学習安定化のため標準化する）
    pos = torch.tensor(mesh.points, dtype=torch.float32)
    pos_norm = (pos - pos.mean(0)) / (pos.std(0) + 1e-8)  # ゼロ割り算を防ぐ

    # 四面体要素の各辺をグラフエッジに変換する（双方向に登録）
    edges = []
    for tet in mesh.cells_dict.get('tetra', []):  # 四面体要素を処理
        for i in range(4):
            for j in range(4):
                if i != j:
                    edges.append([tet[i], tet[j]])  # 全辺を双方向で追加
    edge_index = torch.tensor(edges, dtype=torch.long).T  # shape: [2, num_edges]

    # 学習ターゲット: 各節点のvon Mises応力（MPa）を正規化して使う
    raw_stress = mesh.point_data.get('von_mises_stress', np.zeros(len(mesh.points)))
    stress = torch.tensor(raw_stress, dtype=torch.float32).unsqueeze(1)

    return Data(x=pos_norm, edge_index=edge_index, y=stress, pos=pos)

# 学習データを読み込む（100通りの形状でAnsys FEAを実行済みの前提）
dataset = [load_fea_as_graph(f'fea_results/upright_{i:03d}.vtu') for i in range(100)]
train_loader = DataLoader(dataset[:80], batch_size=4, shuffle=True)   # 80件で学習
test_loader  = DataLoader(dataset[80:], batch_size=4)                 # 20件で評価

# === ステップ2: MeshGraphNetモデルを定義する ===
class MeshGraphNet(MessagePassing):
    """
    GNNによるFEAサロゲート: 節点座標→von Mises応力を予測する
    """
    def __init__(self, in_ch=3, hidden=128, out_ch=1):
        super().__init__(aggr='mean')  # 近傍ノードの情報を平均で集約する
        # エッジMLPとノードMLPを2層ずつ構成する
        self.edge_mlp = nn.Sequential(
            nn.Linear(in_ch * 2, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden),    nn.ReLU()
        )
        self.node_mlp = nn.Sequential(
            nn.Linear(in_ch + hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, out_ch)
        )

    def forward(self, x, edge_index):
        return self.propagate(edge_index, x=x)  # メッセージパッシングを実行

    def message(self, x_i, x_j):
        # 受信ノード x_i と送信ノード x_j の特徴を結合してエッジ特徴を計算する
        return self.edge_mlp(torch.cat([x_i, x_j], dim=-1))

    def update(self, aggr_out, x):
        # 集約されたエッジ情報とノード自身の特徴を結合してノードを更新する
        return self.node_mlp(torch.cat([x, aggr_out], dim=-1))

model = MeshGraphNet(in_ch=3, hidden=128, out_ch=1)
print(f'モデルパラメータ数: {sum(p.numel() for p in model.parameters()):,}')

# === ステップ3: モデルを学習する（ノートPCのCPUで約30〜60分）===
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=30, gamma=0.5)

for epoch in range(100):
    model.train()
    total_loss = 0.0
    for batch in train_loader:
        optimizer.zero_grad()
        pred = model(batch.x, batch.edge_index)  # 応力を予測する
        loss = F.mse_loss(pred, batch.y)
        loss.backward()   # 誤差逆伝播
        optimizer.step()
        total_loss += loss.item()
    scheduler.step()  # 30エポックごとに学習率を半分にする

    if (epoch + 1) % 10 == 0:
        print(f'Epoch {epoch+1:3d}  Loss={total_loss/len(train_loader):.4f}')

torch.save(model.state_dict(), 'meshgraphnet_upright.pth')  # 学習済みモデルを保存

# === ステップ4: 新しいアップライト形状を0.01秒で推論する ===
model.eval()
model.load_state_dict(torch.load('meshgraphnet_upright.pth'))

new_design = load_fea_as_graph('candidate/upright_lightweight_v3.vtu')
with torch.no_grad():
    stress_pred = model(new_design.x, new_design.edge_index)

max_stress   = stress_pred.max().item()     # 最大von Mises応力（MPa）
safety_ratio = 276.0 / max_stress           # A6061-T6 降伏応力276MPaを基準に安全率を計算

print(f'予測最大von Mises応力: {max_stress:.1f} MPa')
print(f'安全率（降伏基準）    : {safety_ratio:.2f}')
print(f'判定: {"OK（設計採用可）" if safety_ratio >= 1.5 else "NG（肉厚を増やすこと）"}')
```

このコードを出力の形式は次のようになります（未実測）：

```
モデルパラメータ数: 50,561
Epoch  10  Loss=0.0842
Epoch  20  Loss=0.0431
...
Epoch 100  Loss=0.0089
予測最大von Mises応力: 187.3 MPa
安全率（降伏基準）    : 1.47
判定: NG（肉厚を増やすこと）
```

## 学生フォーミュラ・レース車両開発への応用

学習済みサロゲートをトポロジー最適化ループに組み込むと、形状パラメータ（肉抜き穴の直径・位置）を変数として安全率≥1.5を制約条件に質量を最小化する問題を自動で解けます。

具体的なシナリオ：アップライトの肉抜き穴を3箇所設け、それぞれの直径（φ8〜φ20mm）を最適化変数とします。評価関数を「重量」、制約を「安全率≥1.5（MeshGraphNetで推論）」として`scipy.optimize.minimize`に渡せば、100ms以下/評価×1000試行の最適化が30秒以内で完了します。

**Before / After（学生チームの実例想定値）**

| 項目 | Ansys直接実行 | MeshGraphNet使用後 |
|------|-------------|-------------------|
| 1設計案の解析時間 | 2〜3時間 | **0.01秒**（推論時） |
| 大会前2週間で評価できる設計案数 | 5〜10案 | **1,000案以上** |
| 最適肉抜き形状の発見にかかる期間 | 1〜2週間 | **数時間** |
| 推論精度（最大応力、R²） | — | 0.95〜0.98（100サンプル時） |
| 推論に必要なスペック | 高性能ワークステーション | **学生用ノートPC（CPU）で可** |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `CUDA out of memory` | バッチサイズが大きすぎる | `batch_size=1`または`batch_size=2`に変更する |
| 学習後も精度が上がらない（R²<0.7） | 学習データが少ない、形状変化が大きすぎる | FEAデータを150点以上に増やすか、形状変化量を±15%以内に制限する |
| `meshio.read`でエラー | vtk/vtuのバージョン不一致 | `pip install --upgrade meshio`で最新版を使用する |
| `edge_index`でインデックス範囲外エラー | 節点インデックスが要素数を超える | `edge_index = edge_index % num_nodes`でクリップする |
| 推論結果が全ノードほぼ同じ値になる | メッセージパッシングの深さが足りない | `MeshGraphNet`を3層重ねて実行するか、`num_layers`を増やす |

## 今週の学生チームへの宿題

Ansysのアップライト解析結果がVTK形式（.vtu）で5点でも手元にあれば、Step1の`load_fea_as_graph`だけを実行してグラフ変換が成功するか試してみましょう。`Data(x=..., edge_index=..., y=...)`のshapeを`print(data)`で確認するだけで、サロゲート構築の半分は完了しています。まずは「FEAデータをグラフとして読み込めた」を今週中に達成してください。
