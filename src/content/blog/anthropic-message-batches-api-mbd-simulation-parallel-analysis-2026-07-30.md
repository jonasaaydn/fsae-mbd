---
title: "Claude Message Batches APIでMATLABシミュレーション結果を50%コスト削減で一括解析する実践ガイド"
date: 2026-07-30
category: "AI Coding"
tags: ["Claude API", "Batch Processing", "MATLAB", "MBD", "コスト最適化", "自動化"]
tool: "Claude"
official_url: "https://platform.claude.com/docs/en/build-with-claude/batch-processing"
importance: "high"
summary: "Anthropicの公式Batches APIを使えば、MATLABのパラメータスタディ結果やOpenFOAMログを最大100,000件まとめてClaudeに送り、トークン費用を50%削減できる。24時間以内に非同期処理が完了するため、深夜バッチ実行との相性が抜群。月あたりの解析コストを従来の同期APIの半額に抑える具体的な実装コードを公開する。"
---

## はじめに

パラメータスタディを回したその夜、Pythonスクリプトを走らせてMATLABの実行結果ファイルを1件ずつClaudeに送ってAIレポートを生成しようとしたとき、あなたは気づく――**1回の解析あたり0.8円、1,000件で800円、月5,000件なら4,000円以上**。それをリアルタイムAPIで回すと費用が膨らむだけでなく、レート制限（毎分50リクエスト）にも引っかかる。しかもほとんどの用途はリアルタイム性が不要なはずだ。

Anthropicが正式提供している**Message Batches API**を使えば、この問題が一気に解決する。1ジョブに最大100,000件を詰め込んで非同期送信するだけで、**同じモデルの同じ推論をトークン費用半額**で回せる。MBDエンジニアが日常的に扱う「大量のシミュレーション結果ログをまとめてAI解析したい」という用途に完璧にはまる。

---

## Message Batches APIとは

**提供元**：Anthropic（2024年9月パブリックベータ、2025年1月正式GA）
**対応モデル**：Claude Haiku 4.5、Sonnet 5、Opus 5など全主要モデル
**割引率**：入力・出力トークンともに標準APIの**50%オフ**（プロンプトキャッシングとの重ねがけも可能）
**処理時間**：送信後**最大24時間以内**に結果返却
**上限**：1ジョブあたり最大100,000リクエスト・256 MB

従来の同期APIとの最大の違いは「リアルタイムレスポンス不要」という前提だ。MBDの現場では「今夜パラメータスタディを回して、朝一番にAIサマリをSlackに送る」というユースケースが珍しくない。この要件ならBatches APIが最適解になる。

---

## 実際の動作：ステップバイステップ

### 前提条件
```
pip install anthropic>=0.35.0
```
ANTHROPIC_API_KEY を環境変数にセットしておくこと。

**① バッチリクエストを作成して送信する**

```python
import anthropic
import json
import os
from pathlib import Path

client = anthropic.Anthropic()  # ANTHROPIC_API_KEYを自動読み込み

def load_simulation_results(results_dir: str) -> list[dict]:
    """MATLABのシミュレーション結果ファイルをすべて読み込む"""
    results = []
    for i, path in enumerate(sorted(Path(results_dir).glob("*.txt"))):
        text = path.read_text(encoding="utf-8")
        results.append({"custom_id": f"sim_{i:04d}", "content": text, "filename": path.name})
    return results

def create_batch_requests(simulation_results: list[dict]) -> list[dict]:
    """各シミュレーション結果をClaudeへのリクエスト形式に変換する"""
    requests = []
    for sim in simulation_results:
        requests.append({
            "custom_id": sim["custom_id"],  # 後でマッチングするためのID
            "params": {
                "model": "claude-haiku-4-5-20251001",  # コスト最小のHaiku
                "max_tokens": 512,
                "system": (
                    "あなたはMBDエンジニア向けのシミュレーション解析AIです。"
                    "結果の要点・異常値・推奨アクションを簡潔に日本語でまとめてください。"
                ),
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            f"ファイル名: {sim['filename']}\n\n"
                            f"シミュレーション結果:\n{sim['content'][:3000]}"  # 長すぎる場合は先頭3000文字
                        )
                    }
                ],
            },
        })
    return requests

# === メイン処理 ===
sim_data = load_simulation_results("./matlab_output/")   # MATLABの出力先
batch_requests = create_batch_requests(sim_data)

# バッチを作成して送信（この時点では非同期処理が始まるだけ）
batch = client.messages.batches.create(requests=batch_requests)
print(f"バッチID: {batch.id}")  # 後でポーリングに使う
print(f"送信リクエスト数: {len(batch_requests)}")

# バッチIDを保存しておく（次のステップで使う）
with open("batch_id.txt", "w") as f:
    f.write(batch.id)
```

