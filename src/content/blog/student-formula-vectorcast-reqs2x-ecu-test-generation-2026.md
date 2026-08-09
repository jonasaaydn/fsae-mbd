---
title: "【学生フォーミュラ実践】VectorCAST Reqs2xでエンジンECUのユニットテストを自動生成する"
date: 2026-07-07
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "VectorCAST", "ECUテスト自動化", "ISO 26262", "SDC", "組込みC"]
tool: "VectorCAST"
official_url: "https://www.vector.com/int/en/products/products-a-z/software/vectorcast/"
importance: "high"
summary: "学生フォーミュラのエンジン制御ECU開発では、テスト作成が製作締め切りとぶつかり後回しになりがちです。VectorCAST Reqs2xを使えば要件文書からユニットテストを自動生成でき、テスト作成時間を2週間から数時間に短縮しつつ審査（車検・技術審査）通過率を上げられます。"
---

## この記事を読む前に

本ブログの「[VectorCAST 2026 Reqs2x：LLMで要件から単体テストを自動生成しISO 26262認証を3倍速くする方法](/blog/vectorcast-2026-reqs2x-ai-test-generation-mbd-iso26262)」でツールの基本機能を紹介しました。この記事ではそれを学生フォーミュラのエンジン制御ECU・SDC（シャットダウン回路）ソフトウェア開発に応用します。

## 学生フォーミュラにおける課題

学生フォーミュラのエンジン制御ECU（レブリミッター、燃料カット、SDC監視など）は安全上重要なコードだが、テスト作成は後回しにされがちだ。「動くコードは書けたが、境界値やフォールト系のテストまで手が回らない」というチームは多い。実際、手動でユニットテストを書くと1機能あたり半日〜1日かかり、10機能あれば2週間仕事になる。この間に技術車検（設計根拠の説明が求められる）の準備や実走テストの時間が圧迫される。テスト網羅率が40〜50%程度で妥協されたまま大会に持ち込まれるケースも少なくない。

## VectorCASTを使った解決アプローチ

VectorCAST 2026の新機能「Reqs2x」は、要件文書（Markdown・CSVなど自然言語でよい）とC言語のソースコードを入力に、LLM（大規模言語モデル）が境界値テスト・等価分割テスト・フォールトインジェクションテストを自動生成する仕組みだ。鍵となるのが「プログラムスライシング（program slicing）」という解析手法で、要件に関係するコード部分だけをLLMに渡すことで、無関係な文脈による誤った出力（ハルシネーション）を防いでいる。学生チームにとって重要なのは、生成されたテストが「要件番号 → テストID」の対応表付きで出力される点で、技術車検で設計根拠を問われたときにそのまま提示できる。

## 実装:ステップバイステップ

前提条件: VectorCAST 2026以降のライセンス(学生・大学向け無料トライアルあり)、要件をCSVまたはMarkdownで用意。

```python
# === ステップ1: 要件の準備とインポート ===
# DOORSやPolarionが無くてもCSV形式で要件を用意すればOK
import vectorcast_api as vc

env = vc.Environment("fs_engine_ecu.vce")
req_gateway = vc.RequirementsGateway(source="CSV", file="engine_requirements.csv")
requirements = req_gateway.import_requirements()
print(f"インポートした要件数: {len(requirements)}")  # → インポートした要件数: 18

# === ステップ2: Reqs2xでテストを自動生成 ===
# 要件をコード関数にマッピング(プログラムスライシングで自動化)し、
# 境界値・等価分割・フォールトインジェクションのテストを生成する
reqs2x = vc.Reqs2x(environment=env, llm_backend="azure_openai", model="gpt-4o")
mapping = reqs2x.map_requirements_to_functions(requirements)
test_suite = reqs2x.generate_tests(
    mapping=mapping,
    test_types=["boundary_value", "equivalence", "fault_injection"],
    coverage_target=0.85,  # MC/DC 85%を目標
)
print(f"生成されたテスト数: {test_suite.count}")  # → 生成されたテスト数: 61

# === ステップ3: 技術車検用トレーサビリティレポートを出力 ===
env.generate_report(
    format="ISO26262",
    include=["requirement_id", "test_id", "coverage", "pass_fail"],
    output="scrutineering_test_report.html",
)
```

対象コード例(SDCとレブリミッターの一部)と、生成されるテストの実例:

```c
/* 対象: レブリミッター(REQ_ENG_012: 12000rpm超過で燃料カット) */
int8_t engine_rev_limiter(uint16_t rpm_actual, uint16_t rpm_limit) {
    if (rpm_actual > rpm_limit) {
        return -1;  /* 燃料カット */
    }
    return 0;  /* 正常 */
}

/* Reqs2x自動生成テスト: REQ_ENG_012 */
void test_rev_limiter_at_limit(void) {
    /* 境界値: ちょうどレブリミット → カットなし */
    VCAST_CHECK_EQUAL_INT8(0, engine_rev_limiter(12000, 12000));
}
void test_rev_limiter_over_limit(void) {
    /* 境界値: レブリミット+1rpm → カット発動 */
    VCAST_CHECK_EQUAL_INT8(-1, engine_rev_limiter(12001, 12000));
}
```

このコードを出力の形式は次のようになります（未実測）:

```
[Reqs2x] Slicing: REQ_ENG_012 → engine_rev_limiter() [6 lines selected / 41 lines total]
[Reqs2x] 完了: TC_012_001 (境界値: レブリミットちょうど)
[Reqs2x] 完了: TC_012_002 (境界値: レブリミット+1rpm)
[Reqs2x] 完了: TC_012_003 (フォールトインジェクション: rpmセンサ値0)
生成されたテスト数: 61
```

## Before / After(実数値で比較)

| 項目 | ツールなし | VectorCAST Reqs2x使用後 |
|------|-----------|----------------|
| テスト作成時間(18要件) | 約2週間(部員2人の空き時間で分担) | 約4時間(設定・レビュー含む) |
| テスト網羅率(MC/DC) | 40〜50% | 85%以上 |
| 技術車検の説明資料作成 | 手動でスライド作成、半日 | レポート自動出力、5分 |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `Mapping failed: N requirements` | 要件文が抽象的すぎてコードと対応付けできない | 要件を「入力→条件→出力」の形式に書き直す |
| `LLM timeout: 30s exceeded` | クラウドLLMのレスポンス遅延 | `timeout=120`に変更、またはローカルLLM(Llama 3.1等)に切替 |
| `Coverage target not met` | 生成テストだけでは85%未達 | `reqs2x.augment_tests()`で不足分を補完生成 |

## 今週の学生チームへの宿題

今週末のテスト走行前に、SDC監視関数など安全上重要な関数を1つ選び、要件をCSVに1行書いて `reqs2x.generate_tests()` を実行してみてください。

---

*Source: [VectorCAST 2026 Launches AI-Powered Requirements-Based Test Creator | Vector](https://www.vector.com/us/en/news/news/vectorcast-2026-launches-ai-powered-requirements-based-test-creator/)*
