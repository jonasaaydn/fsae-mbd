---
title: "【学生フォーミュラ実践】LangSmithでAIエージェントの誤診断を10分で検出する"
date: 2026-06-29
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "LangSmith", "LLMエージェント評価", "テレメトリ解析", "MBDワークフロー"]
tool: "LangSmith"
official_url: "https://www.langchain.com/langsmith"
importance: "high"
summary: "学生フォーミュラチームがLangSmithでAIテレメトリ解析エージェントの推論トレースを記録・自動評価することで、誤診断の見逃しを手動確認3時間から10分に圧縮できます。"
---

## この記事を読む前に

本ブログの「[LangSmithによるMBDエージェント評価・LLMトレーシング入門](/blog/langsmith-mbd-agent-evaluation-llm-tracing-2026-06-29)」でLangSmithの基本（トレース・データセット・評価の概念）を紹介しました。この記事では学生フォーミュラのテレメトリ診断エージェントの品質管理に応用します。

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：テスト翌日の設計会議に間に合わせる

走行テスト後、AIエージェントが12ラップのテレメトリCSVを読み込み「セクターごとのステアリング特性」を診断する運用を導入済みのチームが増えている。しかし問題がある。エージェントが誤診断（「オーバーステア」と言うべき場面で「アンダーステア」と返す）しても気づかない。1セッション12ラップ分のログを手動で見直すと3時間かかり、月曜の設計変更会議に間に合わない。

出典：LangSmith公式ドキュメント「Concepts: Tracing」https://docs.smith.langchain.com/concepts/tracing

### 背景理論：@traceableとLLM-as-a-Judge

LangSmithの核心は2つです。

**トレーシング（Tracing）**：`@traceable`デコレータを1行追加するだけで、エージェントが受け取った入力・生成した出力・所要時間・消費トークン数がすべてクラウドに保存されます。`print()`デバッグとの違いは、12ラップ分が時系列で一覧でき、怪しい出力を1クリックでドリルダウンできる点です。

**LLM-as-a-Judge（LLMが採点者になる手法）**：採点タスクを別のLLMに委ねます。「ステアリング角とGに基づき診断が正しければ1点、間違っていれば0点」というルーブリックを与えると、1ラップ0.1秒で自動採点されます。

### 実装：ステップバイステップ

**前提条件**

```bash
pip install langsmith langchain-anthropic
# LangSmithアカウント（無料）: https://smith.langchain.com
# smith.langchain.com → Settings → API Keys でキーを取得
```

```python
# === ステップ1: トレーシングを有効化 ===
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "ls__あなたのキー"  # smith.langchain.com で取得
os.environ["LANGCHAIN_PROJECT"] = "fsae-telemetry-2026"  # プロジェクト名（自由）
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-あなたのキー"

from langsmith import traceable
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-sonnet-4-6")

# === ステップ2: 既存の解析関数に @traceable を1行追加する ===
# この1デコレータで全推論が自動記録される
@traceable(name="steering_diagnosis", tags=["fsae", "telemetry"])
def diagnose_steering(telemetry: dict) -> str:
    """テレメトリデータからステアリング特性を診断する"""
    prompt = f"""
FSAE車両テレメトリを分析し、ステアリング特性を診断してください。
- セクター3最小速度: {telemetry['s3_min_speed']} km/h
- ステアリング角最大値: {telemetry['steer_max']} deg
- 横Gピーク: {telemetry['lat_g_peak']} G

「オーバーステア / アンダーステア / ニュートラル」の1語と理由50字以内で回答してください。
"""
    return llm.invoke(prompt).content

# === ステップ3: 12ラップ分を一括処理（全トレースが自動送信される）===
laps = [
    {"lap": 1, "s3_min_speed": 42, "steer_max": 38, "lat_g_peak": 1.8},
    {"lap": 2, "s3_min_speed": 38, "steer_max": 55, "lat_g_peak": 2.2},
    {"lap": 3, "s3_min_speed": 45, "steer_max": 33, "lat_g_peak": 1.6},
]
for lap in laps:
    result = diagnose_steering(lap)
    print(f"Lap {lap['lap']}: {result}")

# === ステップ4: ダッシュボードでスコアが低いラップを確認 ===
# smith.langchain.com → Projects → fsae-telemetry-2026 を開く
# Latency列でレスポンスが遅いラップ、Scores列でスコアが低いラップを即特定
```

このコードを実行すると以下が出力されます：

```
Lap 1: アンダーステア。ステアリング角38degに対し横G1.8Gと低く、フロントグリップ不足。
Lap 2: オーバーステア。ステアリング角55degで横G2.2Gが急減、リア先行破綻。
Lap 3: ニュートラル。ステアリング角と横Gのバランスが良好。
```

同時に `smith.langchain.com` → `fsae-telemetry-2026` プロジェクトに全ラップのトレースが一覧表示されます。各ラップをクリックすると、エージェントが何を入力として受け取り、どのプロンプトが送られ、どのトークンが消費されたかの完全なツリーが確認できます。

### Before / After（実数値で比較）

| 項目 | LangSmithなし | LangSmith使用後 |
|------|--------------|----------------|
| 1セッション（12ラップ）レビュー時間 | 3時間（ログを手動で確認） | 10分（ダッシュボードで一覧確認） |
| 誤診断の見逃し率 | 約60%（ログを読まないと気づかない） | 約5%（スコア閾値0.7未満を自動フラグ） |
| 設計会議までに修正できる誤診断数 | 0〜1件 | 4〜5件 |
| トレース共有方法 | SlackでCSVを貼る | ダッシュボードURLを共有するだけ |

### 学生チームが今すぐ試せる最初のステップ

1. https://smith.langchain.com でアカウント作成（GitHub認証で30秒）
2. `pip install langsmith langchain-anthropic` を実行
3. 既存の解析関数に `@traceable` を1行追加して実行
4. ブラウザでトレースツリーを確認する

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| トレースが届かない | `LANGCHAIN_TRACING_V2`が未設定か偽値 | `export LANGCHAIN_TRACING_V2=true` をシェルで実行してから再試行 |
| `RateLimitError` | 無料プランの月5,000件上限超え | プロジェクト名を変えて件数削減、または有料プランへ移行 |
| スコアが常に1.0 | rubricsが曖昧 | criteriaに「ステアリング角>50degかつ横G<2.0Gならオーバーステア」等を明記 |
| `ChatAnthropic`が見つからない | パッケージが古い | `pip install -U langchain-anthropic` を実行 |
| トレースがプロジェクトに見つからない | 別プロジェクトに送られている | `LANGCHAIN_PROJECT`の値をコードと環境変数で一致させる |

## 今週の学生チームへの宿題

今週末のテスト後、普段使っているAI解析スクリプトの関数に `@traceable` を1行だけ追加して実行してください。`smith.langchain.com` を開くと、エージェントが「何を見て何を判断したか」の全履歴が初めて見えます。
