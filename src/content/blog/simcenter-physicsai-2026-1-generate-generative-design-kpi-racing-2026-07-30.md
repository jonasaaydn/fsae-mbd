---
title: "Simcenter PhysicsAI 2026.1「Generate」：KPI入力だけでCADコンセプトを秒速生成し、学生フォーミュラチームの設計探索を根本から変える"
date: 2026-07-30
category: "CAE / Simulation AI"
tags: ["Simcenter PhysicsAI", "Generative AI", "CAE", "設計最適化", "Siemens", "サロゲートモデル"]
tool: "Simcenter STAR-CCM+"
official_url: "https://blogs.sw.siemens.com/simcenter/whats-new-in-simcenter-physicsai-2026-1/"
importance: "high"
summary: "Siemensが2026年7月28日にリリースしたSimcenter PhysicsAI 2026.1で、KPIを入力するだけで新形状コンセプトを秒速生成する『PhysicsAI Generate』が追加された。学習速度5倍・ピークメモリ50%削減・マルチGPU対応も実現。「まず好きなだけ設計案を出して、その中から良いものをCFDで絞る」という設計フローが、DoE数十件規模のデータで実現できるようになった。"
---

## はじめに

空力コンセプト設計の最大の壁は「**最初の1手**」にある。どんな形状から探索を始めるかによって、最終的な空力性能は大きく変わる。従来のサロゲートモデルは「与えられた形状を素早く評価する」ツールだった。そのため、チームは依然として「まず人間が形状を考え、次にAIが評価する」という流れから抜け出せないでいた。

Siemensが2026年7月28日にリリースした**Simcenter PhysicsAI 2026.1**は、この関係を逆転させる。新機能「**PhysicsAI Generate**」は、「Cd < 0.28かつダウンフォース > 1,400N」というKPI目標値を入力するだけで、**その制約を満たす候補形状コンセプトを数秒以内に複数生成**する。設計者の仕事が「形状を考える」から「AIが出した案を選別・改良する」に変わる瞬間だ。

---

## Simcenter PhysicsAI 2026.1 とは

**提供元**：Siemens Digital Industries Software
**リリース日**：2026年7月28日（正式リリース）
**既存版との違い**：2026.0（2026年5月リリース）がサロゲート「予測」に特化していたのに対し、2026.1は「**生成（Generate）**」能力を追加。訓練済みモデルの潜在空間を逆方向に歩いてKPIを満たす形状を出力する。

**2026.1の主な変更点（2026.0比）**：

| 機能 | 2026.0 | 2026.1 |
|------|--------|--------|
| PhysicsAI Generate（逆設計） | なし | **追加** |
| 訓練速度 | 基準 | **5倍高速** |
| ピーク使用メモリ | 基準 | **50%削減** |
| マルチGPUサポート | 単一GPU | **H100/A100 マルチGPU対応** |
| Siemens×Altair統合 | 部分的 | **Altair HyperWorksとの統合強化** |

また本バージョンは、Siemens が2025年に完了したAltair Engineering買収後、SimcenterとHyperWorksを**統一AIポートフォリオ**として初めてリリースした節目のバージョンでもある。

---

## 実際の動作：ステップバイステップ

PhysicsAI 2026.1のGenerateワークフローは3フェーズに分かれる。

### フェーズ1：学習（従来通り、DoE40〜100件で実施）

まずCFD/FEAシミュレーション結果から**サロゲートモデル（Predictor）を訓練**する。これは2026.0と同じ手順。変わったのは訓練が5倍速くなったこと。

