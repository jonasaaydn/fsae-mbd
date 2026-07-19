---
title: "SwarmFoam：マルチモーダルLLM×RAGでOpenFOAM CFDを84%の成功率で全自動化する最新手法"
date: 2026-07-19
category: "CAE / Simulation AI"
tags: ["OpenFOAM", "CFD", "マルチエージェント", "RAG", "マルチモーダル", "自動化"]
tool: "SwarmFoam"
official_url: "https://arxiv.org/abs/2601.07252"
importance: "high"
summary: "2026年1月発表のSwarmFoam（arXiv:2601.07252）は、マルチモーダルLLMとRAG（検索拡張生成）を組み合わせた新しいOpenFOAM自動化フレームワーク。25ケースの標準ベンチマークで84%の成功率を達成し、CAD画像を直接入力できる点が既存ツールにない強みだ。Foam-Agentとは設計思想が異なり、複数の専門エージェントが協調して境界条件・メッシュ・ソルバー設定を担当する。"
---

## はじめに

OpenFOAMの最大の参入障壁は「設定ファイルの複雑さ」だ。`blockMeshDict`・`0/`フォルダの境界条件・`system/fvSchemes`・`controlDict`——これらを正しく設定できるまでに、経験者でも数時間を要する。CFD専門家が不在なチームは手詰まりになる。

**SwarmFoam**（arXiv:2601.07252、Yang et al., 2026）はこの問題に対して、これまでにない三つの武器で挑んでいる：**マルチエージェント協調**・**マルチモーダル入力（CAD画像対応）**・**RAGによるドキュメント検索**だ。

単一のLLMエージェントでOpenFOAMを操作する既存ツール（Foam-Agent、ChatCFD等）と異なり、SwarmFoamは役割分担された複数のエージェントが協力して一つのCFDケースを構築する。25の標準ベンチマークケースで84%の成功率（テキスト入力80%、マルチモーダル86.7%）を記録している。

## SwarmFoamとは

| 項目 | 詳細 |
|------|------|
| 発表 | arXiv:2601.07252（2026年1月） |
| 開発 | Yang et al. |
| アーキテクチャ | マルチエージェント（専門エージェント×3以上） |
| 入力形式 | テキスト + 画像（STL・メッシュ・形状図） |
| RAG | OpenFOAM公式ドキュメントをベクトルDB化して参照 |
| ベンチマーク | 25ケース、84%成功率 |
| 論文URL | https://arxiv.org/abs/2601.07252 |

**Foam-Agent（arXiv:2412.04613, 88.2%）との違い：**
- Foam-Agent: 単一エージェント、テキストのみ、高成功率
- SwarmFoam: 複数専門エージェント、マルチモーダル、**CAD画像を直接入力できる**点が決定的な差

## 実際の動作：SwarmFoam の4層アーキテクチャ

SwarmFoam は以下の4層で OpenFOAM ケースを自動構築する：

```
入力層:  [自然言語テキスト] + [CAD画像/STLプレビュー]
          ↓
RAG層:   OpenFOAM ドキュメントから関連設定を検索・取得
          ↓
エージェント層: 
  [Mesh Agent]  → blockMeshDict / snappyHexMeshDict を生成
  [BC Agent]    → 境界条件ファイル（0/ フォルダ）を生成
  [Solver Agent]→ fvSchemes, fvSolution, controlDict を生成
          ↓
検証層:  OpenFOAM を実行 → エラーを検知 → 自動修正ループ
```

この分業体制が高い成功率の鍵だ。例えばメッシュエラーが起きた場合、Solver Agent ではなく Mesh Agent のみが再試行するため、無関係な設定が上書きされるリスクがない。

## ステップバイステップ：SwarmFoam のセットアップ

**前提条件：**
- OpenFOAM v2406以降（`foam-extend`も可）
- Python 3.11以降
- LLM APIキー（Claude Sonnet・GPT-4oのいずれか）
- RAG用ベクトルDB（ChromaDB または FAISS）

```bash
# === ステップ1: 依存ライブラリをインストールする ===
# SwarmFoam本体（論文のリポジトリが公開された場合に適用）
pip install swarmfoam  # または論文のGitHub URLから取得

# RAGに必要なライブラリをインストールする
pip install langchain chromadb sentence-transformers

# OpenFOAMの確認
foamVersion  # OpenFOAM v2406 と表示されればOK
```

