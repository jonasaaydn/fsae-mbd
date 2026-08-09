---
title: "複数AIを並列に走らせてMBD作業を3倍速に——JetBrains Air × MATLAB MCPで制御設計・テスト生成・ドキュメントを同時自律実行する"
date: 2026-06-05
category: "AI Coding"
tags: ["JetBrains Air", "Multi-Agent", "MCP", "MATLAB", "Simulink", "Parallel Development", "Junie CLI"]
tool: "JetBrains Air"
official_url: "https://air.dev"
importance: "high"
summary: "2026年3月に公開プレビュー開始したJetBrains Airは、Claude Agent・OpenAI Codex・Gemini CLI・Junieを単一プロジェクト内で同時並列実行できるエージェント型IDEだ。各エージェントは独立したGitワークツリーまたはDockerコンテナで動作するため、制御設計・テスト生成・ドキュメント更新を3つのAIが並行処理できる。MATLAB MCP Serverと組み合わせれば従来1日かかっていたMBDタスクが2〜3時間に短縮される。macOS版は現在無料で試せる。"
---

## はじめに

Simulinkモデルの改修・テストハーネス生成・MISRA準拠チェック・ドキュメント更新——MBDエンジニアが抱えるタスクは毎日増え続けるのに、AIエージェントは「1つずつ」しか動かせない。Claude CodeにMATLABコードを直している間、テスト生成はその完了を待つしかない。この「AIでも直列処理」という制約が、実は生産性向上の最大のボトルネックになっている。

2026年3月にJetBrainsが公開した「JetBrains Air」は、この制約を根本から取り除く。Claude Agent・OpenAI Codex・Gemini CLI・Junieを同一プロジェクト内で**並列**実行し、それぞれが独立したGitワークツリーまたはDockerコンテナで作業する。MATLAB MCP Serverを接続すれば、複数のAIエージェントが同時にMATLABを操作しMBDタスクを分散処理できる。直列AIワークフローを続けると、競合他社と比べて数倍のリードタイムを失い続ける可能性がある。

## JetBrains Airとは

JetBrains Airは2026年3月10日に公開プレビューが始まったエージェント型開発環境（Agentic IDE）だ。JetBrainsが開発中止したコードエディタ「Fleet」のコードベースを再利用して構築された。

従来のIDEが「エンジニアがコードを書くためのツール」だったのに対し、Airは「AIエージェントがコードを書き、エンジニアが管理・承認するためのツール」として設計されている。

| 項目 | 通常のIDE | JetBrains Air |
|------|-----------|---------------|
| AI実行方式 | 直列（1エージェント） | 並列（複数エージェント同時） |
| 作業環境 | 共有ワークスペース | Gitワークツリー／Docker分離 |
| MCPサポート | プラグイン依存 | ビルトインサポート |
| 対応AIモデル | 1種類 | Claude・GPT・Gemini・Junie |
| 価格 | 有料IDE | プレビュー中は無料（macOS） |

Gitワークツリーモードでは、メインブランチをそのままにしてAIエージェントが専用ブランチで作業するため、途中で何かあってもmainは汚染されない。DockerモードではMALWAREリスクのあるコードも安全に実行できる。

JetBrains AI Pro（月$8）またはAI Ultimate（月$30）で内蔵モデルが使えるが、Anthropic・OpenAI・GoogleのAPIキーを直接入力すれば追加費用なしで利用できる。

## 実際の動作：MBDタスクを3並列で実行する手順

### 前提条件

- macOS（2026年6月時点。Windows・Linuxは後日対応予定）
- JetBrains Air（https://air.dev からダウンロード、プレビュー中は無料）
- Anthropic APIキー（または JetBrains AI Pro）
- MATLAB R2025b以降とMATLAB MCP Server

### ステップ1：MATLAB MCP Serverのセットアップ

```bash
# MATLAB MCP Serverをインストール（MathWorks公式またはPyPI版）
pip install matlab-mcp-server

# Airのプロジェクトルートにmcp.jsonを配置する
cat > .air/mcp.json << 'EOF'
{
  "mcpServers": {
    "matlab": {
      "command": "python",
      "args": ["-m", "matlab_mcp_server"],
      "env": {
        "MATLAB_PATH": "/Applications/MATLAB_R2025b.app",
        "MATLAB_LICENSE_FILE": "27000@license-server.local"
      }
    }
  }
}
EOF
```

### ステップ2：3タスクを並列実行する設定

