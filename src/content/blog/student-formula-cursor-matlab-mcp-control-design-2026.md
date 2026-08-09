---
title: "【学生フォーミュラ実践】Cursor × MATLAB MCPでトラクションコントロール制御則を会話しながら設計する"
date: 2026-05-22
category: "Race Engineering Use Cases"
tags: ["学生フォーミュラ", "Cursor", "MATLAB MCP", "トラクションコントロール", "制御設計", "PID"]
tool: "Cursor"
official_url: "https://www.cursor.com"
importance: "high"
summary: "「PID制御は分かるけど、MATLABで実装する方法が分からない」という学生チームが、CursorとMATLAB MCPサーバーを繋ぐと自然言語でトラクションコントロールの制御則を設計・シミュレーションできます。制御理論の基礎とMATLAB実装を同時に学べる実践手順を解説します。"
---

## この記事を読む前に

本ブログの「[CursorとMATLAB MCPサーバーを繋げる](/blog/cursor-matlab-mcp-server-mbd-workflow-2026/)」でセットアップ手順を紹介しました。この記事ではそれを**学生フォーミュラのトラクションコントロール制御則設計**に応用します。

---

## 学生フォーミュラにおける課題

電動フォーミュラ（EV）クラスに参加するチームが直面する典型的な課題があります。

「後輪が空転してタイムをロスしている。トラクションコントロール（TCS）を実装したいが、制御理論は授業で習ったものの、実際にMATLABでどう書けばいいか分からない」

TCSの基本は「タイヤのスリップ率（slip ratio）を目標値以下に保つようにモーター出力を絞る」制御です。理論は単純ですが、MATLABで書こうとすると「スリップ率の計算方法」「PIDゲインの決め方」「Simulinkへの組み込み方」でつまずく学生が多くいます。

Cursor + MATLAB MCPを使うと、「トラクションコントロールを作りたい」と入力するだけでMATLABコードが生成・実行され、ゲイン調整もチャットで対話しながら進められます。

---

## Cursor × MATLAB MCPを使った解決アプローチ

Cursor（AIコードエディタ）にMATLAB MCPサーバーを接続すると、CursorのチャットからMATLABを**直接制御**できます。「このコードを実行して」と言えばMATLABが動き、「結果がこうだったので〇〇に変えて」と追加すれば修正コードが自動生成されます。

なぜこれが有効かというと、**制御設計は「試行錯誤」が本質**だからです。

PIDゲインの調整は教科書の公式だけでは決まらず、シミュレーションと調整を何度も繰り返す必要があります。Cursor + MATLABではこのサイクルが「チャットで1文送る→自動実行→結果確認」の3秒に短縮されます。

---

## 実装：ステップバイステップ

### 前提条件