**② 翌朝：結果を取得してCSVに出力する**

```python
import anthropic, json, csv
from pathlib import Path

client = anthropic.Anthropic()
batch_id = Path("batch_id.txt").read_text().strip()

# バッチの処理状況を確認
batch = client.messages.batches.retrieve(batch_id)
print(f"ステータス: {batch.processing_status}")  # ended になっていれば取得可能

if batch.processing_status != "ended":
    print("まだ処理中です。時間をおいて再実行してください。")
else:
    # 結果をイテレータで1件ずつ取得（メモリ効率が良い）
    rows = []
    for result in client.messages.batches.results(batch_id):
        custom_id = result.custom_id
        if result.result.type == "succeeded":
            # 成功した場合はAIの応答テキストを取り出す
            ai_summary = result.result.message.content[0].text
        else:
            ai_summary = f"ERROR: {result.result.error.type}"
        rows.append({"id": custom_id, "summary": ai_summary})
    
    # CSVに保存
    with open("batch_results.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "summary"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"完了: {len(rows)}件の結果を batch_results.csv に保存しました")
```

**③ 実行結果の例（コンソール出力）**

```
バッチID: msgbatch_01XYZ1234ABCD5678
送信リクエスト数: 347
---（翌朝実行）---
ステータス: ended
完了: 347件の結果を batch_results.csv に保存しました
```

---

## Before / After 比較

| 項目 | 同期API（従来） | Batches API |
|------|----------------|-------------|
| 1,000件あたりコスト（Haiku）| 約420円 | **約210円（50%オフ）** |
| 10,000件あたりコスト | 約4,200円 | **約2,100円** |
| レート制限 | 毎分50リクエスト | **制限なし（1ジョブ上限10万件）** |
| 処理完了まで（1,000件） | 約20分（待機必須） | **最大24時間（非同期・放置可）** |
| エラー時の再処理 | スクリプトを再実行 | failed件のみ個別リトライ可 |

毎日500件のシミュレーション結果をAI解析している場合、月あたり約15,000件。同期APIで月6,300円 → Batches APIで月3,150円に半減。年間にすると約37,800円の削減。

---

## 実践コード例：MATLABシミュレーション×Batches API完全自動化スクリプト

```python
#!/usr/bin/env python3
"""
MATLAB パラメータスタディ結果の夜間バッチ解析スクリプト
実行タイミング: パラメータスタディ完了直後（深夜）に cron で自動実行
翌朝: python3 fetch_batch.py で結果取得

前提: anthropic>=0.35.0, 環境変数 ANTHROPIC_API_KEY が設定済み
"""
import anthropic, json, sys
from pathlib import Path
from datetime import datetime

client = anthropic.Anthropic()

MATLAB_OUTPUT_DIR = Path("./paraStudy_results/")
BATCH_ID_FILE = Path("./batch_state.json")
REPORT_DIR = Path("./ai_reports/")
REPORT_DIR.mkdir(exist_ok=True)

def submit_batch():
    """シミュレーション結果をバッチ送信する"""
    files = sorted(MATLAB_OUTPUT_DIR.glob("*.mat.txt"))  # MATLABのログ変換後テキスト
    if not files:
        print("解析対象ファイルなし"); return
    
    requests = [{
        "custom_id": f.stem,
        "params": {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 600,
            "messages": [{"role": "user", "content":
                f"車両ダイナミクスシミュレーション結果を解析し、ヨーレート追従誤差・ロール角ピーク・"
                f"アンダー/オーバーステア傾向・推奨改善点を簡潔にまとめてください:\n{f.read_text()[:2500]}"
            }]
        }
    } for f in files]
    
    batch = client.messages.batches.create(requests=requests)
    BATCH_ID_FILE.write_text(json.dumps({"id": batch.id, "count": len(requests),
                                          "submitted_at": datetime.now().isoformat()}))
    print(f"送信完了: {len(requests)}件 → バッチID {batch.id}")

def fetch_results():
    """翌朝：結果を取得してMarkdownレポートを生成する"""
    state = json.loads(BATCH_ID_FILE.read_text())
    batch = client.messages.batches.retrieve(state["id"])
    if batch.processing_status != "ended":
        print(f"処理中（{batch.processing_status}）。後で再実行してください。"); return
    
    report_lines = [f"# パラメータスタディ AI解析レポート\n生成日時: {datetime.now()}\n"]
    for res in client.messages.batches.results(state["id"]):
        text = res.result.message.content[0].text if res.result.type == "succeeded" else "解析失敗"
        report_lines.append(f"## {res.custom_id}\n{text}\n")
    
    report_path = REPORT_DIR / f"report_{datetime.now().strftime('%Y%m%d')}.md"
    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"レポート生成完了: {report_path}")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "fetch":
        fetch_results()
    else:
        submit_batch()
```

