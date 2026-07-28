---
title: "MCPステートレス化が今日始まる：2026-07-28仕様でMATLAB Agentコードが壊れる3変更と移行手順"
date: 2026-07-28
category: "AI Coding"
tags: ["MCP", "AI Agent", "MATLAB", "Simulink", "stateless", "OAuth", "agentic AI"]
tool: "MCP (Model Context Protocol)"
official_url: "https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/"
importance: "high"
summary: "2026年7月28日、MCPの史上最大規模仕様更新が正式公開された。セッション廃止・ハンドシェイク全削除・OAuth 2.1統合の3つの破壊的変更は、MATLAB MCPサーバーを使うMBDエージェントに直接影響する。今日から動かなくなるコードがある。移行手順と確認スクリプトを完全解説。"
---

## はじめに

今日（2026年7月28日）、Model Context Protocol（MCP）の最大規模アップデートが正式公開された。

「仕様更新」と聞いて「また後で読もう」と思った人に伝えたい。**今回は違う。** MCP 2026-07-28は過去の全バージョンと非互換な破壊的変更を含んでおり、MATLAB MCPサーバーに接続するClaudeエージェント・Gemini CLI・Google Antigravity等のMBDワークフローが今日から応答しなくなる可能性がある。

具体的に何が変わったのか、MATLAB MCPサーバーへの影響はどこか、今すぐ何をすればよいかを解説する。

---

## MCP 2026-07-28 とは

Model Context Protocol（MCP）は、AIエージェントが外部ツール（MATLAB・Simulink・OpenFOAM等）を標準的なAPIで呼び出すための通信プロトコルだ。Anthropicが2024年11月にオープンソース化し、現在はMathWorksがMATLAB MCP Server、MicroSoftがMicrosoft Agent Frameworkでネイティブサポートするなど、エンジニアリングAIの標準インフラとなっている。

2026-07-28 仕様（正式名: "MCP Specification 2026-07-28"）は、2025-11-25仕様以来最大の改訂で、開発コア陣が「ルーティン版番号アップではなく成熟のマイルストーン」と説明するほどの内容だ。

**出典**: [The 2026-07-28 MCP Specification Release Candidate — Model Context Protocol Blog](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)

---

## 3つの破壊的変更とMATLABへの影響

### 変更1: セッションレスアーキテクチャ（最重要）

**旧仕様**: 各クライアントが`Mcp-Session-Id`ヘッダーで特定サーバーインスタンスに固定接続。initializeメッセージが最初に来ることを前提にサーバーが設計されていた。

**新仕様**: セッション概念がプロトコル層から完全削除。`Mcp-Session-Id`ヘッダーは消え、任意のリクエストが任意のサーバーインスタンスに到達できる。

**MATLAB MCP Server への影響**: MathWorksのMATLAB MCP Serverが内部でセッション状態（ワークスペース変数・開いているモデル等）を`Mcp-Session-Id`でトラッキングしていた場合、新仕様クライアントからの接続で状態不整合が起きる。MathWorksの公式SDKアップデートを確認すること。

### 変更2: initializeハンドシェイクの完全削除

**旧仕様**: 接続確立時に`initialize`→`initialized`の2ステップハンドシェイクが必須だった。

**新仕様**: ハンドシェイク廃止。クライアント情報・プロトコルバージョン・ケイパビリティは各リクエストの`_meta`フィールドで送付する。

```python
# 旧仕様（2025-11-25）: initializeが必要だった
async def old_style_connect(client):
    await client.initialize()   # ← これが不要になった
    result = await client.call_tool("matlab_eval", {"code": "a = 1+1"})
    return result

# 新仕様（2026-07-28）: いきなりツール呼び出し可能
async def new_style_connect(client):
    # _metaは各リクエストに自動付与（SDK側で処理）
    result = await client.call_tool("matlab_eval", {"code": "a = 1+1"})
    return result
```