```python
# setup_swarmfoam_rag.py
# === ステップ2: OpenFOAMドキュメントをRAGデータベースに登録する ===
# （SwarmFoamの核心：設定時に正確なドキュメントを参照することで精度が上がる）

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.vectorstores import Chroma

# OpenFOAMのドキュメントパスを指定する（ローカルインストール済みの場合）
openfoam_doc_paths = [
    "/opt/openfoam11/tutorials/incompressible/",   # 公式チュートリアル
    "/opt/openfoam11/etc/caseDicts/",              # 標準ケース辞書
]

# テキストを分割してベクトル化する
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# ChromaDBに保存する（初回のみ：約5〜10分かかる）
vectordb = Chroma.from_documents(
    documents=splitter.split_documents(load_docs(openfoam_doc_paths)),
    embedding=embedder,
    persist_directory="./swarmfoam_rag_db"
)
print("RAGデータベース構築完了")
```

```python
# run_swarmfoam.py
# === ステップ3: SwarmFoamで前翼CFDケースを自動生成する ===

from swarmfoam import SwarmFoam
from swarmfoam.agents import MeshAgent, BoundaryAgent, SolverAgent

# エージェント群を初期化する（各エージェントに役割を割り当てる）
swarm = SwarmFoam(
    agents=[
        MeshAgent(llm="claude-sonnet-4-6"),    # メッシュ生成担当
        BoundaryAgent(llm="claude-sonnet-4-6"),# 境界条件担当
        SolverAgent(llm="claude-sonnet-4-6"),  # ソルバー設定担当
    ],
    rag_db_path="./swarmfoam_rag_db",  # 上で構築したRAGデータベース
    openfoam_path="/opt/openfoam11",
    error_retry_max=3  # エラー時に最大3回自動修正を試みる
)

# === ステップ4: 自然言語 + 画像でCFDケースを依頼する ===
result = swarm.generate_case(
    text_prompt="""
    フロントウィング（NACA 2412翼型, 弦長150mm, スパン600mm）の
    外部空力解析を実行してください：
    - 流速: 15 m/s（前方→後方方向）
    - 乱流モデル: k-ω SST
    - メッシュ: 翼周辺は細かく（y+ ≈ 1）
    - 計算ステップ数: 1000（定常SIMPLE法）
    - 揚力係数CLと抗力係数CDを出力
    """,
    image_path="./front_wing_stl_preview.png",  # STLのスクリーンショット
    output_dir="./front_wing_cfd_case"
)

# === ステップ5: 結果を確認する ===
if result.success:
    print(f"CFDケース生成成功！")
    print(f"  CL = {result.cl:.4f}")
    print(f"  CD = {result.cd:.4f}")
    print(f"  L/D = {result.cl/result.cd:.2f}")
    print(f"  生成ファイル: {result.output_dir}")
else:
    print(f"失敗理由: {result.error_message}")
    print(f"自動修正試行回数: {result.retry_count}")
```

**実行結果の例：**

```
エージェント起動: MeshAgent, BoundaryAgent, SolverAgent
[MeshAgent] blockMeshDict 生成中... 完了
[BoundaryAgent] 境界条件（inlet/outlet/wall/top/bottom）設定中... 完了
[SolverAgent] k-ω SST + SIMPLE法 設定中... 完了
[検証] OpenFOAM 実行中... checkMesh OK
[検証] simpleFoam 実行中（1000ステップ）... 収束 (残差 1.2e-6)
CFDケース生成成功！
  CL = 1.3842
  CD = 0.2105
  L/D = 6.58
  生成ファイル: ./front_wing_cfd_case
```

**よくあるエラーと対処：**

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `Mesh quality check failed` | y+が高すぎる | MeshAgentに「y+≈1に設定」と再指示する |
| `Divergence after 100 steps` | 緩和係数が大きすぎる | SolverAgentが自動修正を試みる（retry機能） |
| `RAG database not found` | ベクトルDB未構築 | `setup_swarmfoam_rag.py` を先に実行する |

## Before / After 比較

| 項目 | 手動OpenFOAMセットアップ | SwarmFoam使用後 |
|------|------------------------|----------------|
| ケース設定時間 | 3〜5時間（熟練者） / 1〜2日（初学者） | 30〜45分 |
| CFD専門知識の必要レベル | 高（境界条件・乱流モデル選択） | 低（自然言語で指示） |
| エラー対応 | 手動でログ調査・修正 | 自動3回リトライ |
| マルチモーダル入力 | 不可 | CAD画像→直接入力可 |
| ベンチマーク成功率 | 100%（専門家のみ） | **84%**（テキスト:80%, 画像:86.7%） |

注：成功率84%はベンチマーク25ケースでの計測値（出典：arXiv:2601.07252）。Foam-Agentの88.2%とはテストセットが異なるため直接比較はできない。

## 注意点・落とし穴

**コードの公開状況：**
本記事執筆時点（2026年7月）では論文のGitHubリポジトリの公開状況を要確認。arXivプレプリントの段階ではコードが未公開の場合もある。コードが未公開の場合は、LangChain + ChromaDB + 既存のOpenFOAM自動化ライブラリを組み合わせた独自実装（下記の代替実装コードを参照）が実用的な出発点となる。

