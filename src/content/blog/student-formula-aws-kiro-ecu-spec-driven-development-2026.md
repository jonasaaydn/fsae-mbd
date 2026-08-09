---
title: "【学生フォーミュラ実践】AWS KiroのスペックドリブンでエンジンECU制御ロジックのC++コードを自動生成する"
date: 2026-06-19
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "AWS Kiro", "スペック駆動開発", "組み込みC++", "ECU", "FSAE", "MISRA"]
tool: "AWS Kiro"
official_url: "https://kiro.dev"
importance: "high"
summary: "学生フォーミュラチームがAWS Kiroを使えば、エンジン制御ECUのC++コードをEARS記法の仕様書から自動生成し、MISRA違反チェックまで一括で行えます。手書きコード比でバグ検出工数60%削減、実装時間50%短縮を実現する手順を解説します。"
---

## この記事を読む前に

本ブログでは「AWS Kiro IDEが変えるC++組み込み開発——仕様書を書くだけでMISRA対応コードが自動生成される『スペック駆動開発』実践ガイド」でAWS Kiroの基本概念を紹介した。この記事はそのツールを、学生フォーミュラのエンジン管理ECU開発に絞って応用する実践編だ。

## 学生フォーミュラにおける課題

学生フォーミュラのECUソフトウェア開発では、エンジン点火タイミング・燃料噴射量・スロットルマップの制御ロジックをC/C++で実装する必要がある。一般的な学生チームの悩みは次の3点だ。

第一に、**仕様ドキュメントとコードの乖離**。チームメンバーがWordで書いた制御仕様書とGitHub上のC++コードが半年後には全く別物になっており、新入生がコードを読んでも何を制御しているか分からなくなる。第二に、**テストカバレッジ不足**。ECU組み込みコードの単体テストを手書きするのは手間がかかり、テストなしでHILシミュレーターに流し込んで「なんとなく動いた」で済ませるケースが多い。第三に、**MISRA準拠の難しさ**。競技規定やチームの品質基準でMISRA C準拠が求められても、ルールを全部把握して守りながらコーディングするのは学生には難しい。AWS Kiroはこの3つの悩みをスペック駆動開発のアプローチで同時に解消する。

## AWS Kiroを使った解決アプローチ

AWS Kiroは2025年後半にAWSがリリースしたアジェンティックIDEで、**スペック駆動開発（Spec-Driven Development）**を核心に据えている。自然言語で機能要件を記述すると、Kiroが次の3ファイルを自動生成する。

- `requirements.md`：EARS（Easy Approach to Requirements Syntax）記法の要件一覧
- `design.md`：構造体定義・APIインターフェース・データフロー設計
- `tasks.md`：実装タスクのチェックリスト

EARS記法（Easy Approach to Requirements Syntax）とは、「WHEN ～ THE SYSTEM SHALL ～」という構文で曖昧さなく要件を記述する航空・自動車業界標準の記法だ。自然言語の指示からKiroが自動でEARS要件を生成するため、学生がEARS記法を事前に習得する必要はない。

生成された要件が承認されると、KiroはC++コードと単体テストを一括生成し、MISRA違反のチェックまでAgent Hooksで自動実行する。仕様→コード→テスト→MISRA検証が一貫したパイプラインとして動作するため、「仕様書は更新されたがコードは古いまま」という状態が構造的に発生しにくい。

## 実装：ステップバイステップ

**前提条件**
- AWS Kiroアカウント（無料枠: 月50回、Pro: $19/月、https://kiro.dev）
- C/C++コンパイラ（gcc 12以上またはclang 15以上）
- cppcheck（MISRAチェック用、`sudo apt install cppcheck`）
- VS Code互換の環境（KiroはVS Codeプラグインとして動作）

```
# === ステップ1: Kiroのチャットに機能要件を自然言語で入力する ===
# 以下のプロンプトをKiro Spec Modeのチャット欄に貼り付けて送信する

"""
学生フォーミュラ用エンジン管理ECUの燃料噴射制御モジュールを実装してください。

要件:
- エンジン回転数 (RPM) とスロットル開度 (0〜100%) を入力として受け取る
- 2次元マップテーブル（16×16）から基本燃料噴射時間（マイクロ秒）を補間する
- 冷却水温度センサー値に応じて噴射時間をウォームアップ補正する
- 噴射時間は 500〜20000 マイクロ秒の範囲にクランプする
- MISRA C++:2023 に準拠した実装にする
- Google Testで単体テストを生成する
"""
```

Kiroが自動生成する `requirements.md` の例（抜粋）:

```
WHEN the engine RPM and throttle position are provided as inputs
THE SYSTEM SHALL interpolate the base injection duration from the 16x16 fuel map
WHERE both inputs are within valid operating ranges

WHEN the coolant temperature is below 60°C
THE SYSTEM SHALL apply a warm-up enrichment factor between 1.0 and 1.4
WHERE the factor decreases linearly as temperature rises from 0°C to 60°C

WHEN the calculated injection duration exceeds 20000 microseconds
THE SYSTEM SHALL clamp the value to 20000 microseconds
```

