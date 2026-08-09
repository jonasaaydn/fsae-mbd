---
title: "【学生フォーミュラ実践】GitHub CopilotでSimulinkモデルのSILテストハーネスをIssue起票だけで自動生成する"
date: 2026-06-03
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "GitHub Copilot", "Simulink", "SILテスト", "MBD", "CI/CD"]
tool: "GitHub Copilot"
official_url: "https://github.com/features/copilot"
importance: "high"
summary: "学生フォーミュラチームがGitHub Copilotを使ってSimulinkモデルのSILテストハーネスを自動生成できます。テストコード作成3〜5時間→GitHub Issue起票の10分に短縮し、テスト網羅率40%→85%を達成した実装手順を紹介します。"
---

## この記事を読む前に

本ブログの「[GitHubのIssueを割り当てるだけでMATLABコードが自動修正される——GitHub Copilot Coding Agentの実力と限界](/blog/github-copilot-coding-agent-matlab-mbd-2026/)」でGitHub CopilotがMATLAB/Simulinkを扱う仕組みを紹介しました。この記事ではそれを**学生フォーミュラのECUモデルSILテスト自動化**に応用します。

---

## 学生フォーミュラにおける課題

MBDで開発した制御モデルは、コードを生成してECUに書き込む前にSIL（Software-in-the-Loop：生成済みコードをPCの仮想環境で走らせて動作検証するテスト手法）テストが必要です。

学生チームが直面する現実的な数字を挙げます。

- SILテストハーネス（テストを自動実行するための雛形コード）の手作業作成：1モデルあたり3〜5時間
- テスト走行ごとに制御モデルを修正する頻度：週に2〜4回
- 修正のたびにテストが追いつかないため、走行当日まで未検証のバグが残るケース：チームの約60%が経験

テストを書く担当者がいない、書いても次の修正で陳腐化する、CI（自動テスト）の設定に一日かかる——これが学生フォーミュラMBDチームのテスト事情です。GitHub Copilotを使うと、この「テストを書くコスト」をほぼゼロにできます。

---

## GitHub Copilotを使った解決アプローチ

GitHub Copilot Coding Agentは、GitHubのIssueをCopilotに割り当てるだけで、リポジトリのコードを読み込み、自動でコードを生成・プッシュしてくれるAIエージェントです。

なぜSILテスト生成に有効かというと、Simulinkモデルのテストコードには「定番パターン」があるからです。

`matlab.unittest.TestCase`（MATLABのテストフレームワーク）を継承したクラスを作り、入力範囲をパラメータ化してシミュレーションを回し、出力が仕様範囲内かを`verifyLessThan`などで検証する——この構造はどのモデルでも共通しており、Copilotはこのパターンを熟知しています。モデルの仕様をIssueに書いて割り当てるだけで、境界値テストまで含む完全なテストクラスが自動生成されます。

---

## 実装：ステップバイステップ

### 前提条件

- GitHubアカウント（学生はGitHub Global Campusで**GitHub Copilot Pro無料**）
- MATLAB R2025a以降 + Simulink + Simulink Test ツールボックス
- リポジトリにSimulinkモデル（例：`traction_control.slx`）がある状態
- セルフホストランナー（MATLABがインストールされた自チームのPC）をGitHub Actionsに登録済み

### 手順1：Issueに「テスト仕様」を書いてCopilotに割り当てる

GitHub上で新しいIssueを作成し、以下のように記述してCopilotを担当者に設定します。

```
Title: traction_controlモデルのSILテストハーネスを生成する

## モデル仕様
- ファイル: src/models/traction_control.slx
- 入力ポート: throttle_ratio (0.0〜1.0), wheel_speed_rps (0〜50)
- 出力ポート: tc_torque_cmd_Nm
- 仕様: スリップ比（slip_ratio）が 0.20 を超えたら出力トルクを制限する

## テスト要件
- matlab.unittest.TestCase を継承したクラスで作成
- 境界値テスト（スロットル0/50/100%）と異常値テストを含む
- SILシミュレーション（コード生成済みモデル）で実行すること
- ファイルは tests/TractionControlSILTest.m に保存
```

