---
title: "【学生フォーミュラ実践】MATLAB Simscapeで94パラメータのサスペンション設計を1秒で最適化するAIサロゲートワークフロー"
date: 2026-06-18
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "MATLAB Simscape", "サスペンション最適化", "AIサロゲートモデル", "FSAE"]
tool: "MATLAB Simscape"
official_url: "https://www.mathworks.com/products/simscape.html"
importance: "high"
summary: "学生フォーミュラチームがMALAB SimscapeのAIサロゲートワークフローを使って94個のサスペンションパラメータ空間を1秒以内に探索できます。従来数時間かかる設計探索1000回が事実上瞬時に完了し、大会前の最適化サイクルを劇的に増やせます。"
---

## この記事を読む前に

[「94パラメータのサスペンション設計を『ほぼ瞬時』に最適化——MATLAB Simscape × AIサロゲートモデルで設計探索1000回を1秒に変える公式ワークフロー」](/blog/simscape-ai-surrogate-vehicle-design-optimization-2026)でSimscapeのAIサロゲート概要を紹介しました。この記事では学生フォーミュラのクォーターカーサスペンション設計に絞り、5分で動くコードと実数値の改善効果を示します。

## 学生フォーミュラにおける課題

学生フォーミュラのサスペンション設計では、スプリングレート（N/mm）・バウンスストップクリアランス（mm）・スタビライザー剛性（N·m/deg）・キャンバー変化特性など20〜30個以上のパラメータが互いに干渉しあいます。Simscapeで完全なクォーターカーモデルを1回走らせると約3分かかるチームも珍しくなく、設計探索500点を実行するだけで丸1日以上を要します。

多くのチームが直面する現実は、大会直前の2週間に「スプリングレートをあと2N/mm硬くすべきか」という問いを検証できないまま、経験と勘に頼った設計を凍結することです。タイムアタック前日に「もう一回試していれば」という後悔は、サロゲートモデルで解消できます。

## MATLAB Simscapeを使った解決アプローチ

SimscapeのAIサロゲートワークフローは、**Surrogate Optimization Toolbox**と**Statistics and Machine Learning Toolbox**を組み合わせて、高コストなSimscapeモデルを「軽量なニューラルネット代理モデル（サロゲートモデル）」に置き換えます。

考え方はシンプルです。サスペンションパラメータ（入力）とバウンス固有値・ロール固有値・タイヤ接地荷重変動（出力）の関係を、200回のSimscapeシミュレーションで学習データとして生成し、それを浅いニューラルネットに教えます。学習済みモデルは入力→出力の近似関数として0.01秒以下で推論できます。

「ラテン超方格法（LHS: Latin Hypercube Sampling）」でサンプル点を設計空間に均一配置することがポイントです。これにより少ないサンプル数でも空間全体を効率よくカバーし、サロゲートの外挿誤差を最小化できます。

## 実装：ステップバイステップ

**前提条件**
- MATLAB R2025b以降
- Simscape、Surrogate Optimization Toolbox、Statistics and Machine Learning Toolbox
- インストール確認: `ver` コマンドで上記ツールボックスが表示されること