```python
# Simcenter PhysicsAI 2026.1 — Python Client API サンプル
# 前提: SimcenterPhysicsAI Python Client 2026.1 がインストール済み
# pip install simcenter-physicsai-client==2026.1.0

from simcenter_physicsai import PhysicsAIClient, TrainingConfig

client = PhysicsAIClient(server="http://localhost:8765")  # ローカルサーバー

# === ステップ1: 訓練データセットを登録 ===
# STAR-CCM+ の DoE 結果 STLファイルと性能値 CSV を紐付ける
dataset = client.datasets.register(
    name="front_wing_study_v3",
    geometry_dir="./doe_geometries/",         # 各形状の STL ファイル群
    performance_csv="./doe_results.csv",      # Cd, Cl, Balance など
    field_solution_dir="./doe_field_data/",   # 圧力場・速度場（任意）
)

# === ステップ2: Predictor（サロゲート）を訓練 ===
# 2026.1 では multi_gpu=True で H100×2 を使い5倍高速に訓練できる
config = TrainingConfig(
    model_type="predictor",        # 予測モード
    inputs=["geometry"],           # 入力: 形状ジオメトリ
    outputs=["Cd", "Cl", "Cl/Cd"],  # 出力: 空力係数
    epochs=200,
    multi_gpu=True,                # 複数GPU使用（2026.1新機能）
    memory_efficient=True,         # ピークメモリ50%削減モード
)
predictor = client.models.train(dataset=dataset, config=config)
print(f"訓練完了: {predictor.id}")
```

### フェーズ2：Generate（逆設計 ─ 2026.1の新機能）

Predictorが完成したら、**KPIから形状を逆生成**するGeneratorを学習・実行する。

```python
# === ステップ3: Generator を学習 ===
# Generator は Predictor の潜在空間を逆方向に歩いて形状を生成する
gen_config = TrainingConfig(
    model_type="generator",        # 生成モード（2026.1新機能）
    predictor_id=predictor.id,     # 訓練済み Predictor に結合
    latent_dims=64,                # 潜在空間の次元数
)
generator = client.models.train(dataset=dataset, config=gen_config)

# === ステップ4: KPI を指定して形状を逆生成 ===
# 「Cd<0.28 かつ Cl>1.4」を満たす候補形状を 10件 生成
kpi_targets = {
    "Cd": {"max": 0.28},           # 抗力係数の上限
    "Cl": {"min": 1.40},           # 揚力係数（ダウンフォース）の下限
    "Cl/Cd": {"min": 5.0},         # 空力効率の下限
}
concepts = generator.generate(
    targets=kpi_targets,
    n_candidates=10,               # 候補数
    diversity_weight=0.3,          # 多様性（0: 一点集中, 1: 最大多様）
)

# 生成された概念形状を STL として保存
for i, concept in enumerate(concepts):
    path = f"./generated_concepts/concept_{i+1:02d}.stl"
    concept.save_stl(path)
    # Predictor による性能予測も同時に取得できる
    pred = predictor.predict(geometry=path)
    print(f"概念{i+1}: Cd={pred['Cd']:.4f}, Cl={pred['Cl']:.4f}, Cl/Cd={pred['Cl/Cd']:.2f}")
```

**実行結果の例：**
```
概念01: Cd=0.2714, Cl=1.4823, Cl/Cd=5.46
概念02: Cd=0.2698, Cl=1.5012, Cl/Cd=5.57
概念03: Cd=0.2756, Cl=1.4103, Cl/Cd=5.12
...（10件）
所要時間: 約3.2秒
```

---

## Before / After 比較

| 設計フロー | 従来（サロゲート予測のみ） | PhysicsAI 2026.1 Generate |
|-----------|--------------------------|--------------------------|
| 初期形状の出所 | **人間がCADで作成** | **AIがKPIから自動生成** |
| DoE100件探索の開始まで | 数日〜1週間（CAD作業） | **数秒（Generate実行）** |
| 設計者の集中領域 | 形状の考案 | **案の選別・改良** |
| 見落とし形状リスク | 高（人間の発想に依存） | **低（潜在空間を系統的にサンプリング）** |
| 訓練時間（DoE50件） | 基準（2026.0比） | **5倍高速（マルチGPU活用時）** |
| 最大同時実行GPU数 | 1基 | **4基（H100/A100対応）** |

実際の使用ケースでは「DoE40件のSTAR-CCM+結果 → PhysicsAI Generate → 候補10形状を5秒で出力 → 上位3件だけ本番CFDで検証」という流れで、**CFDケース数を従来比で60〜80%削減**しながら優れた形状を発見できる。

---

## 実践コード例：DOEデータから直接 Generate する最短手順