### 変更3: OAuth 2.1 / OpenID Connect の整合

**旧仕様**: 認証は各実装が独自に処理。

**新仕様**: OAuth 2.1とOpenID Connectに準拠した6つのSEP（Specification Enhancement Proposal）が取り込まれ、エンタープライズグレードの認証フローを標準化。

**影響**: GitHub Actionsや企業CIでMATLABライセンスを使うMCPサーバーは、認証フローの再設計が必要になる場合がある。

---

## Before / After 比較

| 項目 | 旧仕様（2025-11-25） | 新仕様（2026-07-28） |
|------|------------------|------------------|
| セッション管理 | Mcp-Session-Id必須 | 不要（廃止） |
| 接続開始 | initialize/initialized | なし（即ツール呼び出し） |
| スケーリング | スティッキーセッション必要 | ラウンドロビンLB対応 |
| 認証 | 実装依存 | OAuth 2.1 / OIDC準拠 |
| 長時間タスク | 非対応（実験的） | Tasks拡張（正式） |
| サーバーUI | なし | MCP Apps（正式） |
| 後方互換 | N/A | 旧クライアントと非互換 |

---

## 実践コード：MATLAB MCPサーバーの疎通確認スクリプト

以下のPythonスクリプトで、手持ちのMATLAB MCPサーバーが新仕様に対応しているか確認できる。

**前提条件**: Python 3.10以上、`mcp` パッケージ v0.9.0以上（`pip install "mcp>=0.9.0"`）

```python
# === MCP 2026-07-28 互換性チェッカー ===
# 使い方: python check_mcp_compat.py

import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def check_matlab_mcp_server():
    """MATLAB MCPサーバーの新仕様対応チェック"""
    
    # MATLAB MCPサーバーへの接続パラメータ
    server_params = StdioServerParameters(
        command="matlab",
        args=["-batch", "mcp_server_start"],  # MathWorks公式起動コマンド
    )
    
    async with stdio_client(server_params) as (read, write):
        # 新仕様: initializeを呼ばずにいきなりセッション開始
        async with ClientSession(read, write) as session:
            # initialize を呼ばない（新仕様ではオプション扱いに変更）
            # 旧SDKだとここで "initialize" を呼んでいた

            # ツール一覧を取得してサーバーが応答するか確認
            try:
                tools = await session.list_tools()
                print(f"✅ 接続成功: {len(tools.tools)} ツールを検出")
                for tool in tools.tools:
                    print(f"   - {tool.name}: {tool.description[:50]}...")
            except Exception as e:
                print(f"❌ 接続失敗: {e}")
                print("   → MATLAB MCP Serverのバージョン確認が必要です")
                print("   → MathWorks公式サイトで最新アップデートを確認してください")

if __name__ == "__main__":
    asyncio.run(check_matlab_mcp_server())
```

**実行結果の例（正常時）**:
```
✅ 接続成功: 23 ツールを検出
   - matlab_eval: MATLABコードを実行し結果を返す...
   - simulink_open: Simulinkモデルを開く...
   - matlab_workspace_get: ワークスペース変数を取得する...
```

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `ConnectionRefusedError` | MATLABが起動していない | `matlab -batch "mcp_server_start"` を実行 |
| `ProtocolError: version mismatch` | MCPライブラリが古い | `pip install --upgrade "mcp>=0.9.0"` |
| `AttributeError: initialize` | 旧SDK側がinitializeを強制 | SDK側をv0.9.0以上に更新 |

---

## 注意点・落とし穴

**Tasks拡張の移行**: 2025-11-25の実験的Tasks APIを使っていた場合、新仕様のTasksExtensionへの移行が必要。旧APIのエンドポイントは削除されている。

**Roots・Sampling・MCP Loggingの非推奨化**: これら3機能は今後廃止予定で、代替が提供される。すでに使っている場合は公式の`@deprecated`注記を確認すること。