---

## 注意点・落とし穴

| 問題 | 原因 | 解決策 |
|------|------|--------|
| `invalid_request_error` | モデル名が古い | `claude-haiku-4-5-20251001` に更新 |
| 結果が返らない | 24時間以内は処理中 | `processing_status == "ended"` を確認してから取得 |
| 1件が4,096トークン超え | 入力が長すぎる | `content[:2500]` のように事前にトリミング |
| バッチが途中でexpired | 29日以内に結果取得しなかった | 翌日中に`fetch_results()`を実行すること |
| ストリーミング | Batches APIは非対応 | リアルタイム必要な場合は同期APIを使う |

---

## 応用：より高度な使い方

Batches APIはプロンプトキャッシングと重ねがけできる。システムプロンプトが同一の場合、最初の数件以降はキャッシュが効いてトークン消費が激減。**1,000件のバッチで追加15〜30%節約**が可能。

`tool_use`（ツール呼び出し）もBatches API内で使える。MATLABの各結果に対して「異常値フラグ」「OK/NG判定」「推奨設定値」をJSON構造化出力させることで、後続のスクリプトで自動分類できる。大量の結果を持つ「生成→構造化→DB登録」パイプラインを無人で完結させることも現実的だ。

---

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：空力パッケージのDOEをBatch AIで一晩解析

学生フォーミュラチームが前後ウィング角度を変えた64ケースのCFDを走らせたとする（OpenFOAM、各ケース30分のCFD）。終了後に64件のforce_coefficients.txtをBatches APIに投げ、翌朝に「各ケースのCl/Cd比・ダウンフォースバランス・コーナリング推定タイム換算」をまとめたMarkdownレポートが自動生成されている――これが今日から実装できる。

```python
# 前提: OpenFOAMの各ケースディレクトリから force_coefficients.txt を収集済み
# pip install anthropic>=0.35.0

import anthropic
from pathlib import Path

client = anthropic.Anthropic()

# === ステップ1: 64ケースのCFD結果を読み込む ===
case_dirs = sorted(Path("./openfoam_cases/").glob("case_*/postProcessing/forceCoeffs/0/force_coefficients.txt"))
print(f"{len(case_dirs)}件のCFD結果を検出")

# === ステップ2: バッチリクエストを構築する ===
# 1件ずつ送ると時間がかかるが、Batches APIなら64件を一括送信
requests = []
for path in case_dirs:
    case_name = path.parts[-5]  # "case_0001" など
    data = path.read_text()[-2000:]  # 末尾2000文字（収束後の値を含む）
    requests.append({
        "custom_id": case_name,
        "params": {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 400,
            "messages": [{"role": "user", "content":
                f"【ケース: {case_name}】\n"
                f"以下のOpenFOAM forceCoeffsデータからCd・Cl・Cl/Cd比を抽出し、"
                f"学生フォーミュラの観点から空力バランスと改善点を日本語で簡潔に述べてください:\n{data}"
            }]
        }
    })

# === ステップ3: バッチ送信（非同期）===
batch = client.messages.batches.create(requests=requests)
print(f"バッチ送信完了。ID: {batch.id}（翌朝 fetch で結果取得）")
```

**Before（従来）:** 64件を同期APIで順次解析 → 約21分待機・費用約270円
**After（Batches API）:** 送信5秒→翌朝取得→費用**約135円（50%削減）**・深夜無人実行

**チームが今すぐ試せる最初のステップ：**
```
pip install anthropic
# 上記コードをcosting_test.pyとして保存し、1〜3件のCFD結果で試す
python3 costing_test.py
# 翌朝：python3 costing_test.py fetch
```

まずは5件のログで動作を確認し、コスト感覚をつかんでから本番の64ケースに展開しよう。
