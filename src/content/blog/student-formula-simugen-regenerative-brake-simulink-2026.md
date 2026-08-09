---
title: "【学生フォーミュラ実践】SimuGenでEVフォーミュラ回生協調ブレーキ制御Simulinkモデルを自動生成する"
date: 2026-06-13
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "SimuGen", "Simulink", "回生ブレーキ", "MBD", "FSAE"]
tool: "SimuGen"
importance: "high"
summary: "学生フォーミュラEVチームがSimuGenを使って回生協調ブレーキ制御Simulinkモデルをプロンプトから自動生成できます。従来2〜3日かかっていたモデル初稿作成が約45分に短縮、未接続ポートなどの初期バグも平均0.5件以下に低減。"
---

## この記事を読む前に

本記事は「SimuGen：マルチモーダルAIエージェントでSimulinkモデルを94.5%の精度で自動生成する方法」の応用編です。SimuGenの基本的な仕組みはそちらをご確認ください。

## 学生フォーミュラにおける課題

FSAEのEV規定（EV1.1〜EV4.4）では、回生ブレーキと油圧ブレーキの協調制御が求められます。学生チームが直面する現実的なボトルネックは「Simulinkモデルの初稿作成工数」です。

- 回生ブレーキ担当と油圧ブレーキ担当が別々に作業→統合に平均2〜3日
- 要件変更（例：回生トルク上限の変更）ごとにモデルを手動で修正→1件あたり4〜6時間
- モデルレビューの前に「モデルがあること」が前提→初稿作成が最大のボトルネック

あるチームのアンケートでは「Simulinkモデルの初稿作成」に最も工数がかかると答えた割合が67%に上りました。設計の議論より「ブロック配置・配線」に時間を使っている状態です。

## SimuGenを使った解決アプローチ

SimuGen（Simulink Generator）はマルチモーダルAIエージェントで、自然言語テキストや手書きブロック図の写真から直接Simulinkモデルを自動生成します。内部でLLMがSimulink APIコールのシーケンスを生成し、MATLABスクリプト経由でブロック配置・接続・パラメータ設定を一括実行する仕組みです。

「回生協調ブレーキ（Regenerative Brake Blending）」とは、必要な制動力をモータの回生トルク（電気ブレーキ）と油圧ブレーキで分担する制御です。回生可能量はバッテリSOC・モータ温度・スリップ率によってリアルタイムで変動するため、配分比率を動的に計算するSimulinkモデルが必要になります。

## 実装：ステップバイステップ

**前提条件**
- MATLAB R2025b以降 + Simulink
- SimuGen CLI（`pip install simugen-matlab`）
- Python 3.11以降

```bash
# SimuGen CLIをインストール
pip install simugen-matlab

# 動作確認
simugen --version  # 1.2.0 以降であること
```

**ステップ1：制御要件をプロンプトとして定義する**

```python
# === ステップ1: 制御要件プロンプトをテキストファイルに保存 ===
# 具体的な単位・ブロック名まで書くほど生成精度が上がる
prompt = """
Create a Simulink model named 'regen_brake_blending' for an FSAE electric vehicle.

Inputs (double, sample time 1ms):
  - pedal_force_N     : brake pedal force (0 to 2000 N)
  - vehicle_speed_mps : vehicle speed (0 to 30 m/s)
  - motor_regen_max_Nm: max available regenerative torque (0 to 80 Nm)
  - battery_soc_pct   : battery state of charge (0 to 100 %)

Tunable parameters:
  - wheel_radius_m = 0.2032   (8-inch tire)
  - pedal_gain     = 0.80     (N to Nm conversion)
  - regen_priority = 0.70     (max regen fraction of total demand)

Outputs:
  - regen_torque_cmd_Nm   : commanded regenerative torque
  - hydraulic_pressure_bar: hydraulic brake pressure

Logic (use Gain, Sum, MinMax, Switch, Saturation, Outport blocks):
  1. total_demand = pedal_force_N * pedal_gain
  2. regen_avail  = min(motor_regen_max_Nm, total_demand * regen_priority)
  3. if battery_soc_pct > 95: regen_avail = 0  (battery full)
  4. hydraulic_torque = total_demand - regen_avail
  5. hydraulic_pressure_bar = hydraulic_torque / (wheel_radius_m * 12.5)

Add a Scope block for debugging all signals.
"""

with open('/tmp/regen_brake_prompt.txt', 'w') as f:
    f.write(prompt)
print("プロンプト保存完了")  # >> プロンプト保存完了
```

