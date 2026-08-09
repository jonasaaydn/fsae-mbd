---
title: "【学生フォーミュラ実践】Foam-Agentでフロントウィング空力解析を自然言語で全自動実行する"
date: 2026-06-04
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Foam-Agent", "OpenFOAM", "CFD", "空力解析", "AIエージェント", "FSAE"]
tool: "Foam-Agent"
official_url: "https://github.com/csml-rpi/Foam-Agent"
importance: "high"
summary: "学生フォーミュラのエアロチームがFoam-Agentを導入すると、OpenFOAMのdict設定・計算実行・Cl/Cd抽出までを自然言語一行で自動化できます。従来5時間かかっていた1ケースの解析作業が30分のウォークアウェイ処理に短縮されます。"
---

## この記事を読む前に

本記事は「[自然言語一行でOpenFOAM空力解析が全自動完走——Foam-Agent 2.0の実力と使い方](/blog/foam-agent-openfoam-cfd-automation-2026)」の続編です。ツールの仕組みはそちらを参照し、ここでは**学生フォーミュラチームが実際にフロントウィング最適化に使うシナリオ**に絞って解説します。

---

## 学生フォーミュラにおける課題

学生フォーミュラのエアロ開発において、最大のボトルネックは「OpenFOAMのセットアップ時間」です。

典型的なフロントウィング1ケースの作業工程：
1. STLジオメトリのクリーニング（30〜60分）
2. `blockMeshDict`・`snappyHexMeshDict`の編集（60〜90分）
3. 境界条件（`0/U`・`0/p`・`0/nut`）の設定（30分）
4. `simpleFoam`の実行と収束監視（90〜120分）
5. `postProcess`でCl/Cd抽出（20分）

**合計：4〜6時間/ケース**

フラップ角を5°刻みで7段階試したい場合は42時間。大会前の設計最終化フェーズでこれは致命的です。加えてOpenFOAMのdictファイルはエラーが分かりにくく、「1時間かけて設定したのに計算が発散した」経験を持つ学生は多いでしょう。

Foam-Agentは**自然言語の指示からOpenFOAMの全工程を自動化**し、この問題を根本から解決します。

---

## Foam-Agentを使った解決アプローチ

Foam-AgentはマルチエージェントアーキテクチャでOpenFOAMを操作します。内部では専門エージェントが協調動作します：

- **Plannerエージェント**: 自然言語指示を解析し、必要なCFDステップを計画
- **Mesherエージェント**: STLジオメトリからsnappyHexMeshの設定を自動生成
- **Solverエージェント**: simpleFoamの設定・実行・収束判定を管理
- **Postエージェント**: 収束確認・Cl/Cd・圧力分布の自動抽出

NeurIPS 2025採択論文によると、**OpenFOAM CFDベンチマークで88.2%の成功率**（手動セットアップと同等品質の解析完走）を達成。OpenFOAMの基本概念（境界条件・メッシュの概念程度）があれば使いこなせます。

---

## 実装：ステップバイステップ

**前提条件**
- Ubuntu 20.04/22.04 または WSL2（Windows Subsystem for Linux）
- OpenFOAM v12（無料）
- Python 3.10 以上
- OpenAI APIキーまたはAnthropic APIキー（月$5〜10程度）

```bash
# === ステップ1: OpenFOAMのインストール（未済の場合） ===
# 公式リポジトリを追加してインストール
wget -q -O - https://dl.openfoam.org/gpg.key | \
  sudo gpg --dearmor -o /usr/share/keyrings/openfoam.gpg

echo "deb [signed-by=/usr/share/keyrings/openfoam.gpg] \
  https://dl.openfoam.org/ubuntu jammy/" | \
  sudo tee /etc/apt/sources.list.d/openfoam.list

sudo apt-get update && sudo apt-get install -y openfoam12  # 約2GB / 15分

# OpenFOAMを毎回使えるよう.bashrcに追記
echo "source /opt/openfoam12/etc/bashrc" >> ~/.bashrc
source ~/.bashrc

# インストール確認
blockMesh --version  # "Build: 12-..." が表示されればOK
```

