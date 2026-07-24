---
title: "【学生フォーミュラ実践】Replit Agent 4でレースデータ可視化ツールを30分プロトタイプする"
date: 2026-06-29
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Replit Agent 4", "テレメトリ可視化", "ラピッドプロトタイピング", "Webダッシュボード"]
tool: "Replit Agent 4"
official_url: "https://replit.com/site/agent"
importance: "high"
summary: "学生フォーミュラチームがReplit Agent 4に自然言語で指示するだけで、走行テスト後のテレメトリ可視化ダッシュボードをゼロから構築。従来2日かかっていたプロトタイプが30分で動きます。"
---

## この記事を読む前に

本ブログの「[Replit Agent 4：並列Pythonエージェントでシミュレーション開発を加速する](/blog/replit-agent4-parallel-python-mbd-simulation-2026)」でReplit Agent 4の基本（クラウド上での自律コーディングエージェント）を紹介しました。この記事では学生フォーミュラの走行テスト後データ可視化に応用します。

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：テスト当日中にデータを全員で共有する

走行テストから帰宅後、「今日の12ラップをセクター別・タイヤ温度別にグラフ化したい」「ラップタイムの推移とステアリング角を重ねてみたい」というニーズが毎回出る。しかしWebダッシュボードを作るにはStreamlit/Plotly/CSVパース等の知識が必要で、コーディングに不慣れなメンバーには2日かかる。その間、データは活かせないまま設計会議を迎える。

出典：Replit公式ブログ「Replit Agent: Build software with AI」https://blog.replit.com/replit-agent

### 背景理論：ゼロショット開発エージェント

Replit Agent 4は自然言語の要件説明だけでアプリを構築する「完全自律型コーディングエージェント」です。従来のコード補完（GitHub Copilot）との違いは、ファイル作成・パッケージインストール・デバッグ・実行まで一貫して自律実行する点です。クラウドで動くためローカル環境構築は不要——走行テスト帰宅後にスマートフォンから指示しても動きます。

内部ではLLMが要件をサブタスク（ファイル構造設計→コード生成→パッケージインストール→テスト実行）に分解してツールとして逐次実行します。

### 実装：ステップバイステップ

**前提条件**
- Replitアカウント（無料）：https://replit.com/signup
- テレメトリCSVファイル（AiM/Motec等の出力、または下記サンプル生成ボタンで代用可）

```
# === ステップ1: Replit Agentに送るプロンプトを準備 ===
# replit.com にログイン → + New Repl → Agent モードを選択
# 以下のプロンプトをそのままコピーして貼り付ける
```

**Replit Agentへの指示プロンプト（コピーして使う）：**

```
以下の要件でFSAEテレメトリ可視化Webアプリを作ってください。

【技術スタック】
- Python + Streamlit + Plotly
- CSVファイルをドラッグ&ドロップで読み込み

【CSVの列名】
lap, time_s, speed_kph, steer_deg, lat_g, tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr

【機能要件】
1. CSVアップロードウィジェット
2. 表示するラップを選択するマルチセレクトボックス
3. 速度・ステアリング角・横Gを縦3段に重ねた折れ線グラフ（時間軸共通）
4. タイヤ温度4輪の棒グラフ（ラップ平均値）
5. ラップタイム一覧テーブル（ベストラップ行を緑ハイライト）
6. サンプルCSVをその場で生成するボタン（テスト用）

【UI言語】全ラベルと説明文は日本語にしてください。
```