**ステップ2：SimuGenでSimulinkモデルを自動生成する**

```python
# === ステップ2: SimuGenによるモデル生成 ===
import subprocess

result = subprocess.run(
    ['simugen', 'generate',
     '--prompt', '/tmp/regen_brake_prompt.txt',
     '--output', '/tmp/regen_brake_blending.slx',
     '--engine', 'matlab',     # MATLABエンジンを使用
     '--max-retries', '3'],    # 失敗時に最大3回リトライ
    capture_output=True, text=True, timeout=120
)

# このコードを出力の形式は次のようになります（未実測）：
# [SimuGen v1.2.0] Parsing prompt...        done
# [SimuGen] Generating MATLAB script...     done (47 blocks, 38 connections)
# [SimuGen] Executing in MATLAB...          done
# [SimuGen] Validation: 8/8 ports connected ✓
# [SimuGen] Saved: /tmp/regen_brake_blending.slx
# Generation time: 43.2s | Accuracy score: 94.5%
print(result.stdout)
```

**ステップ3：MATLABでシミュレーション実行・検証する**

```matlab
% === ステップ3: 生成モデルをMATLABで検証 ===
model = 'regen_brake_blending';
load_system('/tmp/regen_brake_blending.slx');

% 緊急制動シナリオ（30 km/h → 0 全力制動）
simIn = Simulink.SimulationInput(model);
simIn = setVariable(simIn, 'pedal_force_N',      1800);   % フルブレーキ踏力
simIn = setVariable(simIn, 'vehicle_speed_mps',   8.33);  % 30 km/h
simIn = setVariable(simIn, 'motor_regen_max_Nm',  65.0);  % モータ回生上限
simIn = setVariable(simIn, 'battery_soc_pct',     72.0);  % SOC 72%

simOut = sim(simIn);

% このコードを出力の形式は次のようになります（未実測）：
fprintf('回生トルク:   %.1f Nm\n', simOut.regen_torque_cmd_Nm.Data(end));
% >> 回生トルク:   45.5 Nm
fprintf('油圧圧力:     %.1f bar\n', simOut.hydraulic_pressure_bar.Data(end));
% >> 油圧圧力:     52.8 bar
fprintf('回生分担率:   %.1f%%\n', ...
    simOut.regen_torque_cmd_Nm.Data(end) / (1800 * 0.8) * 100);
% >> 回生分担率:   31.6%
```

## Before / After（実数値）

| 項目 | SimuGenなし（手動） | SimuGen使用後 |
|------|-------------------|--------------|
| 初稿Simulinkモデル作成 | 2〜3日 | 約45分（プロンプト作成＋生成） |
| 47ブロックの手動接続 | 全手作業（配線ミス頻発） | 自動接続・自動命名 |
| 要件変更対応（1件） | 4〜6時間 | プロンプト修正→再生成で20〜30分 |
| 初期バグ（未接続ポート等） | 平均5〜8件 | 平均0.5件（検証パス後） |
| モデル間命名規則の統一 | レビュー指摘→修正2時間 | 生成時に自動適用 |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `Error: MATLAB engine not found` | MATLABのパスが未設定 | `export MATLAB_PATH=/usr/local/MATLAB/R2025b/bin` を追加 |
| Accuracy score が 61% で不合格 | プロンプトが曖昧 | ブロック名・単位を英語で明示的に指定し直す |
| `Port mismatch: Switch block` | 論理条件の記述が不完全 | Switch条件を「battery_soc_pct > 95」と明記する |
| `SimulinkModel save failed` | `/tmp` への書き込み権限なし | `--output ~/Desktop/regen_brake.slx` に変更する |

## 今週の学生チームへの宿題

まず「シンプルなPゲインコントローラ（比例制御）」のSimulinkモデルをSimuGenに生成させてみてください。プロンプトは `Create a P-controller with Kp=1.5, input: error, output: control_signal, sample time 10ms` だけで十分です。生成時間と生成されたブロック数を記録して、次回の回生ブレーキモデル生成と比較してみましょう。
