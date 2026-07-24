---
title: "Parasoft C/C++testがAIエージェントと繋がる：MCPサーバーで組込みMISRA準拠を43%高速化"
date: 2026-06-26
category: "AI Coding"
tags: ["Parasoft", "C/C++test", "MCP", "MISRA", "ISO 26262", "テスト自動化", "組込みソフト"]
tool: "Parasoft C/C++test CT"
importance: "high"
summary: "embedded world 2026でParasoftが発表。新しいMCPサーバーがClaude CodeなどのAIエージェントをMISRA静的解析・カバレッジ・コンプライアンス成果物に直接接続する。世界初のTÜV認定GoogleTestにより安全クリティカル開発へのオープンソーステストフレームワーク適用が実現。顧客事例でテストサイクル43%短縮・欠陥修正コスト72%削減を達成。"
---

## はじめに

ブレーキ制御ECUのソフトウェア品質レビューに、毎週何時間費やしていますか？MISRA C:2025違反のリストが数百件並んだHTML報告書を開き、一件ずつ優先度を判断し、修正案を書き、証跡を残す――この作業ループから抜け出せないでいるMBDエンジニアは多いはずです。

2026年3月にニュルンベルクで開催された**embedded world 2026**でParasoftが発表した新機能は、この状況を根底から変えようとしています。**C/C++test MCP（Model Context Protocol）サーバー**がClaude CodeやCursor、GitHub CopilotなどのAIエージェントと静的解析エンジンを直結し、MISRA違反の自動分析・修正提案・コンプライアンスレポート生成をエージェントに委任できるようになりました。

「テストコードを書かせてもISO 26262準拠にならない」という従来の限界も、もう一つの新機能が崩します。業界初の**TÜV認定GoogleTestフレームワーク**（C/C++test CT内蔵）により、オープンソースのGoogleTestを使いながらASIL-D対応の認定エビデンスが取得できます。

---

## Parasoft C/C++test CTとは

Parasoftは1987年創業の自動車・航空宇宙向けソフトウェア品質ツールベンダーです。C/C++testは静的解析・単体テスト・カバレッジ計測を1ツールで提供し、MISRA C:2025・MISRA C++:2023・AUTOSAR C++14・CERT・HICPPなど主要コーディング規格に対応します。

**C/C++test CT（Compliance Testing）**は機能安全（ISO 26262・DO-178C）に特化したエディションで、TÜV SÜDによる認定を受けており、テストツール自体がASILの認定要件を満たします。2026年のembedded world発表の主な内容は以下の3点です。

1. **MCP Serverによるアジェンティック統合**：AI エージェントがC/C++testの解析データ（静的解析違反・カバレッジ・テスト結果）にリアルタイムでアクセスできる
2. **TÜV認定GoogleTest**：業界初。GoogleTestをASIL-D環境で公式に使用可能
3. **CUDA C/C++サポート**：.cuファイルへのMISRA・AUTOSAR C++14・CERT適用

---

## MCPサーバーの仕組みと接続方法

MCP（Model Context Protocol）はAnthropicが策定した、AIエージェントと外部ツールを繋ぐ標準プロトコルです。ParasoftのMCPサーバーを起動すると、C/C++testが生成した構造化データ（違反一覧・重篤度マッピング・テストカバレッジ・コンプライアンスマトリクス）がJSON-RPC経由でAIエージェントから参照できるようになります。

**前提条件**
- Parasoft C/C++test 2025.2以降（MCPサーバー機能が含まれるバージョン）
- ライセンス：C/C++test Professional または C/C++test CT
- Parasoftライセンスサーバーへの接続（オンプレ・クラウド共可）

### ステップ1: Claude Code設定ファイルへのMCP登録

```json
// プロジェクトルートの .mcp.json
{
  "mcpServers": {
    "parasoft": {
      "command": "cpptestmcp",
      "args": [
        "--workspace", "/project/ecu_brake_control",
        "--config",   "builtin://MISRA_C_2025"
      ],
      "env": {
        "PARASOFT_LICENSE_SERVER": "license.company.com:2222"
      }
    }
  }
}
```

### ステップ2: C/C++testで静的解析を実行（従来どおり）

```bash
# cmake プロジェクトの場合
cpptestscan --project brake_control.cmake \
            --config "builtin://MISRA_C_2025" \
            --report-dir ./reports/
```

### ステップ3: AIエージェントにタスクを委任

Claude Codeを起動し、自然言語で指示するだけです。

```
# Claude Codeへの指示例
brake_control.c の MISRA C:2025 違反を優先度HIGH以上に絞って一覧化し、
各違反にコメント付き修正コードを提案してください。
その後、ISO 26262 ASIL-B準拠チェックリストを Markdown 形式で生成してください。
```

AIエージェントはParasoft MCPサーバー経由で解析データを取得し、以下を自動生成します：
- 違反の重篤度ランキングと根本原因の説明
- MISRA準拠の修正コード候補
- ISO 26262対応のトレーサビリティマトリクス

---

## Before / After 比較

