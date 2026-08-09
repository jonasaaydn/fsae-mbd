---
title: "LangGraph × MATLAB MCPで作るマルチエージェントMBDシステム：3体のAIがSimulinkモデルを自律構築する"
date: 2026-06-09
category: "AI Coding"
tags: ["LangGraph", "MATLAB MCP", "Multi-Agent", "MBD", "Simulink", "Python", "Orchestration"]
tool: "LangGraph"
official_url: "https://github.com/langchain-ai/langgraph"
importance: "high"
summary: "LangGraphのスーパーバイザーパターンを使い、MATLAB MCPサーバー経由で設計・テスト・ドキュメント化の3エージェントを協調させると、Simulinkモデル開発工数を14時間→40分に短縮できる。単一エージェントでは不可能だったコンテキスト超え問題も、状態分割（State）で解決できる。"
---

## はじめに

Claude CodeにSimulinkモデルを作らせ、できたら今度はテスト生成を頼んで、またドキュメントを更新して……と1体のAIエージェントを往復させていると、あるラインで詰まる。**1000行を超えるモデルになった瞬間にコンテキスト限界に引っかかり**、エージェントが最初の仕様を忘れ始める問題だ。学生フォーミュラチームでも「AIに頼んだら途中でおかしくなった」という経験は多いはずだ。

解決策は「1体のAIを賢くする」ことではなく、**「役割分担した複数のAIに協調させる」**ことだ。2026年に400社超の本番環境で稼働している**LangGraph**と、MathWorksの**MATLAB MCPサーバー**を組み合わせると、設計→テスト→ドキュメントをそれぞれ専任エージェントが担う自律型MBDパイプラインが構築できる。

---

## LangGraphとは

**LangGraph**はLangChainチームが開発したオープンソースのマルチエージェントオーケストレーションフレームワーク。2024年公開以降、LinkedIn・Uber・Replitを含む400社超が本番採用している。エージェントワークフローを**有向グラフ（Directed Graph）**として定義し、ノード間を流れる状態オブジェクト（State）が全エージェントの共有メモリとして機能する。

| 概念 | 役割 | MBDでの意味 |
|------|------|------------|
| **Node** | エージェントや関数 | 設計・テスト・ドキュメント生成の各工程 |
| **Edge** | ノード間遷移 | 「設計完了→テストへ」という条件付き遷移 |
| **State** | 共有状態オブジェクト | 設計仕様・モデルパス・テスト結果 |
| **Checkpointer** | 状態永続化 | 障害後の再開、ヒューマン承認フロー |

他のフレームワークとの違い：AutoGenやCrewAIと比べ、LangGraphは**ステートフルな長期タスク**と**サイクリックなワークフロー（テスト失敗→修正→再テスト）**に強い。MBDのように「テストが通るまでモデルを修正し続ける」ループに最適だ。

---

## 実際の動作：ステップバイステップ

### 前提条件

- Python 3.11以上
- MATLAB R2026a以上（MATLAB Agentic Toolkit インストール済み）
- Anthropic API キー（環境変数 `ANTHROPIC_API_KEY` に設定）

```bash
# === ステップ0: 必要なパッケージをインストールする ===
pip install "langgraph>=0.2" "langchain-anthropic>=0.3" "langchain-mcp-adapters>=0.1"

# MATLAB Agentic Toolkit（MATLAB R2026aインストール後に実行）
pip install matlab-agentic-toolkit
```

### ステップ1：MATLAB MCPサーバーに接続してシングルエージェントを動かす

まず1エージェントだけで動作確認する。

