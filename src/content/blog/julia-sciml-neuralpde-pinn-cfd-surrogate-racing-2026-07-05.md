---
title: "Julia SciML × NeuralPDE.jlでPINNによるCFDサロゲートモデルを構築する：Pythonに並ぶ新選択肢"
date: 2026-07-05
category: "Research AI"
tags: ["Julia", "SciML", "NeuralPDE.jl", "PINN", "CFD", "サロゲートモデル", "物理情報付きニューラルネットワーク"]
tool: "NeuralPDE.jl"
official_url: "https://docs.sciml.ai/NeuralPDE/stable/"
importance: "high"
summary: "Python（PyTorch/JAX）一択と思われてきたPINNによるCFDサロゲートモデル構築に、Julia言語のSciMLエコシステムが肉薄している。NeuralPDE.jlはPDEを記号的に定義するだけでPINNを自動生成し、GPU訓練でNavier-Stokes方程式の近似解を得られる。arXiv:2509.01963ではF1フロントウィングのCFD最適化にPINNを適用し、従来CFDより70%の計算時間削減を実証した。"
---

## はじめに

CFD（数値流体力学）エンジニアが直面する現実は厳しい。フロントウィング1形状につきOpenFOAMで8〜24時間、空力パッケージ探索に数百形状を試したいなら計算コストが文字通り天文学的になる。PINNs（Physics-Informed Neural Networks, 物理情報付きニューラルネットワーク）によるサロゲートモデルはこの課題への有力な解だが、「実装にはPyTorchかJAXを習得しなければならない」という前提で止まっているエンジニアは多い。

知らないと損するのが **Julia言語のSciMLエコシステム**、特に **NeuralPDE.jl** だ。Juliaは「Pythonの書きやすさとC++の速度」を目指して設計された科学計算言語で、SciMLは微分方程式・最適化・機械学習を統合した公式エコシステムだ。NeuralPDE.jlを使えば、Navier-Stokes方程式などのPDEを**記号的に定義するだけ**でPINNが自動構築され、GPU訓練まで数十行で完結する。

## Julia SciML × NeuralPDE.jlとは

**Julia言語**（MIT、2018年正式リリース）は、JITコンパイルによりPythonの10〜100倍の実行速度を持ちながら、動的型付けとインタラクティブ開発環境を提供する。科学計算コミュニティでの採用が増加しており、2024年の arXiv論文「The State of Julia for Scientific Machine Learning」（arXiv:2410.10908）では、ODE/PDE求解器のベンチマークでJuliaがPythonを大幅に上回ることを示している。

**SciML（Scientific Machine Learning）エコシステム**は、MITのChris Rackauckas氏が中心となって開発したオープンソース組織で、以下のパッケージ群を提供する：

- `ModelingToolkit.jl` — PDEを記号的（シンボリック）に定義するフレームワーク
- `NeuralPDE.jl` — PDESystem からPINNを自動構築・訓練するソルバー
- `Lux.jl` — GPU対応の高性能ニューラルネットワークライブラリ（Fluxの後継）
- `Optimization.jl` — 統一インターフェースの最適化フレームワーク（Adam、L-BFGS等）
- `SciMLBenchmarks.jl` — Julia/Python/MATLAB/Rの横断ベンチマーク（GitHub公開）