| 作業 | 従来（手動） | Parasoft MCP + AIエージェント |
|------|------------|-------------------------------|
| MISRA違反レビュー（300件） | 6〜8時間/人 | 15〜20分 |
| テストケース作成 | 2日 | 2〜3時間 |
| コンプライアンスレポート | 4〜8時間 | 30分 |
| 欠陥修正コスト（顧客事例） | 基準値100% | **28%（72%削減）** |
| テストサイクル全体（顧客事例） | 基準値100% | **57%（43%短縮）** |
| 手動テスト工数（顧客事例） | 基準値100% | **62%（38%削減）** |

出典：Parasoft「AI-Assisted Testing Workflows」顧客フィールドデータ（2026年）

---

## 実践コード例：MISRA違反の自動分析と修正提案

以下はPython（Anthropic SDK）を使い、Parasoft MCPサーバー経由でMISRA違反を取得・修正するスクリプトです。

**前提：Parasoft C/C++test 2025.2以降、`cpptestmcp`コマンドがPATHに通っていること**

```python
# === ファイル: analyze_misra.py ===

# Anthropic SDKをインストール: pip install anthropic

import anthropic
import subprocess
import json

# === ステップ1: MCPサーバーを起動してデータを準備 ===
# （実際にはMCPクライアントライブラリ経由で接続するが、ここでは概念を示す）

# === ステップ2: Claudeクライアントを初期化 ===
# ANTHROPIC_API_KEY環境変数を事前に設定しておく
client = anthropic.Anthropic()

# === ステップ3: Parasoft解析結果をJSON形式で読み込む ===
with open("./reports/static_analysis_report.json", "r") as f:
    report = json.load(f)

# HIGH以上の違反のみ抽出（重篤度フィルタリング）
high_violations = [
    v for v in report["violations"]
    if v["severity"] in ["HIGH", "CRITICAL"]
]

# === ステップ4: AIに違反分析と修正案を依頼 ===
prompt = f"""
以下は brake_control.c のMISRA C:2025静的解析結果（HIGH/CRITICAL違反のみ）です。
各違反について：
1. 違反の技術的な理由を1文で説明
2. MISRA準拠の修正コードをコメント付きで提示
3. 修正後の予想リスクレベルを示してください

解析結果:
{json.dumps(high_violations, ensure_ascii=False, indent=2)}
"""

response = client.messages.create(
    model="claude-sonnet-4-6",   # 最新モデルを使用
    max_tokens=4096,             # 違反件数に応じて調整
    messages=[{"role": "user", "content": prompt}]
)

# === ステップ5: 結果を表示・保存 ===
result = response.content[0].text
print(result)

# コンプライアンスレポートとして保存
with open("./reports/ai_misra_review.md", "w", encoding="utf-8") as f:
    f.write(f"# AI MISRA C:2025 レビューレポート\n\n{result}")

print("レポートを reports/ai_misra_review.md に保存しました")
```

**実行例の出力（一部）：**

```
## MISRA C:2025 違反 1: Rule 15.5（関数の単一出口点）

**原因:** brake_control.c の L.47 で早期return文を使用しています。
MISRA Rule 15.5は関数出口が1つであることを要求しています。

**修正前（違反コード）:**
```c
float calc_brake_torque(float pedal_pos) {
    if (pedal_pos < 0.0f) return 0.0f;  // ← 早期return（違反）
    return pedal_pos * BRAKE_GAIN;
}
```

**修正後（準拠コード）:**
```c
float calc_brake_torque(float pedal_pos) {
    float result;  /* 結果変数で単一出口を確保 */
    if (pedal_pos < 0.0f) {
        result = 0.0f;
    } else {
        result = pedal_pos * BRAKE_GAIN;
    }
    return result;  /* 唯一の出口点 */
}
```
```

**よくあるエラーと対処：**

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `cpptestmcp: command not found` | MCPサーバー未インストール | Parasoftインストーラー再実行、PATHを確認 |
| `License not found` | ライセンスサーバー未接続 | `PARASOFT_LICENSE_SERVER` 環境変数を設定 |
| `No violations found` | 解析未実行 | 先に `cpptestscan` で静的解析を完了させる |

次のステップ: `response.usage.input_tokens` を出力して、コストを管理しましょう。

---

## 注意点・落とし穴

**ライセンス費用**：C/C++test CTはエンタープライズライセンス製品で、個人ライセンスは提供されていません。学生チームは「Parasoft Academic Program」または試用版（30日）を使用してください。

**バージョン要件**：MCPサーバー機能はC/C++test **2025.2以降**が必要です。旧バージョンではMCPオプションが存在しません。

**AIへの依存過剰に注意**：AIが提案した修正コードは必ず人間が確認してください。特にハードウェア依存コードや割り込みサービスルーティン（ISR）では、AIが文脈を正しく理解できない場合があります。MISRAの最終承認は認定エンジニアが行うことが必要です。

**レポート生成上限**：1回のAPI呼び出しで処理できる違反数には限りがあります（Claude Sonnetで最大4096トークン出力）。100件超の違反は10〜20件ずつバッチ処理することを推奨します。