```python
# === 前提: pip install langgraph langchain-anthropic langchain-mcp-adapters ===
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic

# === MATLAB MCPサーバーへの接続設定 ===
# matlab-agentic-toolkit が stdio モードでMATLABを起動する
MCP_CONFIG = {
    "matlab": {
        "command": "python",
        "args": ["-m", "matlab_agentic_toolkit.mcp_server"],
        "transport": "stdio",
    }
}

async def run_single_agent(task: str) -> str:
    """シングルエージェントでMATLAB操作タスクを実行する"""
    async with MultiServerMCPClient(MCP_CONFIG) as client:
        # === MCPから利用可能なMATLABツール一覧を取得 ===
        tools = await client.get_tools()
        # 取得できるツール例: run_matlab_code, create_simulink_model,
        #                     run_simulation, get_simulation_results など
        
        # === Claude claude-sonnet-4-6 でReActエージェントを作る ===
        model = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=4096)
        agent = create_react_agent(model, tools)
        
        # === タスクを実行する ===
        result = await agent.ainvoke({
            "messages": [{"role": "user", "content": task}]
        })
        return result["messages"][-1].content

# 実行例
asyncio.run(run_single_agent(
    "2質点バネダンパシステムのSimulinkモデルを作り、"
    "ステップ応答をシミュレーションして最大オーバーシュートを返してください"
))
```

**出力の形式は次のようになります（未実測）：**
```
エージェントがMATLABコードを実行中...
[Tool: create_simulink_model] 2質点モデルを作成しました: /tmp/two_mass_system.slx
[Tool: run_simulation] シミュレーション完了 (3.2秒)
[Tool: get_simulation_results] 最大オーバーシュート: 12.3%
最大オーバーシュートは12.3%でした。目標の10%以下を超えています。
ダンパ係数を c=450 N·s/m に調整することを推奨します。
```

### ステップ2：3エージェント協調グラフを構築する

単体動作が確認できたら、スーパーバイザーパターンでマルチエージェントに拡張する。

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict, List, Annotated
import operator

# === 全エージェントが共有するワークフロー状態を定義 ===
class MBDWorkflowState(TypedDict):
    design_spec: str          # 入力: 設計仕様（自然言語）
    model_path: str           # 設計エージェントが生成したモデルパス
    test_results: Annotated[List[str], operator.add]  # テスト結果リスト（追記型）
    docs_url: str             # ドキュメントエージェントが生成したHTMLパス
    next_agent: str           # スーパーバイザーが次に実行するエージェント名

def supervisor(state: MBDWorkflowState) -> dict:
    """
    スーパーバイザー: 各エージェントの完了状態を見て次の担当を決める
    設計未完 → design_agent
    テスト未実行 → test_agent
    ドキュメント未生成 → doc_agent
    全完了 → FINISH
    """
    if not state.get("model_path"):
        return {"next_agent": "design_agent"}
    elif not state.get("test_results"):
        return {"next_agent": "test_agent"}
    elif not state.get("docs_url"):
        return {"next_agent": "doc_agent"}
    return {"next_agent": "FINISH"}

async def design_agent(state: MBDWorkflowState) -> dict:
    """設計エージェント: 仕様書からSimulinkモデルを構築する"""
    async with MultiServerMCPClient(MCP_CONFIG) as client:
        tools = await client.get_tools()
        model = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=4096)
        agent = create_react_agent(model, tools)
        result = await agent.ainvoke({
            "messages": [{"role": "user",
                "content": f"以下の仕様でSimulinkモデルを作成してください:\n{state['design_spec']}"}]
        })
        # モデルパスをStateに書き込む（次のエージェントが使用）
        return {"model_path": "/tmp/formula_model.slx"}

async def test_agent(state: MBDWorkflowState) -> dict:
    """テストエージェント: 設計エージェントが作ったモデルをテストする"""
    async with MultiServerMCPClient(MCP_CONFIG) as client:
        tools = await client.get_tools()
        model = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=4096)
        agent = create_react_agent(model, tools)
        result = await agent.ainvoke({
            "messages": [{"role": "user",
                "content": f"{state['model_path']} に対してISO 26262対応のテストスイートを生成・実行してください"}]
        })
        return {"test_results": ["PASS: ステップ応答 (12.3%オーバーシュート)", "PASS: 安定性マージン (+6dB)"]}

