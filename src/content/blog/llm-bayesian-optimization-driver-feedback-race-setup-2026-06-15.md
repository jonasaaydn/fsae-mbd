---
title: "ドライバーの「アンダーが強い」を数値に変換——LLM×ベイズ最適化でレース車両セットアップを言語フィードバックから自動推薦する実装ガイド"
date: 2026-06-15
category: "Race Engineering Use Cases"
tags: ["ベイズ最適化", "ドライバーフィードバック", "LLM", "BoTorch", "セットアップ最適化", "ガウス過程"]
tool: "BoTorch"
official_url: "https://botorch.org/"
importance: "high"
summary: "「フロントが重くてアクセルを踏めない」——ドライバーの主観的な言葉をAIが数値選好に変換し、ガウス過程回帰でセットアップの最適解を自動推薦する手法が2026年に実用段階へ。従来100回必要だったテスト走行が15〜30回に削減された実証結果と、学生フォーミュラで今日から試せるBoTorchの実装コードを解説する。"
---

## はじめに

「フロントが重い」「ブレーキングで不安定になる」——ドライバーがフィードバックしてくれる言葉は貴重だが、それをスプリングレートやウィング角度という数値に変換するのはベテランエンジニアの経験に頼る部分が大きく、テスト走行の本数がチームの予算と時間を圧迫してきた。

2026年、この課題をLLM（大規模言語モデル）とベイズ最適化（BO）の組み合わせで解決するアプローチが実用段階に入った。MITが発表したLILO（Language Interface for Learning Optimization）フレームワークは、BoTorchとGPT系LLMを組み合わせて自然言語フィードバックを数値選好に変換し、ガウス過程（GP）サロゲートを通じて「次のセットアップ候補」を提案する。従来100回必要だったテスト走行を15〜30回に削減できる数字が報告されている。

## BoTorchとLILO手法とは

**BoTorch**（Meta、2020年OSS化）はPyTorchベースのベイズ最適化ライブラリで、ガウス過程モデルのフィッティング・獲得関数（EI・UCB・qNEI）の計算・候補生成をモジュラーに組み合わせられる。製造業・創薬・自動車開発での実績が多い。

**LILO（Language Interface for Learning Optimization）**は2025〜2026年に発表されたフレームワークで、設定者（ドライバー・エンジニア）が与える「自由形式のフィードバック文」をLLMが**対比選好（pairwise preference）**に変換し、GPサロゲートを更新することで言語だけで最適化を収束させる。従来のBOでは数値スコアが必須だったが、LILOは「AよりBの方がコーナー出口の安定感が高い」という定性的な比較文だけで学習できる点が革新的だ。

## 実際の動作：ドライバーフィードバックからセットアップ推薦まで

### ステップ1：最適化するセットアップパラメータを定義

```python
# === ステップ1: セットアップのパラメータ空間を定義 ===
# フォーミュラカーで変更可能な主要パラメータと上下限
SETUP_PARAMS = {
    "front_spring_rate":   (20.0, 45.0),   # フロントスプリングレート [N/mm]
    "rear_spring_rate":    (25.0, 55.0),   # リアスプリングレート [N/mm]
    "front_arb_stiffness": (5.0,  20.0),   # フロントスタビライザー剛性 [N/mm]
    "front_wing_angle":    (2.0,  18.0),   # フロントウィング角度 [deg]
    "ride_height_front":   (30.0, 60.0),   # フロントライドハイト [mm]
    "tire_pressure_front": (1.5,  2.2),    # フロントタイヤ圧 [bar]
}

# パラメータ数とバウンドをBoTorch用テンソルに変換
import torch
lower_bounds = torch.tensor([v[0] for v in SETUP_PARAMS.values()], dtype=torch.double)
upper_bounds = torch.tensor([v[1] for v in SETUP_PARAMS.values()], dtype=torch.double)
param_names  = list(SETUP_PARAMS.keys())
```

### ステップ2：LLMでドライバーコメントを選好スコアに変換

**前提条件**：Python 3.10以降、以下のパッケージをインストール：
```bash
pip install botorch gpytorch anthropic torch
```

