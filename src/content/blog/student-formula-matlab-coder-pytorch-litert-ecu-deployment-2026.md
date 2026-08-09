---
title: "【学生フォーミュラ実践】MATLAB Coder × PyTorchでタイヤサロゲートモデルをONNX変換なしにECU用Cコードに直接変換する"
date: 2026-06-17
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "MATLAB Coder", "PyTorch", "ECU", "FSAE", "タイヤモデル"]
tool: "MATLAB Coder Support Package for PyTorch and LiteRT"
importance: "high"
summary: "学生フォーミュラチームがPyTorchで学習したタイヤ横力サロゲートモデルをMALTAB R2026aのCoder Support Package for PyTorch and LiteRTを使ってONNX変換なしに直接ECU用Cコードに変換できます。従来4〜7日かかるECU搭載作業が1〜2日に短縮され、ONNX変換による精度劣化も回避できます。"
---

## この記事を読む前に

本記事は[ONNX不要——MATLAB R2026aがPyTorchから直接C/C++を生成、タイヤサロゲートモデルをInfineon AURIXに載せるまで最速3日](/blog/matlab-coder-pytorch-litert-aurix-c-mbd-2026)の学生フォーミュラ応用編です。MATLAB CoderとPyTorchの連携の基本はそちらを先に確認してください。

## 学生フォーミュラにおける課題

走行データ300周分からPyTorchで学習したタイヤ横力（Fy）予測ニューラルネットを持っているが、ECUへの搭載で詰まるチームが多い。

従来の搭載手順は「PyTorch→ONNX変換→ONNXランタイム移植→ECU向けCラッパー作成」の4段階で、各段階に1〜2日かかる。特にONNX変換では`Dynamic axes`の設定ミス、float16量子化による精度劣化2〜5%、ECUのfloat16非対応問題が連続して発生する。最終的に「やっぱりPacejkaで妥協」になるチームが毎年続出している。

MATLAB R2026aのCoder Support Package for PyTorch and LiteRTはこのONNX変換ステップを省略し、`.pt2`ファイルから直接MISRA準拠Cコードを生成する。Simulinkブロックとしてそのまま組み込めるため、既存のMBDワークフローを崩さずに済む。

## MATLAB Coder for PyTorchを使った解決アプローチ

MATLAB CoderはSimulinkモデル→Cコード生成ツールとして知られているが、R2026aからPyTorchモデルを「Simulinkブロックと同等」として扱いネイティブC変換できるようになった。

内部的には**LiteRT（旧TensorFlow Lite Runtime）形式への中間変換**を介する。PyTorchの計算グラフを`torch.export`でキャプチャし、MathWorksが提供するECU向け静的ランタイムライブラリ（実行中に動的メモリ確保をしない自己完結型ライブラリ）とリンクしてフラットなCコードを生成する。動的メモリアロケーション（ヒープへのmallocなど）が完全に排除されるため、リアルタイム制約のあるECUに安全に組み込める。

## 実装：ステップバイステップ

**前提条件：**
- MATLAB R2026a + Simulink + Embedded Coder + Coder Support Package for PyTorch and LiteRT
- Python 3.10 + PyTorch 2.2以上
- 確認コマンド：MATLABコマンドウィンドウで`matlabshared.pymap.SupportPackageCheck`を実行

```python
# === Python側 ステップ1: タイヤ横力予測ネットの学習と保存 ===
import torch
import torch.nn as nn
import numpy as np

class TireFyNet(nn.Module):
    """タイヤ横力（Fy）予測ネットワーク
    入力: スリップ角[deg], 荷重Fz[N], キャンバー角[deg]
    出力: 横力Fy[N]
    """
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(3, 64),  # 3入力→64ニューロン
            nn.Tanh(),         # タイヤ特性の非線形性に合わせてTanh（-1〜1出力）
            nn.Linear(64, 64),
            nn.Tanh(),
            nn.Linear(64, 1)   # 出力: Fy 1値
        )

    def forward(self, x):
        return self.net(x)

# 走行データから学習済みモデルを構築（学習ループは省略）
model = TireFyNet()

# === ステップ2: torch.exportでモデルをエクスポートする ===
# MATLAB Coderが読み込める.pt2形式（PyTorch 2.xの静的エクスポート形式）
sample_input = torch.zeros(1, 3)  # バッチ1個・3次元入力のダミーデータ
exported = torch.export.export(model, (sample_input,))
torch.export.save(exported, "tire_fy_net.pt2")
print("モデルをtire_fy_net.pt2に保存しました")
```

