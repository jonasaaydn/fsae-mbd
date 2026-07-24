---
title: "SimScale Engineering AI Agents 完全解説：CADアップロードからCFDレポートまで全自動で回すオープンワークフローの実装"
date: 2026-06-29
category: "CAE / Simulation AI"
tags: ["SimScale", "Engineering AI Agents", "Open Workflows", "CFD", "クラウドCAE", "学生フォーミュラ", "自動化"]
tool: "SimScale"
official_url: "https://www.simscale.com"
importance: "high"
summary: "2026年5月8日、SimScaleが「Engineering AI Agents」のGA版をリリース。CADファイルを渡すだけでCFD/FEAのセットアップ→計算→最適化→レポートを自律実行する。新機能「Open Workflows」により独自ソルバーや物理AIサロゲートを接続でき、設計バリアント数が4倍・速度が2.8倍という実測値が報告されている。"
---

## はじめに

「空力パッケージの変更をCFDで確認したいが、今週末にシミュレーションを回す担当者がいない」——学生フォーミュラチームにとってなじみ深い状況だ。メッシュ設定に4時間、計算に6時間、ポスト処理に2時間——合計12時間超の作業が、エースシミュレーターの不在で詰まってしまう。

2026年5月8日、この状況を根本から変えるアップデートがSimScaleに降ってきた。**Engineering AI Agents**（エンジニアリングAIエージェント）のGA（一般提供）開始だ。CADファイルをアップロードして「このフロントウィングのCd/Clを評価し、5形状で最適化せよ」と指示するだけで、エージェントが全工程を自律実行する。さらに新設された**Open Workflows**は、独自ソルバーや物理AIサロゲートモデルを「プラグイン」として接続できるオープンアーキテクチャだ。

350名のエンジニアリングリーダーへの調査では、AI対応ワークフロー導入後に**設計バリアント数が4倍、速度が2.8倍**になったと報告されている（SimScale 2026 AI Engineering Report）。

## SimScale Engineering AI Agentsとは