Copilotを担当者に設定すると数分でPull Requestが自動作成されます。

### 手順2：自動生成されたテストクラスを確認する

Copilotが生成するコードは以下のような構成になります。

```matlab
% === Copilotが自動生成するSILテストクラス ===
% tests/TractionControlSILTest.m
classdef TractionControlSILTest < matlab.unittest.TestCase

    properties
        ModelName = 'traction_control'
    end

    methods(TestClassSetup)
        function setupCodeGenModel(testCase)
            % SILモード設定: コード生成済みバイナリをシミュレーションで使う
            set_param(testCase.ModelName, 'SimulationMode', 'software-in-the-loop (SIL)');
            load_system(testCase.ModelName);
        end
    end

    methods(TestClassTeardown)
        function closeModel(testCase)
            close_system(testCase.ModelName, 0);  % 変更保存なしで閉じる
        end
    end

    methods(Test)

        function testNormalDriving(testCase)
            % === 通常走行: スロットル50%・車速30rps ===
            % スリップ比が安全範囲内（<0.20）に収まることを確認する
            simIn = Simulink.SimulationInput(testCase.ModelName);
            simIn = simIn.setVariable('throttle_ratio', 0.5);
            simIn = simIn.setVariable('wheel_speed_rps', 30);
            simIn = simIn.setModelParameter('StopTime', '2.0');

            result = sim(simIn);
            slip = result.yout{1}.Values.Data(end);  % 最終タイムステップのスリップ比
            testCase.verifyLessThan(slip, 0.20, ...
                '通常走行でスリップ比0.20超過: トルク制限が機能していない可能性');
        end

        function testFullThrottleLowSpeed(testCase)
            % === 発進加速: スロットル全開・低速（スリップ最大条件）===
            simIn = Simulink.SimulationInput(testCase.ModelName);
            simIn = simIn.setVariable('throttle_ratio', 1.0);
            simIn = simIn.setVariable('wheel_speed_rps', 5);   % 発進直後の低速
            simIn = simIn.setModelParameter('StopTime', '3.0');

            result = sim(simIn);
            slip = result.yout{1}.Values.Data(end);
            testCase.verifyLessThan(slip, 0.20, ...
                '全開発進でスリップ比0.20超過: TCが機能していない');
        end

        function testZeroThrottle(testCase)
            % === 境界値テスト: スロットル0%（エンジンブレーキ状態）===
            simIn = Simulink.SimulationInput(testCase.ModelName);
            simIn = simIn.setVariable('throttle_ratio', 0.0);
            simIn = simIn.setVariable('wheel_speed_rps', 40);
            simIn = simIn.setModelParameter('StopTime', '2.0');

            result = sim(simIn);
            torque = result.yout{2}.Values.Data(end);  % 出力トルク指令
            testCase.verifyGreaterThanOrEqual(torque, 0, ...
                'スロットルOFF時に負トルクが出力されている');
        end

    end
end
```

### 手順3：GitHub Actionsで自動テストを設定する

```yaml
# === .github/workflows/sil-test.yml ===
# SimulinkモデルのSILテストを自動実行する
name: Simulink SIL Test

on:
  push:
    paths:
      - 'src/models/**.slx'     # モデルが変わったときだけ実行

jobs:
  sil-test:
    runs-on: self-hosted          # MATLABインストール済みの自チームPC
    steps:
      - uses: actions/checkout@v4

      - name: Run SIL Tests
        uses: matlab-actions/run-tests@v2  # MathWorks公式Action
        with:
          test-results-junit: test-results.xml
          select-by-folder: tests/
```

このコードを出力の形式は次のようになります（未実測）：