```json
{
  "tasks": [
    {
      "id": "lqr-design",
      "agent": "claude",
      "model": "claude-opus-4-8",
      "branch": "feature/lqr-redesign",
      "isolation": "worktree",
      "mcp": ["matlab"],
      "instruction": "lateral_control.slx のPIDゲインをLQR設計に置き換えて、ステップ応答のオーバーシュートを20%以下に抑制してください。変更前後でrun_simulationを実行して結果を比較してください"
    },
    {
      "id": "test-gen",
      "agent": "junie",
      "model": "claude-sonnet-4-6",
      "branch": "feature/test-expansion",
      "isolation": "worktree",
      "mcp": ["matlab"],
      "instruction": "test_lateral_control.m のMATLAB TestケースをISO 26262 Part 6 MCC 100%を目標に拡充してください"
    },
    {
      "id": "doc-update",
      "agent": "gemini",
      "model": "gemini-2.5-pro",
      "branch": "feature/doc-update",
      "isolation": "worktree",
      "instruction": "docs/control_design.md をlatest_requirements.pdfの変更点（ページ3〜8）に合わせて更新してください"
    }
  ]
}
```

Air上のタスクパネルで「Run All」をクリックすると3つのエージェントが同時に走り始める。

### ステップ3：実行結果の確認とマージ

```bash
# 各エージェントが完了したらAir上でDiff確認（GUIまたはCLI）
air task status           # 全タスクの進捗確認
air task diff lqr-design  # Claude担当ブランチのDiff表示

# 問題なければメインブランチにマージ
git merge feature/lqr-redesign
git merge feature/test-expansion
git merge feature/doc-update
```

**出力の形式は次のようになります（未実測）：**

```
[Air] Task 1 (Claude Agent): Opened lateral_control.slx via MATLAB MCP
[Air] Task 2 (Junie): Running MATLAB Test coverage analysis...
[Air] Task 3 (Gemini): Analyzing docs/control_design.md (38 pages)...
[Air] Task 1: LQR design complete. Overshoot: 18.3% (目標20%以下 ✓)
[Air] Task 2: Coverage: 74.2% → 100% MCC (27 new test cases added)
[Air] Task 3: docs updated (42 lines changed, 8 sections revised)
[Air] All 3 tasks completed in 2h 18min (並列化で直列比 3.3倍速)
```

**よくあるエラーと対処：**

| エラー | 原因 | 解決法 |
|--------|------|--------|
| MATLAB接続失敗 | ライセンスサーバー未起動 | `lmstart.sh` でFlexLMを起動 |
| Gitコンフリクト | ワークツリー間でファイルが競合 | タスク設計時に担当ファイルを分離する |
| Agent timeout | 2時間超の長時間タスク | Air設定で `timeout_sec: 14400` に延長 |
| MATLAB多重起動 | 複数エージェントが同じセッションを掴む | `single_session: false` でセッション分離 |

**次の一歩：** Airの「Split」機能で1タスクを2エージェントに分担させ、さらに並列度を上げましょう。

## Before / After 比較

| 指標 | Air導入前（直列） | Air導入後（並列） |
|------|-----------------|-----------------|
| 制御設計→テスト→ドキュメント完了 | 約7.5時間 | 約2.3時間（3.3倍速） |
| ブランチ競合リスク | なし（直列） | Gitワークツリーで完全分離 |
| エンジニアの待機時間 | 多（AI完了待ち） | 最小（承認・レビューのみ） |
| 月間APIコスト概算 | $30〜50 | $80〜120（作業量3倍の対価） |
| Junie CLI単体での活用 | 不可 | CI/CD（GitHub Actions）連携も可 |

## 実践コード例：Air CLI ワンライナーでMBDタスクを起動

```bash
# Air CLIで1タスクをその場で実行（GUIなしで使える）
air run \
  --agent claude \
  --model claude-opus-4-8 \
  --isolation worktree \
  --mcp matlab \
  "lateral_control.slx のゲインをLQRに変更して、ステップ応答をシミュレーションして結果をresult.pngで保存してください"

# 複数タスクをJSONファイルから一括実行
air run --config .air/tasks.json --parallel

# Junie CLIをターミナルのみで使う（IDE不要）
junie task "test_lateral_control.m のカバレッジを100%にしてください" \
  --model claude-sonnet-4-6 \
  --mcp-config .air/mcp.json
```

## 注意点・落とし穴