**ライセンス制約**: MCP SDK自体はMITライセンスだが、MathWorksのMATLAB MCP Serverを利用するにはMATLAB R2026a以降のライセンスが必要。MATLABエンジン不要のStandaloneモードで一部ツールは無料で試せる。

---

## 応用：より高度な使い方

新仕様のTasksExtensionを使うと、従来は難しかった「Simulinkモデルの長時間シミュレーションをMCPエージェントから非同期実行する」ワークフローが組める。

```python
# Tasks拡張で長時間シミュレーションを非同期実行する
from mcp.extensions import tasks

async def run_long_simulation(session, model_path):
    """10分かかるSimulinkモデルをバックグラウンドで実行"""
    task = await session.create_task(
        tool_name="simulink_run",
        arguments={"model": model_path, "stop_time": 600},
    )
    print(f"タスクID: {task.id} で実行開始")
    
    # 完了を待たずに別の処理が可能（非同期）
    return task.id
```

さらに、MCP Appsを使えばSimulinkモデルの状態をWebUIでリアルタイム表示するツールも構築できる。

---

## 今すぐ試せる最初の一歩

```bash
# 1. MCPライブラリを最新に更新
pip install --upgrade "mcp>=0.9.0"

# 2. 現在のバージョン確認
python -c "import mcp; print(mcp.__version__)"

# 3. 互換性チェックスクリプトを実行（上記コード参照）
python check_mcp_compat.py
```

新仕様への対応は今日から始まっている。まずはMCPライブラリのバージョン更新から始めよう。

---

## 学生フォーミュラ・レース車両開発への応用

### シナリオ：チーム内MCPエージェントのアップデート

学生フォーミュラチームがMATLAB MCP Server経由でClaudeを使い、サスペンションキネマティクスの自動最適化ループを構築していたとする。MCP 2026-07-28以降、このシステムは以下の影響を受ける。

**背景理論**: MCPはAIエージェントとツール（MATLAB等）間の「会話プロトコル」だ。HTTP/RESTと同様に、バージョン非互換が起きるとリクエストがエラーになる。ステートレス化により、今後は複数のエージェントが同じMATLAB MCPサーバーに同時接続して並列シミュレーションを実行できるようになる。

**実際に試せる移行確認手順**:

```python
# チームエージェント移行チェック（学生フォーミュラ向け）
# ファイル名: check_team_mcp.py

import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SUSPENSION_CHECK_CODE = """
% サスペンションキネマティクス簡易チェック
wheel_travel = linspace(-50, 50, 100);  % mm
camber_change = wheel_travel * 0.05;   % 度/mm (仮定値)
fprintf('最大キャンバー変化: %.2f度\\n', max(abs(camber_change)));
"""

async def main():
    server_params = StdioServerParameters(
        command="matlab", args=["-batch", "mcp_server_start"]
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # 新仕様: initializeなしで直接実行
            result = await session.call_tool(
                "matlab_eval",
                {"code": SUSPENSION_CHECK_CODE}
            )
            print("サスペンションチェック結果:", result.content[0].text)

asyncio.run(main())
```

**Before / After 数値比較**:

| 指標 | 旧仕様（スティッキーセッション） | 新仕様（ステートレス） |
|------|--------------------------|----------------|
| 同時接続エージェント数 | 1（セッション競合） | 制限なし |
| サーバー再起動後の復帰 | 手動再接続必要 | 自動（次リクエストで再接続） |
| CI/CD組み込み | 難（状態管理複雑） | 容易（各リクエスト独立） |
| セキュリティ | 独自実装 | OAuth 2.1準拠 |

**学生チームが今すぐ試せる最初のステップ**: 上記の `check_team_mcp.py` をチームのリポジトリに追加し、GitHub Actionsで毎晩実行して「MCPサーバーが正常動作しているか」を自動監視する仕組みを作ろう。これだけでエージェントシステムの可用性が大幅に向上する。