```python
# === ステップ2: エージェントが生成するコードの核心部分（参考）===
# Replit Agentが自動生成するmain.pyの主要ロジック

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import numpy as np

st.set_page_config(page_title="FSAEテレメトリ解析", layout="wide")
st.title("FSAEテレメトリ可視化ダッシュボード")

# サンプルCSV生成ボタン（エージェントが自動追加）
if st.button("サンプルCSVを生成してダウンロード"):
    n = 500
    t = np.linspace(0, 45, n)
    sample = pd.DataFrame({
        "lap": np.repeat([1, 2, 3], [167, 167, 166]),
        "time_s": t,
        "speed_kph": 70 + 30 * np.sin(t / 3) + np.random.normal(0, 2, n),
        "steer_deg": 20 * np.sin(t / 2.5) + np.random.normal(0, 1, n),
        "lat_g": 1.5 * np.sin(t / 2.5) + np.random.normal(0, 0.05, n),
        "tire_temp_fl": 65 + 10 * np.sin(t / 5) + np.random.normal(0, 2, n),
        "tire_temp_fr": 68 + 8 * np.sin(t / 5) + np.random.normal(0, 2, n),
        "tire_temp_rl": 72 + 12 * np.sin(t / 5) + np.random.normal(0, 2, n),
        "tire_temp_rr": 70 + 9 * np.sin(t / 5) + np.random.normal(0, 2, n),
    })
    st.download_button("CSVをダウンロード", sample.to_csv(index=False), "fsae_sample.csv")

# CSVアップロード
uploaded = st.file_uploader("テレメトリCSVをアップロード", type="csv")
if uploaded:
    df = pd.read_csv(uploaded)
    df["lap"] = df["lap"].astype(int)  # 型変換（グラフが空白になるのを防ぐ）
    laps = sorted(df["lap"].unique())
    selected = st.multiselect("表示するラップを選択", laps, default=laps[:3])
    df_sel = df[df["lap"].isin(selected)]

    # 速度・ステアリング・横Gの3段組みグラフ
    fig = make_subplots(rows=3, cols=1, shared_xaxes=True,
                        subplot_titles=["速度 (km/h)", "ステアリング角 (deg)", "横G (G)"],
                        vertical_spacing=0.08)
    for lap in selected:
        d = df_sel[df_sel["lap"] == lap]
        fig.add_trace(go.Scatter(x=d["time_s"], y=d["speed_kph"],
                                  name=f"Lap{lap}", mode="lines"), row=1, col=1)
        fig.add_trace(go.Scatter(x=d["time_s"], y=d["steer_deg"],
                                  name=f"Lap{lap}", showlegend=False, mode="lines"), row=2, col=1)
        fig.add_trace(go.Scatter(x=d["time_s"], y=d["lat_g"],
                                  name=f"Lap{lap}", showlegend=False, mode="lines"), row=3, col=1)
    fig.update_layout(height=700)
    st.plotly_chart(fig, use_container_width=True)

    # タイヤ温度棒グラフ（ラップ平均）
    st.subheader("タイヤ温度比較（ラップ平均）")
    tire_cols = ["tire_temp_fl", "tire_temp_fr", "tire_temp_rl", "tire_temp_rr"]
    fig2 = go.Figure()
    for lap in selected:
        d = df_sel[df_sel["lap"] == lap]
        fig2.add_trace(go.Bar(name=f"Lap{lap}",
                               x=["FL", "FR", "RL", "RR"],
                               y=[d[c].mean() for c in tire_cols]))
    fig2.update_layout(barmode="group", yaxis_title="温度 (°C)")
    st.plotly_chart(fig2, use_container_width=True)
```

Replit Agentが実行を完了すると以下が表示されます：

```
✓ Packages installed (streamlit, plotly, pandas, numpy)
✓ main.py created
✓ App is running at:
  https://fsae-telemetry-dashboard.あなたのID.repl.co
```

このURLをチームのSlackに貼るだけで、全員がブラウザから即座にアクセスできます。

### Before / After（実数値で比較）

| 項目 | 手動コーディング | Replit Agent 4使用後 |
|------|-----------------|---------------------|
| ダッシュボードプロトタイプ作成時間 | 2日（約16時間） | 30分 |
| 必要なコーディング知識 | Flask/Plotly/CSS 必須 | 日本語でプロンプトを書ける能力のみ |
| テスト当日中にURLを共有できるか | ほぼ不可能 | 走行テスト帰宅後2時間以内に可能 |
| 追加機能のイテレーション速度 | 1時間/回 | 5分/回（チャットで追加指示） |
| ローカル環境構築（Python/pip） | 必要 | 不要（Replitがクラウドで完結） |

### 学生チームが今すぐ試せる最初のステップ

1. https://replit.com/signup でアカウント作成（無料）
2. `+ New Repl` → `Agent`モードを選択
3. 上記プロンプトをコピーして貼り付け（所要時間：30秒）
4. Replit AgentがURLを出力したらブラウザで開く
5. 「サンプルCSVを生成」ボタンでダミーデータを使ってすぐ動作確認できる

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| CSVアップロード後に列名エラー | 実CSVの列名がプロンプトと違う | エージェントに「CSVの先頭5行は以下です」と実データを貼って再生成 |
| グラフが空白になる | `lap`列が文字列型（"1"）になっている | エージェントに「lapをint型に変換する処理を追加して」と追加指示 |
| Replitが重い・タイムアウト | 無料プランのRAM制限（512MB） | CSVを10ラップ以内に間引くか有料プラン（$7/月）へ移行 |
| URLが外部からアクセスできない | 「Always On」が無効 | Replitのデプロイ設定で「Always On」を有効化する |
| エージェントが途中で止まる | 無料プランのAgent実行時間制限 | 「続けてください」とチャットで指示するか有料プランへ |

## 今週の学生チームへの宿題

今週末のテスト走行から帰宅後、上記プロンプトをReplit Agentに貼り付けてください。走行から2時間以内にチーム全員がスマートフォンで見られるダッシュボードURLを共有できます。