```bash
# === ステップ2: Foam-Agentのインストール ===
git clone https://github.com/csml-rpi/Foam-Agent.git
cd Foam-Agent
pip install -r requirements.txt

# APIキーを設定（どちらか一方でOK）
export OPENAI_API_KEY="sk-..."          # OpenAI GPT-4oを使う場合
# または
export ANTHROPIC_API_KEY="sk-ant-..."  # Claude Sonnetを使う場合

echo "インストール完了"
```

```python
# === ステップ3: フロントウィング1ケースを自然言語で解析 ===
# ファイル名: run_wing_analysis.py

import subprocess, os

os.chdir("/path/to/Foam-Agent")  # Foam-Agentのディレクトリに変更

# 自然言語で解析を指示（日本語でOK）
query = """
学生フォーミュラのフロントウィング空力解析を実行してください。
- STLファイル: ./geometry/front_wing.stl
- 走行速度: 15 m/s（コーナー速度、時速約54km）
- 空気密度: 1.225 kg/m3（標準大気）
- メッシュ密度: coarse（計算時間優先）
- 出力: ダウンフォース係数Cl・抵抗係数Cd・空力効率L/D

解析完了後、Cl・Cd・L/D比を数値で教えてください。
"""

result = subprocess.run(
    ["python", "foam_agent.py", "--query", query, "--model", "gpt-4o"],
    capture_output=True, text=True,
    timeout=3600  # 最大1時間（粗メッシュなら30〜40分）
)

print(result.stdout)
if result.returncode != 0:
    print("エラー内容:", result.stderr[-500:])  # 最後の500文字を表示
```

```python
# === ステップ4: フラップ角スイープで最適角を探索（7ケース自動実行） ===
# ファイル名: flap_angle_sweep.py

import subprocess, json, time

# フラップ角7段階（STLファイルは事前に各角度で用意）
flap_angles = [0, 5, 10, 15, 20, 25, 30]
results = []

for angle in flap_angles:
    query = f"""
    フロントウィング解析を実行してください。
    STL: ./geometry/front_wing_flap{angle:02d}deg.stl
    速度: 15 m/s, メッシュ密度: coarse
    結果はJSON形式で {{"Cl": 数値, "Cd": 数値}} のみ返してください。
    """

    result = subprocess.run(
        ["python", "foam_agent.py", "--query", query, "--model", "gpt-4o"],
        capture_output=True, text=True, timeout=1800  # 30分/ケース
    )

    try:
        # 出力からJSONを抽出
        output = result.stdout
        json_start = output.rfind('{')  # 最後の{を探す
        data = json.loads(output[json_start:output.rfind('}')+1])
        ld_ratio = data["Cl"] / data["Cd"]  # 空力効率L/D
        results.append({"angle": angle, **data, "LD": ld_ratio})
        print(f"フラップ{angle:2d}° → Cl={data['Cl']:.3f}, Cd={data['Cd']:.3f}, L/D={ld_ratio:.2f}")
    except Exception as e:
        print(f"フラップ{angle:2d}° → 解析失敗: {e}")

    time.sleep(5)  # API レート制限対策

# 最適フラップ角を特定（L/D最大＝空力効率最高）
if results:
    best = max(results, key=lambda x: x["LD"])
    print(f"\n最適フラップ角: {best['angle']}°")
    print(f"  Cl = {best['Cl']:.3f}（ダウンフォース係数）")
    print(f"  Cd = {best['Cd']:.3f}（抵抗係数）")
    print(f"  L/D = {best['LD']:.2f}（空力効率）")
```

このコードを出力の形式は次のようになります（未実測）：