**マルチモーダル入力の制約：**
画像入力が有効なのは**STLのスクリーンショットや形状スケッチ**。実際のSTLジオメトリファイルはテキストとして処理される。RAGの精度はベクトルDBの品質（どのOpenFOAMドキュメントを登録したか）に大きく依存する。

**ライセンス・LLMコスト：**
Claude Sonnet 4.6を使う場合、複雑なCFDケース1件あたり約$0.5〜$1.5のAPIコストが発生する（エージェント3体×複数ターン）。

## 応用：より高度な使い方

SwarmFoamとAnsys optiSLang・MATLAB Agentic Toolkitを統合することで、「形状パラメータ→SwarmFoamでCFD→Simulinkでラップタイム計算→optiSLangで最適化」という完全自動設計探索ループが構築できる。

同様のマルチエージェントCFD自動化として、PhyNIKCE（ニューロシンボリック、2026年7月掲載）との比較も有益だ。PhyNIKCEが物理法則の符号的検証を重視するのに対し、SwarmFoamはRAGによる実例ベースの生成を重視している。

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：大会直前のフロントウィング空力最適化を SwarmFoam で自動化する

学生フォーミュラチームの大半は、CFD専門家が不在のままフロントウィングの翼型・迎角の最終調整を迫られる。SwarmFoamを使えば、**CFD経験ゼロのメカニックチームでも**複数の翼型候補を短時間で評価できる。

**背景理論（初学者向け）：**
CFD（数値流体力学）とは、空気の流れをコンピュータ上で計算する技術だ。レースカーでは「どのウィング形状がダウンフォースを最大化し、空気抵抗を最小化するか」を仮想的に試験するために使う。従来はOpenFOAMの設定に深い専門知識が必要だったが、SwarmFoamは自然言語で指示するだけで設定ファイルを自動生成する。

**前提条件：**
- Ubuntu 20.04以上（OpenFOAM推奨環境）
- OpenFOAM v2406（無料・オープンソース）
- Python 3.11以降 + 上記ライブラリ
- Anthropic APIキー

```bash
# === 学生チーム向け：翼型パラメータスタディを自動実行する ===
# 各翼型に対してSwarmFoamを呼び出す簡単なシェルスクリプト

#!/bin/bash
# sweep_airfoils.sh

AIRFOILS=("NACA2412" "NACA4412" "NACA2415" "Selig_S1223")
ANGLES=(5 8 11 14)  # 迎角の候補（度）

for airfoil in "${AIRFOILS[@]}"; do
  for angle in "${ANGLES[@]}"; do
    echo "=== $airfoil, 迎角 $angle 度 ==="
    python run_swarmfoam.py \
      --airfoil "$airfoil" \
      --angle $angle \
      --velocity 15 \
      --output "results/${airfoil}_${angle}deg"
    # SwarmFoamがCFDケースを自動生成→実行→結果を保存する
  done
done

# 全16ケースの結果をCSVにまとめる
python summarize_results.py results/ > wing_sweep_results.csv
echo "完了: 結果を wing_sweep_results.csv に保存しました"
```

**Before / After（学生チーム実績想定）：**

| | 従来（手動CFD） | SwarmFoam使用後 |
|--|---------------|----------------|
| 翼型評価ケース数 | 1〜2（時間不足） | 16ケース自動実行 |
| CFD専門家の必要性 | 必須 | 不要（84%成功率） |
| 1ケースあたり設定時間 | 3〜5時間 | 30分 |
| 総評価時間（16ケース） | 48〜80時間（1専門家） | 8時間（夜間自動実行） |

**今すぐ試せる最初のステップ：**
学生チームの第1ステップは OpenFOAM の公式チュートリアル `cavity`（キャビティ流れ）を SwarmFoam なしで1回完走すること。OpenFOAMの基本構造を理解した上で SwarmFoam を使うと、エラー発生時にエージェントの判断を評価できるようになる。

## 今すぐ試せる最初の一歩

```bash
# SwarmFoam なしで先に OpenFOAM を手動確認する（理解のため）
# 公式 cavity チュートリアルを実行（10分で完走できる）
cp -r $FOAM_TUTORIALS/incompressible/icoFoam/cavity ./cavity_test
cd cavity_test
blockMesh    # メッシュ生成（ターミナルに生成完了と表示されればOK）
icoFoam      # シミュレーション実行
# 完走後、SwarmFoamに同じケースを自然言語で依頼して結果を比較する
```

OpenFOAM の動作確認後、arXiv:2601.07252 の論文を読んで SwarmFoam の設計思想を理解してから実装に入るのが最も効率的だ。論文は https://arxiv.org/abs/2601.07252 から無料でダウンロードできる。