---

## 応用：CI/CDパイプラインへの統合

GitHub ActionsでMISRA違反を自動レビューするワークフロー例：

```yaml
# .github/workflows/misra-ai-review.yml
name: MISRA AI Review

on:
  pull_request:
    paths:
      - 'src/**/*.c'
      - 'src/**/*.cpp'

jobs:
  misra-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # 静的解析を実行（Parasoftは別途セットアップ済みと仮定）
      - name: Run Parasoft Static Analysis
        run: |
          cpptestscan --project ecu.cmake \
                      --config "builtin://MISRA_C_2025" \
                      --report-dir ./reports/
      
      # AIによる違反分析とPRコメント生成
      - name: AI MISRA Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: python3 analyze_misra.py
      
      # PRにレポートをコメント
      - name: Post Review Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('./reports/ai_misra_review.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: report.substring(0, 65000)  // GitHubコメント上限対策
            });
```

CIパイプラインに組み込むことで、PRごとに自動的にMISRA AIレビューが走り、レビュアーの負担を大幅に削減できます。

---

## 今すぐ試せる最初の一歩

Parasoft C/C++testの無料トライアル（30日）を取得し、以下を実行してください。

```bash
# 1. Parasoftをインストール後、サンプルプロジェクトで解析
cpptestscan --config "builtin://MISRA_C_2025" \
            --input ./sample_project/ \
            --report-dir ./reports/

# 2. レポートを確認（HTML形式で開く）
open ./reports/report.html

# 3. 次のステップ：MCPサーバー経由でClaude Codeと接続
```

5分でMISRA違反の全体像が把握できます。

---

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：ブレーキバイワイヤECUのMISRA準拠を夜間に自動化

学生フォーミュラの電気自動車クラスでは、ブレーキバイワイヤ（Brake-by-Wire）制御ECUのソフトウェアに高い安全性が求められます。レース前の技術審査でECUコードのMISRA準拠を問われるケースも増えています。

**従来の問題：** 競技前夜にコードを書き上げても、MISRA違反のレビューを翌朝行う時間がない。手動で300件の違反を1人でレビューするのは不可能。

### 背景：なぜMISRA準拠が重要か

MISRA C（Motor Industry Software Reliability Association）は、組込みCコードの安全性を担保するコーディング規格です。Rule 15.5「関数の単一出口点」やRule 14.3「到達不能コードの禁止」など、バグの温床となりやすいC言語の危険な構文を禁じています。自動車・航空分野では事実上の標準として使われており、学生フォーミュラでもISO 26262相当の安全解析で参照されます。

### 実際に動くコードと手順

```bash
# === 前提: Parasoft C/C++test 2025.2をインストール済み ===

# ステップ1: ブレーキ制御コードを解析（5〜10分）
cpptestscan \
  --input ./ecu_code/brake_by_wire.c \
  --config "builtin://MISRA_C_2025" \
  --report-dir ./reports/

# ステップ2: 解析レポートをJSON形式でエクスポート
cpptestcli \
  --report-format json \
  --output ./reports/violations.json

# ステップ3: AIエージェントで夜間バッチ処理（Pythonスクリプト実行）
python3 analyze_misra.py

# 翌朝に ./reports/ai_misra_review.md を確認するだけ
```

### Before / After（学生チーム事例想定）

| 指標 | 従来（手動） | Parasoft MCP + AI夜間バッチ |
|------|------------|---------------------------|
| MISRA違反レビュー時間 | 6〜8時間（複数人） | 15分（AIが夜間自動処理） |
| 修正提案の質 | 担当者の知識に依存 | MISRA規格に沿った修正コード提示 |
| ISO 26262チェックリスト | 手動作成2〜4時間 | AIが自動生成（30分） |
| 見落とし率（経験上） | 5〜15% | ≈0%（ツールが全件検出） |

### 学生チームが今すぐ試せる最初のステップ

1. Parasoft「Academic Program」（教育機関向け無償ライセンス）を申請する
2. `cpptestscan --config "builtin://MISRA_C_2025"` でコード1ファイルを解析してみる（5分）
3. 違反HTMLレポートをClaude AIのチャットに貼り付けて修正案を聞く（Parasoft MCP未導入でも試せる）

まずステップ3から始めれば、今夜にでもAI支援のMISRAレビューを体験できます。

---

**一次情報源：**
- Parasoft公式発表（embedded world 2026）: [Parasoft Sets New Bar for C/C++ Test Automation](https://www.parasoft.com/news/c-cpp-test-automation-certified-googletest-agentic-ai/)
- AI Agent & MCP Server ブログ記事: [AI Agents & MCP Servers Transform Software Quality](https://www.parasoft.com/blog/ai-agents-mcp-servers-software-quality/)
- TÜV認定GoogleTest発表: [Parasoft Bridges the AI and Compliance Gap](https://www.parasoft.com/news/parasoft-bridges-ai-and-compliance-gap/)