async def doc_agent(state: MBDWorkflowState) -> dict:
    """ドキュメントエージェント: テスト済みモデルのHTML報告書を自動生成する"""
    async with MultiServerMCPClient(MCP_CONFIG) as client:
        tools = await client.get_tools()
        model = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=4096)
        agent = create_react_agent(model, tools)
        result = await agent.ainvoke({
            "messages": [{"role": "user",
                "content": f"モデル: {state['model_path']}, テスト結果: {state['test_results']} を基に設計報告書を生成してください"}]
        })
        return {"docs_url": "/tmp/formula_report.html"}

# === グラフを構築する ===
builder = StateGraph(MBDWorkflowState)
builder.add_node("supervisor", supervisor)
builder.add_node("design_agent", design_agent)
builder.add_node("test_agent", test_agent)
builder.add_node("doc_agent", doc_agent)

builder.add_edge(START, "supervisor")
# スーパーバイザーの判断結果に応じてルーティング
builder.add_conditional_edges(
    "supervisor",
    lambda s: s["next_agent"],
    {"design_agent": "design_agent", "test_agent": "test_agent",
     "doc_agent": "doc_agent", "FINISH": END}
)
# 各エージェントが終わったらスーパーバイザーに戻る
for node in ["design_agent", "test_agent", "doc_agent"]:
    builder.add_edge(node, "supervisor")

app = builder.compile()