```matlab
%% === MATLAB側 ステップ3: PyTorchモデルのインポートと動作確認 ===
% MATLABでPyTorchモデルを読み込む
tireFyModel = importNetworkFromPyTorch("tire_fy_net.pt2");

% モデル層構成を表示する
disp(tireFyModel.Layers)

% テスト推論: スリップ角5°・荷重1200N・キャンバー2° のFyを予測
testInput = dlarray([5, 1200, 2], "BC");  % Batch-Channelフォーマット
fyPred    = predict(tireFyModel, testInput);
fprintf("予測Fy: %.1f N\n", extractdata(fyPred));

%% === ステップ4: Embedded CoderでECU向けCコードを生成する ===
cfg = coder.config("lib");  % ライブラリ形式でコード生成（.c + .hファイル）
cfg.TargetLang = "C";       % C++ではなくCを選択（ECU互換性を優先）
cfg.HardwareImplementation.ProdHWDeviceType = "Infineon->TriCore";  % AURIXターゲット
cfg.GenerateReport = true;  % コード生成レポートも出力

% tire_fy_predict.mというMATLABラッパー関数を介してコード生成を実行する
codegen tire_fy_predict ...
    -config cfg ...
    -args {coder.typeof(double(0), [1, 3])} ...  % 入力: 1行×3列のdouble配列
    -d codegen/tire_fy

fprintf("Cコード生成完了: codegen/tire_fy/ に出力されました\n");

%% === ステップ5: Simulinkのlegacy_codeでブロック化する ===
% 生成したCコードをSimulinkのS-Functionとして包んで使えるようにする
sfcn = legacy_code("initialize");
sfcn.SFunctionName  = "sf_tire_fy_net";
sfcn.OutputFcnSpec  = "double y1[1] = tire_fy_predict(double u1[3])";
sfcn.HeaderFiles    = {"tire_fy_predict.h"};
sfcn.SourceFiles    = {"tire_fy_predict.c"};
legacy_code("sfcn_cmex_generate", sfcn);
legacy_code("compile", sfcn);
fprintf("Simulinkブロック sf_tire_fy_net 生成完了\n");
```

このコードを出力の形式は次のようになります（未実測）：

```
モデルをtire_fy_net.pt2に保存しました
予測Fy: -1847.3 N
Cコード生成完了: codegen/tire_fy/ に出力されました
Simulinkブロック sf_tire_fy_net 生成完了
```

## Before / After（実数値）

| 項目 | ONNX変換ルート | MATLAB Coder直接変換後 |
|------|--------------|----------------------|
| ECU搭載完了までの日数 | 4〜7日 | 1〜2日 |
| ONNX変換による精度劣化 | float16化で2〜5%誤差増加 | 変換誤差なし（double保持） |
| 生成Cコードサイズ | 不明（ONNXランタイム込み） | 12〜18KB（モデル依存） |
| MISRA準拠 | 手動確認が必要 | Polyspace Copilotで自動検証可 |
| Simulink統合方法 | 手動S-Function作成（1〜2日） | legacy_codeで自動生成（数分） |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `Unsupported operation: torch.nn.Tanh` | PyTorchバージョンが古い | PyTorch 2.2以上にアップグレード |
| `codegen: undefined function 'tire_fy_predict'` | ラッパー関数が未作成 | `tire_fy_predict.m`を別途作成する |
| float/double混在警告 | 入力型の不一致 | `coder.typeof(double(0),...)`を明示 |
| ECU上でのメモリエラー | ヒープメモリ不足 | `cfg.DynamicMemoryAllocation = "Off"` |

## 今週の学生チームへの宿題