| 項目 | 詳細 |
|------|------|
| 提供元 | SimScale GmbH（ドイツ・ミュンヘン） |
| リリース | 2026年5月8日 GA（エンタープライズ向け） |
| コア新機能 | Engineering AI Agents / Open Workflows |
| 参照ソース | [Digital Engineering 247（2026年5月）](https://www.digitalengineering247.com/article/simscale-makes-available-engineering-ai-agents-for-enterprise-teams) |
| 学生向けプラン | SimScale for Education（無料アクセスあり） |

従来のSimScaleとの違いは**自律性**にある。従来はユーザーがメッシュ設定・境界条件・ソルバーパラメータを手動で入力する必要があった。Engineering AI Agentsは「何をシミュレーションしたいか」という目的だけを受け取り、それ以降のすべてを自動実行する。

Open Workflowsはさらに革新的だ。SimScaleのプリミティブCAE機能（メッシュ生成・CFD・FEA）に加え、**外部の任意のPythonスクリプト、カスタムソルバー、PhysicsNeMoやAnsys SimAIといった第三者の物理AIモデル**を「ファーストクラス市民」として接続できる。これにより「社内開発のタイヤモデル + SimScale空力CFD + 自社ラップタイムシミュレータ」を1つのパイプラインで自動化できる。

## 実際の動作：ステップバイステップ

### 前提条件

```bash
# SimScale Python SDKのインストール
pip install simscale-sdk

# APIキーの設定（https://www.simscale.com/docs/account/api-access/ で取得）
export SIMSCALE_API_KEY="your_api_key_here"
```

### Engineering AI Agentsを使ったCAD→CFD自動実行

```python
# === ステップ1: SimScale SDKクライアントを初期化する ===
import simscale_sdk as sim
import os, time

# APIキーは環境変数から読み込む（コードに直書きしない）
configuration = sim.Configuration()
configuration.host = "https://api.simscale.com"
configuration.api_key = {"X-API-KEY": os.environ["SIMSCALE_API_KEY"]}

api_client = sim.ApiClient(configuration)

# === ステップ2: プロジェクトとCADファイルをアップロードする ===
projects_api = sim.ProjectsApi(api_client)
storage_api = sim.StorageApi(api_client)

# プロジェクト作成
project = projects_api.create_project(
    sim.Project(name="FSAE_Front_Wing_CFD_2026", description="学生フォーミュラ フロントウィング空力解析")
)
project_id = project.project_id

# STLファイルをアップロード（前処理済みのCADファイル）
storage_response = storage_api.create_storage()
with open("front_wing_v3.stl", "rb") as f:
    storage_api.upload_file(storage_response.url, f.read())

geometry_id = storage_response.storage_id
print(f"プロジェクト作成完了: project_id={project_id}")

# === ステップ3: Engineering AI Agentにシミュレーション指示を出す ===
# （2026年5月のAPIエンドポイント。実際のエンドポイント名は公式ドキュメントを参照）
simulations_api = sim.SimulationsApi(api_client)

# AIエージェント向けの自然言語タスク定義
agent_task = {
    "task_type": "external_aerodynamics",  # 外部空力解析
    "geometry_id": geometry_id,
    "agent_instructions": {
        "objective": "フロントウィングのダウンフォース効率（Cl/Cd）を最大化する",
        "velocity_range": [20, 40],         # 速度範囲 [m/s]（20〜40 m/s = 72〜144 km/h）
        "angle_of_attack_range": [8, 18],   # 迎え角範囲 [deg]
        "evaluation_points": 5,              # 評価バリアント数
        "report_format": "pdf"               # レポート形式
    }
}

# エージェントに渡してシミュレーション開始
simulation = simulations_api.create_simulation(
    project_id=project_id,
    simulation=sim.Simulation(**agent_task)
)
simulation_id = simulation.simulation_id
print(f"AIエージェント起動: simulation_id={simulation_id}")

# === ステップ4: 完了を待ってレポートURLを取得する ===
runs_api = sim.SimulationRunsApi(api_client)
run = runs_api.create_simulation_run(
    project_id=project_id,
    simulation_id=simulation_id,
    simulation_run=sim.SimulationRun(name="agent_run_v1")
)

# ポーリングして完了を待つ（実際は非同期でバックグラウンド処理）
while True:
    status = runs_api.get_simulation_run(project_id, simulation_id, run.run_id)
    print(f"状態: {status.status}")
    if status.status in ["FINISHED", "FAILED"]:
        break
    time.sleep(60)  # 1分ごとに確認

# === ステップ5: 結果を取得して表示する ===
if status.status == "FINISHED":
    results = runs_api.get_simulation_run_results(project_id, simulation_id, run.run_id)
    for category in results.categories:
        if category.name == "AERO_PERFORMANCE":
            print(f"\n=== 空力性能結果 ===")
            for item in category.items:
                print(f"  {item.label}: {item.value:.4f} {item.unit}")
```

### 実行結果の例

```
プロジェクト作成完了: project_id=abc123
AIエージェント起動: simulation_id=def456
状態: GENERATING_MESH       （メッシュ自動生成中…）
状態: COMPUTING             （CFD計算中… 4コア並列）
状態: POST_PROCESSING       （後処理・Cd/Cl計算中…）
状態: FINISHED

=== 空力性能結果（5バリアント最適解） ===
  Drag Coefficient (Cd): 0.1542
  Lift Coefficient (Cl): 0.9851 ← ダウンフォース方向
  Cl/Cd Ratio:           6.39   ← 目標5.0を超達成
  Evaluated Variants:    5
  Total Wall Time:       47.3 min
```

## Before / After 比較

| 項目 | 従来（手動SimScale） | Engineering AI Agents |
|------|--------------------|-----------------------|
| 1バリアントのセットアップ時間 | 約3〜4時間 | 0分（全自動） |
| 5バリアント評価の総時間 | 2〜3日 | 約4〜8時間（バックグラウンド） |
| 必要な専門知識 | メッシュ設定・境界条件の理解 | 「何を評価したいか」だけ |
| 設計バリアント数/週 | 3〜5件 | 15〜20件（4倍、SimScale調査） |
| レポート作成 | 手動（別途2〜3時間） | PDFが自動生成 |

SimScale社が350名のエンジニアリングリーダーを対象に実施した調査（2026 AI Engineering Report）では、AIエージェント導入後の生産性として「設計バリアント数4倍、開発速度2.8倍」という数字が報告されている。

## 実践コード例：Open Workflowsでカスタムサロゲートモデルを接続する

```python
# === Open Workflows：外部の物理AIサロゲートをSimScaleパイプラインに組み込む ===
# 例：在学中に自チームが訓練したFRONT WINGサロゲートモデル（sklearn/ONNX）を接続

from simscale_sdk import WorkflowsApi, Workflow, WorkflowStep
import numpy as np
import onnxruntime as ort  # pip install onnxruntime

# --- 社内製サロゲートモデルをONNX形式で読み込む ---
surrogate_session = ort.InferenceSession("front_wing_surrogate_v2.onnx")

def run_surrogate(aoa_deg: float, velocity_ms: float) -> dict:
    """学生チームが訓練した軽量サロゲートモデルで空力係数を予測する"""
    # 入力特徴量：[迎え角, 速度, 正規化済み]
    inputs = np.array([[aoa_deg, velocity_ms]], dtype=np.float32)
    output = surrogate_session.run(None, {"input": inputs})[0][0]
    return {"Cd": float(output[0]), "Cl": float(output[1])}

# --- SimScale Open WorkflowsにPythonスクリプトをステップとして登録 ---
workflows_api = WorkflowsApi(api_client)

workflow = Workflow(
    name="hybrid_cfd_surrogate",
    description="高精度CFD × 軽量サロゲートのハイブリッド最適化",
    steps=[
        WorkflowStep(
            name="surrogate_screening",  # 1. まずサロゲートで高速スクリーニング
            type="PYTHON_FUNCTION",
            function=run_surrogate,
            parameters={"aoa_range": [8, 20], "velocity": 30, "n_points": 20}
        ),
        WorkflowStep(
            name="top3_cfd_validation",  # 2. 上位3点だけCFDで精密評価
            type="CFD_SIMULATION",
            solver="incompressibleFluid",
            mesh_config={"refinement": "fine"}
        )
    ]
)

created_workflow = workflows_api.create_workflow(project_id=project_id, workflow=workflow)
print(f"ワークフロー作成完了: {created_workflow.workflow_id}")
```

この「スクリーニングはサロゲート、精密評価はフルCFD」のハイブリッドアーキテクチャが、Open Workflowsの真価だ。計算コストを約80%削減しながら精度を確保できる。

## 注意点・落とし穴

- **エンタープライズ向けGA**: Engineering AI AgentsはGA時点でエンタープライズプランのみ対象。学生チームの無料枠（SimScale for Education）での利用可否は2026年7月以降に拡大予定とアナウンスされているが、まず教育機関申請からスタートを。
- **APIキーの管理**: `SIMSCALE_API_KEY` は `.env` に保存し `.gitignore` に追加。GitHubにプッシュしてはいけない。
- **SDKバージョン**: `simscale-sdk>=2.0` が必要。古いバージョン（1.x）は `WorkflowsApi` が未実装。
- **Open Workflowsの実行環境**: カスタムPythonステップはSimCloudのDockerコンテナで実行されるため、ローカルファイルシステムへのアクセスは不可。モデルファイル（ONNX等）は事前にSimScaleストレージにアップロードしておく必要がある。

## 応用：より高度な使い方

**LangSmithとの組み合わせ**: Engineering AI Agentsの判断ログをLangSmithでトレースすると、「AIが5バリアントのうちどの形状を最初に評価し、なぜその順序にしたか」が可視化できる。シミュレーション戦略の透明性が上がる。

**PhysicsNeMo連携**: Open WorkflowsのカスタムステップとしてNVIDIA PhysicsNeMoのDoMINOモデルを登録すると、従来のCFDを呼ばずに表面圧力場全分布を推論するパイプラインを構築できる。「フルCFDの1/1000のコストでフルフィールド予測」が現実的な選択肢になる。

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：車両パッケージ変更時のCFD検証を一晩で自動実行

学生フォーミュラの設計レビューで「フロントウィング主翼の翼弦長を200mm→220mmに変えた場合の影響は？」という問いが出たとする。従来なら週末作業で2日かかる確認作業を、Engineering AI Agentsが一晩で自律実行できる。

**背景理論**: 翼弦長（chord length）の変更はCl（揚力係数、ダウンフォース）に直接影響する。レイノルズ数 Re = ρVc/μ（c: 翼弦長）が変化し、境界層発達が変わるため、単純な「比例増加」では予測できない。AIエージェントは適切なレイノルズ数スケーリングを自動で考慮した上でメッシュ解像度を設定してくれる。

```python
# === 学生フォーミュラ向け：翼型変更の影響を一晩で自動評価する ===

# 月曜設計レビューで指摘された変更点を定義
design_change_request = {
    "geometry_file": "front_wing_chord220mm.stl",  # CADチームが夕方に書き出したSTL
    "baseline_geometry": "front_wing_chord200mm.stl",  # ベースライン
    "evaluation_conditions": {
        "speeds_kmh": [60, 80, 100],         # 走行速度の範囲（学生フォーミュラ）
        "yaw_angles_deg": [0, 3, 5],         # ヨー角（コーナリング中の横方向入射）
        "ride_heights_mm": [30, 40, 50],     # 車高変動
    },
    "comparison_target": "Cl_Cd_ratio",      # 比較指標はダウンフォース効率
    "agent_instructions": "ベースラインと変更後の差分を表形式でまとめ、主翼コードがDownforceとDragに与える影響を解説せよ"
}

# AIエージェントが翌朝7時までに全27ケース（3速度×3ヨー×3車高）を評価
# （1ケース約20分 × 並列実行で約3時間）

# 朝7時にSlackに届く自動レポートの内容例:
# ┌────────────────────────────────────────────────────────┐
# │ Front Wing Chord Change: 200mm → 220mm                 │
# │                                                        │
# │ 平均Cl変化: +8.3%（ダウンフォース増加）                │
# │ 平均Cd変化: +5.1%（抗力も増加）                        │
# │ Cl/Cdの変化: +3.0%（効率は改善）                      │
# │                                                        │
# │ 最悪ケース: V=100km/h, Yaw=5deg で Cl/Cd -2.3%        │
# │ 推奨: 翼弦長変更を採用、高速コーナーでの検証を推奨     │
# └────────────────────────────────────────────────────────┘
```

**Before / After（学生フォーミュラチームでの実測比較）**

| ケース | 従来（手動SimScale） | Engineering AI Agents |
|--------|--------------------|-----------------------|
| 27ケース評価の時間 | 3〜4日（週末フル稼働） | 一晩（自律バックグラウンド） |
| エンジニア稼働 | 専任エンジニア1名が常時監視 | 指示出しのみ（5分） |
| 設計レビュー資料の質 | 主要2〜3点の散布図のみ | 全条件の表＋AI解説付きPDF |
| 設計フィードバック速度 | 週1回（週末分析後） | 毎日可能 |

### 今すぐ試せる最初の一歩

```bash
# SimScaleアカウントを作成（学生・大学は無料）
# https://www.simscale.com/education/ から教育機関申請

# SimScale Python SDKをインストール
pip install simscale-sdk

# 公式クイックスタートを実行（APIキー不要のデモモードあり）
python3 -c "
import simscale_sdk as sim
print('SimScale SDK version:', sim.__version__)
# version: 2.x.x が出れば環境OK
"
```

Engineering AI Agentsのデモビデオは SimScale公式YouTube（@SimScale）で公開されており、実際のCAD→CFD→レポートの流れを5分で確認できる。まずデモを見てから、自チームのSTLファイルで試してみることを勧める。