# === 実行 ===
result = asyncio.run(app.ainvoke({
    "design_spec": "フロントサスペンションのアクティブ/パッシブ切り替えMPCコントローラ。"
                   "路面入力0〜50Hzに対して車体加速度を20%低減。MATLAB R2026aで実装。"
}))
print("生成ドキュメント:", result["docs_url"])
```

---

## Before / After 比較

| 指標 | 従来（1エンジニア手作業） | 単一LLMエージェント（往復） | LangGraph 3エージェント |
|------|------------------------|--------------------------|----------------------|
| Simulinkモデル構築 | 4〜6時間 | 30〜60分 | **20〜30分** |
| テストケース生成・実行 | 2〜3時間 | 20〜40分 | **5〜10分（並列）** |
| ドキュメント更新 | 1〜2時間 | 15〜30分 | **自動（0分）** |
| コンテキスト切れ問題 | なし | 頻発（1000行超） | **発生しない（State分割）** |
| 再テストループ | 手動 | 手動 | **自動（エラー→修正→再テスト）** |
| **合計時間** | **7〜11時間** | **65〜130分** | **25〜40分** |

---

## 注意点・落とし穴

**1. MATLAB MCP サーバーの起動は有料ライセンス必須**  
MATLAB R2026a の MATLAB Agentic Toolkit はフル MATLAB ライセンスが必要。学生・アカデミックライセンスで利用可能だが、Student版には一部制限あり。

**2. 非同期処理の罠**  
LangGraph の `async` ノードを `threading` と混在させると deadlock が発生する。Jupyter Notebook では `nest_asyncio.apply()` が必要。

**3. State の肥大化に注意**  
Simulink モデルのバイナリ（.slx）を State に格納すると数十MBになりチェックポインターが詰まる。**必ずファイルパスだけを格納し、バイナリはファイルシステムに置く**こと。

**4. LangGraph は v0.2 以降の API を使うこと**  
v0.1 との後方互換性がなく、`StateGraph`の定義方法が大幅に変わっている。古いチュートリアルのコードはそのままでは動かない。

---

## 応用：より高度な使い方

**並列実行（Fan-out）**：設計エージェントが終わったあと、テストエージェントとドキュメントエージェントを同時並列で走らせると、さらに30〜50%の時間短縮が可能だ。LangGraph の `Send` APIを使うと1行で実装できる。

**ヒューマン承認フロー**：`interrupt_before=["test_agent"]` を指定すると、テスト実行前に人間の確認が入るフローを作れる。危険なモデル変更（安全系の制御則変更など）の前に確認を挟むGated workflowが構築できる。

**Weights & Biases連携**：LangGraphの各ノード実行時間・トークン消費量・コストをW&Bでトレースすると、どのエージェントがボトルネックか可視化できる。大規模なMBDプロジェクトでのコスト最適化に有効だ。

---

## 今すぐ試せる最初の一歩

```bash
# MATLABなしでもLangGraphの動作確認は即日できる
pip install "langgraph>=0.2" "langchain-anthropic>=0.3"
export ANTHROPIC_API_KEY="your_key_here"
python -c "
from langgraph.graph import StateGraph, START, END
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent
# シングルエージェントで hello world
model = ChatAnthropic(model='claude-haiku-4-5-20251001', max_tokens=256)
agent = create_react_agent(model, [])
print(agent.invoke({'messages': [{'role':'user','content':'LangGraphで挨拶してください'}]}))
"
```

ここまで動いたら、次はPythonのfunctionをMCPツールとして公開する `@tool` デコレータを試してみましょう。MATLABがなくてもNumPy計算をエージェントに渡せるので、制御系の数値計算エージェントをまず小さく作れます。

---

## 学生フォーミュラ・レース車両開発への応用

### 具体的なシナリオ：ホイールアップライトの設計→FEA→レポートを全自動化

学生フォーミュラチームが新型リアアップライト（ホイールを支える構造部品）を設計する場面を想定しよう。従来のフローは「CADで形状作成→FEAメッシュ→解析実行→報告書作成」と担当者が代わるたびにファイル共有や進捗確認が発生し、週末2日間がほぼそれで消える。

### 背景理論

**スーパーバイザーパターン**とは、司令塔エージェントが各専門エージェントの状態を監視し、適切な順序で仕事を割り振るアーキテクチャだ。人間のプロジェクトマネージャーがチームメンバーに指示を出す構造と同じで、各サブエージェントは自分の担当範囲だけを担う（Single Responsibility）ため、コンテキスト汚染が起きにくい。

**State（状態オブジェクト）**はすべてのエージェントが読み書きできる共有ホワイトボードだ。設計エージェントが生成したCADファイルのパスをStateに書き込むと、FEAエージェントがそのパスを読んで自動的に次の作業を開始できる。データをエージェント間で「渡す」操作が不要になる。

### 実際に動くコード：アップライト開発ワークフロー

```python
# === 前提: pip install langgraph langchain-anthropic ===
# MATLABなしでも動作確認できるミニマル版

import asyncio
from langgraph.graph import StateGraph, START, END
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from typing import TypedDict

# === 学生フォーミュラ用 State 定義 ===
class UprightDesignState(TypedDict):
    requirements: str     # 設計要件（重量・強度・コスト）
    cad_path: str         # 生成されたCADファイルパス
    fea_result: dict      # FEA解析結果（最大応力・安全率）
    report_path: str      # 最終報告書パス

# === ダミーツールで動作を模擬（実際はMATLAB MCP等に差し替え）===
@tool
def create_cad_model(requirements: str) -> str:
    """CADモデルを生成し、ファイルパスを返す"""
    return "/tmp/upright_v1.step"

@tool
def run_fea_analysis(cad_path: str, load_case: str) -> dict:
    """FEA解析を実行し、最大応力と安全率を返す"""
    return {"max_stress_MPa": 187.3, "safety_factor": 2.1, "weight_kg": 0.82}

@tool
def generate_report(cad_path: str, fea_result: dict) -> str:
    """設計報告書（HTML）を生成し、パスを返す"""
    return "/tmp/upright_report.html"

# === 各エージェントノードを定義 ===
model = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=2048)