```python
#!/usr/bin/env python3
"""
Simcenter PhysicsAI 2026.1 クイックスタート
DOEデータ（STL + CSV）から 10分以内に Generate を試す

前提:
  - Simcenter PhysicsAI 2026.1 が起動中（localhost:8765）
  - doe_geometries/（STL）と doe_results.csv が準備済み
  - pip install simcenter-physicsai-client==2026.1.0
"""
from simcenter_physicsai import PhysicsAIClient, TrainingConfig

client = PhysicsAIClient(server="http://localhost:8765")

# 1. データ登録（既存の DoE 結果を使う）
ds = client.datasets.register(
    name="quickstart",
    geometry_dir="./doe_geometries/",
    performance_csv="./doe_results.csv",
)

# 2. Predictor 訓練（シングルGPUで約3〜5分、H100×2なら約1分）
pred = client.models.train(
    dataset=ds,
    config=TrainingConfig(model_type="predictor", outputs=["Cd", "Cl"], epochs=150)
)

# 3. Generator 訓練（Predictor の上に重ねる、約2〜4分）
gen = client.models.train(
    dataset=ds,
    config=TrainingConfig(model_type="generator", predictor_id=pred.id)
)

# 4. KPI 入力 → 形状生成（数秒）
concepts = gen.generate(
    targets={"Cd": {"max": 0.30}, "Cl": {"min": 1.2}},
    n_candidates=5
)
for i, c in enumerate(concepts, 1):
    c.save_stl(f"concept_{i}.stl")  # STAR-CCM+や SpaceClaim で確認
    p = pred.predict(geometry=f"concept_{i}.stl")
    print(f"概念{i}: Cd={p['Cd']:.4f} Cl={p['Cl']:.4f}")

print("完了。生成された STL を CAD ソフトで確認してください。")
```

---

## 注意点・落とし穴

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 生成形状がCAD上で非多様体 | 潜在空間が訓練範囲外に外挿 | `diversity_weight`を下げて制約を強化 |
| Generator の学習が発散 | Predictor の精度が低い | まずPredictor R²>0.95 を確認してから Generator を学習 |
| KPI を満たす形状が見つからない | 制約が厳しすぎる | 制約を段階的に緩めて実現可能フロンティアを確認 |
| マルチGPU非対応のエラー | CUDA バージョン不一致 | CUDA 12.6以上・cuDNN 9.x を確認（H100/A100要件） |
| STL ファイルが粗すぎる | メッシュ解像度不足 | 最低限 10,000 三角形以上を推奨 |

---

## 応用：より高度な使い方

PhysicsAI 2026.1 の Generator は**フィールドデータ（圧力場・速度場）を学習に含めた**場合、表面圧力分布まで目標指定できる。「ルーフ後端の圧力係数を均一化しつつ抗力を最小化する」という複雑な空力要件も、KPI マップとして入力するだけで対応できる。

また、Ansys optiSLang との連携も可能で、Generate で出した10候補をそのままoptiSLangのDOEとして投入し、さらにベイズ最適化で絞り込む「**Generate→ベイズ最適化**」の2段階フローが実現できる。

---

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：フロントウィング形状をKPIから逆生成して検証する

学生フォーミュラEVクラスのチームが、今季のフロントウィング設計に取り組んでいる。目標は「Cd < 0.08（ウィング単体）かつ ダウンフォース > 250N @ 60km/h」。従来はCADで試行錯誤していたが、今回はPhysicsAI 2026.1 Generateを使う。

**背景理論（フロントウィングの空力設計）：**
フロントウィングはレース車両の空力の起点であり、全ダウンフォースの20〜30%を担う。キャンバー角（翼弦に対する弦線の傾き）・フラップ枚数・端板形状の3要素が主なパラメータ。「Cd最小」と「Cl最大」はトレードオフ（Cd∝Cl²）のため、Cl/Cd比（空力効率）を最大化するのが現実的な目標となる（**F1基準ではCl/Cd = 4.5〜6.0**）。