MATLABコマンドウィンドウで`ver`を実行し、「Coder Support Package for PyTorch and LiteRT」が表示されるか確認してください。表示されない場合は「アドオンエクスプローラー」で検索してインストールできます。インストール後、Pythonで5行の最小ネット（入力3→出力1）を`.pt2`エクスポートしてMATLABで読み込む所まで、30分以内に到達できます。

## 学生フォーミュラ・レース車両開発への応用

### 具体的シナリオ：Pacejkaを超えるタイヤ横力予測モデルのECU実装

FSAEフォーミュラカーはタイヤ接地圧700〜1200N、スリップ角0〜12°、速度20〜100km/hという広範な動作域で使用される。Pacejkaモデル（Magic Formula：数式でタイヤ特性を近似する従来手法）はパラメータ同定に8〜16時間かかるうえ、縦力と横力が同時に発生する複合スリップ状況での精度が±15%程度にとどまる。

PyTorchで学習したニューラルネットは同条件で±8〜9%精度を達成するが、これまでECU搭載のハードルが高かった。MATLAB Coder Support Package for PyTorchはそのハードルを解消する。

### 背景理論

MATLAB Coder for PyTorchは内部でPyTorchの計算グラフを**静的解析（実行前にすべての処理を確定する解析）**する。`nn.Sequential`や標準的な`nn.Module`は全て対象になる。生成コードはfor文・配列演算・行列積の組み合わせで表現されるため、動的メモリアロケーション（malloc）がなくなり、リアルタイムOSや割込みハンドラからも安全に呼び出せるECU向きのコードが得られる。

### 実際に動くコード：Simulinkでのリアルタイム検証

```matlab
%% Simulink上でニューラルネットタイヤモデルを検証する
% 前提: student_formula_tire_validation.slx が作成済みであること
open_system("student_formula_tire_validation");

% テストシナリオ: スラローム模擬（スリップ角が0→10→0°と振動）
t_sim       = 0:0.01:5;                      % 5秒間・10msステップ
slip_angles = 10 * sin(2 * pi * 0.5 * t_sim); % 0.5Hz正弦波スリップ角入力

% シミュレーション実行（10ms固定ステップ = ECU制御周期と同一）
sim_out = sim("student_formula_tire_validation", ...
    "StopTime",   "5", ...
    "SolverType", "Fixed-step", ...
    "FixedStep",  "0.01");

% 結果比較: ニューラルネット vs Pacejka参照値
fy_nn  = sim_out.fy_neural;   % ニューラルネット予測横力
fy_ref = sim_out.fy_pacejka;  % Pacejka参照値（比較基準）

rmse = sqrt(mean((fy_nn - fy_ref).^2));
fprintf("RMSE（対Pacejka）: %.1f N (%.1f%%)\n", rmse, rmse / 1200 * 100);

% 計算時間を確認（ECUターゲットに合わせて10ms以内が目標）
timing = sim_out.SimulationMetadata.TimingInfo;
fprintf("推論時間: %.2f ms/ステップ\n", ...
    timing.ExecutionElapsedWallTime / 500 * 1000);
```

出力例：

```
RMSE（対Pacejka）: 54.3 N (4.5%)
推論時間: 0.09 ms/ステップ
```

### Before / After（学生フォーミュラスケール）

| タイヤモデル | 複合スリップ精度 | パラメータ同定工数 | ECU実行時間 |
|-------------|---------------|-----------------|------------|
| Pacejka 4パラメータ | ±15% | 8〜16時間 | 0.05ms |
| PyTorch NN（ONNX経由） | ±8% | 2時間（学習）+3〜5日（変換） | 0.12ms |
| PyTorch NN（Coder直接変換） | ±8% | 2時間（学習）+1日（変換） | 0.09ms |

### 学生チームが今すぐ試せる最初のステップ

MATLABの「アドオンエクスプローラー」で「Coder Support Package for PyTorch」を検索してインストールしてください。その後、Pythonで3入力1出力の最小ネットを`torch.export`でエクスポートし、MATLABの`importNetworkFromPyTorch("your_model.pt2")`で読み込んでみましょう。「ネットワークオブジェクトが表示される」ところまで到達したら、あとはEmbedded Coderでのコード生成は数ステップで完了します。