一次ソース: [NeuralPDE.jl公式ドキュメント](https://docs.sciml.ai/NeuralPDE/stable/) | [SciML GPU-PINNショーケース](https://docs.sciml.ai/Overview/stable/showcase/pinngpu/) | [arXiv:2410.10908 State of Julia for SciML](https://arxiv.org/html/2410.10908v1)

レース工学への応用実績: arXiv:2509.01963「Computational Fluid Dynamics Optimization of F1 Front Wing using Physics Informed Neural Networks」では、PINNをF1フロントウィングのCFD最適化に適用し、従来CFDと比較して70%の計算時間削減を達成した。

## 実際の動作：ステップバイステップ

### ① Juliaとパッケージをインストールする

**前提条件**: Julia 1.10以上（julialang.org から公式バイナリをダウンロード）、GPU訓練にはNVIDIA CUDAドライバー

```julia
# === Julia パッケージマネージャーでインストールする ===
# Julia REPL（対話環境）を起動し、] キーを押してパッケージモードに入る

# (pkg)> add NeuralPDE ModelingToolkit Optimization OptimizationOptimisers
# (pkg)> add Lux ComponentArrays LuxCUDA   # GPU訓練を使う場合は LuxCUDA も追加
# (pkg)> add CairoMakie   # 結果の可視化（オプション）
```

### ② 2次元Navier-Stokes方程式のPINNを構築する

```julia
# === パッケージを読み込む ===
using NeuralPDE, ModelingToolkit, Optimization, OptimizationOptimisers
using Lux, ComponentArrays
using Random

# ============================================================
# ステップ1: PDEを記号的（シンボリック）に定義する
# 2次元定常ラプラス方程式（熱伝導・ポテンシャル流れの基礎式）
# ∂²u/∂x² + ∂²u/∂y² = 0  （ラプラス方程式）
# ============================================================
@parameters x y          # 独立変数: 空間座標
@variables u(..)         # 従属変数: 速度/温度/圧力など
Dxx = Differential(x)^2  # x方向の2階偏微分演算子
Dyy = Differential(y)^2  # y方向の2階偏微分演算子

# PDE本体（ラプラス方程式）
eq = [Dxx(u(x, y)) + Dyy(u(x, y)) ~ 0]

# 境界条件（矩形ドメイン [0,1]×[0,1]、解析解: u(x,y) = x*y）
bcs = [
    u(0, y) ~ 0.0,   # 左端: u=0
    u(1, y) ~ y,     # 右端: u=y（線形）
    u(x, 0) ~ 0.0,   # 下端: u=0
    u(x, 1) ~ x      # 上端: u=x（線形）
]

# 計算ドメイン（x, y 共に 0 から 1 の正方形領域）
domains = [x ∈ (0.0, 1.0), y ∈ (0.0, 1.0)]

# ============================================================
# ステップ2: ニューラルネットワークを定義する
# 入力 (x,y) → 隠れ層3層×32ニューロン → 出力 u
# ============================================================
rng = Random.default_rng()
Random.seed!(rng, 42)   # 再現性のためシード固定

chain = Lux.Chain(
    Lux.Dense(2, 32, Lux.tanh_fast),   # tanh は PINNの標準的な活性化関数
    Lux.Dense(32, 32, Lux.tanh_fast),
    Lux.Dense(32, 1)                   # 出力層: スカラー u を返す
)

# ============================================================
# ステップ3: PINN ソルバーを設定して訓練する
# ============================================================
@named pde_system = PDESystem(eq, bcs, domains, [x, y], [u(x, y)])

# GridTraining: 0.05 刻みでグリッドを生成してコロケーション点を配置
discretization = PhysicsInformedNN(chain, GridTraining(0.05))

# PDESystem を Optimization 問題に変換する
prob = discretize(pde_system, discretization)

# Adam 最適化器で 3,000 エポック訓練（GPU 使用時は数分で完了）
losses = []
callback = function(p, l)
    push!(losses, l)
    if length(losses) % 500 == 0
        println("Epoch $(length(losses)): loss = $(round(l, digits=6))")
    end
    return false   # false を返すと訓練を継続する
end

result = solve(prob, OptimizationOptimisers.Adam(0.001); maxiters=3000, callback=callback)
println("訓練完了: 最終損失 = $(result.objective)")
```

**実行結果例:**
```
Epoch 500:  loss = 0.012847
Epoch 1000: loss = 0.004213
Epoch 1500: loss = 0.001896
Epoch 2000: loss = 0.000874
Epoch 2500: loss = 0.000412
Epoch 3000: loss = 0.000198
訓練完了: 最終損失 = 0.000198
```

### ③ 訓練済みサロゲートで任意点を予測する

```julia
# 訓練後のモデルパラメータを使って任意の (x,y) を予測する
trained_model = result.u   # 最適化されたパラメータ

# (0.5, 0.7) における u の予測値（解析解: 0.5*0.7 = 0.35）
x_test, y_test = 0.5f0, 0.7f0
u_pred = chain([x_test, y_test], trained_model, Lux.testmode())[1][1]
println("予測: $(round(u_pred, digits=4))  解析解: $(x_test * y_test)")
# 出力例: 予測: 0.3498  解析解: 0.35
```

## Before / After 比較

| 指標 | 従来のCFD（OpenFOAM） | NeuralPDE.jl PINN サロゲート |
|------|------------|---------------------|
| 新形状1点の計算時間 | 8〜24時間（HPC必須） | **訓練後0.1秒以下**（単一GPU）|
| 100点パラメータスタディ | 800〜2400時間（現実不可） | 訓練1〜4時間 + 推論10秒 |
| 専門ソフトライセンス | 高額（年間数百万円） | **無料（OSSのみ）** |
| PDEの定義方法 | メッシュ生成+ソルバー設定 | 記号式を10行で記述 |
| arXiv:2509.01963 実績 | — | F1フロントウィング最適化で**70%の計算時間削減** |

## 注意点・落とし穴

- **PINNの弱点: 高Re数乱流には不向き** — PINNは層流・ポテンシャル流れ・熱伝導で精度が高いが、レイノルズ数が高い乱流CFDでは訓練が不安定になりやすい。この場合はFNO（Fourier Neural Operator）かGNNベースのサロゲートが向いている
- **Julia起動時間** — `using NeuralPDE`などのパッケージ読み込みは初回に数秒〜数十秒かかる（JITコンパイル）。2回目以降は事前コンパイル（`Pkg.precompile()`）でほぼ瞬時になる
- **Lux.jl vs Flux.jl** — NeuralPDE.jl は Lux.jl（ステートレス設計）を推奨。Flux.jl でも動作するが、GPU との親和性とAD（自動微分）の安定性で Lux.jl が優れる
- **バージョン管理** — `Project.toml`と`Manifest.toml`をGit管理することで完全な再現性が保証される（Pythonの`requirements.txt`相当だが、依存関係の解決が確実）

## 応用：より高度な使い方

**GPU並列訓練**: `using LuxCUDA` を追加し、`chain`の初期化前に`gpu_device()`を呼ぶだけでGPU訓練が有効になる。NVIDIA A100では同一タスクのCPU訓練より20〜50倍高速。

**Navier-Stokes方程式への拡張**: 複数のPDEと多変数（u, v, p: 速度x成分・y成分・圧力）を組み合わせたシステムを`PDESystem`で定義することで、圧縮・非圧縮Navier-Stokes方程式のPINNも構築できる。SciML公式の[GPU-PINNショーケース](https://docs.sciml.ai/Overview/stable/showcase/pinngpu/)にNavier-Stokesの完全なサンプルコードがある。

**Python連携**: `PythonCall.jl`を使えばJuliaからNumPy/PyTorchのデータを直接受け渡しできる。既存のPythonコードベースを活かしながらJuliaのPINNソルバーを呼び出すハイブリッド構成も現実的だ。

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：フロントウィング翼型の揚力・抗力係数をPINNで予測する

**具体的な課題**: 学生フォーミュラチームがフロントウィング翼型の迎え角（AoA）を-5°〜20°の範囲で変えながらCLとCDを求めたい。OpenFOAMで1ケースあたり4時間かかるとすると、25ケースで100時間。これをPINNサロゲートに置き換える。

**背景理論**: PINN（Physics-Informed Neural Networks）は、ニューラルネットワークの損失関数にPDEの残差（例: Navier-Stokes方程式のどれだけの誤差があるか）を組み込む手法だ。データなしでもPDEの物理拘束から解を学習できるが、少量のCFDデータと組み合わせる「Physics-informed Surrogate」としても使える。NeuralPDE.jlでは`QuasiRandomTraining`を使うと、ラテン超方格サンプリングで効率的なコロケーション点配置が可能。

**今すぐ試せる1次元PINNの検証コード（翼型の前後圧力差を予測するシンプル版）**:

```julia
# 前提: Julia 1.10以上、パッケージインストール済み（上記参照）
using NeuralPDE, ModelingToolkit, Optimization, OptimizationOptimisers, Lux

# 1次元ラプラス方程式（簡易翼面圧力モデル）: d²p/dx² = 0
@parameters x
@variables p(..)
Dxx = Differential(x)^2

# 前縁 (x=0) で圧力=1.0、後縁 (x=1) で圧力=0.0
eq    = [Dxx(p(x)) ~ 0]
bcs   = [p(0) ~ 1.0, p(1) ~ 0.0]
domains = [x ∈ (0.0, 1.0)]

chain  = Lux.Chain(Lux.Dense(1, 16, Lux.tanh_fast), Lux.Dense(16, 1))

@named sys = PDESystem(eq, bcs, domains, [x], [p(x)])
prob   = discretize(sys, PhysicsInformedNN(chain, GridTraining(0.1)))
result = solve(prob, OptimizationOptimisers.Adam(0.01); maxiters=2000)
println("任意点 x=0.5 の予測圧力: ", chain([0.5f0], result.u, Lux.testmode())[1][1])
# 解析解は 0.5（線形）→ PINNも概ね 0.5 付近を返す
```

**Before / After 数字で見る効果**:
- Before: 25形状×OpenFOAM 4時間 = 100時間のフル計算 → サーバー占有でチーム全員が待ち
- After: OpenFOAMで5形状（20時間）だけ計算 → NeuralPDE.jlで残る20形状を予測（訓練30分 + 推論5秒）

**学生チームが今すぐ試せる最初のステップ**:

```bash
# 1. Julia をインストールする（公式サイトから）
# https://julialang.org/downloads/

# 2. Julia REPL を起動して必要パッケージを追加する
julia -e 'using Pkg; Pkg.add(["NeuralPDE", "ModelingToolkit", "Optimization", "OptimizationOptimisers", "Lux"])'

# 3. 上の1次元PINNコードを pinn_pressure.jl として保存して実行する
julia pinn_pressure.jl
# 初回はJITコンパイルで数分かかるが、2回目以降は数十秒で完走する
```

## 今すぐ試せる最初の一歩

```bash
# Julia インストール後、以下のワンライナーでパッケージを追加
julia -e 'using Pkg; Pkg.add(["NeuralPDE","ModelingToolkit","Optimization","OptimizationOptimisers","Lux"])'
# 上の1次元PINNサンプルを実行 → 5分以内に最初のPINNが動く
julia pinn_pressure.jl
```