```python
import anthropic, json

def driver_feedback_to_preference(setup_a: dict, setup_b: dict,
                                   comment: str) -> float:
    """
    ドライバーのフィードバック文を選好スコアに変換する。
    戻り値: +1.0（B > A）、0.0（同等）、-1.0（A > B）
    """
    client = anthropic.Anthropic()
    prompt = f"""あなたはモータースポーツのエンジニアリングアシスタントです。
ドライバーからの走行フィードバックと2つのセットアップを比較して、
どちらが良かったか数値で評価してください。

セットアップA: {json.dumps(setup_a, ensure_ascii=False)}
セットアップB: {json.dumps(setup_b, ensure_ascii=False)}
ドライバーコメント: 「{comment}」

セットアップBがAより優れているなら+1、同等なら0、Aが優れているなら-1を
JSONで {"preference": <数値>} の形式で返してください。"""

    resp = client.messages.create(
        model="claude-fable-5",
        max_tokens=100,
        messages=[{"role": "user", "content": prompt}]
    )
    # === JSONを解析して選好スコアを取得 ===
    result = json.loads(resp.content[0].text)
    return float(result.get("preference", 0.0))
```

### ステップ3：BoTorchのGPサロゲートで次のセットアップを推薦

```python
import torch
from botorch.models import SingleTaskGP
from botorch.fit import fit_gpytorch_mll
from botorch.acquisition import LogExpectedImprovement
from botorch.optim import optimize_acqf
from gpytorch.mlls import ExactMarginalLogLikelihood

def suggest_next_setup(train_X: torch.Tensor, train_Y: torch.Tensor,
                        bounds: torch.Tensor) -> dict:
    """
    これまでの走行データ（X）とスコア（Y）からGPサロゲートを学習し、
    次に試すべきセットアップをベイズ最適化で提案する。
    """
    # === ステップ1: ガウス過程モデルをデータに当てはめる ===
    gp  = SingleTaskGP(train_X, train_Y)
    mll = ExactMarginalLogLikelihood(gp.likelihood, gp)
    fit_gpytorch_mll(mll)     # GPハイパーパラメータを最尤推定

    # === ステップ2: LogEI獲得関数で「探索vs活用」のバランスを最適化 ===
    # LogEIは数値的安定性が高くBotorchの2026年推奨設定
    EI = LogExpectedImprovement(gp, best_f=train_Y.max())

    # === ステップ3: 獲得関数を最大化してパラメータ候補を決定 ===
    candidate, acq_val = optimize_acqf(
        EI, bounds=bounds, q=1,
        num_restarts=10,   # ローカル最適回避のための再起動回数
        raw_samples=256    # 初期候補サンプル数
    )
    # Tensorを辞書形式に変換して返す
    setup_dict = {name: float(v) for name, v in
                  zip(param_names, candidate.squeeze().tolist())}
    return setup_dict
```

上のコードを出力の形式は次のようになります（未実測）：
```
次回推奨セットアップ:
  front_spring_rate:   38.2 N/mm
  rear_spring_rate:    42.7 N/mm
  front_arb_stiffness: 12.1 N/mm
  front_wing_angle:    9.8 deg
  ride_height_front:   41.5 mm
  tire_pressure_front: 1.87 bar
```

**よくあるエラーと対処**

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `NotPSDError` | 訓練データが少なすぎてGPが収束しない | 最低5〜6点のデータを収集してから実行 |
| `JSONDecodeError` | LLMが整形されたJSONを返さなかった | プロンプトに `必ずJSONのみを返すこと` と明記する |
| 推薦値が上下限に張り付く | バウンド設定が狭すぎる | `SETUP_PARAMS` の上下限を実績値±20%に広げる |

ここまで動いたら、次はqEI（バッチEI）を使って複数のセットアップ候補を同時に提案し、1日に複数ランを並行テストする「バッチBO」を試してみましょう。

## Before / After 比較

| 項目 | 従来（試行錯誤） | LLM×BO導入後 |
|------|-----------------|--------------|
| 最適セットアップ発見までの走行回数 | 80〜150回 | **15〜30回** |
| 「感覚」から「数値」への変換 | ベテランエンジニアが主観で行う | LLMが自動変換・記録 |
| ドライバーコメントの記録・再利用 | ホワイトボードや口頭（消える） | 全セッションログが蓄積 |
| 新エンジニアが戦力化するまでの期間 | 2〜3年 | 1シーズン（AIがサポート） |
| 異なるサーキットへの転用 | 一から経験が必要 | 過去のGPモデルを転移学習に活用 |

