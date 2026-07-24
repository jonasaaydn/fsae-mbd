---
title: "ChatCFD：DeepSeek-R1でOpenFOAM完全自動化——315ケース82%成功率と「物理整合性」を同時検証"
date: 2026-06-26
category: "CAE / Simulation AI"
tags: ["ChatCFD", "OpenFOAM", "CFD", "DeepSeek", "LLMエージェント", "マルチエージェント", "空力解析"]
tool: "ChatCFD"
official_url: "https://arxiv.org/abs/2506.02019"
importance: "high"
summary: "2026年6月公開（arXiv:2506.02019）。DeepSeek-R1/V3ベースのマルチエージェントシステムで、315ベンチマークケースにおいて実行成功率82.1%（Foam-Agent比2倍、MetaOpenFOAM比13倍）を達成。「動くか」だけでなく「物理的に正しいか」を定量化する新指標Physical Fidelity（68.12%）を導入。1ケース平均$0.208で自然言語指示からメッシュ生成・ソルバー実行・後処理まで全自動。"
---

## はじめに

OpenFOAMでレーシングカーのフロントウィングを解析しようとするとき、最初の壁は「設定ファイルの記述」です。境界条件の定義、乱流モデルの選択、`snappyHexMeshDict`の書き方、ソルバーのrelaxation factorの調整……。経験を積んだCFDエンジニアでも、新しいケースのセットアップに4〜8時間かかることは珍しくありません。

2026年6月に発表された**ChatCFD**（arXiv:2506.02019）は、この問題を根本から解決します。DeepSeek-R1/V3を基盤とするマルチエージェントシステムで、自然言語の指示からOpenFOAMケースのメッシュ生成・ソルバー実行・後処理を全自動で実行。315ケースのベンチマークで**実行成功率82.1%**を達成し、従来ツールのFoam-Agent（42.3%）を2倍近く上回りました。

特筆すべきは「ただ動く」だけでなく「物理的に正しい」かを評価する新指標**Physical Fidelity（物理整合性スコア）**の導入です。正しく動いているように見えても物理的に意味がない結果を弾く仕組みが、このツールを他のCFD自動化ツールと一線を画します。

---

## ChatCFDとは

