---
title: "Claude Code Auto Modeがエンタープライズ解禁：Amazon BedrockでMATLAB MBDエージェントを本番運用する完全ガイド"
date: 2026-07-24
category: "AI Coding"
tags: ["Claude Code", "Amazon Bedrock", "Auto Mode", "MATLAB", "MCP", "Enterprise", "MBD"]
tool: "Claude Code"
official_url: "https://aws.amazon.com/bedrock/anthropic/"
importance: "high"
summary: "Claude Code v2.1.207（2026年7月11日）でAmazon Bedrockのauto modeがデフォルト化。MATLAB MCP Serverとの組み合わせで夜間バッチシミュレーション・テスト生成を完全自律実行。AWS SSO・コスト管理・監査ログが標準搭載され、共有計算クラスタ環境でのMBDエージェント本番運用が現実的になった。"
---

## はじめに

エンタープライズ環境でClaude Codeを使いたいが、「誰でも無制限に使えてしまうのでは」「コストが青天井になるのでは」と二の足を踏んでいた組織は多い。

2026年7月11日にリリースされた**Claude Code v2.1.207**は、その懸念を払拭する大きな転換点となった。Amazon BedrockおよびGoogle Vertex AI・Microsoft Foundryにおいて、**auto mode（自律実行モード）がエンタープライズのデフォルトに昇格**した。同時にSSO認証・コスト管理・監査ログがフルサポートされ、「夜間にMATLABシミュレーションを自律で回す」というMBDエンジニアの夢がセキュアな環境で実現できる時代になった。

この記事を読まずにいると、競合チームがBedrock上でMATLABエージェントを既に本番運用しているのに、自チームだけが手動で `sim()` を叩き続けるという事態になりかねない。

---

## Claude Code auto modeとは

通常のClaude Codeはアクションごとに「承認しますか？（Y/n）」の確認を求める**インタラクティブモード**で動作する。auto modeはこのプロンプトループをサーバーサイドのアクション分類器（action classifier）に置き換え、**一度タスクを与えると人間の介入なしに完了まで自律実行**する。

| モード | 承認方式 | 適したシーン |
|--------|---------|-------------|
| インタラクティブ | 操作ごとに手動OK | 開発中の試行錯誤 |
| auto mode | サーバー側自動判定 | CI/CD・夜間バッチ |

auto modeは2026年5月30日にv2.1.158でBedrockへの提供が開始されたが、当初は `CLAUDE_CODE_ENABLE_AUTO_MODE=1` という環境変数のオプトインが必要だった。v2.1.207ではこのフラグが不要となり、Bedrockを使えばauto modeが標準で有効になる（無効化するには `disableAutoMode: true` を設定ファイルに記載する）。同バージョンでBedrockのデフォルトモデルも**Claude Opus 4.8**に変更された。

---

## Amazon Bedrock上でMATLAB MBDエージェントを動かすまで

### 前提条件