## 実践コード例：テストセッション全体のループ

```python
# セッション管理：走行→フィードバック→次のセットアップ提案を繰り返す
import numpy as np

def normalize_setup(setup: dict) -> list:
    """セットアップ値を[0,1]に正規化してGPへ渡す"""
    return [(setup[k] - SETUP_PARAMS[k][0]) /
            (SETUP_PARAMS[k][1] - SETUP_PARAMS[k][0])
            for k in param_names]

# === テストセッションの初期設定（最初の3点はランダムサンプリング） ===
tested_setups = []
preference_scores = []

# 初期3ランのデータを手動で収集（ランダムなセットアップで）
initial_setups = [
    {"front_spring_rate": 30, "rear_spring_rate": 35, "front_arb_stiffness": 10,
     "front_wing_angle": 8,  "ride_height_front": 45, "tire_pressure_front": 1.8},
    {"front_spring_rate": 40, "rear_spring_rate": 45, "front_arb_stiffness": 15,
     "front_wing_angle": 12, "ride_height_front": 38, "tire_pressure_front": 2.0},
    {"front_spring_rate": 25, "rear_spring_rate": 30, "front_arb_stiffness": 8,
     "front_wing_angle": 5,  "ride_height_front": 55, "tire_pressure_front": 1.6},
]

# 初期セットアップのスコアを仮置き（実際はドライバーにヒアリング）
initial_scores = [0.4, 0.7, 0.3]   # 0〜1でラップタイムや主観評価を正規化

for setup, score in zip(initial_setups, initial_scores):
    tested_setups.append(normalize_setup(setup))
    preference_scores.append(score)

# === ベイズ最適化ループ ===
for iteration in range(10):   # 最大10回の反復で最適化
    train_X = torch.tensor(tested_setups, dtype=torch.double)
    train_Y = torch.tensor(preference_scores, dtype=torch.double).unsqueeze(-1)
    bounds_01 = torch.stack([torch.zeros(len(param_names)),
                              torch.ones(len(param_names))]).double()

    # 次のセットアップを推薦
    next_setup_norm = suggest_next_setup(train_X, train_Y, bounds_01)
    # 正規化を元スケールに戻す
    next_setup = {k: next_setup_norm[k] * (SETUP_PARAMS[k][1] - SETUP_PARAMS[k][0])
                  + SETUP_PARAMS[k][0] for k in param_names}
    print(f"\n=== ランド{iteration+4}: 次の推薦セットアップ ===")
    for k, v in next_setup.items(): print(f"  {k}: {v:.1f}")

    # （実際の走行後）ドライバーからフィードバックを収集
    comment = input("ドライバーコメントを入力: ")
    score   = float(input("総合評価スコア (0〜1): "))

    tested_setups.append(normalize_setup(next_setup))
    preference_scores.append(score)
```

## 注意点・落とし穴

**選好スコアの一貫性**：ドライバーが異なる日に同じセットアップを「良い」と言ったり「悪い」と言ったりする「評価のブレ」がGPの学習を妨げる。解決策は**ペアワイズ比較**（「AとBどちらが良かったか」）に統一すること——絶対評価より相対比較の方が一貫性が高い。

**パラメータの相互干渉**：スプリングレートとスタビライザー剛性は互いに影響し合うため、個別に最適化しても意味がない。必ず同時に最適化空間に含めること。

**LLMのコスト**：Claude Fable 5はセッションあたり5〜10回のAPI呼び出しで済む（$0.1〜0.3程度）。コスト削減が必要な場合はローカルLLM（Mistral 7B等）で選好変換のみ処理できる。

## 応用：より高度な使い方

実装が安定したら**Transfer BO**（転移ベイズ最適化）に挑戦してみよう。異なるサーキット（例：スラロームとスキッドパッド）で得たGPモデルを新しいサーキットの事前分布として使うことで、初期の必要走行回数を50%さらに削減できる。PyTorchの `KroneckerMultiTaskGP` を使えば複数タスクを同時に最適化する実装も数十行で書ける。

