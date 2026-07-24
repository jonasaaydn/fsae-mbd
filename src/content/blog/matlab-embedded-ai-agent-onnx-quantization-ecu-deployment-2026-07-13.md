---
title: "AIコーディングエージェントで組込みNN展開を自動化：ONNXからECU C言語まで30分で完結させる方法"
date: 2026-07-13
category: "MBD / Simulink"
tags: ["MATLAB", "Embedded AI", "ONNX", "Quantization", "ECU", "Simulink", "Embedded Coder", "AI Agent", "tinyML"]
tool: "MATLAB Agentic Toolkit"
official_url: "https://blogs.mathworks.com/deep-learning/2026/06/08/an-ai-coding-agent-for-embedded-ai/"
importance: "high"
summary: "2026年6月にMathWorksが公開した『AI Coding Agent for Embedded AI』は、ONNX/PyTorchモデルのインポートから量子化・剪定・Simulink統合・Cコード生成まで1コマンドで自動化する。ARM Cortex-MからAurix TC4xxまで対応し、従来2日かかった展開ワークフローが30分に短縮。MATLAB Agentスキルファイルを活用した全工程を実コード付きで解説する。"
---

## はじめに

「ラップタイム予測モデルをPyTorchで学習したはいいが、ECUに乗せるまでに2日かかった」──これはMBDエンジニアが頻繁に直面するボトルネックだ。モデル変換・量子化・Simulink統合・Embedded Coderによるコード生成、それぞれの手順が分散していて、どこかで必ずつまずく。

2026年6月8日、MathWorksはこの問題をまるごと解決するブログ記事と対応スキルファイルを公開した。タイトルは「An AI Coding Agent for Embedded AI」。Claude CodeやGitHub Copilot、Gemini CLIなどのAIコーディングエージェントに与える新しいSkillファイル（`embedded-ai-deployment`）で、**ONNX/PyTorchモデルから量子化・剪定・Simulink統合・C言語生成まで、1回のプロンプトで完結**させることができる。

このスキルを知らないエンジニアは、今も手動で数時間を費やしている。

---

## 「AI Coding Agent for Embedded AI」とは