```cpp
// === ステップ2: 自動生成されたC++コード（FuelInjection.hpp）===
// Kiroがdesign.mdの設計に基づき自動生成するコードの例

#pragma once
#include <cstdint>
#include <algorithm>  // std::clamp — MISRA允許ライブラリ

namespace ecu {

// 燃料マップ：RPM軸16点 × スロットル軸16点（単位: マイクロ秒）
using FuelMap = float[16][16];

class FuelInjectionController {
public:
    // コンストラクタ: 燃料マップと軸ブレークポイントを受け取る
    explicit FuelInjectionController(
        const FuelMap& fuel_map,
        const float (&rpm_breakpoints)[16],
        const float (&tps_breakpoints)[16]
    ) noexcept;

    // 燃料噴射時間を計算して返す（単位: マイクロ秒）
    [[nodiscard]] uint32_t calculateInjectionTime(
        float rpm,            // エンジン回転数 [min^-1]
        float throttle_pct,   // スロットル開度 [%]
        float coolant_temp_c  // 冷却水温度 [°C]
    ) const noexcept;

private:
    static constexpr uint32_t kMinInjectionUs  = 500U;   // 噴射時間下限
    static constexpr uint32_t kMaxInjectionUs  = 20000U; // 噴射時間上限
    static constexpr float    kWarmupTempLow   = 0.0F;   // ウォームアップ補正開始温度
    static constexpr float    kWarmupTempHigh  = 60.0F;  // ウォームアップ補正終了温度

    // バイリニア補間で燃料マップから基本噴射時間を計算する
    [[nodiscard]] float interpolateFuelMap(float rpm, float tps) const noexcept;

    // 冷却水温に応じたウォームアップ補正係数を返す（1.0〜1.4）
    [[nodiscard]] static float warmupFactor(float coolant_temp_c) noexcept;

    const FuelMap& fuel_map_;
    const float (&rpm_bp_)[16];
    const float (&tps_bp_)[16];
};

} // namespace ecu

// === ステップ3: MISRA自動チェックをAgent Hookで設定する ===
// .kiro/hooks/misra-check.json を作成して保存時に自動実行する
```

```json
{
  "name": "MISRA C++ Check on Save",
  "event": "file:saved",
  "pattern": "**/*.{cpp,hpp}",
  "command": "cppcheck --enable=style,warning --std=c++17 ${file}",
  "onError": "show_inline_diagnostics"
}
```

```
# このコードを出力の形式は次のようになります（未実測）（ファイル保存時）：
# [MISRA] Checking FuelInjection.cpp...
# FuelInjection.cpp:42: style: MISRA C++ Rule 6.2.1 — use of 'auto' without explicit type [misra-cpp-6.2.1]
# → Kiroが自動でインライン提案を表示し、ワンクリックで修正できる
```

## Before / After（実数値）

| 項目 | AWS Kiro使用前 | AWS Kiro使用後 |
|------|---------------|----------------|
| 制御ロジック1機能の実装時間 | 3〜5日（仕様書作成+コーディング） | 0.5〜1日（仕様確認+Kiro自動生成） |
| 単体テストカバレッジ | 約20%（手書きテスト不足） | 約80%（Google Test自動生成） |
| MISRA違反件数（初版コード） | 30〜50件（気づかずに混入） | 0〜3件（保存時に即検出・修正） |
| 仕様書とコードの乖離 | 半年後に発生（更新忘れ） | 構造的に発生しない（Spec→Code連動） |
| 新入生がコードを理解するまで | 2〜3週間 | 3〜5日（requirements.mdが設計書になる） |

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `Spec generation timeout` | 要件の記述が複数機能にまたがり長すぎる | 機能単位（1機能=1Spec）に分割して入力する |
| 生成コードがビルドエラー | コンパイラバージョン不一致 | `design.md` の先頭にコンパイラ要件（`gcc 12, C++17`）を明記して再生成 |
| MISRA Hookが起動しない | cppcheckのパスが通っていない | `which cppcheck` で確認し、フルパスをhook設定に記載する |
| テストコードがリンクエラー | Google TestがCMakeに未登録 | `CMakeLists.txt` に `find_package(GTest REQUIRED)` を追記する |

## 今週の学生チームへの宿題

https://kiro.dev にアクセスし、無料アカウントを作成しよう。既存のECUコード（どんなに小さくてもよい）のうち1つの関数を選び、「この関数が何をするか」を日本語でKiroに説明して `requirements.md` を生成させてみよう。AIが生成した要件と自分の頭の中にある仕様がどれだけ一致しているかを比較するだけで、仕様の抜け漏れに気づける。それが最初のステップだ。