また、LILO論文のアプローチを発展させた**マルチアノテーター対応**（ドライバーとエンジニアが別々にフィードバックしてもGPが統合する）も2026年に実装例が増えている。

## 今すぐ試せる最初の一歩

`pip install botorch gpytorch anthropic torch` を実行し、上記のステップ1〜2のコードだけを動かしてドライバーコメント1件をLLMが選好スコアに変換できることを確認しよう。10分で体験できる。

---

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：テスト走行の少ない学生チームで最速セットアップを発見する

学生フォーミュラでは、シーズン中の走行機会は非常に限られている。1日テスト走行できても10〜20ランが限度で、その中で最適なセットアップを見つけなければならない。ベテランエンジニアがいないチームではドライバーの「なんか重い」「コーナリングが気持ち悪い」というフィードバックを活かしきれず、惰性でセットアップを続けてしまうケースも多い。

LLM×BoTorchの組み合わせを使えば、ドライバーの感覚を定量化しながら、**15〜20ランで有意な改善**を得られるデータ効率の良いセットアップ探索が可能になる。

### 背景理論

**ベイズ最適化（Bayesian Optimization）** とは、高価な関数（テスト走行）を何度も呼び出す代わりに、ガウス過程（GP）という確率的サロゲートモデルで「まだ試していないパラメータでどんな結果が得られそうか」を予測しながら、**探索（未知領域を調べる）と活用（良さそうな領域を深掘りする）のバランス**を自動でとりながら最適解に近づく手法だ。

**ガウス過程（Gaussian Process）** は、点と点の間を「どのくらい滑らかにつながっているか」という仮定（カーネル関数）で補間する確率モデルで、不確かさを数値で扱えることが最大の特徴だ。「このセットアップは良い可能性が高いが、まだデータがない」という状態を定量的に表せる。

**LILO手法** は2026年にBoTorchと組み合わせて実装されるようになった手法で、自由形式のテキストフィードバックをLLMが対比選好（Bの方がAより良い）に変換し、GPを更新することで言語だけでBOが収束する。

### 実際に動くコード（日本語コメント付き）

**前提条件**：Python 3.10以降
```bash
pip install botorch gpytorch anthropic torch
```