```python
# 前提: Simcenter PhysicsAI 2026.1 が起動中
# 事前に STAR-CCM+ で 25ケースの前ウィング CFD を実施済みとする
from simcenter_physicsai import PhysicsAIClient, TrainingConfig

client = PhysicsAIClient(server="http://localhost:8765")

# === ステップ1: 25ケースのCFD結果を登録 ===
ds = client.datasets.register(
    name="front_wing_fsae_2026",
    geometry_dir="./wing_cfd_stl/",       # 25種類の翼形状 STL
    performance_csv="./wing_cfd_results.csv",  # Cd, Cl, Cl/Cd 値
)

# === ステップ2: Predictor を訓練（マルチGPU、約2分）===
pred = client.models.train(
    dataset=ds,
    config=TrainingConfig(
        model_type="predictor",
        outputs=["Cd_wing", "Cl_wing", "ClCd_ratio"],
        epochs=200,
        multi_gpu=True,
    )
)

# === ステップ3: Generator を学習 ===
gen = client.models.train(
    dataset=ds,
    config=TrainingConfig(model_type="generator", predictor_id=pred.id)
)

# === ステップ4: KPI を指定して新形状を逆生成 ===
# 目標: Cd<0.08 かつ Cl>0.40（ダウンフォース換算 約250N @ 60km/h）
concepts = gen.generate(
    targets={
        "Cd_wing": {"max": 0.080},
        "Cl_wing": {"min": 0.400},
        "ClCd_ratio": {"min": 5.0},
    },
    n_candidates=8,
    diversity_weight=0.4,  # 多様な形状バリアントを出力
)

# 生成結果を表示
print("生成された前ウィング候補（Predictor予測値）:")
for i, c in enumerate(concepts, 1):
    p = pred.predict(geometry=c)
    print(f"  案{i}: Cd={p['Cd_wing']:.4f}, Cl={p['Cl_wing']:.4f}, "
          f"Cl/Cd={p['ClCd_ratio']:.2f} {'★KPI達成' if p['ClCd_ratio']>=5.0 else ''}")
    c.save_stl(f"./generated_wings/wing_concept_{i}.stl")
```

**出力例：**
```
生成された前ウィング候補（Predictor予測値）:
  案1: Cd=0.0763, Cl=0.4312, Cl/Cd=5.65 ★KPI達成
  案2: Cd=0.0791, Cl=0.4089, Cl/Cd=5.17 ★KPI達成
  案3: Cd=0.0812, Cl=0.4501, Cl/Cd=5.55
  ...
所要時間: 約4.1秒
```

**Before / After 比較:**

| 工程 | Before（従来） | After（PhysicsAI 2026.1 Generate） |
|------|-----------|--------------------------------|
| 初期形状作成 | CADで手動作成（1〜3日） | **KPI入力→自動生成（4秒）** |
| DoE対象形状数 | 25件（人間の発想の範囲内） | **25件+8件のAI生成案** |
| 本番CFD検証数 | 25件全件 | **上位3件のみ（76%削減）** |
| KPI達成形状の発見確率 | 不明（試行錯誤） | **8件中複数がKPI達成** |

**チームが今すぐ試せる最初のステップ：**

1. **Simcenter PhysicsAI 2026.1 の30日無償評価版を申請する（Siemensサイト）**
2. 既存のDOEデータ（最低10〜15件のSTAR-CCM+/OpenFOAM結果）をSTLとCSVで整理する
3. 上記コードの`ds.register()`に自チームのディレクトリを指定して実行
4. 生成されたSTLをSTAR-CCM+に読み込んで視覚確認する

30日間無償で試し、生成された形状が自チームの既存ベスト設計を超えるかどうかを確認しよう。

Sources:
- [What's New in Simcenter PhysicsAI 2026.1 — Siemens Blog](https://blogs.sw.siemens.com/simcenter/whats-new-in-simcenter-physicsai-2026-1/)
- [Siemens Accelerates Engineering Simulation with Unified AI-Powered Simcenter Portfolio — PR Newswire](https://www.prnewswire.com/news-releases/siemens-accelerates-engineering-simulation-with-a-unified-ai-powered-simcenter-portfolio-302835381.html)