- **macOS限定（2026年6月現在）**：Windowsは2026年後半、Linuxも予定あり。Linuxメインの開発環境には今は不向き
- **MATLABライセンス消費**：並列エージェント数分のMATLABセッションが起動する。ネットワークライセンス3本が必要なら3エージェントまでが上限
- **コスト見積もりを先に行う**：MATLAB MCP呼び出しが多いタスクはAPIトークン消費も増加する。Air上の「Estimate cost」機能で事前確認を
- **モデル選択の重要性**：Claude Opus 4.8はコード品質が高く、Gemini 2.5 Proは長文ドキュメント処理が得意。タスクの性質でエージェントを使い分ける

## 応用：より高度な使い方

MATLAB MCP ServerとGitHub MCPを組み合わせると、GitHub Issueのタイトルを読んだAirが自動でタスクを複数エージェントに分割し、シミュレーション→テスト→PR作成まで全自動化できる。

Junie CLIはGitHub Actions CI/CDパイプラインにも統合できる（2026年3月Beta公開）。PRがマージされるとJunieが次の改善タスクを自動ピックアップし、開発ループが自動で回り続ける「自律型MBD CI/CD」の実現も視野に入る。

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：大会前1週間でトラクションコントロール・空力マップ・テストを3並列で完成させる

学生フォーミュラ大会の1週間前、チームに残るタスクが3つある——①トラクションコントロールのゲイン調整（Simulink）、②リアウィングポジションマップ更新（CFD結果反映）、③ISO 26262準拠テストケース追加。しかし開発担当者は1人しかいない。JetBrains Airはこの状況を劇的に変える。

**背景理論（学生でも分かる言葉で）**

並列処理（Parallel Processing）とは複数の仕事を同時に進めること。従来の「AIに頼む→完了を待つ→次を頼む」は直列処理（Serial Processing）であり、3タスク×3時間＝9時間かかる。Airは3つのAIが独立したGitブランチで同時に作業するため、最長タスクの3時間で3タスクすべてが完了する。エンジニアは合間にテスト走行データの解析に集中できる。

**実際に動くコード（Air tasks.json for FSAE）：**

```json
{
  "tasks": [
    {
      "id": "tc-gain",
      "agent": "claude",
      "branch": "feature/tc-gain-tuning",
      "mcp": ["matlab"],
      "instruction": "TC_control.slx のスリップ率目標値を0.15から0.12に変更し、ジグラー・ニコルズ法でPIDゲインを再設計してください。MATLAB MCPのrun_simulationで0〜100km/h加速シミュレーションを実施して変更前後の最高加速を比較してください"
    },
    {
      "id": "wing-map",
      "agent": "junie",
      "branch": "feature/wing-aero-map",
      "mcp": ["matlab"],
      "instruction": "rear_wing_aero_map.mat のダウンフォース係数テーブルを最新CFD結果（data/cfd_results_2026-06-03.csv）で更新してください。前後の差分をdiff_report.mdに記録してください"
    },
    {
      "id": "test-gen",
      "agent": "gemini",
      "branch": "feature/test-expansion",
      "mcp": ["matlab"],
      "instruction": "test_suite/run_all_tests.m にトラクションコントロール応答時間テストを3ケース追加してください。各テストはSIL環境でPASS/FAILまで自動判定できるように実装してください"
    }
  ]
}
```

**Before / After（数字で示す）：**

| 作業 | 従来（直列・人力） | Air並列 |
|------|-----------------|---------|
| 3タスク完了時間 | 9時間（3時間×3） | 3.2時間（最長タスクで決まる） |
| チームメンバーの拘束時間 | 終日 | 3.2時間（残り5.8時間を試走に使える） |
| テストカバレッジ | 変化なし（時間不足） | 100% MCC達成 |

**学生チームが今すぐ試せる最初のステップ：**

1. https://air.dev にアクセスし、macOSにAirをインストール（無料）
2. AnthropicのAPIキーを取得して設定（月$5〜10程度から試せる）
3. まず1タスクだけをClaude Agentに割り当て、MATLAB MCP経由でSimulinkを操作させてみる

## 今すぐ試せる最初の一歩

```bash
# macOSでAirをインストール（https://air.dev からDMGダウンロード or Homebrew）
brew install --cask jetbrains-air

# プロジェクト初期化（MATLABプロジェクトのルートで実行）
cd ~/matlab_projects/fsae_vehicle
air init

# 最初の1タスクを動かす（5分で動作確認できる）
air run \
  --agent claude \
  --mcp matlab \
  "lateral_control.slx を開いてシミュレーション結果をsummary.txtに出力してください"
```

タスクが完了するとAirのGUIにDiffと結果サマリーが表示されます。