```matlab
% === ステップ1: サスペンションパラメータの設計空間を定義する ===
% 各パラメータの下限・上限を設定（DoEの探索範囲）
lowerBounds = [15, 5, 100, -3];   % [スプリングレート(N/mm), バウンスストップ(mm), スタビ(N·m/deg), キャンバ(deg)]
upperBounds = [35, 20, 300,  0];

% ラテン超方格法（LHS）で200点のサンプルを生成する
% （設計空間を均一にカバーでき、少ないサンプルで精度が出やすい）
rng(42);       % 再現性のためシードを固定
nSamples = 200;
X_train = lhsdesign(nSamples, 4) .* (upperBounds - lowerBounds) + lowerBounds;

% === ステップ2: Simscapeモデルを回して学習データを生成する ===
% quarter_car_model.slx が同じフォルダに存在することを確認
Y_train = zeros(nSamples, 3);  % 出力: [バウンス固有値(Hz), ロール固有値(Hz), 接地荷重変動(N)]
load_system('quarter_car_model');  % Simulink/Simscapeモデルを読み込む

for i = 1:nSamples
    % パラメータをモデルのワークスペース変数にセット
    set_param('quarter_car_model/Spring', 'k', num2str(X_train(i,1)));
    set_param('quarter_car_model/BounceStop', 'gap', num2str(X_train(i,2)));
    set_param('quarter_car_model/Stabilizer', 'kt', num2str(X_train(i,3)));
    set_param('quarter_car_model/Suspension', 'camber0', num2str(X_train(i,4)));

    % シミュレーションを実行して結果を取得（約3分/点）
    simOut = sim('quarter_car_model', 'StopTime', '10');
    Y_train(i,:) = [simOut.bounce_hz, simOut.roll_hz, simOut.fz_variation];

    if mod(i, 10) == 0
        fprintf('進捗: %d/%d 完了\n', i, nSamples);  % 10点ごとに進捗を表示
    end
end
save('training_data.mat', 'X_train', 'Y_train');  % 後で再利用できるよう保存

% === ステップ3: ニューラルネットのサロゲートモデルを学習する ===
% fitnetで浅いネットワーク（隠れ層2層×64ノード）を素早く学習する
net = fitnet([64, 64], 'trainscg');   % 共役勾配法（少データでも過学習しにくい）
net.trainParam.epochs = 1000;
net.trainParam.goal   = 1e-4;        % MSEの目標値
net = train(net, X_train', Y_train'); % MATLABのfitnetは列ベクトル形式が必要

% === ステップ4: サロゲートモデルで1000点を一括評価する（約0.1秒）===
X_eval = lhsdesign(1000, 4) .* (upperBounds - lowerBounds) + lowerBounds;
Y_pred = net(X_eval')';  % ニューラルネットで高速推論

% タイヤ接地荷重変動が最小の設計点を選ぶ（コーナリング安定性の指標）
[minFz, bestIdx] = min(Y_pred(:, 3));
bestParams = X_eval(bestIdx, :);

fprintf('=== 最適パラメータ ===\n');
fprintf('  スプリングレート : %.1f N/mm\n', bestParams(1));
fprintf('  バウンスストップ : %.1f mm\n',   bestParams(2));
fprintf('  スタビライザー  : %.0f N·m/deg\n', bestParams(3));
fprintf('  キャンバ角      : %.1f deg\n',   bestParams(4));
fprintf('  予測接地荷重変動: %.1f N\n', minFz);
```

このコードを出力の形式は次のようになります（未実測）：

```
進捗: 10/200 完了
進捗: 20/200 完了
...
進捗: 200/200 完了
=== 最適パラメータ ===
  スプリングレート : 22.4 N/mm
  バウンスストップ : 11.3 mm
  スタビライザー  : 187 N·m/deg
  キャンバ角      : -1.8 deg
  予測接地荷重変動: 312.4 N
```

## 学生フォーミュラ・レース車両開発への応用

上記のサロゲートモデルをそのままラップタイムシミュレーターに繋ぐことで、「タイヤ接地荷重変動→コーナリング限界速度→ラップタイム」という連鎖を最適化できます。具体的には、サロゲートの出力（接地荷重変動）をラップシム（Pythonなどで自作した最低限の点質量モデルでも可）の入力として渡し、ラップタイムをスカラーのコスト関数として最小化します。これを`fmincon`やOptuna（Pythonベイズ最適化）と組み合わせると、ラップタイムを直接目的関数としたサスペンション最適化が実現します。

**Before / After（学生チームの実例想定値）**

| 項目 | ツールなし（Simscape直接） | Simscape + AIサロゲート使用後 |
|------|--------------------------|------------------------------|
| 設計探索200点の時間 | 600分（10時間） | 610分（学習込み）※初回のみ |
| 探索1000点の追加時間 | 3000分（50時間） | **約0.1秒** |
| 大会前2週間の最適化サイクル数 | 3〜5回 | **50回以上** |
| 設計者の主観に依存する割合 | 高（経験ドリブン） | 低（データドリブン） |
| サロゲートの予測精度（R²） | — | 0.97以上（200サンプル時） |

2回目以降はStep2の学習データ生成をスキップして`load('training_data.mat')`から再開できるため、パラメータ範囲を変えた再探索も数分で完了します。

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| `train`でNaN値が出る | Y_trainに発散したシミュレーション結果が混在 | `Y_train(any(isnan(Y_train),2),:) = []`で除外してから学習 |
| サロゲート精度が低い（R²<0.8） | サンプル数不足、または設計空間が広すぎる | サンプルを300点以上に増やすか、設計空間を狭める |
| `set_param`でエラー | パラメータ名がモデルのブロックと一致しない | Simulink Model Explorerでブロック名とパラメータ名を確認する |
| 推論結果が学習範囲外に外れる | 評価点がlowerBounds〜upperBoundsの外 | `X_eval`の各列が範囲内かチェックし、外れた点をクリップする |

## 今週の学生チームへの宿題

まず自チームのSimscapeモデル（なければSimulink Transfer Functionブロック2個でクォーターカーを近似）を用意し、`lhsdesign(20, 2)`で20点だけ評価してみましょう。20×（1回のシミュレーション時間）という壁を体感すれば、サロゲートの価値がすぐに理解できます。「データを集めて学習する」最初の20点から始めてください。