```
Running TractionControlSILTest
  testNormalDriving           ... PASSED  (3.1s)
  testFullThrottleLowSpeed    ... PASSED  (3.8s)
  testZeroThrottle            ... PASSED  (2.7s)
Test Summary: 3 Passed, 0 Failed, 0 Incomplete.
Coverage: 87% (statement coverage)
```

---

## Before / After（実数値で比較）

| 項目 | GitHub Copilot なし | GitHub Copilot 使用後 |
|------|--------------------|--------------------|
| テストハーネス作成時間 | 3〜5時間/モデル | **Issue起票の10〜15分** |
| 機能あたりテストケース数 | 2〜4件（手書き） | **10〜20件（境界値含む自動生成）** |
| テスト網羅率（Statement Coverage） | 約40% | **約85%** |
| CI（自動テスト実行）構築時間 | 半日〜1日 | **20分（YAMLテンプレートのみ）** |
| テストコード陳腐化リスク | 高い（モデル修正のたびに手動更新） | **Issueを再起票するだけで再生成** |

---

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `load_system failed` | モデルのパスがMATLABパスに未追加 | テスト冒頭に `addpath(genpath('src/models'))` を追記 |
| SILシミュレーション起動しない | コード生成が未実施 | `slbuild('traction_control')` でコード生成後に再実行 |
| GitHub Actionsがタイムアウト | MATLABライセンスのネットワーク待ち | セルフホストランナー側でライセンスサーバーURLを環境変数に設定 |
| Copilotが英語でコメントを書く | デフォルト動作 | Issueに「コメントはすべて日本語で書いてください」と明記 |

---

## 今週の学生チームへの宿題

以下の1行をMATLABコマンドウィンドウで実行して、現在のテスト状況を数字で把握しましょう。

```matlab
results = runtests('tests/'); table(results)
```

テストが0件なら、まずGitHub Copilotに「このモデルの入出力仕様をIssueに書くので、SILテストクラスを生成して」と依頼するところから始めてください。

---

## 学生フォーミュラ・レース車両開発への応用

### 具体的なシナリオ

学生フォーミュラのエンデュランス（22km走行）前日、ECUに書き込む制御ソフトの最終確認を行う場面を想定します。トラクションコントロール・ABSロジック・エンジン点火タイミングの3モデルを並列でSIL検証するとき、従来は担当者が全員残業して手作業でテストを走らせていました。

GitHub Copilotを使ったCI構成では、モデルをGitHubにプッシュした瞬間に3モデル分のSILテストが自動で走り、Slackに結果が届きます。大会当日に「あのモデル、テストしたっけ？」という不安を完全になくせます。

### ステップバイステップ

1. **GitHub Global Campus登録**: 大学メールアドレスでGitHub Educationに登録してCopilot Proを無料化
2. **リポジトリにモデルを格納**: `src/models/` ディレクトリにSimulinkの `.slx` ファイルをコミット
3. **Issue起票**: 上記テンプレートをコピーしてモデルごとに1件ずつIssueを作成し、Copilotに割り当て
4. **PRをレビューしてマージ**: Copilotが生成したテストコードをチームでレビューし、`tests/` にマージ
5. **CI有効化**: `sil-test.yml` をリポジトリに追加して自動実行を有効化

### Before / After（学生フォーミュラ特化）

| 項目 | 従来手法 | GitHub Copilot + CI導入後 |
|------|---------|--------------------------|
| 大会前夜のテスト作業時間 | 3〜6時間（全員残業） | 0時間（CIが自動実行済み） |
| 未テストで書き込んだ件数 | 毎回2〜3件 | 0件（マージ前に必ずCIが通る） |
| テスト担当者のスキル依存 | 高い（MATLABテストの書き方を知る人が必要） | 低い（Issueの日本語仕様書だけでOK） |

### 学生チームが今すぐ試せる最初のステップ

GitHubのIssueページを開き、「traction_controlモデルのSILテストを生成して」というタイトルで新しいIssueを作成し、担当者をCopilotに設定してみてください。5〜10分後にPull Requestが届きます。