```
フラップ 0° → Cl=0.821, Cd=0.142, L/D=5.78
フラップ 5° → Cl=1.043, Cd=0.168, L/D=6.21
フラップ10° → Cl=1.287, Cd=0.209, L/D=6.16
フラップ15° → Cl=1.456, Cd=0.251, L/D=5.80
フラップ20° → Cl=1.531, Cd=0.302, L/D=5.07
フラップ25° → Cl=1.487, Cd=0.376, L/D=3.95
フラップ30° → Cl=1.342, Cd=0.441, L/D=3.04

最適フラップ角: 5°
  Cl = 1.043（ダウンフォース係数）
  Cd = 0.168（抵抗係数）
  L/D = 6.21（空力効率）
```

7段階のスイープが並列ではなく直列に回っても合計3〜4時間。手動なら42時間かかる作業が、Foam-Agentに「フラップ角を変えながら7ケース解析して」と指示するだけで完了します。

---

## 学生フォーミュラ・レース車両開発への応用

### 具体的なシナリオ：大会前の空力セットアップ最適化

学生フォーミュラの加速・スキッドパッド・エンデュランスでは、サーキット特性に応じた空力バランス（フロント/リアダウンフォース比）が重要です。Foam-Agentを使えば「加速重視セット（低ダウンフォース）」「コーナリング重視セット（高ダウンフォース）」の2種類のウィング形状を1日で比較評価できます。

### 背景理論（学部生向け）

`simpleFoam`は定常非圧縮流体の解析ソルバーです。ナビエ・ストークス方程式（流体の運動方程式）をSIMPLE法（Semi-Implicit Method for Pressure-Linked Equations）で解きます。Foam-AgentはこのsimpleFoamの設定ファイル（`system/`フォルダのdictファイル群）を自動生成するため、ユーザーはOpenFOAMのファイル構造を覚える必要がありません。

Cl（揚力係数）とCd（抵抗係数）は無次元数で、同じ形状なら速度によらず一定の値を持ちます。そのため15m/sで解析した結果を、別の速度域でも使い回せます。

### Before / After 比較

| 項目 | 手動OpenFOAM | Foam-Agent使用後 |
|------|-------------|----------------|
| 1ケースのセットアップ時間 | 2〜3時間 | 10〜15分（自然言語入力のみ） |
| 7段階フラップスイープ全体 | 35〜42時間 | 3.5〜4時間 |
| dictファイル設定ミスによる発散 | 頻発（デバッグ30〜60分） | Agentが自動修正 |
| 1週間で評価できるケース数 | 5〜7ケース | 30〜40ケース |
| OpenFOAM習得コスト | 1〜2ヶ月 | 1日（Foam-Agentの使い方のみ） |

### 学生チームが今すぐ試せる最初のステップ

OpenFOAMのチュートリアルケース（`$FOAM_TUTORIALS/incompressible/simpleFoam/airFoil2D`）に入って、「このケースのCl/Cdを日本語で説明してください」とFoam-Agentに指示してみてください。Agentが既存ケースを解釈して数値と物理的意味を返すまで5分以内のはずです。

---

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `STL not watertight` | STLに穴や自己交差がある | FreeCAD / Meshmixerで`Check and Repair Mesh`を実行 |
| `Solver diverged after N steps` | メッシュ品質が低い | クエリに`メッシュ密度: fine`を追加して再実行 |
| `API rate limit exceeded` | APIコール過多 | `time.sleep(10)`を追加してリクエスト間隔を広げる |
| `OpenFOAM not found` | PATHが設定されていない | `source /opt/openfoam12/etc/bashrc`を`.bashrc`に追記 |
| JSON解析エラー | Agentの出力形式が変化した | `output_format: json`オプションを明示的に指定 |

---

## 今週の学生チームへの宿題

OpenFOAMのチュートリアルディレクトリ（`$FOAM_TUTORIALS/incompressible/simpleFoam/airFoil2D`）をFoam-Agentに渡して、「このNACA翼型のCl/Cdを計算して、学生フォーミュラのフロントウィングに使えるか評価してください」と日本語で聞いてみてください。これだけでFoam-Agentの実力と限界を5分で体感できます。