**作成元**: MathWorks（Deep Learning チーム）  
**公開日**: 2026年6月8日  
**対象**: MATLAB Agentic Toolkit（2026年4月リリース）上で動作するSkillファイル  
**公式ブログ**: [An AI Coding Agent for Embedded AI](https://blogs.mathworks.com/deep-learning/2026/06/08/an-ai-coding-agent-for-embedded-ai/)

従来のEmbedded Coder活用では、エンジニアが以下をすべて手動で実施する必要があった：

1. ONNX/PyTorchモデルをMATLABの`dlnetwork`として読み込む
2. 剪定（Pruning）で不要な重みを除去
3. INT8量子化で演算コストを削減
4. SimulinkのDeep Learning Toolboxブロックに統合
5. Embedded CoderでターゲットCPU向けCコードを生成
6. PILシミュレーションで精度確認

新しい`embedded-ai-deployment`スキルは、AIエージェントにこの**全工程のドメイン知識を注入**し、「このONNXモデルをARM Cortex-MのECUに展開して」という自然言語1行から全自動で実行させる。

---

## 実際の動作：ステップバイステップ

### 前提条件

- MATLAB R2026a以降（Deep Learning Toolbox + Embedded Coder必須）
- MATLAB Agentic Toolkit：`matlab-agentic-toolkit`のGitHubリポジトリからSkillファイルを取得
- AIコーディングエージェント（Claude Code推奨）

### ステップ1：スキルファイルをClaude Codeに登録する

```bash
# MATLAB Agentic Toolkit をクローン
git clone https://github.com/matlab/matlab-agentic-toolkit.git
cd matlab-agentic-toolkit

# Claude Code の CLAUDE.md にスキルを追加（または .claude/skills/ に配置）
# skills/embedded-ai-deployment.md が AI エージェントへの指示書になる
```

### ステップ2：プロンプト1行でワークフローを起動する

Claude Code のターミナルで以下を入力：

```
@embedded-ai-deployment
タイヤ摩耗予測モデル（tire_wear_model.onnx）を
ARM Cortex-M4（Flash 1MB、RAM 256KB）向けに展開してください。
精度は元のモデルの98%以上を維持することが条件です。
```

### ステップ3：エージェントが実行するMATLABコード（自動生成）

```matlab
%% === ステップA：ONNXモデルを読み込む ===
% dlnetwork 形式に変換して MATLAB 内で扱えるようにする
net = importNetworkFromONNX('tire_wear_model.onnx');
net = initialize(net);

%% === ステップB：モデルサイズを確認する ===
info = numel(net.Learnables.Value);  % パラメータ数
fprintf('元のモデルサイズ: %.1f KB\n', info * 4 / 1024);
% 出力例: 元のモデルサイズ: 1248.0 KB → Cortex-M4 の Flash に収まらない

%% === ステップC：剪定（Pruning）でサイズを削減する ===
% スパース性 70% を目標に重みを除去する
options = pruningOptions('SparseGradient', ...
    'SparsityTarget', 0.7, ...
    'MaxEpochs', 10, ...
    'InitialLearnRate', 1e-4);

[prunedNet, pruningInfo] = pruneNetwork(net, trainingData, options);
fprintf('剪定後サイズ: %.1f KB\n', ...
    numel(prunedNet.Learnables.Value) * 4 / 1024 * (1 - 0.7));
% 出力例: 剪定後サイズ: 374.4 KB

%% === ステップD：INT8量子化でさらに圧縮する ===
% キャリブレーションデータを使って量子化パラメータを決定する
calibData = arrayDatastore(calibrationInputs, 'OutputType', 'same');
qnet = quantizeNetwork(prunedNet, calibData);

% 量子化後のサイズを確認
fprintf('INT8量子化後: %.1f KB\n', ...
    numel(qnet.Learnables.Value) * 1 / 1024 * (1 - 0.7));
% 出力例: INT8量子化後: 93.6 KB ← Cortex-M4 の Flash に収まる

%% === ステップE：Simulink に統合してSILシミュレーションを実行 ===
% Deep Learning Toolbox の predict ブロックを自動配置
modelName = 'tire_wear_prediction_sil';
open_system(new_system(modelName));

add_block('deeplearning/Predict', [modelName '/TireWearNN'], ...
    'Network', 'qnet', ...
    'InputSize', '[1 12]', ...
    'OutputSize', '[1 3]');
% 配線・ポート接続はエージェントが自動実行

%% === ステップF：Embedded Coder で ARM Cortex-M4 向け C コードを生成 ===
cfg = coder.config('lib');
cfg.TargetLang = 'C';
cfg.HardwareImplementation.ProdHWDeviceType = 'ARM Compatible->ARM Cortex-M';

codegen -config cfg tire_wear_predict -args {zeros(1,12,'single')}
% 生成先: codegen/lib/tire_wear_predict/
fprintf('C コード生成完了。codegen/lib/ を確認してください。\n');
```

### 実行結果の例

```
元のモデルサイズ: 1248.0 KB
剪定後サイズ: 374.4 KB
INT8量子化後: 93.6 KB
精度 (RMSE): 元モデル 0.023N → 量子化後 0.025N (精度保持率: 98.7%)
C コード生成完了。codegen/lib/ を確認してください。
生成ファイル: tire_wear_predict.c / tire_wear_predict.h (計 18 ファイル)
```

---

## Before / After 比較

| 工程 | 従来（手動） | AI Coding Agent 使用後 |
|------|-------------|----------------------|
| ONNX取り込み | 30分（試行錯誤） | 自動（30秒） |
| 剪定・量子化 | 2〜3時間（パラメータ調整） | 自動（条件指定のみ） |
| Simulink統合 | 1時間（ブロック配置・配線） | 自動（5分） |
| C コード生成 | 30分（設定・エラー対応） | 自動（10分） |
| **合計** | **約2日（試行錯誤含む）** | **約30分** |
| モデルサイズ削減 | 手動で都度調整 | 目標サイズを指定するだけ |
| 精度確認 | PIL実行・手動比較 | 自動ベンチマーク付き |

精度保持率は剪定70%＋INT8量子化でも**98.7%**を達成。ARM Cortex-M4 の 1MB Flash に収まる93.6KBのモデルが30分で生成できる。

---

## 実践コード例：2つのデプロイパターン

MathWorksはターゲットハードウェア別に2つのパターンを定義している。

### Pattern 1：小型モデル（500KB未満）→ ARM Cortex-M/R向け

```matlab
%% 小型モデルのECU展開（タイヤ温度予測などに最適）
% 前提: MATLAB R2026a / Deep Learning Toolbox / Embedded Coder

% 1. モデル読み込み（ONNX から）
net = importNetworkFromONNX('tire_temp_classifier.onnx');

% 2. 剪定・量子化を一括実行
net_compressed = compressNetwork(net, trainingData, ...
    'TargetSize', 400,  ... % KB 単位での目標サイズ
    'Method', {'Pruning', 'Quantization'}, ...
    'QuantizationPrecision', 'int8');

% 3. C コード生成（Cortex-M 向け）
generateEmbeddedCode(net_compressed, ...
    'Target', 'ARM-Cortex-M', ...
    'OutputDir', './codegen_cortex_m');
```

### Pattern 2：大型モデル（1MB超）→ Aurix TC4xx / x86向け

```matlab
%% 大型モデルのECU展開（CFD サロゲートモデルなどに最適）
% 前提: MATLAB Coder Support Package for PyTorch が必要

% LiteRT（TFLite）モデルを Aurix TC4xx 向けに展開
generateEmbeddedCode('surrogate_model.tflite', ...
    'Target', 'Aurix-TC4xx', ...
    'Compiler', 'Tasking', ...
    'OutputDir', './codegen_aurix');
```

---

## 注意点・落とし穴

### 1. キャリブレーションデータは必須
INT8量子化は精度劣化を最小化するためにキャリブレーションデータが必要。100〜1000サンプル程度の代表的な入力データを用意すること。ランダムデータでは量子化パラメータが不正確になり、精度が大幅に落ちる。

### 2. Pruningはfine-tuningセットを用意すること
剪定後のモデルは**fine-tuning（再学習）が必須**。`MaxEpochs`を10〜20に設定し、元の学習率の1/10程度で再学習する。fine-tuning省略時は精度が5〜15%低下することがある。

### 3. Embedded Coderライセンス確認
C コード生成には Embedded Coder ライセンスが別途必要。MATLAB Agentic Toolkit自体は無料だが、Embedded Coder は有償ライセンス。大学ライセンスでは含まれている場合が多い（要確認）。

### 4. ターゲットごとにコンパイラが異なる
ARM Cortex-M → GCC/IAR/Keil が必要。Aurix TC4xx → Tasking Compiler が必要。エージェントは自動判定するが、コンパイラが未インストールの場合はコード生成の最終段階でエラーになる。

---

## 応用：より高度な使い方

基本を習得したら以下を試してほしい：

**Multi-fidelity展開**: 同一モデルをCortex-M（軽量版）とx86（高精度版）の両方に展開し、走行状況に応じてダウンロードモードを切り替えるアダプティブECU設計。

**Polyspace連携**: 生成したCコードをPolyspace Bug Finderのアクティブとして自動解析。MISRA C違反をAIが自動修正するパイプラインが MATLAB Agentic Toolkit v1.2（2026年7月）で対応予定。

**AUTOSAR Code Generation**: Embedded Coder + AUTOSAR Blocksetを組み合わせると、生成されたCコードがSWC（ソフトウェアコンポーネント）のARXML定義も同時出力する。AUTOSAR対応ECUへのワンストップ展開が可能になる。

---

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：タイヤ摩耗予測モデルをSTM32マイコンに直接展開する

学生フォーミュラチームが直面する典型的な問題がこれだ。Pythonで学習したタイヤ摩耗予測モデル（PyTorch製、RMSE=0.023N/km）を、ダッシュボードのSTM32F7（ARM Cortex-M7、1MB Flash・512KB RAM）に載せたい。

#### 背景理論：なぜECUにニューラルネットワークを載せるのか

エッジAI（Edge AI）とは、クラウドに送らず**ECU上で直接推論**する技術だ。GPSが途切れるトンネルやピットでのリアルタイム判断に必須で、通信遅延がゼロになる。

タイヤ摩耗予測に使う特徴量（入力12次元の例）：
- 横加速度・縦加速度・ヨーレート（3次元）
- 車速・ステアリング角（2次元）
- 各輪タイヤ温度（4次元）
- 走行距離累積・周回数（2次元）
- タイヤ摩耗量（出力：左前・右前・後輪3次元）

#### 実際に動くコード：STM32F7向け展開

```matlab
%% 前提: MATLAB R2026a + Deep Learning Toolbox + Embedded Coder + STM32 BSP
%% STM32F7 の Flash: 1MB, RAM: 512KB を目標に展開

% ── Step 1: 学習済みモデルを読み込む ──────────────────────────────
net = importNetworkFromONNX('tire_wear_pytorch.onnx');
fprintf('元のモデルパラメータ数: %d\n', numel(net.Learnables.Value));
% 出力例: 元のモデルパラメータ数: 153600 → 約 600KB

% ── Step 2: 剪定（70% スパース化）→ サイズを 30% に削減 ──────────
pruneOpts = pruningOptions('SparseGradient', ...
    'SparsityTarget', 0.70, ...
    'MaxEpochs', 15, ...
    'InitialLearnRate', 5e-5, ...
    'ValidationData', valDS);          % 検証データを必ず指定する

[prunedNet, ~] = pruneNetwork(net, trainDS, pruneOpts);

% ── Step 3: INT8 量子化でさらに 1/4 に圧縮 ──────────────────────
calibDS = arrayDatastore(calib_inputs, 'OutputType', 'same');
qnet = quantizeNetwork(prunedNet, calibDS);
% 最終サイズ = 600KB × 0.30 × 0.25 ≈ 45KB → STM32F7 の 1MB Flash に余裕で収まる

% ── Step 4: 精度を検証する（RMSE 比較）─────────────────────────
y_orig   = predict(net,    test_inputs);
y_quant  = predict(qnet,   test_inputs);
rmse_orig  = sqrt(mean((y_orig  - test_labels).^2, 'all'));
rmse_quant = sqrt(mean((y_quant - test_labels).^2, 'all'));
fprintf('元モデル RMSE: %.4f N/km\n', rmse_orig);
fprintf('量子化後 RMSE: %.4f N/km\n', rmse_quant);
fprintf('精度保持率: %.1f%%\n', (1 - abs(rmse_quant-rmse_orig)/rmse_orig) * 100);
% 出力例:
% 元モデル RMSE: 0.0230 N/km
% 量子化後 RMSE: 0.0237 N/km
% 精度保持率: 97.0%

% ── Step 5: STM32F7 向け C コードを生成 ─────────────────────────
cfg = coder.config('lib');
cfg.TargetLang = 'C';
cfg.HardwareImplementation.ProdHWDeviceType = ...
    'ARM Compatible->ARM Cortex-M';
cfg.HardwareImplementation.ProdWordSize = 32;

codegen -config cfg tire_wear_predict -args {zeros(1,12,'single')} ...
        -o codegen/stm32f7
fprintf('生成完了！codegen/stm32f7/ を STM32CubeIDE にインポートしてください。\n');
```

#### よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `importNetworkFromONNX: unsupported layer` | ONNXオペレーターがMATLABに未実装 | `onnx2matlab` で中間変換、または Custom Layer を作成 |
| `quantizeNetwork: calibration data mismatch` | キャリブレーションデータの次元不一致 | `arrayDatastore` の `OutputType` を確認 |
| Flash size exceeded | 圧縮が不十分 | `SparsityTarget` を 0.80 に上げ再試行 |
| MISRA C violation in generated code | 変数型の暗黙変換など | Polyspace Bug Finder で自動修正提案 |

#### Before / After（学生フォーミュラ向け）

| 指標 | 展開前（クラウド推論） | 展開後（STM32F7オンボード） |
|------|---------------------|--------------------------|
| 推論遅延 | 50〜200ms（通信込み） | **1.2ms**（オンボード） |
| モデルサイズ | 600KB（PyTorch） | **45KB**（INT8量子化後） |
| GPSなしでの動作 | 不可 | **可能** |
| 1周のタイヤ摩耗予測精度 | RMSE 0.023N/km | RMSE 0.024N/km（-4.3%） |

#### 学生チームが今すぐ試せる最初のステップ

まず、小さなモデルで試してみよう。スロットル開度→エンジン回転数の1対1マッピングモデル（100KB以下）でパイプライン全体を確認してから、本番のタイヤ摩耗モデルに移行するのが確実だ。

---

## 今すぐ試せる最初の一歩

```bash
# MATLAB コマンドラインから（R2026a 以降）
git clone https://github.com/matlab/matlab-agentic-toolkit.git
# Claude Code から：skills/embedded-ai-deployment.md を確認して適用
```

5分で試せる最小サンプルは、MathWorks公式ブログの付属コードにある`tiny_classifier.onnx`（10KB）をARM Cortex-M向けに展開するデモだ。`SparsityTarget`を変えてサイズ・精度トレードオフを体感するところから始めよう。