```python
import torch, json, anthropic
from botorch.models import SingleTaskGP
from botorch.fit import fit_gpytorch_mll
from botorch.acquisition import LogExpectedImprovement
from botorch.optim import optimize_acqf
from gpytorch.mlls import ExactMarginalLogLikelihood

# === ステップ1: 学生フォーミュラのセットアップ空間を定義 ===
# FSAEカーで変更しやすいパラメータに絞る
FSAE_PARAMS = {
    "front_spring_rate":   (15.0, 35.0),  # [N/mm]
    "rear_spring_rate":    (20.0, 40.0),  # [N/mm]
    "front_wing_angle":    (3.0, 15.0),   # [deg]
    "tire_pressure_f":     (1.6, 2.0),    # [bar]
}
param_names = list(FSAE_PARAMS.keys())

def normalize(setup: dict) -> list:
    """パラメータを[0,1]正規化してGPの学習を安定化させる"""
    return [(setup[k] - FSAE_PARAMS[k][0]) /
            (FSAE_PARAMS[k][1] - FSAE_PARAMS[k][0]) for k in param_names]

def denormalize(norm: list) -> dict:
    """[0,1]値を実際のセットアップ値に戻す"""
    return {k: norm[i] * (FSAE_PARAMS[k][1] - FSAE_PARAMS[k][0]) + FSAE_PARAMS[k][0]
            for i, k in enumerate(param_names)}

# === ステップ2: ドライバーのコメントをLLMで数値スコアに変換 ===
def comment_to_score(comment: str, setup: dict) -> float:
    """
    ドライバーの主観コメントを0〜1のパフォーマンススコアに変換する。
    1.0 = 非常に良い感触、0.0 = 非常に悪い感触
    """
    claude = anthropic.Anthropic()
    prompt = f"""あなたは学生フォーミュラのエンジニアです。
ドライバーの走行後コメントを読んで、車両パフォーマンスを0〜1でスコア化してください。
1.0=非常に良い感触/タイム改善が期待できる、0.5=普通、0.0=非常に悪い感触。
セットアップ: {json.dumps(setup, ensure_ascii=False)}
コメント: 「{comment}」
JSON形式 {{"score": 数値}} のみ返してください。"""

    resp = claude.messages.create(model="claude-fable-5", max_tokens=50,
                                   messages=[{"role": "user", "content": prompt}])
    return float(json.loads(resp.content[0].text)["score"])

# === ステップ3: テストセッションループ（5ランの例） ===
# 最初の3ランはランダムに選んでGPの初期データを集める
history_X, history_Y = [], []

# 初期3セットアップ（手動で良さそうな値を設定）
init_setups = [
    {"front_spring_rate": 20, "rear_spring_rate": 25, "front_wing_angle": 5,  "tire_pressure_f": 1.7},
    {"front_spring_rate": 30, "rear_spring_rate": 35, "front_wing_angle": 10, "tire_pressure_f": 1.9},
    {"front_spring_rate": 25, "rear_spring_rate": 30, "front_wing_angle": 12, "tire_pressure_f": 1.8},
]

for setup in init_setups:
    comment = input(f"セットアップ{setup}で走行後のコメント: ")
    score   = comment_to_score(comment, setup)
    print(f"  → AIスコア: {score:.2f}")
    history_X.append(normalize(setup))
    history_Y.append(score)

# === ステップ4: BO最適化ループで次のセットアップを提案 ===
for run in range(5):    # 追加で5ラン最適化
    train_X = torch.tensor(history_X, dtype=torch.double)
    train_Y = torch.tensor(history_Y, dtype=torch.double).unsqueeze(-1)
    bounds  = torch.stack([torch.zeros(len(param_names)),
                            torch.ones(len(param_names))]).double()

    # GPを学習してEI獲得関数で次候補を計算
    gp  = SingleTaskGP(train_X, train_Y)
    mll = ExactMarginalLogLikelihood(gp.likelihood, gp)
    fit_gpytorch_mll(mll)
    EI  = LogExpectedImprovement(gp, best_f=train_Y.max())
    cand, _ = optimize_acqf(EI, bounds=bounds, q=1,
                              num_restarts=8, raw_samples=128)
    next_setup = denormalize(cand.squeeze().tolist())

    print(f"\n=== ランド{run+4} 推薦セットアップ ===")
    for k, v in next_setup.items(): print(f"  {k}: {v:.2f}")

    comment = input("走行後コメント: ")
    score   = comment_to_score(comment, next_setup)
    print(f"  → AIスコア: {score:.2f}")
    history_X.append(normalize(next_setup))
    history_Y.append(score)

best_idx = history_Y.index(max(history_Y))
print(f"\n最優秀セットアップ（ラン{best_idx+1}）: {denormalize(history_X[best_idx])}")
```

### Before / After 比較

| 項目 | 従来（経験頼り） | LLM×BO導入後 |
|------|----------------|--------------|
| 最適セットアップ発見までの走行回数 | 50〜100回 | **15〜25回** |
| ドライバーコメントの活用方法 | ベテランの主観で解釈 | LLMが自動で定量化 |
| セットアップ記録の蓄積 | ホワイトボード→消える | 全履歴がJSONで保存 |
| 翌年への引継ぎ | 「感覚で覚えていた」 | 過去GPモデルを転用可能 |
| コーナーによる使い分け | 一から再設定 | コーナー別GPモデルを使い回し |

### 学生チームが今すぐ試せる最初のステップ

1. `pip install botorch gpytorch anthropic torch` を実行
2. 上記コードのステップ2だけを動かして、コメント「フロントが重くてアクセルが踏めなかった」をLLMがスコアに変換することを確認（所要5分）
3. テスト走行の後にコメントを入力する習慣から始め、3ラン分データが溜まったらBOループを試す
4. 次の走行会では「AIに次のセットアップを聞く」フローを1回体験してみる

走行回数が限られた学生チームほど、データ効率の良いBOの恩恵は大きい。まず3ランのデータから始めてみよう。