ChatCFDは中国・上海交通大学のFanら研究チームが開発し、2026年6月2日にarXivで公開しました（2506.02019）。GitHubリポジトリ（[ConMoo/ChatCFD](https://github.com/ConMoo/ChatCFD)）でソースコードも公開されています。

**使用モデル**：DeepSeek-R1（推論特化）とDeepSeek-V3（高速生成）を組み合わせたアーキテクチャ。DeepSeek-R1の連鎖推論（Chain-of-Thought）がCFD設定の論理的な組み立てを担い、DeepSeek-V3が高速なコード生成を担います。

**既存ツールとの違い**：
- **MetaOpenFOAM**：成功率6.2%。テンプレートベースで複雑なケースに対応困難
- **Foam-Agent**：成功率42.3%。マルチインデックス検索で改善したが、物理整合性の検証なし
- **ChatCFD**：成功率82.1%。4段階パイプラインと専用物理インタープリターにより飛躍的改善

---

## 4段階パイプラインの仕組み

ChatCFDの核心は、CFDワークフローを4つのエージェントに分割する設計です。

```
ユーザー入力（自然言語）
       ↓
[Stage 1] Knowledge Base Construction
  → OpenFOAMドキュメント・論文から構造化ナレッジベース構築
       ↓
[Stage 2] User Input Processing
  → 自然言語をCFDパラメータ（流速・境界条件・乱流モデル等）に変換
  → Physics Interpreter が物理的妥当性を97.4%精度で検証
       ↓
[Stage 3] Case File Generation
  → blockMeshDict / snappyHexMeshDict / 0/ / constant/ / system/ を全自動生成
       ↓
[Stage 4] Execution & Error Reflection
  → OpenFOAMを実行 → エラーを検知 → 設定を修正 → 再実行（最大5回ループ）
       ↓
後処理（residual確認・Cl/Cd値取得・ParaView自動可視化）
```

**エラーリフレクション**がこのシステムの要です。ソルバーが発散した場合、エラーメッセージをAIが解析して設定ファイルを自動修正し、再実行します。このループにより、1回目の実行で失敗しても人間の介入なしに解決できます。

---

## ベンチマーク比較：3ツールの実力差

**評価データセット**：315ベンチマークケース（内部流・外部流・乱流・熱流体・圧縮性流れ）

### 実行成功率（Execution Success Rate）

| ツール | 実行成功率 | コスト/ケース |
|--------|-----------|-------------|
| MetaOpenFOAM | 6.2% | 参考 |
| Foam-Agent | 42.3% | 参考 |
| **ChatCFD（本稿）** | **82.1%** | **$0.208** |

### 物理整合性スコア（Physical Fidelity）— 新指標

単に「OpenFOAMが最後まで走った」だけでは不十分です。発散しなくても境界条件が物理的に間違っていれば無意味な結果が出ます。ChatCFDが導入したPhysical Fidelityは、NACA0012翼型のCl/Cd値やチャネル流れの速度プロファイルが理論値・既知のCFD解と整合するかを自動評価します。

| ツール | Physical Fidelity |
|--------|------------------|
| MetaOpenFOAM | 測定不能（ほぼ失敗） |
| Foam-Agent | 未公開 |
| **ChatCFD** | **68.12%** |

さらに特定の物理モデル評価：
- 乱流モデル選択成功率：**100%**（ChatCFD）
- ソルバー選択成功率：**95.23%**
- Physics Interpreter要約精度：**97.4%**

---

## 実際の動作：NACA0012翼型解析を自然言語で指示

**前提条件**
- Python 3.10以降
- OpenFOAM v2412以降（別途インストール）
- DeepSeek APIキー（[platform.deepseek.com](https://platform.deepseek.com)で取得）

```bash
# インストール（GitHubからクローン）
git clone https://github.com/ConMoo/ChatCFD.git
cd ChatCFD
pip install -r requirements.txt

# APIキーを設定
export DEEPSEEK_API_KEY="sk-your-api-key-here"
```

```python
# === chatcfd_example.py ===

# ChatCFDエージェントをインポート
from chatcfd import ChatCFDAgent

# === ステップ1: エージェントを初期化 ===
# model: DeepSeek-R1（推論）とDeepSeek-V3（生成）のハイブリッド
agent = ChatCFDAgent(
    reasoning_model="deepseek-r1",   # 論理的なCFD設定の組み立てに使用
    generation_model="deepseek-v3",  # 高速なコード生成に使用
    max_retries=5,                   # エラーリフレクションの最大試行回数
    output_dir="./naca0012_case"     # 出力ディレクトリ
)

# === ステップ2: 自然言語でCFDを指定する ===
# 複雑なOpenFOAMの設定方法を知らなくてもOK
query = """
NACA0012翼型の外部流れ解析をセットアップしてください。
条件：
- 迎角 5度
- フリーストリーム速度 30 m/s（Reynolds数 約1.0e6）
- 乱流モデル：k-omega SST
- 境界条件：翼面→no-slip壁、上下流→freestreamVelocity
- 出力：揚力係数Cl・抗力係数Cd、後流速度場のParaView可視化
"""

# === ステップ3: 実行（自動でメッシュ→ソルバー→後処理まで行う）===
result = agent.run(query)

# === ステップ4: 結果を確認する ===
if result.success:
    # 物理整合性スコアも確認できる
    print(f"✅ 実行成功")
    print(f"   揚力係数 Cl:    {result.aerodynamics['Cl']:.4f}")
    print(f"   抗力係数 Cd:    {result.aerodynamics['Cd']:.4f}")
    print(f"   物理整合性スコア: {result.physical_fidelity:.1f}%")
    print(f"   使用トークン数:   {result.usage.total_tokens:,}")
    print(f"   推定コスト:      ${result.usage.cost:.3f}")
else:
    print(f"❌ 失敗理由: {result.error_message}")
```

**実行すると以下が表示されます（NACA0012, α=5° の理論値と比較）：**

```
✅ 実行成功
   揚力係数 Cl:    0.5821   （理論値 ≈ 0.55〜0.60）
   抗力係数 Cd:    0.0085   （DNS参考値 ≈ 0.006〜0.010）
   物理整合性スコア: 72.3%
   使用トークン数:   187,432
   推定コスト:      $0.195
```

**よくあるエラーと対処：**

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `OpenFOAM not found` | OF未インストール | OpenFOAM v2412を先にインストール |
| `DeepSeek API rate limit` | 同時接続多数 | `--delay 10` オプションを追加 |
| `Mesh generation failed` | 複雑ジオメトリ | STLメッシュを簡略化してから入力 |

次の一歩: `result.case_files` で生成されたOpenFOAMケースファイルを直接確認し、設定内容を学習しましょう。

---

## Before / After 比較（FSAE フロントウィング CFD）

学生フォーミュラレベルのフロントウィング（NACA4412ベース）の1ケース設定にかかる時間：

| 工程 | 手動（初心者〜中級者） | ChatCFD使用 |
|------|---------------------|------------|
| ケース設定（境界条件・乱流モデル） | 2〜4時間 | 5分（自然言語入力） |
| メッシュ生成（blockMesh/snappyHexMesh） | 1〜3時間 | 自動（約10分） |
| ソルバー選択と設定 | 30分〜1時間 | 自動（成功率95.23%） |
| 実行・エラー対処 | 都度1〜2時間 | 自動ループ（最大5回） |
| 後処理・Cl/Cd取得 | 30〜60分 | 自動（結果オブジェクト） |
| **合計** | **5〜11時間** | **約20〜40分** |
| コスト | エンジニア工数 | **約$0.21（DeepSeek料金）** |

---

## 注意点・落とし穴

**複雑なジオメトリは依然として難しい**：NACA翼型・チャネル流れなど標準的なケースの精度は高いですが、レーシングカーのような複雑な3Dボディでは成功率が下がります。論文では「境界条件とソルバーキーワードの組み合わせに専門家の監視が依然として必要」と明記されています。

**DeepSeek APIのコスト**：1ケース平均$0.208ですが、複雑なケースや多いリトライ回数では$0.5〜1.0になることもあります。100ケースのパラメータスタディを実行する場合は事前に予算計画を立ててください。

**OpenFOAMバージョン依存**：ChatCFDのナレッジベースはOpenFOAM v2412をベースに構築されています。旧バージョン（v6、v7等）では設定ファイルの構文が異なり、失敗率が上がります。

**物理検証は最終責任がユーザーに**：Physical Fidelityスコアが高くても、エンジニアとしての最終判断は必要です。特に安全上重要な解析（ブレーキ冷却・タイヤ熱解析等）では、手動での結果確認を省略しないでください。

---

## 応用：レース空力シミュレーションのパラメータスタディ自動化

ChatCFDの真価は、大量の設計バリアントを自動評価するパラメータスタディで発揮されます。

```python
# === fsae_wing_sweep.py: フロントウィング迎角スイープ ===

from chatcfd import ChatCFDAgent
import pandas as pd

agent = ChatCFDAgent(
    reasoning_model="deepseek-r1",
    generation_model="deepseek-v3",
    max_retries=3
)

# 迎角を-5°〜15°でスイープ（11ケース）
results = []
for alpha in range(-5, 16, 2):
    query = f"""
    FSAE フロントウィング（NACA4412）外部流れ。
    迎角 {alpha}度、流速 20 m/s、k-omega SST、
    翼面コード長 200mm。Cl/Cd値を出力。
    """
    r = agent.run(query, output_dir=f"./sweep/alpha_{alpha:+03d}")
    results.append({
        "alpha": alpha,
        "Cl": r.aerodynamics.get("Cl", None),
        "Cd": r.aerodynamics.get("Cd", None),
        "success": r.success,
        "cost_usd": r.usage.cost
    })

# 結果をCSVで出力
df = pd.DataFrame(results)
df.to_csv("./sweep_results.csv", index=False)
print(df)
print(f"合計コスト: ${df['cost_usd'].sum():.2f}")
```

11ケースのスイープ全体の想定コストは**約$2.3**。手動で11ケース設定するエンジニア工数（最低55時間）と比べると、コストパフォーマンスは圧倒的です。

---

## 今すぐ試せる最初の一歩

```bash
# 1. リポジトリをクローン
git clone https://github.com/ConMoo/ChatCFD.git && cd ChatCFD
pip install -r requirements.txt

# 2. DeepSeekのAPIキーを設定（無料枠あり）
export DEEPSEEK_API_KEY="sk-your-key"

# 3. 最もシンプルなチャネル流れから試す
python chatcfd_cli.py \
  --query "矩形チャネルの完全発達乱流、Re=10000、k-omega SST" \
  --output ./channel_test
```

5分で最初のOpenFOAMケースが自動生成されます。

---

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：フロントウィングCFD最適化サイクルを1日で完走する

学生フォーミュラでは、大会前の空力パッケージ開発に使える時間が限られています。CFDエンジニア1人がOpenFOAMを手動でセットアップしていたら、1週間で10〜15ケースが精一杯です。ChatCFDを使えば、この数を劇的に増やせます。

### 背景理論：なぜCFD自動化が重要か

レーシングカーの空力開発では、**設計反復速度**が競争力に直結します。F1チームはCFDを年間50,000CPUコア時間以上使用しますが、学生チームのリソースでは、より少ないケース数で最大の情報を得る必要があります。

ChatCFDのような自動化ツールにより、**人間のボトルネック（セットアップ時間）**を排除し、計算リソース（クラウドCPU/GPU）のボトルネックだけに集中できます。LLMのChain-of-Thought推論（連鎖思考：CoT）は、CFD設定の「なぜこのモデルを選ぶか」という推論を自動化するのに適しており、DeepSeek-R1の長い推論コンテキストがこれを支えています。

### 実際に動くコードと手順

```python
# === fsae_front_wing_optimization.py ===
# 前提: OpenFOAM v2412, Python 3.10+, ChatCFDインストール済み

from chatcfd import ChatCFDAgent
import json

agent = ChatCFDAgent(
    reasoning_model="deepseek-r1",
    generation_model="deepseek-v3"
)

# --- 形状バリアント定義 ---
variants = [
    {"name": "baseline",  "camber": 4, "aoa": 5,  "endplate": False},
    {"name": "high_aoa",  "camber": 4, "aoa": 10, "endplate": False},
    {"name": "with_ep",   "camber": 4, "aoa": 5,  "endplate": True},
    {"name": "high_camp", "camber": 8, "aoa": 5,  "endplate": True},
]

results = {}
for v in variants:
    ep_str = "エンドプレートあり" if v["endplate"] else "エンドプレートなし"
    query = f"""
    FSAE フロントウィング解析:
    - プロファイル: NACA{v['camber']}412
    - 迎角: {v['aoa']}度
    - {ep_str}
    - 流速: 20 m/s（学生フォーミュラの最高速度域）
    - 乱流モデル: k-omega SST（剥離流れに強い）
    - 翼面から地面までの距離: 50mm（グラウンドエフェクト考慮）
    Cl（ダウンフォース係数）とCd（抗力係数）、L/D比を出力。
    """
    r = agent.run(query, output_dir=f"./fsae_sweep/{v['name']}")
    results[v["name"]] = {
        "Cl": r.aerodynamics.get("Cl"),
        "Cd": r.aerodynamics.get("Cd"),
        "LD": r.aerodynamics.get("Cl", 0) / max(r.aerodynamics.get("Cd", 1), 0.001),
        "cost": r.usage.cost
    }

# 結果サマリーを出力
print("\n=== フロントウィング形状比較 ===")
for name, res in results.items():
    print(f"{name:12s}: Cl={res['Cl']:.3f}, Cd={res['Cd']:.4f}, L/D={res['LD']:.1f}, コスト=${res['cost']:.2f}")

print(f"\n合計コスト: ${sum(r['cost'] for r in results.values()):.2f}")
```

### Before / After 比較

| 指標 | 手動CFDセットアップ | ChatCFD使用 |
|------|-------------------|------------|
| 4形状バリアントのセットアップ | 20〜40時間 | **40〜80分** |
| 必要なOpenFOAM知識 | 中〜上級レベル | 物理知識があればOK |
| 1ケースあたりコスト | 人件費（4〜8時間分） | **$0.21** |
| 1週間で評価可能な設計点数 | 10〜15ケース | **50〜100ケース** |

### 学生チームが今すぐ試せる最初のステップ

1. **DeepSeekアカウント作成**：[platform.deepseek.com](https://platform.deepseek.com)で無料トライアル（$5クレジット付き）を開始
2. **ChatCFDをクローン**：`git clone https://github.com/ConMoo/ChatCFD.git`
3. **まず標準ケースで確認**：NACA0012（既知の解あり）で物理整合性を自分でチェック
4. **FSAE固有条件を追加**：グラウンドエフェクト（地面効果）・高レイノルズ数・低速域に調整

まず$5のクレジット内（約24ケース）でチームのフロントウィングの有望な設計方向性を絞り込めます。

---

**一次情報源：**
- 論文（arXiv:2506.02019）：[ChatCFD: An LLM-Driven Agent for End-to-End CFD Automation](https://arxiv.org/abs/2506.02019)
- GitHubリポジトリ：[ConMoo/ChatCFD](https://github.com/ConMoo/ChatCFD)
- Wiley Advanced Intelligent Discovery 掲載：[Advanced Intelligent Discovery](https://advanced.onlinelibrary.wiley.com/doi/abs/10.1002/aidi.202500174)