- Cursor のインストール（無料プランで使用可能）
- MATLAB R2024b 以上
- MATLAB MCP Core Server のセットアップ（[MATLAB Agentic Toolkit](https://github.com/mathworks/matlab-mcp-server) の README を参照）

### 手順1：Cursorのチャットに制御設計を依頼する

Cursor を開き、`Ctrl+L` でチャット欄を起動して以下を入力します。

```
MATLAB MCPサーバーに接続して以下を実行してください：

学生フォーミュラ用トラクションコントロールのシミュレーションを作成する。

車両パラメータ：
- 車両重量: 280 kg
- 駆動輪: 後輪2輪（RWD）
- モーター最大トルク: 240 Nm
- タイヤ半径: 0.254 m（10インチ）
- 目標スリップ率: 0.10〜0.15（10〜15%が最大グリップ）

PIDコントローラでスリップ率を制御するMATLABスクリプトを書いて実行してください。
```

### 手順2：生成されたMATLABコードを理解する

```matlab
% === ステップ1: 車両・タイヤパラメータの設定 ===
m      = 280;    % [kg] 車両総重量
r_tire = 0.254;  % [m] タイヤ有効半径
T_max  = 240;    % [Nm] モーター最大トルク
mu_max = 1.5;    % [-] タイヤ最大摩擦係数（グリップの限界）
g      = 9.81;   % [m/s²] 重力加速度

% === ステップ2: タイヤモデルを定義する ===
% Pacejka簡易モデル: スリップ率とグリップ力の関係を近似する曲線
% スリップ率が0.12付近でグリップが最大になる非線形の関係
slip_ref  = linspace(0, 0.5, 500); % スリップ率の計算範囲（0〜50%）
mu_curve  = mu_max * sin(1.8 * atan(15 * slip_ref)); % Pacejka近似式

figure(1); clf;
plot(slip_ref, mu_curve, 'b-', 'LineWidth', 2);
xlabel('スリップ率 [-]');
ylabel('摩擦係数 μ [-]');
title('タイヤ特性：スリップ率 vs 摩擦係数');
grid on;
xline(0.12, 'r--', '最適スリップ率(0.12)', 'LabelHorizontalAlignment','left');

% === ステップ3: PIDコントローラのパラメータ設定 ===
% スリップ率の目標値（これより大きくならないようにTCSが働く）
slip_target = 0.12;  % [-] 目標スリップ率

% PIDゲイン（最初はここから始めて、結果を見ながら調整する）
Kp = 200;   % 比例ゲイン：誤差に対してすぐに反応する強さ
Ki = 50;    % 積分ゲイン：定常偏差をゆっくり消す強さ
Kd = 10;    % 微分ゲイン：急激な変化を抑える強さ

% === ステップ4: 時間ステップシミュレーション ===
dt    = 0.005;   % [s] 計算刻み幅（5msec: 制御ECUの一般的なサイクル時間）
t_end = 5.0;     % [s] シミュレーション時間
t = 0:dt:t_end;

% 状態変数の初期化
v_body     = zeros(size(t));  % 車体速度 [m/s]
v_wheel    = zeros(size(t));  % 車輪周速度 [m/s]
slip       = zeros(size(t));  % スリップ率 [-]
T_motor    = zeros(size(t));  % モータートルク [Nm]
integral   = 0;               % PID積分項の累積値

for i = 2:length(t)
    % スリップ率の計算
    % スリップ率 = (車輪速度 - 車体速度) / 車体速度
    % これが0なら完全グリップ、大きいほど空転している
    if v_body(i-1) > 0.5  % 停車中（速度≤0.5m/s）はゼロ除算を避ける
        slip(i) = (v_wheel(i-1) - v_body(i-1)) / v_body(i-1);
        slip(i) = max(0, slip(i));  % 負のスリップ（ブレーキ時）は無視
    end

    % PID制御：スリップ率の誤差に基づいてトルクを調整する
    error      = slip_target - slip(i);    % 目標との差
    integral   = integral + error * dt;    % 誤差の積分
    derivative = (slip(i) - slip(max(1,i-1))) / dt; % 誤差の微分

    % トルク指令値の計算（誤差が大きいほどトルクを絞る）
    T_cmd = T_max * (1 + Kp*error + Ki*integral - Kd*derivative);
    T_motor(i) = max(0, min(T_max, T_cmd));  % 0〜T_max の範囲に制限

    % 車体の加速度計算（F=ma の法則）
    % タイヤが路面に加える力 = モータートルク / タイヤ半径 × 摩擦係数
    mu_current  = interp1(slip_ref, mu_curve, min(slip(i), 0.5));
    F_traction  = mu_current * m * g;  % 最大牽引力
    F_actual    = min(T_motor(i)/r_tire, F_traction); % 実際の推進力
    a_body      = F_actual / m;        % 加速度

    % 車輪の角加速度計算（車輪慣性モーメントを考慮）
    I_wheel = 0.9;  % [kg·m²] 車輪の慣性モーメント（概算値）
    alpha_wheel = (T_motor(i) - F_actual*r_tire) / I_wheel;

    % 速度の更新（前の時刻 + 加速度 × 時間刻み）
    v_body(i)  = v_body(i-1) + a_body * dt;
    v_wheel(i) = v_wheel(i-1) + alpha_wheel * r_tire * dt;
    v_wheel(i) = max(v_body(i), v_wheel(i));  % 物理的制約
end

% === ステップ5: 結果の可視化 ===
figure(2); clf;
subplot(3,1,1);
plot(t, v_body*3.6, 'b-', 'LineWidth', 1.5);
ylabel('車体速度 [km/h]'); grid on;
title('トラクションコントロール シミュレーション結果');

subplot(3,1,2);
plot(t, slip, 'r-', 'LineWidth', 1.5); hold on;
yline(slip_target, 'k--', '目標スリップ率'); hold off;
ylabel('スリップ率 [-]'); grid on; ylim([0, 0.3]);

subplot(3,1,3);
plot(t, T_motor, 'g-', 'LineWidth', 1.5);
ylabel('モータートルク [Nm]'); xlabel('時刻 [s]'); grid on;

fprintf('=== シミュレーション結果 ===\n');
fprintf('5秒後の車体速度: %.1f km/h\n', v_body(end)*3.6);
fprintf('最大スリップ率: %.3f\n', max(slip));
fprintf('スリップ制御が働いた時間: %.1f%%\n', sum(slip > slip_target*0.9)/length(t)*100);
```

### このコードを出力の形式は次のようになります（未実測）

```
=== シミュレーション結果 ===
5秒後の車体速度: 63.2 km/h
最大スリップ率: 0.148
スリップ制御が働いた時間: 34.7%
```

そのままCursorに「ゲインを調整してスリップ率のオーバーシュートを減らして」と入力すると、Kp・Ki・Kdを自動調整したコードを生成して即実行してくれます。

---

## Before / After 比較

| 項目 | Cursor+MATLAB MCPなし | 使用後 |
|------|---------------------|--------|
| PIDゲインの調整サイクル | 1回の変更→実行→確認：10〜15分 | **30秒** |
| 制御コードの初期作成 | 1〜2日（Simulink初心者の場合） | **30分** |
| 理解できないコードへの対応 | 検索やドキュメント読み | **「この行を説明して」で即解説** |
| ゲイン自動探索（パラメータスイープ） | スクリプトの手動修正 | **「Kpを50〜500で10刻みで試して」で自動化** |

---

## よくあるエラーと対処

| エラー | 原因 | 解決法 |
|--------|------|--------|
| MCP接続エラー | MATLABが起動していない | MATLAB を先に起動してから Cursor を開く |
| 結果が発散する（Inf/NaN） | PIDゲインが大きすぎる | Kpを10分の1に下げてから再実行 |
| スリップ率が0のまま | 初期速度の設定ミス | `v_body(1)=1.0` に変更して再実行 |

---

## 応用：より高度な使い方

基本のTCSが完成したら、Cursorに追加依頼できます。

- **「このコードをSimulinkモデルに変換して」**：ECUへの実装に向けてMBDモデル化
- **「KpをABCの範囲でパラメータスイープして最適値を見つけて」**：自動ゲインチューニング
- **「実際の走行データCSVを使ってモデルを検証して」**：実車との比較

---

## 今週の学生チームへの宿題

Cursorを開いて「MATLABでスリップ率をsin波で変化させて、PIDで0.12に制御するシミュレーションを作って」と入力してください。**制御の基礎概念がコードとグラフで5分で理解できます。**