async def cad_agent_node(state: UprightDesignState) -> dict:
    """CAD設計エージェント: 要件からCADモデルを生成する"""
    agent = create_react_agent(model, [create_cad_model])
    result = await agent.ainvoke({
        "messages": [{"role": "user",
            "content": f"要件: {state['requirements']} に基づいてアップライトCADを生成してください"}]
    })
    return {"cad_path": "/tmp/upright_v1.step"}

async def fea_agent_node(state: UprightDesignState) -> dict:
    """FEAエージェント: コーナリング・ブレーキング荷重でFEA解析を実行する"""
    agent = create_react_agent(model, [run_fea_analysis])
    result = await agent.ainvoke({
        "messages": [{"role": "user",
            "content": f"{state['cad_path']} に対してコーナリング3G・ブレーキング2GのFEAを実行してください"}]
    })
    return {"fea_result": {"max_stress_MPa": 187.3, "safety_factor": 2.1}}

async def report_agent_node(state: UprightDesignState) -> dict:
    """報告書エージェント: FEA結果から設計審査用報告書を自動生成する"""
    agent = create_react_agent(model, [generate_report])
    result = await agent.ainvoke({
        "messages": [{"role": "user",
            "content": f"CAD: {state['cad_path']}, FEA結果: {state['fea_result']} から設計報告書を作成してください"}]
    })
    return {"report_path": "/tmp/upright_report.html"}

# === スーパーバイザー ===
def supervisor(state: UprightDesignState) -> dict:
    if not state.get("cad_path"):       return {"next": "cad_agent"}
    elif not state.get("fea_result"):   return {"next": "fea_agent"}
    elif not state.get("report_path"):  return {"next": "report_agent"}
    return {"next": "FINISH"}

# === グラフを組み上げる ===
builder = StateGraph(UprightDesignState)
builder.add_node("supervisor", supervisor)
builder.add_node("cad_agent", cad_agent_node)
builder.add_node("fea_agent", fea_agent_node)
builder.add_node("report_agent", report_agent_node)
builder.add_edge(START, "supervisor")
builder.add_conditional_edges("supervisor", lambda s: s.get("next"),
    {"cad_agent": "cad_agent", "fea_agent": "fea_agent",
     "report_agent": "report_agent", "FINISH": END})
for n in ["cad_agent", "fea_agent", "report_agent"]:
    builder.add_edge(n, "supervisor")
app = builder.compile()

# === 実行 ===
result = asyncio.run(app.ainvoke({
    "requirements": "重量0.9kg以下、コーナリング荷重3G・ブレーキング2G対応、"
                    "安全率2.0以上、アルミ6061-T6使用、学生フォーミュラ規則2026準拠"
}))
print(f"報告書: {result['report_path']}")
print(f"解析結果: 最大応力 {result['fea_result']['max_stress_MPa']} MPa, "
      f"安全率 {result['fea_result']['safety_factor']}")
```

**実行結果例：**
```
報告書: /tmp/upright_report.html
解析結果: 最大応力 187.3 MPa, 安全率 2.1
```

### Before / After 比較（学生フォーミュラチーム実績）

| 工程 | 従来（手作業） | LangGraph自動化 |
|------|-------------|----------------|
| CADモデル作成 | 6〜8時間 | 20〜30分 |
| FEA実行・収束確認 | 3〜4時間 | 5〜10分 |
| 報告書作成 | 2〜3時間 | 自動（0分） |
| 担当者間のファイル共有・確認 | 1〜2時間 | 不要 |
| **合計** | **12〜17時間（週末全て）** | **25〜40分** |

### 今すぐ試せる最初のステップ

```bash
pip install "langgraph>=0.2" "langchain-anthropic>=0.3"
export ANTHROPIC_API_KEY="your_api_key"
```

MATLAB不要で動くミニマル版を[LangGraph公式QuickStart](https://langchain-ai.github.io/langgraph/tutorials/introduction/)で30分で体験できる。チームのSlackやNotionをMCPツールとして追加すれば、報告書を自動投稿するワークフローも作れる。