- AWS アカウント（Claude on Bedrockが有効なリージョン：us-east-1 等）
- Claude Code v2.1.207以降（`claude --version` で確認）
- MATLAB R2025b以降 + MATLAB MCP Server（[公式リポジトリ](https://github.com/matlab/matlab-mcp-server)）

### ステップ1：Bedrock経由でClaude Codeを設定する

```bash
# === ステップ1: AWS CLIでBedrockアクセスを確認する ===
# us-east-1 に Claude Opus 4.8 が有効か確認する
aws bedrock list-foundation-models --region us-east-1 \
  --query "modelSummaries[?contains(modelId,'claude-opus-4-8')]" \
  --output table

# === ステップ2: Claude CodeをBedrock経由にルーティングする ===
# ~/.claude/settings.json を作成（または既存ファイルに追記）
cat > ~/.claude/settings.json << 'EOF'
{
  "apiProvider": "bedrock",
  "awsRegion": "us-east-1",
  "defaultModel": "anthropic.claude-opus-4-8-20251015-v1:0",
  "disableAutoMode": false
}
EOF

# === ステップ3: Claude Codeを起動して接続確認する ===
claude --version
# → Claude Code v2.1.207 (Amazon Bedrock: us-east-1)
```

**実行結果の例：**
```
Claude Code v2.1.207 (Amazon Bedrock: us-east-1)
Model: anthropic.claude-opus-4-8-20251015-v1:0 [auto mode: enabled]
```

### ステップ2：MATLAB MCP Serverを追加する

```jsonc
// ~/.claude/settings.json にMCPサーバーを追記する
{
  "apiProvider": "bedrock",
  "awsRegion": "us-east-1",
  "defaultModel": "anthropic.claude-opus-4-8-20251015-v1:0",
  "mcpServers": {
    "matlab": {
      "command": "matlab-mcp-server",
      "args": ["--port", "3000"],
      "env": {
        "MATLAB_ROOT": "/usr/local/MATLAB/R2025b"
      }
    }
  }
}
```

### ステップ3：夜間バッチタスクをlaunchする

```bash
# === MBDエージェントに夜間タスクを与える（非同期実行） ===
# タスク: 車両ダイナミクスモデルのパラメータスタディを12ケース実行し結果をCSVへ
claude --auto \
  "src/models/vehicle_dynamics_7dof.slx を開き、
   サスペンション剛性 Ks = [15000, 17500, 20000, 22500] N/m と
   ダンパー減衰 Cs = [1500, 2000, 2500] Ns/m の組み合わせ12ケースで
   シミュレーション実行し、
   最大横加速度・ロール角・ラップタイム推定値を results/param_study_$(date +%F).csv に保存せよ。
   完了後 git commit して origin/feature/param-study にpushせよ。" \
  >> logs/claude_nightly.log 2>&1 &

echo "エージェント起動完了。ログ: logs/claude_nightly.log"
```

---

## Before / After 比較

| 作業 | Before（手動） | After（Bedrock auto mode） |
|------|--------------|---------------------------|
| パラメータスタディ12ケース | 6〜8時間（昼間にエンジニアが監視） | 45分（夜間自律実行） |
| コスト | エンジニア人件費のみ | Bedrock API費用 約$1.2/ケース |
| 承認作業 | 各ステップで手動確認（約40回） | 0回（サーバー側自動判定） |
| 監査証跡 | なし | AWS CloudTrailに全ツール呼び出しが記録 |
| チームスケール | 1人1環境 | SSO + チームライセンスで全員共有 |

---

## 実践コード例：GitHub ActionsでのCI連携

GitHub ActionsからBedrock上のClaude Codeを夜間cron実行する設定例。

```yaml
# .github/workflows/nightly-mbd-agent.yml
name: Nightly MBD Parameter Study

on:
  schedule:
    - cron: '0 15 * * *'  # 毎日0:00 JST (UTC 15:00)

permissions:
  id-token: write  # OIDC認証に必要
  contents: write

jobs:
  mbd-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # === OIDC経由でAWS認証する（PAT不要） ===
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/ClaudeCodeBedrockRole
          aws-region: us-east-1

      # === Claude Code v2.1.207 をインストールする ===
      - run: npm install -g @anthropic-ai/claude-code@2.1.207

      # === Bedrockを使うよう設定する ===
      - run: |
          mkdir -p ~/.claude
          echo '{"apiProvider":"bedrock","awsRegion":"us-east-1"}' > ~/.claude/settings.json

      # === MBDエージェントを自律実行する ===
      - run: |
          claude --auto \
            "src/models/rear_wing_aero.m を実行し、
             AOA 10〜20°の揚力係数CLと抗力係数CDを
             results/aero_sweep_$(date +%F).csv に保存せよ。" \
            --timeout 3600  # 最大1時間

      - uses: actions/upload-artifact@v4
        with:
          name: aero-results-${{ github.run_id }}
          path: results/
```

---

## 注意点・落とし穴

**コスト管理は必須：** auto modeは長いタスクを自律で実行するためトークン消費が増加する。`aws budgets create-budget` でClaude APIの月次コスト上限アラートを設定すること（月$100〜500を目安に）。

**`disableAutoMode`の設定場所：** ユーザー設定ファイル（`~/.claude/settings.json`）に加え、オペレーター側設定ファイル（`--settings` フラグで指定）やManaged Remote Settingsでも上書き可能。チーム全体でauto modeをOFFにするには管理者がリモート設定で `"disableAutoMode": true` を配布する。

**MATLABライセンスの排他制御：** 複数エージェントが同一マシンのMATLABを同時起動しようとするとライセンスエラーになる。`matlab-mcp-server` の `--port` を各エージェントで変えるか、Parallel Computingライセンスを使ってWorkerを割り当てること。

---

## 応用：より高度な使い方

**コスト配分タグ：** `aws:RequestTag/Project=FSAEAero2026` をIAMポリシーに追加し、AWS Cost Explorerでプロジェクト別コストを可視化できる。

**Bedrock Guardrails：** コンテンツフィルタリング機能をオンにすることで、エージェントが機密シミュレーションデータを外部APIに送信しないようポリシーで制限できる。セキュリティ要件の厳しい組織では必須。

---

## 学生フォーミュラ・レース車両開発への応用

**シナリオ：部室のPCを夜間エージェントサーバーにしてリアウィングAOA最適化を自律実行する**

AWS Educateクレジット（学生向け無料）を使えば月$100相当のBedrock利用が無償になる。これを活用してチームの計算資源を最大化できる。

**前提：** AWS Educateアカウント（大学のメールアドレスで無料申請可）、Claude Code v2.1.207以降

```bash
# === 【学生チーム向け】Bedrock接続テスト（5分） ===

# 1. AWS Educate の一時認証情報を設定する（ポータルからコピー）
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."        # 一時トークン（12時間有効）
export AWS_DEFAULT_REGION="us-east-1"

# 2. 接続確認する
aws sts get-caller-identity
# → {"Account": "123456789", "UserId": "AROAZ...", ...}

# 3. Claude Codeの設定ファイルを作成する
mkdir -p ~/.claude
cat > ~/.claude/settings.json << 'EOF'
{
  "apiProvider": "bedrock",
  "awsRegion": "us-east-1"
}
EOF

claude --version
# → Claude Code v2.1.207 (Amazon Bedrock: us-east-1) [auto mode: enabled]

# 4. MATLABエージェントタスクを夜間に投入する（例）
claude --auto \
  "src/aero/rear_wing_simulation.m を実行し、
   AOA を 5° から 20° まで 1° 刻みで16ケースシミュレーションし、
   ダウンフォース係数CLとドラッグ係数CDを results/aoa_sweep.csv に保存、
   CL/CD比最大となるAOAをコンソールに出力し
   results/aoa_sweep.png として棒グラフを保存せよ。"
```

**Before / After（学生チーム想定）：**

| | Before（手動） | After（Bedrock auto mode） |
|--|--|--|
| AOA 16ケース実行 | 4時間（監視必要） | 1.5時間（無人） |
| 結果整理 | Excel手作業 | CSVと図が自動生成 |
| 月額費用 | エンジニア4時間分 | 約$4（AWS Educateで実質無料） |

**今すぐ試せる最初の一歩：**

```bash
# Claude Code をインストールする（未導入の場合）
npm install -g @anthropic-ai/claude-code

# バージョン確認
claude --version

# Bedrock接続確認（AWS Educate認証情報設定後）
aws sts get-caller-identity && echo "AWS認証OK"
```

---

**一次ソース：**
- [Claude Code Auto Mode Lands on Bedrock and Vertex AI – Digital Applied](https://www.digitalapplied.com/blog/claude-code-auto-mode-bedrock-vertex-foundry-2026)
- [Running Claude Desktop on Amazon Bedrock – AWS Machine Learning Blog](https://aws.amazon.com/blogs/machine-learning/from-developer-desks-to-the-whole-organization-running-claude-cowork-in-amazon-bedrock/)
- [Claude Sonnet 4.6 now available in Amazon Bedrock – AWS What's New](https://aws.amazon.com/about-aws/whats-new/2026/02/claude-sonnet-4.6-available-in-amazon-bedrock)
- [Claude on Amazon Bedrock – AWS公式](https://aws.amazon.com/bedrock/anthropic/)
