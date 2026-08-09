# 領域別モデル階層と検証済み文献（全8領域・生データ復旧版）

作成日: 2026-08-10。統合文書が途中で切れていたため、各調査エージェントの結果から復旧した。
文献は Crossref / DataCite / OpenLibrary の書誌レコードで実在を照合済み。
**ここに無い文献を教科書に書いてはならない。**

## SIL / HIL / DIL — モデルベース開発の検証環境（第VI部 第40〜48章：離散化とリアルタイム／SIL／コード生成／HIL／DIL①②③／実車テスト計画／実車データ突き合わせ）

### モデル階層

**[入門] 可変ステップMIL（Model-in-the-Loop, Normal mode, ode45等）**

- 仮定・成立条件: 車両を連続時間の常微分方程式として扱い、ソルバが誤差許容値（RelTol/AbsTol）を満たすよう刻み幅を自動調整する。計算時間は無制限で、実時間性を一切要求しない。入力はスクリプトで与える既知の時間関数（ステップ操舵、ランプ舵角など）であり、人間もECUも介在しない。「数値解 ≈ 真の解」とみなしてよい、という前提。
- 破綻条件（次の階層へ進むべき時）: (1) 不連続が入ると破綻する — タイヤの静止摩擦↔滑り、ABSのオンオフ、シフト、クラッチ断接、接触。ソルバがゼロクロッシング検出で刻み幅を極端に詰め、事実上停止する（「solver is taking excessively small steps」）。(2) 制御則を実装対象にした瞬間に破綻する — 可変ステップにはサンプル時間の概念が無いため、実機で必ず生じる離散化位相遅れ・ZOH遅れ・エイリアシングを構造的に見落とす。(3) 最も危険なのは「ここで良く見えても実装できる保証が無い」こと。可変ステップで安定な制御則が固定ステップ実装で発振する例は日常的。【次へ進む条件】制御則を実装対象にした／モデルに不連続が入った／人間を入れる、のいずれか。
- 学生フォーミュラでの実行可能性: 全面的に使える。第I部〜第IV部（線形2輪モデル、定常円旋回、過渡応答、非線形4輪、g-gダイアグラム、QSSラップタイム）はこの階層で完結してよく、学生フォーミュラの設計判断の大半はここで足りる。第V部の制御設計も初期検討はここ。
- MATLAB実装経路: Simulink Normal モード。Solver: Variable-step、ode45（Dormand-Prince）／剛性系は ode23t, ode15s。純MATLABなら ode45/ode15s 関数。Vehicle Dynamics Blockset、Simscape Driveline も利用可（MathWorks FSAE無償ライセンスに含まれる範囲を要確認）。

**[入門〜実用（第40章の中核）] 固定ステップMIL（離散化の妥当性確認）**

- 仮定・成立条件: 一定刻み幅 h で明示的ソルバ（ode1〜ode8）を回す。h は系の最速時定数に対して十分小さく、かつ選んだソルバの数値安定領域の内側にある。制御則はサンプル時間 Ts（通常 h の整数倍）で離散実行される。マルチレート（車両1ms／制御10ms／表示16.7ms）を意図的に設計している。
- 破綻条件（次の階層へ進むべき時）: (1) 剛性（stiff）要素で破綻する。学生フォーミュラで実際に効くのは、高剛性ブッシュ／ARB、Simscape物理ネットワーク、そしてタイヤ緩和。タイヤ緩和の時定数は `τ = σ/V`（σ=緩和長, 概ね0.2〜0.4m）で、高速ほど τ が小さく＝剛性が高くなる。V=30m/s, σ=0.3m なら τ=0.01s、前進オイラー ode1 の安定条件は概ね `h < 2τ = 0.02s`、RK4(ode4) で `h < 2.785τ ≈ 0.028s`。(2) h を精度だけで決め、安定性で決めないと発散する。(3) h を小さくすれば精度と安定性は買えるが、次段の実時間実行の予算を食い潰す — このトレードオフが第40章の本質。(4) 剛性が強すぎると明示ソルバでは h が実時間に入らず、陰的（ode14x/ode1be）に移らざるを得ない。【次へ進む条件】その h で実時間に間に合うかを測る必要が出たら実時間実行へ。生成コードとモデルの一致を確認する必要が出たらSILへ。
- 学生フォーミュラでの実行可能性: 必須。DILもHILもこの階層を通らないと成立しない。学生が最初に必ず踏む地雷が「h を精度だけで選んで発散」と「vx→0 でのスリップ角特異点」。ここを教科書で正面から扱う価値が最も高い。
- MATLAB実装経路: Model Settings > Solver: Type=Fixed-step。明示: ode1(Euler)/ode2(Heun)/ode3(Bogacki-Shampine)/ode4(RK4)/ode5(Dormand-Prince)/ode8(Dormand-Prince RK8(7))。陰的: ode14x（Newton＋補外）/ode1be（後退オイラー）。Simscapeは局所ソルバ（local solver）で分離。可変ステップ解を基準に固定ステップ解を重ねて h を決める手順を自作。

**[実用（学生フォーミュラの現実解）] ソフトリアルタイム実行（Simulation Pacing / MATLAB tic-toc ループ）**

- 仮定・成立条件: シミュレーション時刻を壁時計時刻に「概ね」合わせる。汎用OS（Windows/Linux）上で動くため、決定論的な周期保証は無く、間に合わない周期の発生を許容する。人間の知覚は数msのジッタを検出しない、という暗黙の前提。
- 破綻条件（次の階層へ進むべき時）: (1) 描画（drawnow）、GC、OSスケジューリングで数十msのジッタが出る。(2) 遅延の吸収方式で挙動が2つに分岐し、どちらも危険 — (a)「シミュレーション時間を壁時計より遅らせる」＝スローモーション化、(b)「dt を引き伸ばして追いつく」＝積分精度が壊れる。実例として本ユーザーの `C:\Users\jo121\Desktop\ClaudeCode\FormulaMBD\MATLAB\Phase07c_DIL_RealTime.m` は `dt = min(dt, 0.05)` により (a) 型になっており、描画が50ms以上詰まるとシミュレーション時間が実時間から遅れる。ドライバはこれを「車が重い／レスポンスが鈍い」と誤認し、セットアップ判断が汚染される。(3) ラップタイムの絶対値比較には使えない（周期が保証されないため）。【次へ進む条件】レイテンシとジッタを数値で保証したくなったらハードリアルタイムへ。
- 学生フォーミュラでの実行可能性: 学生フォーミュラで最初に到達すべき段。まずここで「運転できる」状態を作るのが正しい順序。ただし用途を『セットアップ間の相対比較（相対妥当性）』に限定し、ラップタイムの絶対値を語らないという規律とセットで運用する。
- MATLAB実装経路: Simulink: `set_param(mdl,'EnablePacing','on','PacingRate','1')`（本ユーザーの Phase07_DIL_Simulink.m で実使用を確認）＋ StopTime='inf'。純MATLAB: tic/toc ループ＋固定 h のサブステップ積分（Phase07c_DIL_RealTime.m は nsub=ceil(dt/1ms) で RK4 サブステップ）。Simulink Desktop Real-Time の Normal モードも近い性質。

**[実務標準] SIL（Software-in-the-Loop）**

- 仮定・成立条件: モデルから生成したCコードを開発PC上でコンパイル・実行し、モデルと数値的に等価かを背合わせ（back-to-back）で確認する。ホストPCのコンパイラ・浮動小数点・int幅で動くため、ターゲットの演算とは別物である、という限定つきの検証。
- 破綻条件（次の階層へ進むべき時）: (1) SILが一致してもターゲットで一致する保証は無い — コンパイラ、浮動小数点の丸めと演算順序、int幅、エンディアンが違う。(2) 実行時間・スタック使用量はホストのものであり、ターゲットの実時間性の根拠にならない。(3) MathWorks自身が「SIL/PILはモデルシミュレーション時間の短縮を目的としていない」と明記しており、高速化手段と誤解しやすい。(4) MIL↔SIL間には浮動小数点の演算順序差による微小差が必ず出る。許容差を事前に決めておかないと、正常な差を「バグ」と誤断する。【次へ進む条件】ターゲット固有の演算・実行時間・スタックが問題になるならPILへ。
- 学生フォーミュラでの実行可能性: Embedded Coder があれば実行可能。ただし学生フォーミュラでECUに自作コードを載せるチームは限られる。ECU内製チーム（電子スロットル、TC、データロガー、安全系ロジック）には必須。載せないチームには『知る価値はあるが実行しない』。
- MATLAB実装経路: SIL/PIL Manager アプリ（Automated Verification モード）。または Simulation mode = 'Software-in-the-Loop (SIL)'。`slbuild`、比較は Simulation Data Inspector。Embedded Coder が必要。Simulink Coverage があれば生成コードのカバレッジも取得可。

**[実務標準] PIL（Processor-in-the-Loop）**

- 仮定・成立条件: 開発PCでクロスコンパイルし、実ターゲットプロセッサ（または命令セットシミュレータ）上で製品オブジェクトコードを実行する。ターゲットの演算結果・実行時間・スタック使用量を実測できる。
- 破綻条件（次の階層へ進むべき時）: (1) PILは通信で1ステップずつ同期して進むため、実時間ではない。実行時間プロファイルは取れるが、割り込み競合、RTOSスケジューリング、I/Oドライバの実挙動は反映されない。これを「実時間性の保証」と誤認するのが最頻出の誤り。(2) 周辺I/O（AD変換、PWM、CAN）は通常モデル化されずバイパスされる。(3) 固定小数点化した場合のオーバーフロー・量子化は検出できるが、それは制御則の話であって車両挙動の話ではない。【次へ進む条件】I/Oと実時間スケジューリングを含めて検証したいならHILへ。
- 学生フォーミュラでの実行可能性: ターゲット基板が必要。Arduino / STM32 / TI C2000 などハードウェアサポートパッケージのある安価な基板なら学生でも到達可能で、費用対効果は悪くない。ECU内製チーム向け。基板が無いチームは実行不可。
- MATLAB実装経路: Simulation mode = 'Processor-in-the-Loop (PIL)'、SIL/PIL Manager。Embedded Coder Support Package（STMicroelectronics, TI C2000, Arduino, ARM Cortex 等）。execution-time profiling、stack usage profiling。PIL API は `rtw.pil.RtIOStreamApplicationFramework`。

**[実務標準] ハードリアルタイム実行（Simulink Real-Time / Simulink Desktop Real-Time）**

- 仮定・成立条件: 専用RTOSまたはベアメタル上で周期 h を決定論的に守る。全周期で TET（Task Execution Time）< h が成立している。最悪実行時間が有界である（＝計算コストが入力に依らず一定、fixed-cost）。
- 破綻条件（次の階層へ進むべき時）: (1) TET が h を超えるとオーバーラン。オーバーランは静かに起きて結果を汚すため、TETを測っていないと気づけない。(2) Simscape の陰的ソルバの反復回数が可変だと TET が入力依存で変動し、最悪ケースで破綻する — 反復回数を固定する fixed-cost 化が必須。(3) モデルを実車寄りに重くする（4輪Magic Formula＋緩和＋サス運動学＋空力マップ）と簡単に破綻し、結局モデルを削ることになる。この『実時間のためにモデル精度を落とす』トレードオフが第40章の主題。(4) 精度を落としたモデルは車両挙動の予測には使えなくなる — にもかかわらずHIL/DILで挙動を論じてしまうのが次段の落とし穴。
- 学生フォーミュラでの実行可能性: Speedgoat 等の専用ターゲットは高価で通常は予算外。一方 Simulink Desktop Real-Time は通常のPC＋対応I/Oボードで動き、学生でも射程内。ただし多くのFSAEチームにはオーバースペックで、階層3（ソフトリアルタイム）で十分なことがほとんど。『知る価値は高いが、実行は選択的』。
- MATLAB実装経路: Simulink Real-Time（Speedgoatターゲット）、Simulink Desktop Real-Time（ホストPC＋カーネルモード）。TETレポート、Real-Time Performance Advisor、Simscape の fixed-cost simulation（局所ソルバ＋反復回数固定）。

**[実務標準] HIL（Hardware-in-the-Loop）**

- 仮定・成立条件: 実ECU（実ハードウェア）を、実時間で動く車両モデルと電気的I/O（アナログ、PWM、CAN、レゾルバ等）で囲む。ECUから見て実車と電気的に区別がつかない環境を作れている、というのが本質的な仮定。
- 破綻条件（次の階層へ進むべき時）: (1) センサ・アクチュエータの電気的模擬が不完全だと、ECUの自己診断（DTC）が誤作動し、本題の検証に入る前に止まる。実務でHIL立ち上げ工数の大半がここに消える。(2) 車両モデルは実時間制約で精度を落としてあるため、『制御ロジック・I/O・異常系の検証』には使えても『車両挙動の予測』には使えない。この混同が最頻出かつ最も高くつく誤り。(3) 故障注入（断線、地絡、電源短絡、センサ張り付き）まで含めないと、HILの主目的である異常系検証を果たさない。正常系だけのHILは費用対効果が極めて悪い。
- 学生フォーミュラでの実行可能性: 費用と工数が大きく、多くの学生フォーミュラチームでは実行できない。正直に『知る価値はあるが実行しない』と書くべき階層。例外として、電子スロットル／APPS・BSE plausibility／シャットダウン回路など安全系ロジックを内製するチームには、信号発生器＋実ECUの簡易HIL（マイコン2台構成でも可）が現実的な妥協点になる。
- MATLAB実装経路: Simulink Real-Time + Speedgoat I/Oモジュール、dSPACE、NI VeriStand。簡易版は Simulink Desktop Real-Time ＋ 安価なDAQ、あるいはマイコン2台（一方が車両モデル、一方が被検ECU）で自作可能。

**[実用（学生フォーミュラの本命）] 固定ベースDIL（フォースフィードバック・ステアリング付き）**

- 仮定・成立条件: 前庭系への運動刺激が無くても、視覚＋ステアリング反力＋音（＋エンジン振動）だけでドライバは車両の状態と限界を判断できる、という仮定。ドライバは欠けた運動手がかりを他モダリティで代償する。
- 破綻条件（次の階層へ進むべき時）: (1) 横並進の知覚が欠落するため、横方向制御は絶対妥当性を持たない。Blaauw (1982) は固定ベースシミュレータで縦方向制御は絶対・相対とも良好な妥当性を示す一方、横方向制御は相対妥当性にとどまり絶対妥当性を欠くことを実車と比較して示している（横並進の知覚欠如が原因）。したがって『絶対的なグリップ限界の評価』『限界付近の主観評価』を信じてはいけない。(2) ステアリング反力の質が成否を決める。反力が単なるセンタリングばね（線形）だと、実車の最重要手がかりであるセルフアライニングトルクのピークとその後の低下（＝フロント限界の予兆）が再現されず、ドライバは限界を感じられず常にオーバードライブする。Toffin et al. (2007) は反力特性がドライバ性能に影響することをシミュレータ実験とモデルで示している。(3) 力覚の遅れを無視すると、ドライバの操舵と反力の位相が合わず操舵発振（human-in-the-loop oscillation）を起こす。【使える範囲】セットアップの順位付け（相対比較）まで。
- 学生フォーミュラでの実行可能性: 学生フォーミュラの本命。市販FFBホイール（Logitech / Thrustmaster / Fanatec）＋ペダル＋PC で概ね10〜30万円で構築可能。実例として Monash Motorsport は Assetto Corsa ベースで構築し、RPM対速度・横加速度対時間について『相対妥当性（relative validity）』を報告している（絶対妥当性は主張していない点が重要）。DynamiΣ PRC は Simulink + Unreal Engine で Formula Student 用DILを構築した例をMathWorksが公開。
- MATLAB実装経路: 入力（舵角・ペダル）: `vrjoystick`（Simulink 3D Animation）または Simulink の Joystick Input ブロック。3D表示: Simulink 3D Animation ＋ Unreal Engine 連携、Vehicle Dynamics Blockset のシーン。【重要】FFB反力の出力（トルク書き込み）には MATLAB/Simulink の標準経路が無く、自作が必要（DirectInput/SDL への C MEX、あるいは Unreal/Unity 側で反力を扱う）。ここは教科書で正直に『標準経路が無い』と書くべき箇所。

**[研究最前線寄り（実務標準だが学生には非現実的）] モーションベースDIL ＋ 古典washoutフィルタ**

- 仮定・成立条件: 高域通過フィルタで高周波の並進加速度を限られたストロークで再現し、低周波の持続加速度はチルトコーディネーション（車体を傾け重力成分 g·sinθ で代用）で置き換える。ドライバの前庭系はチルト角速度が知覚閾値以下なら傾きに気づかない、という仮定。washout（中立位置への復帰）運動もまた閾値以下で知覚されない、という仮定。
- 破綻条件（次の階層へ進むべき時）: (1) チルト角速度が知覚閾値を超えると『傾いている』と気づかれ、正しい加速度手がかりのはずが偽手がかり（false cue）に反転する。(2) washoutの復帰運動そのものが誤った加速度を与える。(3) パラメータが多く（各軸のカットオフ周波数、スケーリングゲイン、チルト速度リミット）、手調整が難しく、あるマニューバに合わせると別のマニューバで破綻する。(4) アクチュエータのストローク・速度限界を陽に扱えないため、限界に当たるとハード的に頭打ちし不連続な手がかりが出る — これが次段（MPCキューイング）の動機。(5) スケーリングを1に近づけたくなるが、ストロークは常に足りないので必ずスケールダウンが必要。
- 学生フォーミュラでの実行可能性: 6DOFヘキサポッドは学生予算外で、ほぼ実行不可能。『知る価値はあるが実行しない』。ただし2〜3DOFの簡易モーション（シート傾斜、シートベルトテンショナ、振動アクチュエータ）で代替キューを与える方向は一部再現可能で、Nehaoua et al. (2006) が小型シミュレータ向けキューイングを扱っている。
- MATLAB実装経路: 標準ブロックは無く自作。Simulinkで高域通過／低域通過フィルタ＋座標変換＋チルト速度リミッタを組む。座標変換は Aerospace Blockset の変換ブロックを流用可能。設計指針は Nahon & Reid (1990) の分類（classical / adaptive / optimal）に従うのが定石。

**[研究最前線] 最適／MPCベース・モーションキューイング**

- 仮定・成立条件: アクチュエータの位置・速度・加速度制約を陽に含めた最適化問題として、知覚された特定力（specific force）と角速度の誤差を最小化する。将来の車両運動がある程度予測できる、かつ人間の前庭系を線形伝達関数で表せる、という仮定。
- 破綻条件（次の階層へ進むべき時）: (1) 予測が要る — 実ドライバの操作は本質的に予測不能で、予測ホライズン内の仮定が外れると性能が落ちる（自動運転や既知コースでは有利、人間運転では不利）。(2) 実時間で最適化を解く必要があり計算負荷が高く、explicit MPC や効率化そのものが研究テーマ（Fang & Kemeny 2016）。(3) 目的関数に埋め込む知覚モデル自体が不確かで、重み調整が主観評価と一致する保証が無い — 客観最適が主観最良と一致しない。
- 学生フォーミュラでの実行可能性: 実行不可能。ただし『なぜ古典washoutでは足りないか（＝アクチュエータ制約を陽に扱えないから）』を理解するために知る価値がある。第39章のMPCと理論的に地続きなので、教科書の構成上は接続点として有用。
- MATLAB実装経路: Model Predictive Control Toolbox（`mpc`, `mpcmoveAdaptive`）、Optimization Toolbox（`quadprog`）。文献実装は Dagdelen et al. (2009)、Garrett & Best (2013)、Fang & Kemeny (2016)、Khusro et al. (2020, オープンアクセス)。

**[研究最前線（かつ学生に必須）] 妥当性の定量化 — 主観評価と客観指標の対応づけ**

- 仮定・成立条件: シミュレータの『良さ』は絶対妥当性（absolute validity: 実車と数値そのものが一致）と相対妥当性（relative validity: 変化の方向と順位が一致）に分解して測定できる。ドライバの主観評価は客観指標に写像できる。
- 破綻条件（次の階層へ進むべき時）: (1) 相対妥当性しか無いのに絶対値で議論するのが最大の誤り。Godley, Triggs & Fildes (2002) は速度研究について、絶対妥当性ではなく相対妥当性が成立する範囲を実証的に切り分けている。(2) ドライバの主観（『曲がりやすい』）と客観指標（ヨーレート応答、ラップタイム）は必ずしも相関しない。(3) ドライバは短時間で適応してしまうため、順序効果・学習効果を制御しないと評価が汚染される。(4) シミュレータ酔いが評価を歪める（SSQで測定すべき）。(5) DILで速いセットアップが実車で速い保証は無く、実データで相関を確認するまで仮説にすぎない。
- 学生フォーミュラでの実行可能性: 必須。DILを作った後に『これを信じてよいか』を決めるのがこの階層で、第27章（妥当性判断基準）・第48章（実車データ突き合わせ）と直結する。学生でも、同一コースで実車テストデータ（GPS/IMU/舵角/車速）とDILログを突き合わせ、相対妥当性を示すことは十分可能。Monash Motorsport が実例。
- MATLAB実装経路: 自作解析。Simulation Data Inspector、時間同期（相互相関 `xcorr` によるタイムアライメント）、回帰・相関分析。主観評価は SSQ（Kennedy et al. 1993）と一対比較法を併用。

### 実務でよく起きる誤り

- 【可変ステップの罠】ode45で綺麗な応答が出たので「実装できる」と結論する。可変ステップにはサンプル時間の概念が無く、実機で必ず生じるZOH遅れ・離散化位相遅れ・エイリアシングを構造的に見落とす。可変ステップで安定な制御則が固定ステップ実装で発振するのは日常的に起きる。
- 【刻み幅の決め方】固定ステップの h を「精度」だけで決め、「数値安定性」で決めない。明示的ソルバには安定限界があり、h は系の最速時定数 τ に縛られる（前進オイラー ode1 なら概ね h < 2τ、RK4 ode4 なら h < 2.785τ）。精度が十分に見えても安定限界を超えれば発散する。逆に安定性のために h を詰めすぎると実時間予算を食い潰す。
- 【最速時定数の見落とし】学生フォーミュラの車両モデルで最速の時定数はタイヤ緩和 `τ = σ/V`（σ≈0.2〜0.4m）であることが多い。高速ほど τ が小さくなり剛性が上がるため、「低速のスキッドパッドでは安定なのに、高速のオートクロスで発散する」という形で現れる。刻み幅の検証は必ず想定最高速で行うこと。
- 【vx→0 の特異点】スリップ角を `α = atan(vy/vx)` で定義すると vx→0 で特異になる。学生フォーミュラは発進・停止・極低速コーナー（ヘアピン、パイロン間）を必ず通るため、DILでは確実に踏む。NaN・数値振動の最頻出原因。対策は vx の下限クリップか、緩和をスリップ角ではなくタイヤ変形（deflection）ベースで定式化すること。ラップタイムシミュレーション（QSS）では停止を扱えても、DILは実時間で停止状態を通過しなければならない点が本質的に違う。
- 【ソフト実時間をリアルタイムと呼ぶ】Simulation Pacing やMATLABのtic-tocループは汎用OS上のソフト実時間であり、周期保証が無い。これを根拠にラップタイムの絶対値を語ってはいけない。用途は「セットアップ間の相対比較」に限定する。
- 【遅延吸収方式の無自覚】描画落ちをどう吸収するかで挙動が2つに分岐し、どちらも危険。(a) dtをクランプする（例: `dt = min(dt, 0.05)`）とシミュレーション時間が壁時計から遅れ、スローモーション化する。ドライバはこれを「車が重い／レスポンスが鈍い」と誤認し、セットアップ判断が汚染される。(b) dtをそのまま伸ばすと積分精度が壊れる。本ユーザーの `C:\Users\jo121\Desktop\ClaudeCode\FormulaMBD\MATLAB\Phase07c_DIL_RealTime.m` は (a) 型の構造になっており、教科書の実例としてそのまま使える。
- 【単一サンプル時間で全部回す】車両モデル・制御・映像・反力を全部最速周期（例1ms）で回すと実時間に入らない。車両1ms／制御10ms／映像16.7ms（60fps）／反力1kHz、のようにマルチレートで設計するのが正解。学生の実装で最も効く最適化の一つ。
- 【SILの過信】SILが一致したのでコードは正しい、と結論する。SILはホストPCのコンパイラ・浮動小数点・int幅で動いており、ターゲットの丸め、演算順序、オーバーフロー、エンディアンは別問題（PILの領域）。
- 【MIL↔SIL差をバグと即断】浮動小数点の演算順序の違いにより、MILとSILの間に微小差が出るのは正常。許容差（tolerance）を検証開始前に決めておかないと、正常な差の追跡に工数を溶かす。
- 【SIL/PILを高速化手段と誤解】MathWorks公式ドキュメントが明記しているとおり、SIL/PILはシミュレーション時間の短縮を目的としていない。高速化が目的なら Rapid Accelerator を使う。
- 【PILを実時間性の保証と誤認】PILは通信で1ステップずつ同期して進むため実時間ではない。実行時間プロファイルは取得できるが、割り込み競合、RTOSスケジューリング、I/Oドライバの実挙動、周辺I/O（AD変換・CAN）は含まれない（通常バイパスされる）。
- 【HILの目的の取り違え】HILで「車両挙動」を検証しようとする。HILの車両モデルは実時間制約のために精度を落としてあるため、制御ロジック・I/O・異常系の検証には使えても、車両挙動の予測には使えない。これがX-in-the-Loop全体で最も高くつく誤解。
- 【HILの立ち上げ工数】センサ・アクチュエータの電気的模擬が不完全だとECUの自己診断（DTC）が誤作動し、本題に入る前に止まる。実務ではHIL立ち上げ工数の大半がここに消える。学生チームが安易にHILに手を出すと、この段で年度が終わる。
- 【正常系だけのHIL】故障注入（断線、地絡、電源短絡、センサ張り付き、CAN喪失）を含めないHILは、主目的である異常系検証を果たしておらず費用対効果が極めて悪い。
- 【TETを測らない】ハードリアルタイム実行でタスク実行時間（TET）を測っていない。オーバーランは静かに起きて結果を汚すため、測定していなければ気づけない。
- 【固定コスト化の欠落】Simscapeの陰的ソルバを実時間で使い、反復回数を固定していない。反復回数が入力依存で変動するとTETが変動し、最悪ケースでオーバーランする。局所ソルバ＋反復回数固定（fixed-cost simulation）が必要。
- 【固定ベースDILで絶対限界を評価】横並進の知覚が欠落しているため横方向制御は絶対妥当性を持たない（Blaauw 1982）。絶対的なグリップ限界の評価や限界付近の主観評価を信じてはいけない。使ってよいのはセットアップの順位付けまで。
- 【反力をセンタリングばねだけで作る】実車でドライバが限界を察知する最重要手がかりは、セルフアライニングトルクのピークとその後の低下（＝フロントの限界の予兆）。反力が線形ばねだけだとこの手がかりが完全に消え、ドライバは限界を感じられず常にオーバードライブする。FFBホイールを買っただけでは解決しない — 反力の中身が本体。
- 【力覚遅延を予算に入れない】視覚遅延ばかり議論して反力（力覚）の遅延を無視する。反力が遅れるとドライバの操舵と反力の位相が合わず、操舵発振（human-in-the-loop oscillation）を起こす。
- 【遅延の絶対値だけ見る】視覚・運動・力覚の遅延を揃えていない。不自然さと酔いを生むのは遅延の絶対値よりモダリティ間の相対的なズレ。遅延は「測って、揃えて、必要なら予測で補償する」対象（Fang, Reymond & Kemeny 2011; Hogema 1997）。
- 【チルトコーディネーションの偽手がかり】チルト角速度が知覚閾値を超えると「傾いている」と気づかれ、加速度の代替のはずが偽手がかり（false cue）に反転して逆効果になる。チルト速度リミッタは必須。
- 【キューイングのスケーリングを1にしたがる】モーションストロークは常に足りないため、必ずスケールダウンが必要。1を目指すと確実にアクチュエータ限界に当たり、ハード的な頭打ちで不連続な手がかりが出る。
- 【市販ゲーム物理を検証基準にする】Assetto Corsa 等の物理は非公開かつゲーム性のためにチューニングされており、自作モデルの検証基準（reference）にはならない。ゲームはDILの器としては有用だが、妥当性の根拠は必ず実車データに置く。Monash Motorsport が実車テレメトリと突き合わせているのが正しい姿勢。
- 【絶対妥当性と相対妥当性を区別しない】学生フォーミュラのDILが到達できるのは通常 relative validity（変化の方向と順位が一致）まで。absolute validity（数値そのものが一致）は主張できない。この区別を明示せずにラップタイムの絶対値を議論するのが最も頻繁な失敗。
- 【ドライバの適応と学習効果】ドライバは短時間でシミュレータに適応してしまう。順序効果・学習効果を制御しないと主観評価が汚染される。ドライバ数が3〜4名と少ない学生フォーミュラでは統計的に致命的に効く。ラテン方格などで順序をカウンターバランスすること。
- 【シミュレータ酔いを測らない】酔ったドライバの主観評価は使えない。SSQ（Kennedy et al. 1993）でセッション前後に測定してから評価を採用する。
- 【主観と客観の相関を仮定する】ドライバの主観（「曲がりやすい」）と客観指標（ヨーレート応答、ラップタイム）は必ずしも相関しない。DILで速いセットアップが実車で速い保証は無く、実データで相関を確認するまでは仮説にすぎない。
- 【実車データ突き合わせの時間同期漏れ】DILログと実車データを比較する際、時間同期（タイムアライメント）をせずに相関を取る。数十msのズレで相関が崩れ、モデルが悪いのか同期が悪いのか判別不能になる。相互相関（xcorr）で遅延を同定してから比較すること。
- 【未確認事項1】Reid, L. D. & Nahon, M. A., "Flight simulation motion-base drive algorithms", UTIAS Report No. 296 (1985) は古典washoutの原典として広く引用されるが、本調査では二次引用と書籍販売情報で存在が示唆されたのみで、現物にアクセスして確認していない。教科書ではDOI確認済みの Nahon & Reid (1990, JGCD, 10.2514/3.20557) を正典として引くこと。
- 【未確認事項2】Schwarzhuber, T., Wörle, L., Graf, M., & Eichberger, A., "Validity Quantification of Driver-In-The-Loop Simulation in Motorsport", FISITA Web Congress 2020, Article F2020-VDC-047 は、グラーツ工科大学の業績データベースに掲載を確認したがDOIが無く、本文も未確認。モータースポーツDILの妥当性定量化という主題は本教科書に極めて適合するため入手を推奨するが、現時点では references に含めていない。
- 【未確認事項3】Blissing et al. (2016) の具体的なレイテンシ閾値（何msでドライバ挙動が変わるか）は、ACM DLが403を返したため全文未確認。二次情報では「許容遅延は概ね50〜150ms」とされるが、一次ソースで裏を取っていないため、この数値を教科書に書く場合は必ず全文を入手して確認すること。
- 【未確認事項4】モーション忠実度基準としてよく引用される Sinacori の1977年 NASA CR-152066 は本調査では未確認。Crossref上で確認できたのは Sinacori, J. B. (1986) "Modeling Flight Simulator Visual/Motion Cue Effects on Pilot Performance; A Summary"（DOI 10.21236/ada359459）であり、年・報告書番号が一般的な引用と異なる。引用前に現物確認が必要。
- 【未確認事項5】プロF1チームのシミュレータの内部仕様（モーションストローク、レイテンシ実測値、キューイングアルゴリズム）は公開されていない。ベンダー（Ansible Motion 等）の記事は宣伝であり査読文献ではなく、そこに現れる「約80%を捉える」「開発費最大4000万ドル」といった数値は出典が示されていない。教科書では数値として引用せず、業界の関心事の傍証としてのみ扱うこと。
- 【未確認事項6】MathWorks の FSAE 無償ライセンスに Embedded Coder / Simulink Real-Time / Simulink Desktop Real-Time が含まれるかは年度と地域で変わる可能性があり、本調査では確認していない。第41〜43章で「学生が実行できるか」を断定する前に、MathWorks の Student Competitions ページで当該年度の対象製品リストを確認すること。

### 学生フォーミュラ固有の事情

【車両特性がDIL要件に効く形】学生フォーミュラは13インチ級の小径タイヤ、平均40〜60km/h・最高110km/h程度の低速域、そして低ダウンフォース（空力の寄与が小さい）が特徴。結果として、DILの忠実度はほぼタイヤモデルとサスペンションの質だけで決まり、空力モデルの粗さは相対的に問題にならない。第44章のモデル要件は「空力を削ってでもタイヤの緩和と非線形性を残す」という優先順位になる。

【低速域が実装上の最大の地雷】FSAEは発進（クラッチミート）、スキッドパッドの定常低速旋回、オートクロスのヘアピンとパイロン間の極低速を必ず通る。したがってスリップ角の定義 `α = atan(vy/vx)` の vx→0 特異点を回避する実装が必須で、これがDIL固有の要求。ラップタイムシミュレーション（QSS）は停止点を代数的に扱えるが、DILは実時間で停止状態を連続的に通過しなければならない — この違いが第28〜33章（LTS）と第44章（DIL）の本質的な分岐点。逆に、固定ステップの安定限界を決めるタイヤ緩和時定数 `τ = σ/V` は高速ほど小さくなるため、刻み幅の検証は最高速側で行う必要がある。低速で安定でも高速で発散する。

【TTCデータの制約】Tire Test Consortium（FSAE TTC）のタイヤデータは加盟チームのみが入手でき、NDAにより数値を公開できない。DILのタイヤモデルの質はここで決まるため、(a) 加盟チームは Magic Formula 係数を同定してDILに載せられる、(b) 非加盟チームは実車のスキッドパッド／定常円旋回から等価コーナリングスティフネスを逆算するしかない、という二極化が生じる。教科書は両方の経路を示す必要があり、(b) の場合はDILの妥当性が相対妥当性にすら届かない可能性を明記すべき。

【予算による階層の切断】モーションベースDIL（6DOFヘキサポッド）は学生予算外で、階層9〜10は「知る価値はあるが実行しない」。現実解は固定ベース＋市販FFBホイール（Logitech / Thrustmaster / Fanatec）＋ペダル＋PCで概ね10〜30万円。Speedgoat等の専用リアルタイムターゲットも通常は予算外だが、Simulink Desktop Real-Time なら通常PCで到達可能。HILは費用と工数の両面で多くのチームに非現実的。

【MATLAB経路の空白】入力（舵角・ペダル）は `vrjoystick` や Joystick Input ブロックで読めるが、FFB反力の出力（トルク書き込み）には MATLAB/Simulink の標準経路が存在しない。DirectInput/SDL への C MEX を自作するか、Unreal Engine / Unity 側で反力を扱うかの二択になる。DynamiΣ PRC の公開事例は Simulink + Unreal Engine + Simulink 3D Animation の構成。この「標準経路が無い」ことを教科書で隠さず書くのが誠実。

【ドライバ数と実車テスト時間の少なさが検証を縛る】ドライバは3〜4名程度、交代も多く、実車テスト日数は年間数日しかない。結果として (a) 主観評価の順序効果・学習効果が統計的に致命的に効く（ラテン方格でのカウンターバランスが必須）、(b) DILを検証するための実車データそのものが乏しい。したがって学生フォーミュラのDILが現実に到達できるのは relative validity（セットアップ変更の方向と順位が実車と一致する）までであり、absolute validity（ラップタイムの絶対値が一致する）は原理的に主張できない。Monash Motorsport が実際に relative validity のみを報告し絶対妥当性を主張していないのは、この制約を正しく理解した姿勢の実例。

【ICE前提での位置づけ】本教科書はパワーユニットが内燃機関でEVは対象外のため、EV部門で重視されるトルクベクタリング制御のHIL検証や高電圧安全系（AMS/IMD）の検証は範囲外。一方で、電子スロットル（ETC）を採用するチームには APPS/BSE plausibility とシャットダウン回路が残り、これは簡易HIL（信号発生器＋実ECU、あるいはマイコン2台構成）の良い対象になる。ここが学生フォーミュラでHILが唯一現実的な価値を持つ領域。

【既存資産】本ユーザーは既に `C:\Users\jo121\Desktop\ClaudeCode\FormulaMBD\MATLAB` に動作するDIL実装を持っている: `Phase07_DIL_Simulink.m`（Simulink Simulation Pacing による ソフト実時間、`set_param(mdl,'EnablePacing','on','PacingRate','1')`）、`Phase07c_DIL_RealTime.m`（純MATLAB の tic/toc ループ＋1ms RK4サブステップ、18状態モデル、マウス操舵、3D表示、ラップ計測）、`Phase07b_DIL_3D_Cockpit.m`、`Phase03k_DIL_Input_Interface.m`（約2000行）。教科書の第44〜46章は、これらを「学生が実際に到達した実例」として引用でき、特に `Phase07c_DIL_RealTime.m` の `dt = min(dt, 0.05)` は「ソフト実時間の遅延吸収がなぜ危険か」を説明する生きた教材になる。

### 参照文献

- **Nahon, M. A., & Reid, L. D. (1990). Simulator motion-drive algorithms: A designer's perspective. Journal of Guidance, Control, and Dynamics, 13(2), 356–362.** ✓実在確認（訂正: 訂正不要。著者2名（Meyer A. Nahon, Lloyd D. Reid）・巻13・号2・頁356-362・年1990すべて一致）
  - 種別: 論文 / 入手性: 有料（AIAA）／大学経由で入手可
  - https://doi.org/10.2514/3.20557
  - 用途: モーションキューイングの古典的分類（classical washout / adaptive / optimal）の基準文献。第44〜46章（DIL①②③）でwashoutフィルタを導入する際の定義の出所として使う。しばしば引用される Reid & Nahon の UTIAS Report 296 (1985) ではなく、DOIが確認できるこちらを正典として引くべき。
- **Reymond, G., & Kemeny, A. (2000). Motion Cueing in the Renault Driving Simulator. Vehicle System Dynamics, 34(4), 249–259.** ✓実在確認（訂正: 訂正不要。著者2名・巻34・号4・頁249-259・年2000すべて一致）
  - 種別: 論文 / 入手性: 有料／大学経由
  - https://doi.org/10.1076/vesd.34.4.249.2059
  - 用途: OEM（ルノー）の実運用シミュレータにおけるモーションキューイングの実装解説。第46章（DIL③キューイング）で「実務でどう作られているか」を示す一次ソース。
- **Dagdelen, M., Reymond, G., Kemeny, A., Bordier, M., & Maïzi, N. (2009). Model-based predictive motion cueing strategy for vehicle driving simulators. Control Engineering Practice, 17(9), 995–1003.** ✓実在確認（訂正: 訂正不要。著者5名（Mehmet Dagdelen, Gilles Reymond, Andras Kemeny, Marc Bordier, Nadia Maïzi）・巻17・号9・頁995-1003・年2009すべて一致）
  - 種別: 論文 / 入手性: 有料（Elsevier）／大学経由
  - https://doi.org/10.1016/j.conengprac.2009.03.002
  - 用途: MPCベース・モーションキューイングの代表的原典。ルノーのULTIMATEシミュレータで検証。第46章で「古典washoutの限界＝アクチュエータ制約を陽に扱えない」ことの解決策として引く。第39章（MPC）とも接続する。
- **Garrett, N. J. I., & Best, M. C. (2013). Model predictive driving simulator motion cueing algorithm with actuator-based constraints. Vehicle System Dynamics, 51(8), 1151–1172.** ✓実在確認（訂正: 訂正不要。著者2名（Nikhil J.I. Garrett, Matthew C. Best）・巻51・号8・頁1151-1172・年2013すべて一致）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）／大学経由
  - https://doi.org/10.1080/00423114.2013.783219
  - 用途: アクチュエータ制約を陽に含むMPCキューイング。第46章のキューイング階層の最上段の説明に使う。同著者らのAVEC2010サーベイより入手性・査読水準が高い。
- **Fang, Z., & Kemeny, A. (2016). An efficient Model Predictive Control-based motion cueing algorithm for the driving simulator. SIMULATION, 92(11), 1025–1033.** ✓実在確認（訂正: 訂正不要。著者2名（Zhou Fang, Andras Kemeny）・巻92・号11・頁1025-1033・年2016すべて一致）
  - 種別: 論文 / 入手性: 有料（SAGE）／大学経由
  - https://doi.org/10.1177/0037549716667835
  - 用途: MPCキューイングの実時間計算負荷という実装上の壁と、その効率化。第46章で「研究最前線がなぜ学生に届かないか」を計算コストの観点から説明する材料。
- **Khusro, Y. R., Zheng, Y., Grottoli, M., & Shyrokau, B. (2020). MPC-Based Motion-Cueing Algorithm for a 6-DOF Driving Simulator with Actuator Constraints. Vehicles, 2(4), 625–647.** ✓実在確認（訂正: 訂正不要。著者4名（Yash Raj Khusro, Yanggu Zheng, Marco Grottoli, Barys Shyrokau）・巻2・号4・頁625-647・年2020すべて一致）
  - 種別: 論文 / 入手性: オープンアクセス（MDPI）— 学生が無料で全文入手可
  - https://doi.org/10.3390/vehicles2040036
  - 用途: MPCキューイングのオープンアクセス文献。学生が実際に全文を読める数少ないMPCキューイング論文なので、第46章の推奨読書として最適。定式化が追える。
- **Blaauw, G. J. (1982). Driving Experience and Task Demands in Simulator and Instrumented Car: A Validation Study. Human Factors, 24(4), 473–486.** ✓実在確認（訂正: 訂正不要。著者（Gerard J. Blaauw）・巻24・号4・頁473-486・年1982すべて一致（正式誌名は Human Factors: The Journal of the Human Factors and Ergonomics Society））
  - 種別: 論文 / 入手性: 有料（SAGE）／大学経由
  - https://doi.org/10.1177/001872088202400408
  - 用途: 固定ベースDILの限界を実証した基礎文献。縦方向制御は絶対妥当性を持つが、横方向制御は横並進の知覚欠如により絶対妥当性を欠き相対妥当性にとどまる、という結論は第44章（DIL①モデル要件）と第47〜48章（妥当性判断）の骨格になる。「学生の固定ベースDILで何を信じてよいか」の直接の根拠。
- **Godley, S. T., Triggs, T. J., & Fildes, B. N. (2002). Driving simulator validation for speed research. Accident Analysis & Prevention, 34(5), 589–600.** ✓実在確認（訂正: 訂正不要。著者3名（Stuart T. Godley, Thomas J. Triggs, Brian N. Fildes）・巻34・号5・頁589-600・年2002すべて一致）
  - 種別: 論文 / 入手性: 有料（Elsevier）／大学経由
  - https://doi.org/10.1016/S0001-4575(01)00056-2
  - 用途: 絶対妥当性と相対妥当性を実験的に切り分けた代表例。第27章（妥当性判断基準）と第48章で「シミュレータ結果をどの粒度まで信じるか」の枠組みを与える。
- **Reymond, G., Kemeny, A., Droulez, J., & Berthoz, A. (2001). Role of Lateral Acceleration in Curve Driving: Driver Model and Experiments on a Real Vehicle and a Driving Simulator. Human Factors, 43(3), 483–495.** ✓実在確認（訂正: 訂正不要。著者4名（Gilles Reymond, Andras Kemeny, Jacques Droulez, Alain Berthoz）・巻43・号3・頁483-495・年2001すべて一致）
  - 種別: 論文 / 入手性: 有料（SAGE）／大学経由
  - https://doi.org/10.1518/001872001775898188
  - 用途: 実車とシミュレータを直接比較し、横加速度の手がかりがコーナリング時のドライバ挙動に果たす役割を示す。固定ベースDILで「横Gが無いと何が失われるか」を定量的に語るための一次ソース。第44章・第47章。
- **Toffin, D., Reymond, G., Kemeny, A., & Droulez, J. (2007). Role of steering wheel feedback on driver performance: driving simulator and modeling analysis. Vehicle System Dynamics, 45(4), 375–388.** ✓実在確認（訂正: 訂正不要。著者4名・巻45・号4・頁375-388・年2007すべて一致）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）／大学経由
  - https://doi.org/10.1080/00423110601058874
  - 用途: ステアリング反力特性がドライバ性能に与える影響を、シミュレータ実験とドライバモデルの両面から扱う。第45章（DIL②反力とペダル）の中心文献。学生が市販FFBホイールで反力を作る際、「なぜセンタリングばねだけでは駄目か」の根拠。
- **Jiang, Y., Deng, W., Zhang, S., & Zheng, H. (2014). Modeling and verification of steering torque feedback system for driving simulator. 17th International IEEE Conference on Intelligent Transportation Systems (ITSC), 2275–2276.** ✓実在確認（訂正: 訂正不要。著者4名（Yuyao Jiang, Weiwen Deng, Sumin Zhang, Hang Zheng）・会議名・頁2275-2276・年2014すべて一致。※2ページのみの短報である点に注意（引用時に内容を期待しすぎない））
  - 種別: 論文 / 入手性: 有料（IEEE）／大学経由
  - https://doi.org/10.1109/ITSC.2014.6958053
  - 用途: ステアリング反力トルク系のモデル化と検証。第45章で反力モデルの構成（ラック力推定→トルク指令）を示す際の参照。ただし2ページの短報である点に注意。
- **Mourant, R. R., & Sadhu, P. (2002). Evaluation of Force Feedback Steering in a Fixed Based Driving Simulator. Proceedings of the Human Factors and Ergonomics Society Annual Meeting, 46(26), 2202–2205.** ✓実在確認（訂正: 訂正不要。著者2名（Ronald R. Mourant, Praveen Sadhu）・巻46・号26・頁2202-2205・年2002すべて一致）
  - 種別: 論文 / 入手性: 有料（SAGE）／大学経由
  - https://doi.org/10.1177/154193120204602621
  - 用途: 固定ベースシミュレータにおけるフォースフィードバック・ステアリングの効果評価。学生フォーミュラのDIL構成（固定ベース＋FFBホイール）と条件が一致する数少ない文献。第45章。
- **Blissing, B., Bruzelius, F., & Eriksson, O. (2016). Effects of Visual Latency on Vehicle Driving Behavior. ACM Transactions on Applied Perception, 14(1), 1–12.** ✓実在確認（訂正: 訂正不要。著者3名（Björn Blissing, Fredrik Bruzelius, Olle Eriksson）・巻14・号1・頁1-12・年2016すべて一致）
  - 種別: 論文 / 入手性: 有料（ACM DL）／大学経由。本調査では全文未入手
  - https://doi.org/10.1145/2971320
  - 用途: 視覚レイテンシがドライバ挙動に与える影響を実験的に扱う。第44章のレイテンシ予算の一次ソース候補。【注意】本調査では全文にアクセスできず（ACM DLが403）、具体的な閾値ms数は未確認。教科書で数値を引く際は必ず全文を入手して確認すること。
- **Fang, Z., Reymond, G., & Kemeny, A. (2011). Performance Identification and Compensation of Simulator Motion Cueing Delays. Journal of Computing and Information Science in Engineering, 11(4).** ✓実在確認（訂正: 訂正不要。著者3名（Zhou Fang, Gilles Reymond, Andras Kemeny）・巻11・号4・年2011一致。※Crossrefに頁情報なし（論文番号方式）のため、引用時は頁を書かないのが正しい）
  - 種別: 論文 / 入手性: 有料（ASME）／大学経由
  - https://doi.org/10.1115/1.3622751
  - 用途: モーションキューイング系の遅延そのものを同定し補償する手法。第44章のレイテンシ予算で「遅延は測って補償する対象である」という実務的態度を示す根拠。視覚遅延と運動遅延の相対ズレの扱いに直結。
- **Hogema, J. H. (1997). Compensation for Delay in the Visual Display of a Driving Simulator. SIMULATION, 69(1), 27–34.** ✓実在確認（訂正: 訂正不要。著者（Jeroen H. Hogema）・巻69・号1・頁27-34・年1997すべて一致）
  - 種別: 論文 / 入手性: 有料（SAGE）／大学経由
  - https://doi.org/10.1177/003754979706900103
  - 用途: 視覚表示遅延の補償（予測による先出し）の古典。第44章で「遅延は減らせないなら予測で補う」という選択肢を提示する際に引く。
- **Kennedy, R. S., Lane, N. E., Berbaum, K. S., & Lilienthal, M. G. (1993). Simulator Sickness Questionnaire: An Enhanced Method for Quantifying Simulator Sickness. The International Journal of Aviation Psychology, 3(3), 203–220.** ✓実在確認（訂正: 訂正不要。著者4名（Robert S. Kennedy, Norman E. Lane, Kevin S. Berbaum, Michael G. Lilienthal）・巻3・号3・頁203-220・年1993すべて一致）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）／大学経由。ただしSSQの項目表自体は多数の二次文献に再掲されており実質入手容易
  - https://doi.org/10.1207/s15327108ijap0303_3
  - 用途: SSQ（シミュレータ酔い質問紙）の原典。第47章（実車テスト計画）と主観評価の章で、ドライバ評価を集める前に酔いを測る手順の根拠。学生チームでもそのまま使える実務ツール。
- **Kendall, I. R., & Jones, R. P. (1999). An investigation into the use of hardware-in-the-loop simulation testing for automotive electronic control systems. Control Engineering Practice, 7(11), 1343–1356.** ✓実在確認（訂正: 訂正不要。著者2名・巻7・号11・頁1343-1356・年1999すべて一致）
  - 種別: 論文 / 入手性: 有料（Elsevier）／大学経由
  - https://doi.org/10.1016/S0967-0661(99)00103-3
  - 用途: 自動車ECUのHIL検証に関する基礎的な査読文献。第43章（HIL）でHILの目的（制御ロジック・I/O・異常系の検証であって車両挙動予測ではない）を裏づける一次ソース。
- **Shylla, D., Jain, A., Shah, P., & Sekhar, R. (2023). Model in Loop (MIL), Software in Loop (SIL) and Hardware in Loop (HIL) Testing in MBD. 2023 4th IEEE Global Conference for Advancement in Technology (GCAT), 1–6.** ✓実在確認（訂正: 訂正不要。著者4名（Dapynhunlang Shylla, Ayushi Jain, Pritesh Shah, Ravi Sekhar）・会議名・頁1-6・年2023すべて一致）
  - 種別: 論文 / 入手性: 有料（IEEE）／大学経由
  - https://doi.org/10.1109/GCAT59970.2023.10353323
  - 用途: MIL/SIL/HILの階層を1本でまとめた比較的新しい論文。第40〜43章の導入で「X-in-the-Loopの用語体系」を引用付きで定義するのに使える。ただし総説的で深さは限定的。
- **Chrysakis, G., Vogel, J., & Nikzadfar, K. (2022). Development of a Driver-in-the-Loop Simulation to Evaluate the Performance to Energy Trade-Off of Active Dynamics Systems on an Electric Race Car. SAE Technical Paper 2022-01-5040.** ✓実在確認（訂正: 訂正不要。著者3名（Georgios Chrysakis, Jonathan Vogel, Kamyar Nikzadfar）・論文番号2022-01-5040・出版社SAE International・年2022すべて一致）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE）／大学のSAE購読経由。学生はFSAE関連で大学契約がある場合あり
  - https://doi.org/10.4271/2022-01-5040
  - 用途: レースカーを対象としたDIL構築の査読付き実例。第44〜46章で「モータースポーツ文脈のDILは何のために作るか（セットアップ判断・エネルギー配分）」を示す。EV対象だが、DIL構築手順とドライバ評価の部分はICEの学生フォーミュラにそのまま転用できる。
- **Khadeir, A. A., Saehood, Z. A., Mutar, H. K., Abduljabbar, A. A., Al-Dahwi, A., & Abdulameer, R. (2021). Building and validation of a low-cost driving simulator. Journal of Physics: Conference Series, 1973(1), 012046.**
  - 種別: 論文 / 入手性: オープンアクセス（IOP, CC BY）— 学生が無料で全文入手可
  - https://doi.org/10.1088/1742-6596/1973/1/012046
  - 用途: 低コスト・ドライビングシミュレータの構築と妥当性確認のオープンアクセス文献。学生が全文を読める形で「安価に作って、どう検証するか」を示す数少ない例。第44章の学生向け実践パートで推奨。
- **Nehaoua, L., Arioui, H., Espie, S., & Mohellebi, H. (2006). Motion cueing algorithms for small driving simulator. Proceedings 2006 IEEE International Conference on Robotics and Automation (ICRA), 3189–3194.** ✓実在確認（訂正: 訂正不要。著者4名・会議名 ICRA 2006・頁3189-3194・年2006すべて一致）
  - 種別: 論文 / 入手性: 有料（IEEE）／大学経由
  - https://doi.org/10.1109/ROBOT.2006.1642187
  - 用途: 小型・低自由度シミュレータ向けのモーションキューイング。6DOFヘキサポッドが買えない学生フォーミュラにとって、現実的に到達しうる唯一のモーション系の設計指針。第46章の「学生ができる範囲」の節。
- **Stahl, K., Abdulsamad, G., Leimbach, K.-D., & Vershinin, Y. A. (2014). State of the art and simulation of motion cueing algorithms for a six degree of freedom driving simulator. 17th International IEEE Conference on Intelligent Transportation Systems (ITSC), 537–541.** ✓実在確認（訂正: 訂正不要。著者4名（Konrad Stahl, Gobir Abdulsamad, Klaus-Dieter Leimbach, Yuri A. Vershinin）・会議名・頁537-541・年2014すべて一致）
  - 種別: 論文 / 入手性: 有料（IEEE）／大学経由
  - https://doi.org/10.1109/ITSC.2014.6957745
  - 用途: 6DOFシミュレータ向けキューイングアルゴリズムの状況整理とシミュレーション比較。第46章でアルゴリズム階層（classical / adaptive / optimal / MPC）を俯瞰するのに使える、DOI確認済みの代替サーベイ。
- **Loeb, J. S., Guenther, D. A., Chen, H.-H. F., & Ellis, J. R. (1990). Lateral Stiffness, Cornering Stiffness and Relaxation Length of the Pneumatic Tire. SAE Technical Paper 900129.** ✓実在確認（訂正: 訂正不要。著者4名（Jeff S. Loeb, Dennis A. Guenther, Hung-Hsu Fred Chen, John R. Ellis）・論文番号900129・出版社SAE International・年1990すべて一致）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE）／大学経由
  - https://doi.org/10.4271/900129
  - 用途: タイヤ緩和長（relaxation length）の基礎文献。第40章で「固定ステップの刻み幅は何に縛られるか」を論じる際、系の最速時定数 τ=σ/V の σ の実測的な根拠として引く。第7〜11章（タイヤ）とも接続。
- **Ghazi Zadeh, A., & Fahim, A. (2001). An Analytical Transient Tire Model. Tire Science and Technology, 29(2), 108–132.** ✓実在確認（訂正: 訂正不要。著者2名・巻29・号2・頁108-132・年2001すべて一致）
  - 種別: 論文 / 入手性: 有料／大学経由
  - https://doi.org/10.2346/1.2135231
  - 用途: 過渡タイヤモデルの解析的定式化。第40章で緩和のモデル化形式（スリップ角ベースか変形ベースか）を選ぶ根拠になり、vx→0 の特異点回避の議論に直結する。
- **The importance of yaw motion feedback in driving simulators. In The Dynamics of Vehicles on Roads and Tracks (IAVSD 2015 Proceedings), pp. 774–783. CRC Press, 2016.**
  - 種別: 論文 / 入手性: 有料（CRC Press書籍章）／大学経由。著者名は未確認
  - https://doi.org/10.1201/b21185-81
  - 用途: ヨー運動フィードバックの重要性を扱うIAVSD論文。第44章で「並進が無くてもヨーだけは与える価値があるか」という、低予算モーション系の設計判断に直結する。【注意】Crossrefに著者情報が登録されていないため、引用時は書籍現物で著者名を確認すること。
- **A high fidelity driving feeling real-time dynamic steering system model. In The Dynamics of Vehicles on Roads and Tracks (IAVSD 2015 Proceedings), pp. 784–793. CRC Press, 2016.**
  - 種別: 論文 / 入手性: 有料（CRC Press書籍章）／大学経由。著者名は未確認
  - https://doi.org/10.1201/b21185-82
  - 用途: 実時間で動く高忠実度ステアリング系モデル。第45章（DIL②反力）で、実時間制約下で反力モデルをどこまで作り込むかの参照。【注意】Crossrefに著者情報が登録されていないため、引用時は書籍現物で著者名を確認すること。
- **MathWorks. SIL and PIL Simulations (Embedded Coder Documentation).** ✓実在確認（訂正: 訂正不要。ページタイトル「SIL and PIL Simulations」で一致。冒頭「With Embedded Coder®, you can run software-in-the-loop (SIL) and processor-in-the-loop (PIL) simulations of your model」）
  - 種別: 公式ドキュメント / 入手性: オープン（無料）
  - https://www.mathworks.com/help/ecoder/ug/about-sil-and-pil-simulations.html
  - 用途: SIL/PILの公式定義の出所。第41〜42章。本調査で実際に取得して確認した記述: SILは「生成コードを開発用計算機上でコンパイル・実行」、PILは「開発用計算機でクロスコンパイルし、ターゲットプロセッサまたは等価な命令セットシミュレータ上でオブジェクトコードを実行」。また「SIL/PILはモデルシミュレーション時間の短縮を目的としていない」と明記されている点は、教科書の誤解訂正としてそのまま使える。
- **MathWorks. Fixed-Step Solvers in Simulink (Simulink Documentation).**
  - 種別: 公式ドキュメント / 入手性: オープン（無料）
  - https://www.mathworks.com/help/simulink/ug/fixed-step-solvers-in-simulink.html
  - 用途: 第40章（離散化とリアルタイム）の実装経路。本調査で確認した内容: 明示的固定ステップソルバは ode1(Euler), ode2(Heun), ode3(Bogacki-Shampine), ode4(RK4), ode5(Dormand-Prince), ode8(Dormand-Prince RK8(7))、陰的は ode14x と ode1be。既定の FixedStepAuto は離散モデルでは基本サンプル時間、連続モデルでは全シミュレーション時間の1/50 を選ぶ（＝ほぼ確実に不適切なので必ず手動設定せよ、という教材になる）。
- **MathWorks. Solvers for Real-Time Simulation (Simscape Documentation).** ✓実在確認（訂正: 訂正不要。ページタイトル「Solvers for Real-Time Simulation」で一致。冒頭「To run your model on a real-time target machine, configure your model for fixed-step, fixed-cost simulation」— 第40章（離散化とリアルタイム）の一次ソースとして適切）
  - 種別: 公式ドキュメント / 入手性: オープン（無料）
  - https://www.mathworks.com/help/simscape/ug/solvers-for-real-time-simulation.html
  - 用途: 第40章・第43章。本調査で確認した内容: 「明示的ソルバは陰的より高速だが、数値的に剛性の高い系では精度が落ちる」。剛性のある連続系には ode14x、実時間性能が不足するなら刻み幅を増やす／反復回数を減らす／ode1be に切り替える／モデルの剛性自体を下げる。固定コスト化（fixed-cost simulation）と局所ソルバでオーバーランを防ぐ、という実務手順の公式根拠。
- **MathWorks. Formula Student Driver-in-the-Loop Simulator Using Simulink and Unreal Engine (DynamiΣ PRC, video, 38分40秒).**
  - 種別: 公式ドキュメント / 入手性: オープン（無料、MathWorksアカウント登録が必要な場合あり）
  - https://www.mathworks.com/videos/formula-student-driver-in-the-loop-simulator-using-simulink-and-unreal-engine-1736319381271.html
  - 用途: 学生フォーミュラチーム（DynamiΣ PRC）が Simulink + Unreal Engine + Simulink 3D Animation でDILを構築した公開事例。第44章の「学生が実際に到達した構成」の実在証拠。本調査でページを取得し、チーム名・ツールチェーンを確認済み。ただしフレームレート・サンプル時間・レイテンシの具体数値はページ本文には無い（動画本編の確認が必要）。
- **Monash Motorsport. Formula Student Driver Simulator (チーム技術ブログ／学位論文の要約).**
  - 種別: FSAE設計レポート / 入手性: オープン（無料、Web公開）
  - https://www.monashmotorsport.com/blog/driversim
  - 用途: 学生フォーミュラチームによるDIL構築と妥当性確認の公開事例。本調査で取得して確認した内容: Assetto Corsa をベースに構築、横方向摩擦係数を実車テストとシミュレータのテレメトリ比較から1.75と同定、ギヤ比・ファイナル・トルクカーブを実走行とダイナモで検証。結論として「RPM対速度」「横加速度対時間」について relative validity（相対妥当性）を達成したと述べ、絶対妥当性は主張していない。第48章で「学生チームが到達できる妥当性の水準」を示す最良の実例。
- **Ansible Motion. Engineering the advantage: driver-in-the-loop simulation in motorsport (業界解説記事).**
  - 種別: 公式ドキュメント / 入手性: オープン（無料、Web公開）
  - https://www.ansiblemotion.com/engineering-the-advantage-driver-in-the-loop-simulation-in-motorsport
  - 用途: プロのレースチームがDILを何に使うか（ドライバトレーニング、車両開発、セットアップ最適化）の業界側の記述。本調査で取得し、F1テストドライバが年間60〜70日をシミュレータで過ごすという記述、およびエンジニアリング級DILの要件（高い持続加速度、調整可能なモーションキューイング、低レイテンシ映像、オープンアーキテクチャ）を確認。【重要な限界】これはシミュレータベンダーの宣伝記事であり査読文献ではない。記事中の「シミュレーションが車両挙動の約80%を捉える」といった数値は出典が示されておらず、教科書で数値として引用してはならない。業界の関心事の傍証としてのみ使う。

---

## タイヤモデル（Tire Modelling）— 学生フォーミュラMBD教科書 第II部 第7〜11章の土台

### モデル階層

**[入門] 線形タイヤモデル（コーナリングスティフネス1係数）Fy = −Cα·α**

- 仮定・成立条件: 接地圧分布・接地長を一切モデル化せず、横力はスリップ角に比例するとだけ置く。前提は (1) スリップ角が微小（乾燥路の一般的なレーシングタイヤで概ね |α| ≲ 2〜3 deg、ピークスリップ角の1/3程度まで）、(2) 垂直荷重 Fz が一定、(3) キャンバ角ゼロまたは無視、(4) 縦力 Fx = 0（複合スリップなし）、(5) 定常（過渡遅れなし）、(6) 摩擦限界に達しない。セルフアライニングトルクを扱う場合は Mz = −Cα·α·t（t = ニューマチックトレール一定）と、トレール一定を追加で仮定する。第3章の線形2輪モデル、第4章のスタビリティファクタはすべてこの1係数の上に建っている。
- 破綻条件（次の階層へ進むべき時）: (a) スリップ角がピークを越えると完全に破綻する。線形式は α とともに Fy が無限に増えるので、限界旋回・スピン・カウンターステアは原理的に表現できない。(b) 荷重移動を入れた瞬間に破綻する。実タイヤは Cα も μ も Fz に対して頭打ち（load sensitivity）なので、内外輪で荷重が振れると線形の重ね合わせは横加速度を必ず過大評価する。学生フォーミュラの車重・トレッド比だと定常旋回で片輪荷重が2倍近く振れるため、誤差は数%ではなく十数%オーダーになる。(c) 加減速中の旋回（トレイルブレーキング、コーナー脱出）では Fx が入るので摩擦円が効き、まったく合わない。(d) ステア入力が速い過渡（第5章）では relaxation length による遅れが無視できず、ヨーレート位相が合わない。(e) ニューマチックトレールは限界付近で急減してゼロ・負にすらなるので、Mz を一定トレールで扱うと操舵反力（第13章）の「限界の手応え抜け」がまったく再現できない。
- 学生フォーミュラでの実行可能性: 必須かつ最も費用対効果が高い。TTCデータが無くても、実車のステアリング角センサとヨーレートから実測アンダーステア勾配を求めれば Cα の比を逆算できる。第I部（1〜6章）の全内容、アンダーステア勾配・スタビリティファクタ・ヨー固有振動数の設計目標設定はこの階層で完結する。ただし「限界横G」「ラップタイム」を語り始めた瞬間に無効になることを、第6章で明示的に線引きする必要がある。
- MATLAB実装経路: 自作が正しい。関数1行（Fy = -Calpha*alpha）で足り、Toolbox不要。線形2輪モデルは状態方程式を書いて ss / lsim / bode で扱えるのが最大の利点で、Control System Toolbox の周波数応答解析がそのまま使える。Simulink では Gain ブロックのみ。Vehicle Dynamics Blockset を持ち出す必要はない（むしろ持ち出すと線形性の教育効果が消える）。

**[入門〜実用] 荷重依存を入れた準線形モデル（Cα(Fz)・μ(Fz)、tire load sensitivity）**

- 仮定・成立条件: 線形モデルの (2)「Fz 一定」だけを外し、Cα と最大摩擦係数 μ を Fz の非線形関数（典型的には2次式または飽和関数）として与える。他の仮定（微小スリップ、純スリップ、定常）は保持する。物理的根拠は、接地面積が荷重にほぼ比例して増える一方で接地圧も上がり、ゴム摩擦が圧力に対して劣化するため μ が荷重とともに下がる、という実験事実。
- 破綻条件（次の階層へ進むべき時）: 依然として摩擦限界とピーク以降を表現できないので、限界旋回には使えない。また Cα(Fz) を2次式で当てはめると、外挿域（TTC試験荷重範囲の外、特に低荷重側）で負値や非物理的な折り返しが出やすい。学生フォーミュラは荷重移動が大きく内輪が Fz≈0 近くまで抜けるため、この低荷重外挿が実際に効く。キャンバ・内圧・温度の影響は依然ゼロ。
- 学生フォーミュラでの実行可能性: 極めて実用的で、線形モデルの次に必ず教えるべき階層。これを入れるだけで「ロール剛性配分を前後で振るとアンダー/オーバーが変わる」という第9章の中心命題が定量的に説明できるようになる。逆に、この階層を飛ばして Magic Formula に行くと、学生は荷重移動の物理を理解しないまま係数を回すだけになる。
- MATLAB実装経路: 自作。TTCデータがあれば polyfit で Cα(Fz) を当てはめ、無ければ複数荷重のスキッドパッド実測から2〜3点で近似する。griddedInterpolant や Lookup Table ブロックで Simulink に埋め込める。外挿は必ず 'nearest' でクランプし、多項式外挿させないこと。

**[実用（物理ベース）] ブラシモデル（純スリップ、放物線圧力分布）**

- 仮定・成立条件: トレッドを剛体カーカス上に生えた独立した弾性ブラシ毛（縦・横のトレッド剛性 cp）の列と見なし、接地長 2a にわたって (1) 接地圧が放物線分布、(2) 摩擦係数 μ が一定（速度・圧力・温度に依存しない）、(3) 前端から粘着域、後端から滑り域という2領域構造、(4) カーカスは剛（変形しない）、(5) 定常。この仮定から Fy = f(α) の全域形状が解析的に出て、コーナリングスティフネス Cα = 2·cp·a²、摩擦飽和 Fy,max = μ·Fz、そしてニューマチックトレールが t = a/3 から始まってスリップ角とともに単調減少しピーク付近でゼロに漸近する、という Mz の挙動まで一本の理屈で導出できる。
- 破綻条件（次の階層へ進むべき時）: (a) μ 一定の仮定が最大の弱点。実ゴムは滑り速度と接地圧と温度で μ が変わるため、ピーク後の力の落ち込み（peak と slide の差、レーシングタイヤで顕著）を再現できない。ブラシモデルは典型的にピーク後がフラットになり、実測の落ち込みより楽観的。(b) 放物線圧力分布は実測と違う（特に低内圧・高荷重で中央が凹む）。(c) キャンバスラスト、コニシティ・プライステア（α=0 での残留横力/モーメント）は素の定式化に入らない。(d) カーカス剛の仮定により、高荷重で接地長が伸びる効果と、カーカス横たわみが Cα に効く効果が抜ける。定量精度は Magic Formula に及ばない。
- 学生フォーミュラでの実行可能性: 「使えるが、定量予測には使わない」階層。教科書としての価値は決定的に高い。B・C・D・E という当てはめ係数が何を意味するのか、なぜニューマチックトレールが限界で消えるのか、なぜ摩擦円が円ではないのかを、この階層でしか物理的に説明できない。TTCデータが無いチームにとっては、cp と a と μ の3パラメータをカタログ値・接地痕実測（車体に載せて墨を塗る）・スキッドパッド横Gから決めれば、係数同定なしで全域曲線が引ける実用的な逃げ道でもある。
- MATLAB実装経路: 自作一択。解析解なので数十行のMATLAB関数で書け、Simulink では MATLAB Function ブロックに入れる。接地長 2a は静的たわみから、cp は Cα の実測値と a から逆算する。既存 Toolbox にブラシモデルのブロックは無い。

**[実用（物理ベース）] ブラシモデル複合スリップ（理論的な摩擦円の導出）**

- 仮定・成立条件: 純スリップのブラシモデルに、縦スリップ κ と横スリップ角 α を合成した「理論スリップ」ベクトル（σx = −κ/(1+κ), σy = tanα/(1+κ) など）を導入し、滑り域では合力が摩擦円の縁 μ·Fz に張り付き、その方向が滑り速度ベクトルと逆向きになる、と仮定する。等方摩擦（縦横で μ が同じ）と、縦横のトレッド剛性が等しい（cpx = cpy）と置くと、合力の大きさが純スリップ曲線と同じ形で表せる。
- 破綻条件（次の階層へ進むべき時）: (a) 等方摩擦・等方剛性の仮定は実タイヤでは成り立たない。レーシングタイヤは一般に縦の剛性のほうが高く、Fx のピークが Fy のピークより小さいスリップで立つ。cpx ≠ cpy を入れると摩擦円は楕円に歪み、解析解も複雑化する。(b) 複合スリップ時の Mz は縦力による接地面のねじれで大きく変わり、素のブラシモデルでは精度が出ない。(c) μ 一定の弱点が複合スリップではさらに効く（滑り速度が大きくなるため）。
- 学生フォーミュラでの実行可能性: 第10章（複合スリップ）の理論的背骨として必須。学生が一番誤解するのが「摩擦円は円であり、Fx と Fy は単純に二乗和で足せる」という点で、この階層でその誤りを潰す。実務ではラップタイムシミュレーション（第28章 g-gダイアグラム）が複合スリップの精度で決まるため、ここを理屈で理解しているかどうかが第IV部の成否を分ける。
- MATLAB実装経路: 自作。摩擦円/楕円の妥当性チェックには MFeval で Magic Formula の複合スリップ結果を出し、ブラシモデルの理論解と重ねて描くのが良い教材になる。

**[実用] Fiala モデル**

- 仮定・成立条件: Fiala (1954) による簡略化タイヤモデル。ブラシモデルと同系統の粘着/滑り2領域の考え方を、実装しやすい形にまとめたもの。必要パラメータが少なく、MathWorks の Vehicle Dynamics Blockset 実装では縦スリップ剛性 Ckappa、コーナリングスティフネス Calpha、キャンバ剛性 Cgamma、静摩擦 muMax と動摩擦 muMin、縦横の relaxation length Lrelx/Lrely 程度で動く。並進摩擦モデル（translational friction model）で複合スリップ時の力を計算する。
- 破綻条件（次の階層へ進むべき時）: MathWorks 自身が「広範な非線形の複合横スリップや横方向ダイナミクスを含まない検討向け」と明記している。すなわち、限界付近の複合スリップ精度、キャンバ依存性の細部、Mz の忠実度は Magic Formula に劣る。μ を静・動の2値で扱うため、滑り速度に対する連続的な摩擦低下も表現できない。内圧依存・温度依存はない。
- 学生フォーミュラでの実行可能性: 「Magic Formula 係数がまだ無いが、Simulink で車両モデルを回し始めたい」段階の現実的な橋渡しとして有用。TTCに未加入で、コーナリングスティフネスと最大横Gだけ実測で持っているチームが、第II部統合（第23章 非線形4輪モデル）を最初に組むときの既定値として妥当。ただし第IV部のラップタイム最適化やセットアップ感度解析にこのまま進むと、複合スリップ精度不足で結論が変わりうることを明記すべき。
- MATLAB実装経路: Vehicle Dynamics Blockset の Fiala Wheel 2DOF ブロック（https://www.mathworks.com/help/vdynblks/ref/fialawheel2dof.html）。ブレーキ（ディスク/ドラム/マップ）と転がり抵抗（ISO 28580、SAE J2452、Magic Formula、マップ）を選べる。同系統の簡略モデルとして Dugoff Wheel 2DOF も用意されている。Magic Formula 係数が無い場合の第一候補として MathWorks 公式ドキュメントが Fiala を推奨している。

**[実務標準] Pacejka Magic Formula MF5.2（純スリップ）**

- 仮定・成立条件: 物理モデルではなく高精度な当てはめ式（経験式）である、という点が最重要の前提。基本形は y = D·sin(C·arctan(B·x − E·(B·x − arctan(B·x)))) + Sv（x はスリップ量 + Sh）。係数の意味は D = ピーク係数（最大値、概ね μ·Fz）、C = 形状係数（曲線の漸近値と全体形状を決める。Fy で約1.3、Fx で約1.6が典型）、B = 剛性係数、E = 曲率係数（ピーク近傍の尖り。E ≤ 1 でなければ非物理的に折り返す）、そして積 B·C·D が原点勾配＝コーナリングスティフネス（または縦スリップ剛性）に一致する。Sh・Sv は水平・垂直シフトで、コニシティ／プライステア（α=0 での残留横力）と転がり抵抗を吸収する。荷重依存とキャンバ依存は、B・C・D・E 自体を Fz と γ の関数（p系・q系の係数群）として与えることで表現する。すべて定常・単一動作条件での当てはめであり、内挿式であることが暗黙の前提。
- 破綻条件（次の階層へ進むべき時）: (a) 同定に使ったデータ範囲の外に出た瞬間に破綻する。これが最大かつ最頻の失敗。荷重・キャンバ・内圧のいずれも、TTC試験マトリクスの外は保証されない。特に学生フォーミュラは荷重移動で内輪 Fz がほぼゼロまで抜けるのに、その低荷重域は試験点が疎で外挿になりやすい。(b) MF5.2 は内圧依存を持たない。TTC走行中に温度上昇で内圧が上がる（そして実車でも冷間→温間で上がる）ので、単一内圧のモデルは実車と系統的にずれる。(c) 大きなキャンバ角では精度が落ちる。(d) turn slip（旋回中の接地面回転、小旋回半径・低速で顕在化）を扱えない。(e) 温度・摩耗の効果は一切入らない。(f) 定常式なので過渡には使えない（次階層へ）。
- 学生フォーミュラでの実行可能性: TTC加入チームにとっての実務標準であり、教科書の第8〜9章の中心。TTCのCornering試験（スリップ角スイープ）から Fy0 と Mz0、Drive/Brake試験（スリップ率スイープ）から Fx0 を同定する。非加入チームでも、公開されている乗用車用の .tir を「形」の教材として読ませる価値はある（ただし数値をそのまま自チームの10〜13インチタイヤに使ってはならない）。
- MATLAB実装経路: 評価は MFeval（MATLAB Central File Exchange #63618, Marco Furlan 作。MF5.2/6.1/6.2 の .tir を読んで力・モーメントを返す。mfeval()、mfeval.readTIR()、mfeval.coefficientCheck() を提供）。同定は Optimization Toolbox の fmincon で、Cx>0, Dx>0, Ex≤1 のような非線形制約を掛けて段階的に当てはめるのが MathWorks 公式ブログの推奨手順（Fx0・Fy0 を最初に確定してから従属モードへ進む）。MathWorks 公式の Magic Formula Tire Tool（GUI）と Magic Formula Tire MATLAB Library もある。Simulink 側は Vehicle Dynamics Blockset の Combined Slip Wheel 2DOF が MF5.2 の .tir を Extended Tire Features サポートパッケージ経由で MF6.2 に変換して読み込む。

**[実務標準] Magic Formula 複合スリップ（コサイン型ウェイト関数 Gxα・Gyκ）**

- 仮定・成立条件: 純スリップの Fx0(κ)・Fy0(α) に対し、もう一方のスリップによる減衰をコサイン型の重み関数で掛ける形（Fx = Gxα·Fx0、Fy = Gyκ·Fy0 + SVyκ）。重み関数自体も Magic Formula 型のコサイン関数で、r系（rBx, rCx, rBy, rCy, rVy…）の係数群で記述される。これも純粋な当てはめであり、ブラシモデルのような物理的導出ではない。SVyκ 項は、駆動/制動が横力にもたらすオフセットを吸収する。
- 破綻条件（次の階層へ進むべき時）: (a) 複合スリップの係数を同定するには「スリップ角を固定して縦スリップをスイープする」複合試験データが必要で、これが最も入手しにくい。純スリップデータしか無い状態で複合スリップ係数をデフォルト値のまま使うと、g-gダイアグラムの斜め領域（トレイルブレーキング、コーナー脱出）がまるごと当てにならない。学生フォーミュラのラップタイムはまさにこの領域で決まる。(b) 複合スリップ時の Mz は純スリップの Mz より格段に難しく、縦力による項（Mz にかかる s·Fx 項）を含めても実測との一致は悪くなりがち。(c) 純スリップ側の当てはめが悪いと複合側は必ずもっと悪くなる（誤差が積み上がる）。
- 学生フォーミュラでの実行可能性: 第10章の中核。第IV部（ラップタイムシミュレーション）の精度がここで決まるので、教科書としては「複合試験データを持っているか」で読者を2分岐させ、持っていない場合はブラシモデル由来の摩擦楕円で代替し、その保守性（どちら側に誤るか）を明記する構成が誠実。
- MATLAB実装経路: MFeval が複合スリップまで含めて評価する（入力に縦スリップ率とスリップ角を同時に与える）。Vehicle Dynamics Blockset の Combined Slip Wheel 2DOF が Simulink 実装。自作するなら Pacejka 3rd ed. 第4章の式群をそのまま実装する。

**[実務標準] Magic Formula MF6.1 / MF6.2（内圧依存・大キャンバ・turn slip）**

- 仮定・成立条件: MF5.2 を拡張し、(1) 内圧依存を正規化内圧増分（基準内圧 p0 に対する相対変化）として導入し、剛性・ピーク値などをスケールする、(2) 大きなキャンバ角に対応、(3) 転がり抵抗の記述を改善、(4) turn slip を扱えるようにした版。MF6.1 の定式化は Besselink・Schmeitz・Pacejka (2010, Vehicle System Dynamics 48:sup1) が原典で、これは TU/e のリポジトリでオープンアクセス公開されている。MF6.2 はその後継で、MathWorks の Vehicle Dynamics Blockset が実装しているのはこの MF6.2。内圧依存の具体的な係数名（PP系）は .tir ファイルと原典で確認すること（本調査では原典PDFのテキスト抽出に失敗したため、係数名の逐語的確認は未了）。
- 破綻条件（次の階層へ進むべき時）: (a) 内圧依存係数を同定するには複数内圧での試験が必要。TTCは内圧を振ったマトリクスを持つが、チームが自前でスイープを増やせるわけではない。(b) turn slip の係数は、平面ベルト試験機が turn slip 入力を与えないため TTCデータからは同定できない。「モデルは対応しているが係数が埋まらない」典型例で、既定値のまま使えば実質的に無効。学生フォーミュラのスキッドパッド（半径約8m台）やヘアピンは turn slip が理論上効く領域なので、ここは教科書として「知る価値はあるが実行できない」と明記すべき。(c) 係数が増えた分だけ過学習（overfitting）しやすく、データが薄いと MF5.2 より悪化することさえある。(d) 温度・摩耗は依然として範囲外。
- 学生フォーミュラでの実行可能性: 内圧依存は学生フォーミュラで実際に効く。エンデュランス中にタイヤ温度が上がって内圧が変わり、冷間セット圧の決定はチームの実務課題そのものだからである。したがって MF6.x の内圧項は「使う価値がある拡張」。一方 turn slip 項は係数が埋まらないので実行不可。この2つを同じ『MF6.x』として一括りにせず、使える拡張と使えない拡張に分けて教えることが重要。
- MATLAB実装経路: Vehicle Dynamics Blockset の Combined Slip Wheel 2DOF が MF6.2 を実装し、.tir / .txt / .mat を読み込む。MF5.2 の .tir は Extended Tire Features サポートパッケージで MF6.2 に変換できる（TYDEX v1.3 のデータ入力にも対応）。MFeval は MF6.1・MF6.2 の .tir をそのまま評価できる。Simscape Driveline の Tire (Magic Formula) は Besselink 2010 を参照しているが縦方向のみなので、横・キャンバを扱う用途には使えない。

**[実務標準] 過渡タイヤモデル：relaxation length による一次遅れ**

- 仮定・成立条件: タイヤの横力・縦力はスリップ入力に対して瞬時には立ち上がらず、カーカスの弾性変形が定常状態に達するまで距離を要する。これを「単接触点過渡モデル（single contact point transient model）」として、スリップ量に対する一次遅れ dα'/dt + (V/σ)·α' = (V/σ)·α で表す。σ が relaxation length（緩和長）で、物理的には σ ≈ Cα / Ky（コーナリングスティフネス ÷ カーカス横剛性）。時定数が σ/V、すなわち時間ではなく走行距離で決まるのが本質。原典は Pacejka & Besselink, 'Magic Formula Tyre Model with Transient Properties', Vehicle System Dynamics 27(sup1), 1997。
- 破綻条件（次の階層へ進むべき時）: (a) 一次遅れ近似は、入力の波長が接地長に対して十分長いときにしか成立しない。おおむね 8〜10 Hz 程度を超える高周波、あるいは接地長オーダーの短波長入力では、接地面内の変形分布を無視した単接触点近似が崩れる（次階層のストリングモデルへ）。(b) σ は定数ではなく Fz とスリップ量に依存する（限界付近で短くなる）。定数 σ を使うと限界付近の過渡が合わない。(c) 縦と横で σ が異なる。(d) 路面凹凸によるタイヤ自体の上下ダイナミクス（ベルトの固有振動）は含まない。
- 学生フォーミュラでの実行可能性: 学生フォーミュラでは道路車両より重要度が上がる。時定数が σ/V なので低速ほど遅れが大きく、アウトクロス／スキッドパッドの走行速度域（おおむね40〜70 km/h）では乗用車の高速走行時より遅れが顕著に効くからである。第5章（過渡応答）、第32章（過渡を含むラップタイムシミュレーション）、第35章（EKFによる車体すべり角推定）、第39章（MPC）はいずれも σ の扱いで結果が変わる。σ を無視した状態推定器は、ステア入力直後に系統的なバイアスを出す。
- MATLAB実装経路: Vehicle Dynamics Blockset の Fiala Wheel 2DOF と Combined Slip Wheel 2DOF がともに relaxation length による一次遅れを実装している（Fiala は Lrelx / Lrely パラメータ）。自作する場合は Simulink の Transfer Fcn ではなく、V が変化するため 1/s 積分器と V/σ ゲインで組む（V→0 で発散しないよう下限クランプ必須）。σ の実測は、定速でステアをステップ入力し横力の立ち上がり距離を見る、あるいは Cα と実測カーカス横剛性から算出する。

**[研究/上級（教科書としては読むべき、実装は選択的）] ストリングモデル（stretched string、非定常・有限波長）**

- 仮定・成立条件: タイヤを弾性支持された張力の掛かった弦（string）と見なし、接地面内の横変形分布を空間的に解く。これにより、入力波長が接地長と同オーダーになる領域での周波数応答（振幅・位相の低下）を物理的に表現できる。Pacejka の教科書では out-of-plane（面外）非定常挙動の章として体系化されている（3rd ed. 第5章相当、2nd ed. のチャプターDOI 10.1016/b978-075066918-4/50005-8 で構成を確認できる）。単接触点一次遅れは、このモデルの長波長極限として導出される。
- 破綻条件（次の階層へ進むべき時）: (a) 定式化が線形で、大スリップ・摩擦限界近傍には拡張が要る。(b) 面内（縦・上下）の挙動は別モデルが必要。(c) 実装コストと係数同定コストが跳ね上がる一方、車両運動レベルの応答（ヨーレート、横加速度）への寄与は一次遅れ近似からの改善分が小さい。
- 学生フォーミュラでの実行可能性: 『知る価値はあるが、学生フォーミュラで実行する意味は薄い』階層。教科書としては、なぜ一次遅れ近似が正当化されるのか、その正当化がどの周波数で切れるのかを示すために必要。実装して車両モデルに組み込む価値は、DIL（第44〜46章）で操舵反力の高周波成分を扱う場合を除けばほぼ無い。
- MATLAB実装経路: 既存のMATLAB Toolboxに直接のブロックは無い。学習目的なら周波数応答を解析的に評価するスクリプトを自作し、一次遅れモデルの bode 応答と重ねて「どこから乖離するか」を可視化するのが最も教育効果が高い。

**[研究最前線／商用高度モデル] MF-Swift（Magic Formula ベースのリジッドリングモデル）**

- 仮定・成立条件: Magic Formula による接地面の力・モーメント生成に、ベルトを剛体リング（rigid ring）として弾性支持する構造モデルを重ねる。これにより、タイヤ自体の固有振動（おおむね60〜100 Hz 程度までの帯域）、路面凹凸に対する応答、短波長入力に対する接地面の実効的な平滑化（enveloping）を扱える。原典は Schmeitz, Besselink, Jansen, 'TNO MF-SWIFT', Vehicle System Dynamics 45(sup1), 2007、および構造とパラメータ化について Schmeitz & Versteden, Tire Science and Technology 37(3), 2009。ABS のような高帯域制御の検証で実績がある（Pauwelussen et al., Control Engineering Practice 11(2), 2003）。
- 破綻条件（次の階層へ進むべき時）: (a) リジッドリング仮定は、ベルトが剛体として動く帯域までしか有効でない。それ以上の周波数・短波長では柔軟リング／構造モデル（FTire, CDTire）が必要。(b) 構造パラメータの同定には、力・モーメント試験に加えてクリートを踏ませる試験や剛性・モーダル試験が要る。これは商用試験機の領域で、TTCの試験マトリクスには含まれない。(c) 商用ライセンス（Siemens Simcenter Tire / Delft-Tyre 系）が前提。
- 学生フォーミュラでの実行可能性: 『知る価値はあるが、学生フォーミュラでは実行できない』。理由は係数同定が不可能だから（データが存在しない）であって、モデルが難しいからではない。この区別を教科書で明示することが重要。唯一の接点は、第44〜46章のDILで路面入力の質感を扱うときに「なぜ Magic Formula 単体ではステアリングに路面を感じないのか」を説明する文脈。
- MATLAB実装経路: MathWorks 公式の Vehicle Dynamics Blockset ドキュメントが挙げる対応タイヤモデルは Magic Formula 5.2 / 6.2 / Dugoff / Fiala の4種であり、MF-Swift（Delft-Tyre）は Extended Tire Features のページには記載されていない。使うならベンダー提供の Simulink S-Function 経由になり、実質的に商用ライセンスが必要。学生チームの現実的な実装経路は無いと判断すべき。

**[研究最前線／商用高度モデル] FTire / CDTire（柔軟リング・構造ベースの高忠実度モデル）**

- 仮定・成立条件: FTire（Michael Gipser, Vehicle System Dynamics 43(sup1), 76–91, 2005）はベルトを柔軟な環状構造として離散化し、トレッドブロックの摩擦接触を含めて解く物理モデル。CDTire（Fraunhofer ITWM, Gallrein & Bäcker, Vehicle System Dynamics 45(sup1), 69–77, 2007）は快適性・耐久性（durability）用途向けのモデル群で、CDTire/3D のような3次元構造版まで階層化されている。いずれも数百Hz級の帯域、短波長路面、大変形、路面形状の詳細（RGRロードモデル等）を扱える。
- 破綻条件（次の階層へ進むべき時）: (a) パラメータ同定が最も重い階層。構造試験・材料試験・モーダル試験を含む専用の同定プロセスが必要で、通常はタイヤメーカーまたは専門ベンダーが実施する。(b) 計算コストが高くリアルタイム実行に制約がある（CDTire は実時間版を持つが、それでも Magic Formula とは桁が違う）。(c) 用途が乗り心地・耐久・路面入力であり、定常コーナリング性能の予測精度が Magic Formula より高いとは限らない。目的が違うモデルを「上位互換」と誤解しないこと。
- 学生フォーミュラでの実行可能性: 学生フォーミュラでは実行不可能。ライセンス費用と同定データの両方が手に入らない。教科書での役割は、モデル階層の上端を示して『Magic Formula より上に何があり、それはどんな問いに答えるためのものか』を読者に位置づけさせること。学生フォーミュラの主要な問い（旋回性能、ラップタイム、セットアップ）に対しては、これらは正しい道具ではないと明言してよい。
- MATLAB実装経路: FTire・CDTire ともにベンダーが Simulink / Simscape Multibody 向けインターフェースを提供するが、いずれも商用。MathWorks 標準製品には含まれない。

**[研究最前線] 熱モデル（タイヤ温度分布・フラッシュ温度）**

- 仮定・成立条件: ゴムの摩擦係数は温度に強く依存するため、力の生成モデルにタイヤ温度を状態として結合する。代表例が TRT（Thermo Racing Tyre）モデル（Farroni, Giordano, Russo, Timpone, Meccanica 49(3), 707–723, 2014）で、タイヤ断面を層（表面・ベルト・インナーライナー）に分けた熱伝導モデルに、摩擦仕事による発熱、路面・空気・内気への熱伝達、変形によるヒステリシス発熱を入れて温度分布を解き、その温度で摩擦係数をスケールする。さらに接地する瞬間の局所的な高温（flash temperature）まで扱う定式化もある（Mavros, Vehicle System Dynamics 57(5), 721–751, 2019）。
- 破綻条件（次の階層へ進むべき時）: (a) 熱物性値（ゴムの熱伝導率・比熱・密度、路面との熱伝達係数）が同定困難で、これらが結果を支配する。(b) μ(T) の関係そのものをタイヤごとに実測する必要があり、TTCの標準試験ではこれを分離して取れない。(c) モデルが車両モデルと双方向に結合するため（温度→力→スリップ→発熱→温度）、数値的に不安定になりやすい。(d) 温度と内圧と摩耗が同時に動くので、熱だけ入れて他を固定すると、かえって系統誤差を作ることがある。
- 学生フォーミュラでの実行可能性: 『実務上は極めて重要だが、モデルとしては実行困難』という珍しい位置。学生フォーミュラでもタイヤウォーマーの可否、エンデュランス中の性能劣化、冷間セット圧の決定は現実の勝敗要因である。現実的な落としどころは、フルの熱モデルではなく (1) タイヤ表面温度と内圧を実測してログする、(2) 温度帯ごとに Magic Formula の摩擦スケーリング係数（λμx, λμy）を分けて同定する、という「離散化された熱依存」に留めること。TTCデータには温度チャンネルが含まれるので、これは加入チームなら実行可能。
- MATLAB実装経路: 既製ブロックは無い。Simulink で熱の集中定数モデル（数状態のODE）を自作し、出力温度で Magic Formula の λμ スケーリング係数を変調する構成が現実的。Simscape の熱ドメインを使えば熱回路として組める。MFeval は λμ 系のユーザースケーリング係数を .tir 経由で扱えるので、そこに温度依存を差し込むのが最短経路。

**[研究最前線] 摩耗・経時劣化モデル**

- 仮定・成立条件: 摩擦仕事（滑り速度 × せん断応力の接地面積分）の蓄積によりトレッドゴムが減り、同時に熱履歴でゴム物性が変化する（heat cycling）として、ピーク摩擦係数と剛性の低下を記述する。多くは摩擦パワーの累積量を説明変数とする経験式。
- 破綻条件（次の階層へ進むべき時）: (a) 定量的な予測モデルは、タイヤメーカー固有の材料データなしには成立しない。公開文献のモデルは定性的傾向を示すに留まる。(b) 摩耗と熱と内圧が交絡し、実測から摩耗単独の寄与を分離することがほぼ不可能。(c) 学生フォーミュラの走行距離スケール（エンデュランス22km級）では、物理的摩耗より熱履歴によるグリップ低下のほうが支配的なことが多く、『摩耗モデル』という名前が誤導になりうる。
- 学生フォーミュラでの実行可能性: モデル化としては実行不可能。ただし教科書に載せる価値は高い。理由は、TTCデータ自体がこの効果に汚染されているからである。TTCは1本のタイヤで長い試験マトリクスを走るため、試験の後半ほどピーク摩擦が落ちる。これを知らずに全ランを混ぜて当てはめると、モデルが実際より悪い（あるいは条件によって食い違う）値に収束する。第9章の係数同定と第27章の妥当性判断基準で必ず触れるべき。
- MATLAB実装経路: 既製実装は無い。実務的には摩耗そのものをモデル化するのではなく、『同定に使うデータをどのランから取るか』というデータ選別の問題として扱う。MATLAB では TTCデータをラン番号・経過時間で層別し、ピーク μ のドリフトをプロットして確認する前処理スクリプトを書くのが正しい対応。

### 実務でよく起きる誤り

- 【符号系の取り違え】最頻出かつ最も被害が大きい。本書は ISO 8855（x前方・y左・z上）を採用するが、TTC/Calspan の生データや Milliken の RCVD、多くのSAE論文は SAE J670 系（y右・z下）で書かれている。変換時に Fy・Mz・キャンバ角（IA）・スリップ角の符号を一貫して反転しないと、モデルは動くが挙動が鏡像になる（アンダーとオーバーが入れ替わる、セルフアライニングトルクが復元でなく発散方向に働く）。しかも線形域では見た目が自然なので発覚が遅れる。対策は、生データの符号系を推測せずに必ず付属ドキュメントで確認し、変換関数を1箇所に閉じ込め、既知の物理（正のスリップ角で復元モーメントが出る）で単体テストすること。
- 【Magic Formula を物理モデルだと誤解する】MF は高精度な内挿式であって物理モデルではない。B・C・D・E に物理的解釈（D=ピーク、C=形状、BCD=原点勾配、E=ピーク近傍の曲率）はあるが、それは当てはめ結果の読み方であって外挿能力を与えない。同定データの荷重・キャンバ・内圧の範囲外は保証されず、特に低荷重域の外挿は学生フォーミュラで実際に踏む。『係数が入っているから正しい値が返る』という思い込みが、破綻を静かに隠す。
- 【E > 1 を許して当てはめる】曲率係数 E が1を超えると曲線がピーク後に非物理的に折り返す。MathWorks の公式手順も Ex ≤ 1、Cx > 0、Dx > 0 といった非線形制約を fmincon に与えることを推奨している。制約なしの最小二乗はデータの端で平然と E > 1 に落ちる。
- 【当てはめの順序を守らない】Fx0（純縦）と Fy0（純横）を先に確定してから、それに依存する Mz0・複合スリップ・モーメント系へ進む。全モードを同時に最適化すると、従属モードの誤差が純スリップ側の係数を引きずって全体が悪化する。MathWorks 公式ブログが明示している段階的手順。
- 【Simscape Driveline の Tire (Magic Formula) を全方向タイヤだと思って使う】公式ドキュメントに『縦運動のみを仮定し、キャンバ・旋回・横運動を含まない』と明記されている。パワートレイン・駆動系の検討用であって、旋回性能の検討には使えない。第22章（駆動系）で使うのは正しく、第23章（非線形4輪モデル）で使うのは誤り。
- 【Vehicle Dynamics Blockset のタイヤブロック選択とMFバージョンの不整合】Combined Slip Wheel 2DOF が実装しているのは MF6.2。手持ちの .tir が MF5.2 の場合は Extended Tire Features サポートパッケージで変換が要る。バージョンを意識せずに読み込ませて、係数が既定値で埋まったまま気づかない事故が起きる。
- 【TTCデータの単位系・フォーマットを確認しない】TTCは SI 系と Imperial 系の両方で配布される。MathWorks の解説は MAT形式かつSI単位のものだけを使うよう明記している。単位を取り違えると、係数は収束するが値が桁違いになる。
- 【平面ベルト試験の摩擦係数をそのまま実路面に持ち込む】TTCは Calspan の平面ベルト機で 25 mph、研磨材系のベルト表面上で試験する。試験室の路面と実際のパドック・コース路面は摩擦特性が違うため、同定した D（≒μ·Fz）をそのまま使うとラップタイムが楽観側にずれる。対策は、スキッドパッドの実測最大横G と突き合わせて摩擦スケーリング係数（λμx, λμy）を較正すること。第27章の妥当性判断基準に組み込むべき論点。
- 【1本のタイヤで走った長い試験マトリクスを層別せずに全部混ぜて当てはめる】試験が進むにつれて熱履歴と摩耗でピーク摩擦が下がるため、ラン順を無視して混合すると、当てはめが『どの状態でもない中間値』に収束する。ラン番号・経過時間で層別し、ピーク μ のドリフトを可視化してから使うデータを決める。
- 【温度と内圧のドリフトを『ばらつき』と見なす】試験中も実走行中もタイヤ温度が上がり、それに伴って内圧が上がる。同じスリップ角でも力が変わるのに、時系列でなく散布図だけ見ていると単なるノイズに見える。MF5.2 は内圧依存を持たないので、この系統的変化を吸収できず残差に押し込まれる。
- 【relaxation length を無視して過渡・状態推定を語る】σ の時定数は σ/V であり、速度が低いほど遅れが長い。学生フォーミュラの速度域では効きが大きい。σ を入れない状態推定器（第35章のEKFによる車体すべり角推定）は、ステア入力直後に系統的バイアスを出す。また V→0 で 1/V が発散するため、実装では速度に下限クランプが必須。
- 【摩擦円を真円だと思い、Fx と Fy を単純に二乗和で扱う】実タイヤは縦横で剛性も摩擦も等方でなく、Fx のピークと Fy のピークは同じスリップ量では立たない。摩擦『楕円』ですら近似で、複合スリップ時の Mz は特に単純な合成則に従わない。第28章の g-gダイアグラムの形状がここで決まる。
- 【複合スリップ係数を既定値のまま使う】複合試験データが無いのに MF の r 系係数をデフォルトで残すと、g-gダイアグラムの斜め領域が根拠のない値になる。ラップタイムはまさにその領域で決まるため、『純スリップは合っているのにラップタイムが合わない』という診断困難な状態を作る。データが無いなら MF の複合スリップを使わず、ブラシモデル由来の摩擦楕円で代替し、その旨をモデル仕様に明記するほうが誠実。
- 【ニューマチックトレールを一定として Mz を扱う】ブラシモデルが示すとおり、トレールは α=0 で a/3 程度から始まりスリップ角とともに単調に減少して限界付近でゼロに近づく（さらにキャンバ・複合スリップで負にもなりうる）。一定トレールでは、ドライバーが限界を察知する最重要の手がかりである『操舵反力の抜け』が再現できず、第13章（操作系コンプライアンスと反力トルク）と第45章（DIL 反力）が根本から成立しない。
- 【コーナリングスティフネスの符号定義を文書内で統一しない】Cα を正で定義して Fy = −Cα·α と書くか、Fy = Cα·α と書くかは流儀が分かれる。章をまたいで混在すると、スタビリティファクタの符号が反転してアンダー／オーバーの判定が逆になる。教科書では第2章で1度だけ定義し、全章で機械的に守る。
- 【turn slip 対応を『使える機能』と誤認する】MF6.x は turn slip を扱えるが、平面ベルト試験機が turn slip 入力を与えないため TTCデータからは係数が同定できない。モデルの能力と、その能力を発揮させるデータの有無は別問題。『モデルが対応している＝使える』ではない。
- 【上位モデルを常に上位互換だと思う】FTire・CDTire は乗り心地・耐久・路面入力のためのモデルであり、定常コーナリング性能の予測が Magic Formula より正確とは限らない。MF-Swift も帯域を広げるのが目的。目的の違うモデルを忠実度の一次元尺度で並べると、選択を誤る。
- 【モデル階層を上げれば精度が上がると考える】係数が増えるほど過学習しやすい。データが薄い状態で MF5.2 から MF6.x に上げると、かえって外挿性能が落ちることがある。階層を上げる正しい条件は『いま使っているモデルが破綻する現象を実測で確認し、かつ次の階層の係数を埋めるデータがある』ことの両方であって、片方だけでは上げてはならない。

### 学生フォーミュラ固有の事情

【タイヤサイズと動作点が乗用車と根本的に違う】学生フォーミュラは10〜13インチの小径タイヤで、接地長が短く、relaxation length σ も小さい一方、走行速度が低い（平均40〜70 km/h 級）ため時定数 σ/V は乗用車の高速走行時より大きくなる。つまり「小さいタイヤだから過渡は速い」は誤りで、速度が低い分だけ距離ベースの遅れが時間として長く効く。第5章と第32章で明示すべき。

【低速・小旋回半径ゆえに turn slip が理論上効く】スキッドパッド（外径15.25m級の8の字）やヘアピンは旋回半径が小さく、MF6.x が扱える turn slip の効く領域。しかし TTC の平面ベルト試験機は turn slip 入力を与えないため係数が同定できない。「モデルは対応しているが係数が埋まらない」典型例で、教科書としては使えない拡張として明記する。

【低ダウンフォース・大荷重移動】空力荷重が小さく重心高／トレッド比が不利なため、定常旋回中の内外輪荷重差が乗用車より大きい。結果として (1) load sensitivity の影響が支配的になり線形モデルの誤差が大きい、(2) 内輪 Fz がほぼゼロまで抜けるので Magic Formula の低荷重外挿域を実際に踏む。TTC試験マトリクスの最低荷重より下は外挿であり、ここで非物理的な挙動（Fy の折り返し、負の剛性）が出ていないか coefficientCheck 等で必ず確認する必要がある。

【TTCの性格と入手条件（確認済み）】FSAE Tire Test Consortium は Calspan の平面ベルト試験機（flat-belt / flat-track）で、FSAEの実走行速度に合わせた 25 mph で試験する。加入は一度きりの登録料 500 USD で、登録フォームは millikenresearch.com 経由、データは会員専用フォーラム（fsaettc.org、phpBB）からダウンロードする。Calspan によれば 8ラウンドの試験が完了しており、40種類以上のタイヤ構造に対し430超の試験が行われている。横力試験に加えて静的・動的スプリングレート測定を含む。タイヤはメーカーからの寄贈で、寄贈の見返りにメーカーもデータにアクセスする。具体的な荷重・キャンバ角などのマトリクスはラウンドごとに改訂される。

【TTCデータが無いチームの現実的な代替（優先順）】
1. 実車実測でコーナリングスティフネスの前後比を逆算する。定常円旋回でステア角・ヨーレート・横加速度をログし、アンダーステア勾配から前後 Cα 比を求める。絶対値でなく比なら実車から取れ、第I部・第4章の設計判断（スタビリティファクタ）にはこれで足りる。
2. スキッドパッドで最大横G を実測し、Magic Formula の D（≒μ·Fz）ではなくブラシモデルの μ を直接決める。接地長 2a は車体に載せて墨・粘土で接地痕を取れば実測できる。トレッド剛性 cp は Cα と a から逆算。これで3パラメータのブラシモデルが実測だけで閉じる。
3. Fiala モデル（Vehicle Dynamics Blockset）を既定値として車両モデルを先に完成させ、実測が取れ次第パラメータを差し替える。MathWorks 公式ドキュメントが Magic Formula 係数を持たない場合の第一候補として Fiala を推奨している。
4. 公開されている乗用車用 .tir を「形」の教材として読む。ただし数値を自チームのタイヤに転用してはならない（サイズ・構造・コンパウンドが違う）。
5. 直線加速の実測から縦スリップ剛性の当たりを付ける（トラクション限界の加速度から D の縦成分）。

【MATLAB/Simulink の入手性（確認済み）】MathWorks は Formula SAE / Formula Student 参加チームに 100以上の製品を無償提供しており、Vehicle Dynamics Blockset と Simscape 一式（Driveline / Multibody 等）が含まれる。チームリーダーまたは指導教員が Student Competition Software Request Form を提出する。つまり第II部で扱うタイヤブロックはすべて学生が正規に入手できる。

【複合スリップ試験データが最大のボトルネック】ラップタイムは g-gダイアグラムの斜め領域（トレイルブレーキング・脱出加速）で決まるのに、複合スリップ係数の同定に必要なデータが最も入手しにくい。教科書は読者を「複合データを持つ／持たない」で分岐させ、持たない場合はブラシモデル由来の摩擦楕円で代替したうえで、その近似がどちら側に誤るか（一般に楽観側か保守側か）を明示する構成が誠実。

### 参照文献

- **Pacejka, H. B., "Tire and Vehicle Dynamics," 3rd ed., Butterworth-Heinemann (Elsevier) / SAE International, Oxford, 2012. ISBN 978-0-08-097016-5（電子版 978-0-08-097017-2）、672ページ。Igo J. M. Besselink（Eindhoven工科大学）が寄稿著者。** ✓実在確認（訂正: OpenLibrary 書誌レコードで 2012年・672ページ・ISBN 9780080970165・Butterworth-Heinemann / Elsevier Science & Technology Books を確認。著者欄は Hans Pacejka と I. J. M. Besselink の連名で登録されており、「Besselink が寄稿著者」という記述は妥当（第3版で Besselink が加筆）。出版社を「Elsevier / SAE International」と併記する場合、書誌レコード上の出版社は Butterworth-Heinemann（Elsevier）であり、SAE は共同販売元。教科書では「Butterworth-Heinemann (Elsevier), 2012」と書くのが正確。）
  - 種別: 書籍 / 入手性: 有料（大学図書館経由が現実的）。多くの工学系大学が Elsevier ScienceDirect 経由で電子版を契約している。
  - 用途: タイヤモデル全章の正典。第7〜11章（スリップ定義、Magic Formula、係数同定、複合スリップ）と第II部の過渡タイヤ記述の主要典拠。Magic Formula の完全な式群（複合スリップ、Mz、キャンバ）と、単接触点過渡モデル・ストリングモデルの理論がここに集約されている。3rd ed.（2012）が最新で、第4版は2026年8月時点で確認できない。MathWorks の Vehicle Dynamics Blockset ドキュメントも本書3rd ed. を参照文献に挙げている。
- **Milliken, W. F. and Milliken, D. L., "Race Car Vehicle Dynamics," SAE International, Warrendale PA, 1995. R-146, ISBN 978-1-56091-526-3（ISBN-10: 1-56091-526-9）、922ページ。** ✓実在確認（訂正: 書籍・著者・年・出版社・ISBN-10（1560915269）はすべて確認済み。LCCN 94036941 / OCLC 31288484 / OpenLibrary OL1111145M。**ページ数は890ページ**であり、リストの「922ページ」は確認できなかった（同じリストの No.29 は890ppと正しく記載しており、No.2 の922が誤り）。教科書では「890 pp.」と書くか、ページ数を書かないこと。なお SAE 商品番号 R-146 は正しい。）
  - 種別: 書籍 / 入手性: 有料（SAE または一般書店）。日本の大学図書館にも所蔵が多い。
  - 用途: 第I部（車両運動）と第II部（タイヤ・サスペンション）の全体構成の基準。特にタイヤ章の実務的な記述（コーナリングスティフネス、荷重感度、ニューマチックトレール、摩擦円）と、レース現場の言語（アンダーステア勾配、Y-Mo図）を教科書に接続するために必要。SAE J670 系の符号を使っているため、ISO 8855 との差異を第1章で扱う際の具体例としても使う。別冊の演習書 "RCVD: Problems, Answers and Experiments"（スパイラル製本）が存在する。
- **Bakker, E., Nyborg, L., and Pacejka, H. B., "Tyre Modelling for Use in Vehicle Dynamics Studies," SAE Technical Paper 870421, 1987.** ✓実在確認（訂正: Crossref レコードで完全一致を確認（Egbert Bakker, Lars Nyborg, Hans B. Pacejka / 1987 / SAE Technical Paper Series / proceedings-article）。訂正不要。Magic Formula の原典論文。）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学のSAE契約経由で入手できる場合が多い。
  - https://doi.org/10.4271/870421
  - 用途: Magic Formula の原典。第8章で「なぜこの形の式なのか」を歴史的に説明するために引く。著者所属が Volvo Car Corp. の Chassis Engineering と Delft工科大学 Vehicle Research Laboratory であることも、この式が産業界の実務要求から生まれたことを示す材料になる。DOI は Crossref で実在を確認済み。
- **Pacejka, H. B. and Bakker, E., "The Magic Formula Tyre Model," Vehicle System Dynamics, Vol. 21, Issue sup001, pp. 1–18, 1992.** ✓実在確認（訂正: Crossref で巻21・号 sup001・pp.1-18・1992年を完全一致で確認。原題は全大文字表記（THE MAGIC FORMULA TYRE MODEL）で登録されているが、通常表記で引用して問題ない。訂正不要。）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由。
  - https://doi.org/10.1080/00423119208969994
  - 用途: Magic Formula バージョン3の体系的記述。第8章で B・C・D・E の各係数の意味と、荷重・キャンバ依存の入れ方を説明する際の一次典拠。Crossref で書誌（巻・号・ページ・年・DOI）を確認済み。
- **Pacejka, H. B. and Besselink, I. J. M., "Magic Formula Tyre Model with Transient Properties," Vehicle System Dynamics, Vol. 27, Issue sup001, pp. 234–249, 1997.** ✓実在確認（訂正: Crossref で巻27・号 sup001・pp.234-249・1997年を完全一致で確認。訂正不要。過渡タイヤ特性（リラクセーションレングス）を扱う原典で、第II部タイヤ④および第V部の過渡モデルに直結。）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由。
  - https://doi.org/10.1080/00423119708969658
  - 用途: relaxation length による単接触点過渡モデルを Magic Formula に結合する定式化の典拠。第5章（過渡応答）、第32章（過渡を含むラップタイムシミュレーション）、第35章（EKFによる車体すべり角推定）で σ を導入する根拠として引く。Crossref で確認済み。
- **Besselink, I. J. M., Schmeitz, A. J. C., and Pacejka, H. B., "An improved Magic Formula/Swift tyre model that can handle inflation pressure changes," Vehicle System Dynamics, Vol. 48, Issue sup1, pp. 337–352, 2010.** ✓実在確認（訂正: Crossref で巻48・号 sup1・pp.337-352・2010年を完全一致で確認。訂正不要。MF 6.1/6.2 の空気圧依存性の根拠論文で、FSAE TTC データの空気圧スイープを扱う章で必須。）
  - 種別: 論文 / 入手性: オープンアクセス版あり: https://pure.tue.nl/ws/files/3139488/677330157969510.pdf （出版社版は有料）
  - https://doi.org/10.1080/00423111003748088
  - 用途: MF-Tyre 5.2 から MF6.1 への拡張（内圧依存、大キャンバ角対応、転がり抵抗の記述改善）の原典。第8章で MF5.2 と MF6.x の違いを説明する中心典拠。学生フォーミュラでは冷間セット圧の決定が実務課題なので、内圧依存の項は「実際に使う価値のある拡張」として扱う。MathWorks の Simscape Driveline / Vehicle Dynamics Blockset も本論文を参照文献に挙げている。TU/e リポジトリにオープンアクセス版がある（PDF実在を確認済み。ただし本調査ではPDF本文のテキスト抽出に失敗しており、内圧依存の個々の係数名の逐語的確認は未了）。
- **Schmeitz, A. J. C., Besselink, I. J. M., and Jansen, S. T. H., "TNO MF-SWIFT," Vehicle System Dynamics, Vol. 45, Issue sup1, pp. 121–137, 2007.** ✓実在確認（訂正: Crossref で巻45・号 sup1・pp.121-137・2007年を完全一致で確認。訂正不要。）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由。
  - https://doi.org/10.1080/00423110701725208
  - 用途: MF-Swift（Magic Formula ベースのリジッドリングモデル）の原典。第II部でモデル階層の上端を示し、「Magic Formula の上に何があるか」を位置づけるために引く。学生フォーミュラでは係数同定が不可能なので、実行できない階層の代表例として扱う。Crossref で確認済み。
- **Schmeitz, A. J. C. and Versteden, W. D., "Structure and Parameterization of MF-Swift, a Magic Formula-based Rigid Ring Tire Model," Tire Science and Technology, Vol. 37, Issue 3, pp. 142–164, 2009.** ✓実在確認（訂正: Crossref で巻37・号3・pp.142-164・2009年を確認。Crossref のタイトル末尾に組版由来の脚注番号「3」が混入している（"...Rigid Ring Tire Model3"）が、正しいタイトルはリスト記載どおり。訂正不要。）
  - 種別: 論文 / 入手性: 有料（Tire Science and Technology）。大学経由。
  - https://doi.org/10.2346/1.3138768
  - 用途: MF-Swift の構造とパラメータ化手順を示す論文。「なぜ学生チームには同定できないのか」を具体的に説明する材料（必要な試験の種類）として引く。Crossref で確認済み。
- **Gipser, M., "FTire: a physically based application-oriented tyre model for use with detailed MBS and finite-element suspension models," Vehicle System Dynamics, Vol. 43, Issue sup1, pp. 76–91, 2005.** ✓実在確認（訂正: Crossref で Michael Gipser・巻43・号 sup1・pp.76-91・2005年を確認。訂正不要。物理ベースタイヤモデルの代表として、Magic Formula（半経験式）との対比に使える。）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由。
  - https://doi.org/10.1080/00423110500139940
  - 用途: FTire の原典。柔軟リング＋トレッドブロック接触という高忠実度構造モデルの代表として、モデル階層の最上端を示すために引く。用途が乗り心地・耐久・路面入力であり、定常コーナリング性能の予測が Magic Formula より正確とは限らないという「目的の違い」を教える材料。Crossref で確認済み。同著者の続報 "FTire – the tire simulation model for all applications related to vehicle dynamics," VSD 45(sup1), pp. 139–151, 2007, DOI 10.1080/00423110801899960 も実在を確認済み。
- **Gallrein, A. and Bäcker, M., "CDTire: A Tire Model for Comfort and Durability Applications," Vehicle System Dynamics, Vol. 45, Issue sup1, pp. 69–77, 2007.** ✓実在確認（訂正: Crossref で A. Gallrein, M. Bäcker・巻45・号 sup1・pp.69-77・2007年を確認。Crossref 上のタイトル表記は小文字（"CDTire: a tire model for comfort and durability applications"）。内容は乗り心地・耐久用途であり、レース車両のグリップ予測が主題ではない点を教科書で明示すること。）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由。
  - https://doi.org/10.1080/00423110801931771
  - 用途: Fraunhofer ITWM の CDTire の原典。FTire と並べて、高忠実度タイヤモデルが「快適性・耐久性」という別の問いのための道具であることを示す。Crossref で確認済み。
- **Kasprzak, E. M. and Gentz, D., "The Formula SAE Tire Test Consortium—Tire Testing and Data Handling," SAE Technical Paper 2006-01-3606, 2006.（Motorsports Engineering Conference & Exposition, Dearborn, Michigan, 2006年12月5日発表。著者所属: University at Buffalo / Calspan Corp.）** ✓実在確認（訂正: Crossref で Edward M. Kasprzak（University at Buffalo）, David Gentz（Calspan Corp.）・2006年・SAE Technical Paper Series を確認。所属もリスト記載どおりで正しい。訂正不要。FSAE TTC データを使う章の一次ソースとして最適。）
  - 種別: SAE Technical Paper / 入手性: 著者の所属機関 Milliken Research Associates が全文PDFを公開している: https://www.millikenresearch.com/TTC_SAE_paper.pdf （URLの実在と配信を確認済み）。SAE Mobilus 版は有料。
  - https://doi.org/10.4271/2006-01-3606
  - 用途: TTC の成り立ち、組織、試験マトリクスの設計思想、出力チャンネル、FSAEチームによる実用方法を記した一次資料。第9章（係数同定）と第24章（パラメータ入手）で TTC を扱う際の中心典拠。TTCがどういう性格のデータなのかを学生に理解させるうえで代替がない。DOI・書誌ともに SAE Mobilus 上で確認済み。
- **Calspan, "FSAE TTC"（Formula SAE Tire Test Consortium 公式案内ページ）** ✓実在確認（訂正: ページ実取得で確認。正しい URL は末尾スラッシュ付き https://calspan.com/automotive/fsae-ttc/ 。記載内容：Calspan が TTC のタイヤデータ唯一の提供元、2005年以降8ラウンドの試験を実施、565校超が参加、試験場所は Buffalo NY。**データ入手には登録フォーム提出と 500 USD の支払いが必要**で、会員は secure forum からデータセットをダウンロードする。教科書でデータ入手手順を書く際はこの500 USDを明記すべき。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（データ本体は会員のみ。会員フォーラムは https://www.fsaettc.org/ で、登録者限定のphpBBであることを確認済み）
  - https://calspan.com/automotive/fsae-ttc
  - 用途: TTC の入手条件の一次情報。登録料 500 USD、millikenresearch.com 経由の登録フォーム、8ラウンドの試験完了、40種類超のタイヤ構造・430超の試験、平面ベルト機で 25 mph（FSAEの実走行速度に合わせた設定）、横力試験に加えて静的・動的スプリングレート測定を含むこと、タイヤはメーカー寄贈で見返りにメーカーもデータにアクセスすること、会員は専用フォーラム経由でダウンロードすること、試験マトリクスの詳細はラウンドごとに改訂されること——これらすべてを本ページで確認した。第24章でTTCへの加入手順を書く際の典拠。
- **Radt, H. S. and Glemming, D. A., "Normalization of Tire Force and Moment Data," Tire Science and Technology, Vol. 21, Issue 2, pp. 91–119, 1993.** ✓実在確認（訂正: Crossref で H. S. Radt, D. A. Glemming・巻21・号2・pp.91-119・1993年を確認。訂正不要。無次元化タイヤモデル（Radt/Milliken 法）の原典。）
  - 種別: 論文 / 入手性: 有料（Tire Science and Technology）。大学経由。
  - https://doi.org/10.2346/1.2139525
  - 用途: Radt/Milliken 無次元化タイヤモデルの原典。Magic Formula とは別系統の、レース現場で使われてきたタイヤデータ整理手法。第9章で「係数同定の前にデータをどう正規化して見るか」を教える際に引く。荷重ごとにバラバラに見える曲線が無次元化で1本にまとまるという視覚的インパクトは、荷重感度を理解させる最良の教材。Crossref で確認済み。
- **Radt, H. S., "An Efficient Method for Treating Race Tire Force-Moment Data," SAE Technical Paper 942536, 1994.** ✓実在確認（訂正: Crossref で Hugo S. Radt 単著・1994年・SAE Technical Paper Series を確認。訂正不要（フルネームは Hugo S. Radt）。）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由。
  - https://doi.org/10.4271/942536
  - 用途: レースタイヤの力・モーメントデータ処理に特化した無次元化手法。TTCデータを扱う実務手順の典拠として第9章・第24章で引く。Crossref で確認済み。
- **Kasprzak, E. M., Lewis, K. E., and Milliken, D. L., "Tire Asymmetries and Pressure Variations in the Radt/Milliken Nondimensional Tire Model," SAE Technical Paper 2006-01-1968, 2006.** ✓実在確認（訂正: Crossref で Edward M. Kasprzak, Kemper E. Lewis, Douglas L. Milliken・2006年・SAE Technical Paper Series を確認。訂正不要。）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由。
  - https://doi.org/10.4271/2006-01-1968
  - 用途: 無次元化モデルに、タイヤの非対称性（コニシティ・プライステア）と内圧変化を組み込んだ拡張。第9章で「α=0 で横力がゼロにならないのはなぜか」「内圧をどう扱うか」を説明する際の典拠。著者に TTC 共同ディレクタの Kasprzak と Milliken が入っており、FSAE文脈に直結する。Crossref で確認済み。
- **Svendenius, J. and Gäfvert, M., "A semi-empirical dynamic tire model for combined-slip forces," Vehicle System Dynamics, Vol. 44, Issue 2, pp. 189–208, 2006.** ✓実在確認（訂正: Crossref で Jacob Svendenius, Magnus Gäfvert・巻44・号2・pp.189-208・2006年を確認。訂正不要。第II部タイヤ④（複合スリップ）の理論的裏付け。）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由。
  - https://doi.org/10.1080/00423110500385659
  - 用途: ブラシモデルを基礎に複合スリップ力を半経験的に構成する手法。第10章（複合スリップ）で、Magic Formula の r 系係数を同定できない読者に対する物理ベースの代替経路として引く。Crossref で確認済み。関連する初期版として Svendenius & Gäfvert, "A Brush-Model Based Semi-Empirical Tire-Model for Combined Slips," SAE 2004-01-1064, 2004, DOI 10.4271/2004-01-1064 も実在を確認済み。
- **Svendenius, J., Gäfvert, M., Bruzelius, F., and Hultén, J., "Experimental Validation of the Brush Tire Model," Tire Science and Technology, Vol. 37, Issue 2, pp. 122–137, 2009.** ✓実在確認（訂正: Crossref で著者4名・巻37・号2・pp.122-137・2009年を確認。Crossref タイトル末尾に組版由来の脚注番号「5」が混入（"...Brush Tire Model5"）しているが、正しいタイトルはリスト記載どおり。訂正不要。）
  - 種別: 論文 / 入手性: 有料（Tire Science and Technology）。大学経由。
  - https://doi.org/10.2346/1.3130985
  - 用途: ブラシモデルが実測とどこまで一致し、どこで外れるかを実験的に示した論文。第7章・第10章の「いつ破綻するか」を、著者の印象ではなく実験結果に基づいて書くために必要。第27章（妥当性判断基準）の実例としても使える。Crossref で確認済み。
- **Farroni, F., Giordano, D., Russo, M., and Timpone, F., "TRT: thermo racing tyre a physical model to predict the tyre temperature distribution," Meccanica, Vol. 49, Issue 3, pp. 707–723, 2014（オンライン先行公開 2013）.** ✓実在確認（訂正: Crossref で Flavio Farroni, Daniele Giordano, Michele Russo, Francesco Timpone・Meccanica 巻49・号3・pp.707-723 を確認。Crossref の登録年は2013（オンライン先行公開）、印刷号は2014年。リストの「2014年、オンライン先行2013」という記述は正しい。訂正不要。第II部タイヤ⑤（荷重・温度・摩耗）の一次ソース。）
  - 種別: 論文 / 入手性: 有料（Springer）。大学経由。
  - https://doi.org/10.1007/s11012-013-9821-9
  - 用途: レーシングタイヤの熱モデルの代表例。第11章（荷重・温度・摩耗）で、温度がグリップに与える影響を扱う際の典拠。学生フォーミュラでは完全実装は困難だが、「温度帯ごとに摩擦スケーリング係数を分けて同定する」という現実的な簡略化を正当化する背景理論として引く。Crossref で書誌を確認済み（Crossref の issued は 2013、掲載巻号は 2014）。
- **Mavros, G., "A thermo-frictional tyre model including the effect of flash temperature," Vehicle System Dynamics, Vol. 57, Issue 5, pp. 721–751, 2019（オンライン先行公開 2018）.** ✓実在確認（訂正: Crossref で Georgios Mavros（Loughborough University）・VSD 巻57・号5・pp.721-751 を確認。Crossref 登録年は2018（オンライン先行）、印刷号は2019年。リストの記述は正しい。訂正不要。）
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由。
  - https://doi.org/10.1080/00423114.2018.1484147
  - 用途: 接地の瞬間に生じる局所的高温（flash temperature）まで含めた熱-摩擦結合モデル。第11章で熱モデルの研究最前線を示す。Crossref で確認済み（Crossref の issued は 2018、掲載巻号は 2019）。
- **Fiala, E., "Seitenkräfte am rollenden Luftreifen," VDI Zeitschrift, V.D.I., Vol. 96, 1954.** ✓実在確認（訂正: DOI が存在しない1954年の独語論文のため書誌データベースでは直接確認できなかったが、**MathWorks 公式ドキュメント「Fiala Wheel 2DOF」の参考文献[1]に、ほぼ同一の書誌が明記されている**ことを実取得で確認した："Fiala, E. 'Seitenkrafte am Rollenden Luftreifen.' VDI Zeitschrift, V.D.I. Vol 96, 1954."（MathWorks 側はウムラウト・大文字化が異なる表記）。したがって実在は確認できる。ただし巻96の号・ページ番号までは今回確認できていないため、**教科書では号・ページを書かない**こと（曖昧な記憶で補完しない）。）
  - 種別: 論文 / 入手性: 未確認（1954年のドイツ語誌。オンライン入手は困難と思われる。実務上は Pacejka 3rd ed. または MathWorks ドキュメント経由での参照が現実的）
  - 用途: Fiala モデルの原典。MathWorks が Vehicle Dynamics Blockset の Fiala Wheel 2DOF ブロックの参照文献としてこの書誌をそのまま掲載しており、その形で実在を確認した。第7章で簡略物理モデルの系譜を示す際に引く。【注意】原典そのもの（掲載ページ番号を含む）は本調査では直接確認できていない。ページ番号を書く場合は原典または信頼できる書誌データベースで再確認すること。
- **MathWorks, "Combined Slip Wheel 2DOF"（Vehicle Dynamics Blockset リファレンス）** ✓実在確認（訂正: ページ実取得で確認。Vehicle Dynamics Blockset のブロックで、スピン軸まわりの回転と上下変位の2自由度、タイヤ力は6自由度、**Magic Formula 6.2** を用いて Fx, Fy, Fz, Mx, My, Mz を出力。ブレーキはディスク／ドラム／マップ参照の3種を選択可。訂正不要。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ソフトウェア本体はFSAE無償ライセンスに含まれる）
  - https://www.mathworks.com/help/vdynblks/ref/combinedslipwheel2dof.html
  - 用途: 第23章（非線形4輪モデル）と第II部の実装章の中心ブロック。Magic Formula 6.2 を実装し、.tir / .txt / .mat を読み込み、転がり抵抗に relaxation length でパラメータ化された一次遅れを持つこと、MF5.2 からの変換に Extended Tire Features サポートパッケージが必要なことを本ページで確認した。参照文献に Pacejka 3rd ed.（式 4.E9–4.E78）と Besselink et al. 2010 が挙がっている。
- **MathWorks, "Fiala Wheel 2DOF"（Vehicle Dynamics Blockset リファレンス）** ✓実在確認（訂正: ページ実取得で確認。Vehicle Dynamics Blockset のブロック。横・縦スリップに対応した簡易タイヤモデルで、駆動トルク・ブレーキ圧・路面高さ・キャンバ角・空気圧を入力に、車輪回転速度・上下運動・6自由度の力とモーメントを出力。**参考文献[1]に Fiala 1954 が明記**されており、上記 No.20 の実在確認の根拠にもなる。訂正不要。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス
  - https://www.mathworks.com/help/vdynblks/ref/fialawheel2dof.html
  - 用途: Magic Formula 係数を持たないチームの第一候補。必要パラメータ（Ckappa, Calpha, Cgamma, muMin, muMax, Lrelx, Lrely）と適用限界（広範な非線形複合横スリップや横方向ダイナミクスを含まない検討向け）を本ページで確認した。参照文献に Fiala 1954、SAE J2452、ISO 28580:2018、Pacejka 3rd ed. が挙がっている。第7章と第24章で引く。
- **MathWorks, "Get Started with the Extended Tire Features for Vehicle Dynamics Blockset"** ✓実在確認（訂正: ページ実取得で確認。タイトルは記載どおり完全一致。内容はサポートパッケージのインストールからタイヤデータのインポート・前処理・可視化・モデルフィッティング・パラメータ更新までの8ステップのワークフロー。**対応タイヤモデルは Magic Formula 5.2 / Magic Formula 6.2 / Dugoff / Fiala** の4種。第II部タイヤ③（係数同定）の実装手順として、FSAE TTC データからの同定に直接使える。訂正不要。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス
  - https://www.mathworks.com/help/vdynblks/ug/get-started-with-the-extended-tire-features-for-vehicle-dynamics-blockset.html
  - 用途: Vehicle Dynamics Blockset が対応するタイヤモデルが Magic Formula 5.2 / 6.2 / Dugoff / Fiala の4種であること、対応ブロックが Combined Slip Wheel 2DOF / CPI / STI、Fiala Wheel 2DOF、Dugoff Wheel 2DOF であること、TYDEX v1.3 形式のデータ入力に対応することを確認した。重要なのは、MF-Swift（Delft-Tyre）が本ページに記載されていないこと——高度モデルへの標準実装経路が無いことの根拠になる。
- **MathWorks, "Tire (Magic Formula)"（Simscape Driveline リファレンス）** ✓実在確認（訂正: ページ実取得で確認。正式ページタイトルは "Tire (Magic Formula) - Tire defined by Magic Formula coefficients"、製品は Simscape Driveline（Physical Modeling カテゴリ）。**重要な注意：このブロックは4係数の簡易 Magic Formula による縦方向挙動のみのモデル**であり、Vehicle Dynamics Blockset の MF6.2 とは別物。横力・複合スリップは扱えないため、教科書では両者の適用限界の違いを明示すること。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス
  - https://www.mathworks.com/help/sdl/ref/tiremagicformula.html
  - 用途: 実務でよく起きる誤りの直接的な根拠。本ページには「縦運動のみを仮定し、キャンバ・旋回・横運動を含まない」と明記されている。第22章（駆動系）では正しく使え、第23章（非線形4輪モデル）では使ってはならない、という線引きの典拠。4種のパラメータ化（ピーク縦力とスリップ／定数係数／荷重依存係数／物理信号係数）とタイヤコンプライアンスによる過渡表現を持つことも確認した。参照文献に Besselink et al. 2010 が挙がっている。
- **MathWorks Student Lounge ブログ, "Magic Formula Tire Modeling in Formula Student," 2022年6月7日** ✓実在確認（訂正: ページ実取得で確認。タイトル・日付（2022年6月7日）はリスト記載どおり。**著者情報を補足すべき**：ブログのホストは Tanya Kuruvilla、実際の執筆者は UPBracing Formula Student チームの Tom Teasdale。内容は FSAE TTC データから Magic Formula を同定するオープンソース MATLAB ツール（GUI 付き、fmincon と非線形制約を使い単純最小二乗ではなく物理的に妥当な係数を得る、TIR ファイル出力可）。TTC の試験がスリップ角約6度までしかカバーしない点と、similarity 法による外挿の必要性にも触れており、第II部タイヤ③の「適用限界」の記述に使える。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス
  - https://blogs.mathworks.com/student-lounge/2022/06/07/mf-tyre/
  - 用途: 学生フォーミュラ向けの Magic Formula 同定手順を具体的に示した唯一級の公式資料。第9章（係数同定）の実装手順の骨格として使える。本ページで確認した内容: TTCデータが Cornering（スリップ角スイープ）と Drive/Brake（スリップ率スイープ）の2種に分かれること、MAT形式かつSI単位のデータのみを使うべきこと、histcounts で時系列を定常条件ごとに分割すること、lsqcurvefit ではなく fmincon を使い Cx>0・Dx>0・Ex≤1 のような非線形制約を課すこと、Fx0 と Fy0 を最初に当てはめてから従属モードへ進むこと、結果を .tir または MAT 構造体で出力すること。Magic Formula Tire Tool（GUI）と Magic Formula Tire MATLAB Library（コード生成対応）を紹介しており、モーメント（Mz0, Mz, Mx, My）は未計算なので MFeval の併用を推奨している。
- **Furlan, M., "MFeval"（MATLAB Central File Exchange, File ID 63618）およびドキュメントサイト mfeval.wordpress.com**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MATLAB Central File Exchange、MathWorksアカウントで無償ダウンロード）
  - https://www.mathworks.com/matlabcentral/fileexchange/63618-mfeval
  - 用途: 学生が実際に使えるオープンソースの Magic Formula 評価実装。MF5.2 / 6.1 / 6.2 の .tir を読んで定常の力・モーメントを評価する。提供関数は mfeval()、mfeval.readTIR()、mfeval.coefficientCheck()。入力は垂直荷重・縦スリップ率・スリップ角・キャンバ角・turn slip・前進速度（内圧と回転速度は任意）、出力は力・モーメント・摩擦係数・接地面寸法・剛性など30列。MATLAB・Simulink・Simpack・CarMaker といった異なるソフト間で同一の式を使うことによる実装の標準化を目的としている。MathWorks 公式ブログもモーメント計算の代替として本ツールを推奨。第9章の演習で使う。【注意】具体的なオープンソースライセンス種別（MIT/BSD等）は本調査では特定できなかった。教科書で配布・改変を伴う使い方を書く場合はライセンスを実物で確認すること。
- **MathWorks, "Formula SAE / Formula Student" 学生競技会向けソフトウェア提供ページ** ✓実在確認（訂正: URL は実在し取得成功。ただし**取得時は地域別に解決され「Formula SAE Japan - MATLAB & Simulink」ページが返った**（日本の読者向けにはむしろ好都合）。記載内容：「MathWorks is pleased to sponsor the 2026 Formula SAE Japan competition」として、Student Competition Software Request Form を提出したチームにソフトウェア・オンライントレーニング・メンター・技術サポートを無償提供。教科書で「MathWorks の FSAE 無償ライセンス」を根拠づける一次ソースとして使える。日本チーム向けには申請フォーム提出が必要である点を明記すること。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ソフトウェア提供は参加チームの申請と審査が必要）
  - https://www.mathworks.com/academia/student-competitions/formula-sae.html
  - 用途: 本書の実装の正典が MATLAB/Simulink であることの実行可能性の根拠。参加チームに100以上の製品が無償提供され、Vehicle Dynamics Blockset と Simscape 一式（Driveline, Multibody, Electrical, Fluids, Battery）、Control System Toolbox、Embedded Coder などが含まれることを確認した。申請はチームリーダーまたは指導教員が Student Competition Software Request Form を提出する。第II部・第VI部で使うブロックがすべて正規に入手できることを、序章で読者に示すために引く。
- **Pauwelussen, J. P., Gootjes, L., Schröder, C., Köhne, K.-U., Jansen, S., and Schmeitz, A., "Full vehicle ABS braking using the SWIFT rigid ring tyre model," Control Engineering Practice, Vol. 11, Issue 2, pp. 199–207, 2003.** ✓実在確認（訂正: Crossref で著者6名（J.P Pauwelussen, L Gootjes, C Schröder, K.-U Köhne, S Jansen, A Schmeitz）・巻11・号2・pp.199-207・2003年を確認。訂正不要。第VI部の SIL/HIL や第V部の ABS・トラクションコントロールでリジッドリングモデルの必要性を論じる際の根拠。）
  - 種別: 論文 / 入手性: 有料（Elsevier）。大学経由。
  - https://doi.org/10.1016/S0967-0661(02)00185-5
  - 用途: リジッドリングモデルが必要になる具体的な場面（ABSのような高帯域制御の検証）を示す実例。第II部で「どんな問いを立てたときに Magic Formula では足りなくなるか」を具体的に語る材料。学生フォーミュラのブレーキ章（第16〜17章）や制御章（第38章 トラクションコントロール）で、モデル忠実度と制御帯域の関係を論じる際に引く。Crossref で確認済み。

---

## 車両運動モデルの階層（点質量 → 運動学的2輪 → 線形2輪 → 非線形2輪 → 4輪＋荷重移動 → 7自由度 → 14自由度 → マルチボディ → 最小ラップタイム最適制御）と、各階層の成立条件・破綻条件・学生フォーミュラでの実行可能性

### モデル階層

**[入門（第I部の前・第28章の土台）] 点質量モデル／摩擦円・摩擦楕円（g-gダイアグラム）**

- 仮定・成立条件: 車両を1点の質量に縮約する。姿勢（ヨー・ロール・ピッチ）を持たないので、操舵という入力すら存在しない。タイヤ4本の能力を1つの合成摩擦楕円 (a_x/a_x,max)² + (a_y/a_y,max)² ≤ 1 に集約する。前後左右のグリップ配分・荷重移動・タイヤ荷重感度は全て「すでに理想配分されている」と暗黙に仮定する。空力を入れる場合は速度依存の μ 増加として扱う（a_y,max(V) = (μ(m g + F_z,aero(V)))/m）。定常コーナ速度は V = √(μ g R) に帰着する。
- 破綻条件（次の階層へ進むべき時）: （1）アンダーステア／オーバーステアを一切表現できない。「バランス」という概念自体が存在しない。（2）荷重移動を無視するため、実車より必ずグリップを過大評価する（タイヤの荷重感度 ∂F_y/∂F_z が逓減するため、左右荷重移動が起きると軸のトータルグリップは必ず落ちる）。（3）ヨー慣性が無いので過渡が無い＝コーナ進入・脱出のヨー立ち上がり時間がゼロになる。（4）前後軸の限界が違う（＝スピンする／プッシュする）ことを表現できない。→ 次階層に進むべき条件：「なぜこの車はアンダーなのか」「舵角いくつで曲がるのか」「ARBを硬くすると何が起きるのか」を問い始めた瞬間。
- 学生フォーミュラでの実行可能性: 使える。むしろ最初に必ず作るべき階層。OptimumLap 相当の準定常ラップシムはここで組める。マス・ダウンフォース・タイヤ μ の一次感度（軽量化1 kgで何秒か）はこの階層で十分な精度が出る。ただし FSAE のオートクロス／エンデュランスは半径が小さく直線が短いため、定常旋回に到達しないコーナが多く、点質量QSSはラップタイムを楽観側に外す（Siegler et al. SAE 2000-01-3563 が定常／準定常／過渡の差を比較している）。ここで出した数字は「相対比較にのみ使う、絶対値は信じない」と明記して運用すること。
- MATLAB実装経路: 追加Toolbox不要。素の MATLAB スクリプトで書ける（微分方程式ですらなく代数式なので ode45 も不要）。コース中心線を弧長 s で離散化し、各点で v_max(s)=√(a_y,max·R(s)) を求め、前進パス（加速律速）と後進パス（制動律速）を取って min を取る、という3パス法。プロットは plot / patch。g-gダイアグラムそのものは上位階層（4輪モデル）から Milliken の Moment Method（SAE 942538）で生成し、この階層に「境界」として与えるのが実務の順序。

**[入門（第V部・自動運転／経路追従の前提として）] 運動学的2輪モデル（kinematic bicycle model）2自由度**

- 仮定・成立条件: タイヤのスリップ角がゼロ（横力を出さずに、タイヤは向いている方向にのみ転がる）と仮定する。状態は位置 (X, Y) と方位 ψ、入力は速度 V と舵角 δ。旋回半径は幾何のみで決まり R = l/tanδ（アッカーマン）。動力学（質量・慣性・タイヤ）が一切入らない。
- 破綻条件（次の階層へ進むべき時）: 横加速度が概ね 0.3–0.4 g を超えるとスリップ角が無視できなくなり、実際の軌跡が幾何予測から乖離する。学生フォーミュラは常時 1 g 超で走るので、この階層は「走行中の車両挙動」にはほぼ全域で破綻している。→ 次階層に進むべき条件：横加速度が 0.3 g を超える領域を扱う瞬間、つまり FSAE では最初から。
- 学生フォーミュラでの実行可能性: 限定的に使える。FS Driverless の経路生成・パス追従（Pure Pursuit / Stanley）の内部モデル、および低速でのコーン間走行やピットマヌーバでは実用。**ハンドリング解析には絶対に使ってはいけない。**「知る価値はあるが、車両運動の説明には実行できない」階層として位置づけ、なぜ破綻するかを示す反例教材として使うのが正しい。
- MATLAB実装経路: Automated Driving Toolbox / Navigation Toolbox の bicycleKinematics オブジェクト、Robotics System Toolbox の Bicycle Kinematic Model ブロック。ただし Vehicle Dynamics Blockset の「Bicycle Model」ブロック（Automated Driving Toolbox 内、https://www.mathworks.com/help/driving/ref/bicyclemodel.html）は**運動学ではなく線形タイヤの3DOF動力学モデル**なので混同しないこと。

**[実用（第3〜5章の中核）] 線形2輪モデル（線形単軌道モデル、linear bicycle / single-track）2自由度**

- 仮定・成立条件: 前進速度 V を一定の定数として与える（縦運動を状態から外す）。左右輪を1本にまとめる（＝左右の荷重移動とタイヤ荷重感度を無視）。タイヤ横力をスリップ角に比例させる F_y = K·α（K は軸あたりコーナリングスティフネス）。スリップ角・舵角・車体すべり角はすべて微小。ロール・ピッチ・上下動なし。空力ゼロまたは定数。前後力ゼロ。\n\n【状態方程式の標準形】状態 x = [β, r]ᵀ（β: 車体すべり角、r: ヨーレート）、入力 δ（前輪実舵角）、ISO 8855（x前・y左・z上）:\n  β̇ = −(K_f+K_r)/(m·V)·β − [1 + (l_f·K_f − l_r·K_r)/(m·V²)]·r + K_f/(m·V)·δ\n  ṙ = −(l_f·K_f − l_r·K_r)/I_z·β − (l_f²·K_f + l_r²·K_r)/(I_z·V)·r + (l_f·K_f)/I_z·δ\n（K_f, K_r は「1軸あたり」。文献で「1輪あたり C」を使う場合は K = 2C。安部の式に現れる係数2はこれ）\n\n【定常円旋回】スタビリティファクタ A = −m·(l_f·K_f − l_r·K_r)/(l²·K_f·K_r)。ヨーレートゲイン r/δ = (V/l)/(1 + A·V²)、横加速度ゲイン a_y/δ = (V²/l)/(1 + A·V²)、車体すべり角ゲイン β/δ = [1 − m·l_f·V²/(l·l_r·K_r)]·(l_r/l)/(1 + A·V²)。A>0 アンダー、A=0 ニュートラル、A<0 オーバー。特性速度 V_ch = 1/√A（ここでヨーレートゲインが最大になる。d/dV[(V/l)/(1+AV²)]=0 ⟹ 1−AV²=0）。臨界速度 V_cr = 1/√(−A)（A<0のとき、ここでゲインが発散し不安定化）。β が符号反転する速度 V_β0 = √(l·l_r·K_r/(m·l_f))。\n\n【アンダーステア勾配との関係】δ = l/R + K_us·(a_y/g) と定義すると A = K_us/(g·l)。Gillespie の K_us = W_f/K_f − W_r/K_r（W_f = m·g·l_r/l, W_r = m·g·l_f/l）と代入すれば上の A に一致する。\n\n【ニュートラルステアポイント（NSP）】重心から前方 a_e = (l_f·K_f − l_r·K_r)/(K_f + K_r) の位置。前軸からの距離は l·K_r/(K_f+K_r)。アンダーステア ⟺ NSP が重心の後方 ⟺ スタティックマージン SM = (l_r·K_r − l_f·K_f)/(l·(K_f+K_r)) > 0（Milliken の符号規約：後方が正）。NSP は「横力をそこに加えてもヨーが発生しない点」であり、横風外乱応答を決めるのは重心位置ではなく NSP と風圧中心の相対位置。\n\n【過渡応答】ステップ操舵に対するヨーレート応答は零点を1つ持つ2次系:\n  r(s)/δ(s) = G_r(0)·(1 + T_r·s)/(s²/ω_n² + 2ζ·s/ω_n + 1)\n  T_r = m·l_f·V/(l·K_r)\n  ω_n² = det(A) = l²·K_f·K_r·(1 + A·V²)/(m·I_z·V²)\n  2ζ·ω_n = −tr(A) = [m·(l_f²·K_f + l_r²·K_r) + I_z·(K_f + K_r)]/(m·I_z·V)\n安定条件は det(A) > 0 ⟺ 1 + A·V² > 0（＝アンダー／ニュートラルは全速度で安定、オーバーは V < V_cr でのみ安定）。
- 破綻条件（次の階層へ進むべき時）: （1）タイヤが線形な領域＝横加速度で概ね 0.3–0.4 g 以下でしか成立しない。学生フォーミュラの走行域（1 g 超）は完全に外側。（2）左右荷重移動が無いので、ARB・ばね定数・ロール剛性配分という FSAE 最大のセットアップ手段の効果がゼロと出る。（3）速度一定なので、制動旋回・加速旋回・ブレーキングによるヨー誘起を表現できない。（4）K_f, K_r を定数と置くので K_us が横加速度に依存しない＝「低 a_y でアンダー、高 a_y でオーバー」という実車で最も重要な遷移が表現できない。（5）スピン（発散）は臨界速度としてしか現れず、舵角過大による飽和スピンは表現できない。→ 次階層に進むべき条件：a_y が 0.4 g を超える領域を扱う／限界挙動を論じる／セットアップ変更の効果を予測したい、のいずれか。
- 学生フォーミュラでの実行可能性: 使える。ただし「限界性能の予測」ではなく「用語と物理の定義」「制御設計の設計モデル」として使う。具体的には（a）ヨーレートゲイン・応答時間・ζ・ω_n の設計目標値を決める、（b）第37章 LQR／第39章 MPC の内部予測モデル、（c）第35章の拡張カルマンフィルタによる β 推定のプロセスモデル、（d）ホイールベース・重量配分・ヨー慣性の一次感度検討。FSAE はホイールベースが短い（規則の最小値は Formula SAE Rules の該当条項で必ず確認）ため l_f·l_r が小さく、動特性指数 k²/(l_f·l_r)（k² = I_z/m）が乗用車より大きくなりやすい。結果として ω_n が高く、ヨーの立ち上がりが速い代わりに減衰が取りにくい傾向が理屈上出る。ここは実車データで裏取りすべき仮説として書くこと。
- MATLAB実装経路: Control System Toolbox が最短。A, B 行列を作って sys = ss(A,B,C,D); step(sys); bode(sys); damp(sys); pole(sys); eig(A)。V を掃引して A 行列の固有値軌跡をプロットすれば臨界速度が可視化できる（オーバーステア設定で実軸を右半平面に横切る）。Simulink なら State-Space ブロック 1 個。Vehicle Dynamics Blockset の Vehicle Body 3DOF（Single track バリアント、https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html）、または Automated Driving Toolbox の Bicycle Model ブロックが既製。**ただし両ブロックとも SAE J670 の z-down・y-right 系（X前・Y右・Z下）である**ため、ISO 8855 で自作した式と接続すると横加速度・ヨーレート・ロール角の符号が合わない。座標変換ブロックを必ず挟むこと。

**[実務標準（第2部の到達点、第II部23章・第V部）] 非線形2輪モデル（3自由度：u, v, r）**

- 仮定・成立条件: 左右輪はまだ1本にまとめたまま。タイヤを非線形モデル（Magic Formula / ブラシ / Fiala）に置き換え、飽和と複合スリップを表現する。前進速度 u を状態に昇格させ、駆動・制動・空力抗力を入れる。荷重移動は入れない（または前後の縦荷重移動だけを準静的に入れる）。タイヤ緩和長 σ を入れるなら σ/u·Ḟ_y + F_y = F_y,ss の1次遅れを追加する。\n\n【位相面解析】u と δ を固定すると (β, r) の2次元自励系になり、位相ポートレートが描ける。典型的には安定な平衡点（通常旋回）1個と鞍点（サドル、ドリフト平衡）2個が存在し、鞍点の安定多様体が吸引領域の境界＝「安定ハンドリング包絡（stable handling envelope）」を作る。δ を増やしていくと平衡点が衝突・消滅（サドルノード分岐）してスピンに至る（Ono et al. 1998）。Inagaki et al.（AVEC'94）は (β, β̇) 平面で同じ議論を行い、ESC の介入しきい値設計の原型を与えた。Bobier-Tiu et al.（Vehicle System Dynamics 2019）はこの位相ポートレートを制御合成そのものに使う方法論を整理している。
- 破綻条件（次の階層へ進むべき時）: （1）左右荷重移動が無いままなので、ARB／ばね／車高によるバランス調整の効果が依然としてゼロ。セットアップ検討には使えない。（2）左右輪の差（内輪・外輪のスリップ角差、キャンバ差、LSD の左右トルク差）が表現できない。LSD が生む駆動時のヨーモーメントは FSAE で無視できないが、この階層では出せない。（3）位相ポートレートは u と δ を凍結した図であり、実際のスピンは u が落ちながら起きる。「凍結系の解析」であることを明記しないと学生が誤読する。（4）ロール角そのものが無いので、キャンバ変化によるグリップ変化が入らない。→ 次階層に進むべき条件：セットアップ（ロール剛性配分・タイヤ空気圧・車高）を数値で議論したい、あるいは前後ブレーキバランスを設計したい。
- 学生フォーミュラでの実行可能性: 非常に有用。第35章（EKF による β 推定）、第38章（トラクションコントロール）、第39章（MPC）の設計・検証モデルとして実行可能。位相面解析はスピンとカウンタステアを学生に「見せる」ための最良の教材で、計算コストも低くノートPCで即描ける。FSAE 特有の注意として、TTC データから同定した Magic Formula 係数の適用範囲（試験した荷重・空気圧・キャンバ・スリップ角の範囲）を外れると平衡点の個数まで変わってしまうため、位相図には必ず「同定範囲外」の領域を網掛けで示すこと。
- MATLAB実装経路: 自作が正道。右辺関数 f(x,u) を MATLAB Function として書き、ode45（剛くなったら ode15s / ode23t）で積分。位相ポートレートは meshgrid + quiver（ベクトル場）+ streamline（軌道）。平衡点は fsolve（Optimization Toolbox）で δ を掃引しながら求め、解析ヤコビアンまたは numjac で線形化して eig で安定判別。分岐図（δ vs 平衡 β）は predictor–corrector の連続法を自作するのが現実的（MATLAB に標準の分岐解析機能は無い。MatCont 等の第三者製ツールは存在するが本調査では未確認）。Simulink 側なら Vehicle Dynamics Blockset の Vehicle Body 3DOF（Single track）に Magic Formula タイヤを接続。

**[実務標準（第II部の統合＝第23章、第IV部セットアップ感度の土台）] 非線形4輪モデル＋準静的荷重移動（3〜4自由度：u, v, r [, ロール角 φ]）**

- 仮定・成立条件: タイヤ4本を独立に扱う。縦荷重移動 ΔF_z,long = m·a_x·h/l、横荷重移動を前後軸に配分（幾何成分＝ロールセンタ高さによる分、弾性成分＝ロール剛性配分による分、非ばね上分）して各輪の F_z を求める。ロール・ピッチ・ヒーブは準静的（＝ばね・ダンパの動特性は無視して静的つり合いで解く）とみなす。各輪でキャンバ・トー・スリップ角を計算し、Magic Formula の複合スリップで F_x, F_y, M_z を出す。空力は速度依存のダウンフォース＋前後配分。駆動系（LSD）と前後ブレーキ配分をここで入れる。\n\n**この階層で初めて「バランス」が物理として現れる。** メカニズムは：ロール剛性配分を前寄りにする → 前軸の横荷重移動が増える → タイヤ荷重感度（∂F_y/∂F_z が逓減）により前軸のトータル横力が減る → アンダーステアになる。線形2輪では絶対に出てこない。
- 破綻条件（次の階層へ進むべき時）: （1）ばね・ダンパの過渡（ロールの立ち上がり時間、ダンパによるトランジェントな荷重移動配分）が無いので、素早い切り返し（スラローム、シケイン）でのバランス変化が出ない。ダンパチューニングの議論ができない。（2）路面の凹凸・縁石入力に対する応答がゼロ。（3）車高変化に伴う空力の変化（エアロプラットフォーム感度）が入らない。（4）ロールセンタ／ロール軸は幾何的な構成概念であって物理的な回転軸ではない（Guiggiani 2026 が明示的に指摘）。ロール軸が実在の軸だと信じて設計すると、ロールセンタ移動が大きいサスペンションで予測が外れる。（5）フレーム捩り剛性を無限大と仮定している。FSAE でフレーム捩り剛性が全ロール剛性と同オーダーだと、設計したロール剛性配分がそのまま実現せず、バランス予測が根本から狂う。→ 次階層に進むべき条件：ダンパを設計したい／路面入力を入れたい／ホイールスピン・ロックを扱いたい。
- 学生フォーミュラでの実行可能性: 最重要。**FSAE チームが実際に意思決定に使うべき主戦場はここ。** ARB 剛性、ばね定数、タイヤ空気圧、重心高、前後重量配分、ブレーキバイアス、LSD プリロードの効果がすべてここで比較できる。この階層で g-g ダイアグラムを生成して第IV部の QSS ラップシムに渡す、というのが実務の正しいデータフロー。Milliken の Moment Method（SAE 942538 / SAE 800847）による Yaw Moment Diagram もこの階層で描く。「4輪モデルで g-g と YMD を作り、点質量QSSに食わせる」構成は FSAE の規模でも現実的に回る。
- MATLAB実装経路: Vehicle Dynamics Blockset の Vehicle Body 3DOF の **Dual track バリアント**（4隅で力が作用し、横荷重移動を計算する）。あるいは Simulink で自作（荷重移動サブシステム＋Magic Formula 関数×4＋剛体運動）。定常円旋回スイープは δ と V を掃引して fsolve で平衡解を求める（Constant Radius / Constant Speed の2通りを両方やる）。Moment Method は β と δ を格子状に掃引して各点で F_y と M_z を求め contour で描く。Kasprzak & Milliken の SAE 2000-01-1624（MRA Vehicle Dynamics Simulation – MATLAB/Simulink）がまさにこの構成の先例。

**[実務標準（第38章 TC、第40〜44章の実装対象）] 7自由度モデル（車体3：u, v, r ＋ 車輪回転4：ω1..ω4）**

- 仮定・成立条件: 車体は平面3自由度のまま。各車輪の回転を独立した状態にする（I_w·ω̇ = T_drive − T_brake − F_x·R_e）。これによりスリップ率 κ が動的な状態量になり、ホイールロック・ホイールスピンが陽に表現できる。上下動・ロール・ピッチはまだ無い（荷重移動は準静的）。
- 破綻条件（次の階層へ進むべき時）: 上下方向の自由度が無いため、路面入力に対するタイヤ接地荷重の変動（＝実車で ABS/TC が最も苦しむ状況）が再現できない。縁石、路面のうねり、ダンパ不整によるグリップ喪失を扱えない。→ 次階層に進むべき条件：路面入力を入れたい／ダンパを設計したい／エアロプラットフォームを扱いたい。
- 学生フォーミュラでの実行可能性: 使える。トラクションコントロール、ローンチコントロール、ABS（FSAE では稀だがブレーキバランス検討には有用）、ドライブトレイン（クラッチ・ギヤ比・LSD）の設計と SIL/HIL の対象モデルはここ。実時間性が良く（車輪回転は速いモードなので固定ステップは 1 ms オーダが必要）、リアルタイム化・コード生成の演習素材としても適する。
- MATLAB実装経路: Vehicle Dynamics Blockset の Passenger 7DOF リファレンスアプリケーション（車体3自由度＋各輪の転動1自由度）。https://www.mathworks.com/help/vdynblks/ug/passenger-vehicle-dynamics-models.html に構成が明記されている。タイヤは Combined Slip Wheel / Longitudinal Wheel ブロック、または Magic Formula の自作関数。実装は Simulink Coder / Embedded Coder で固定ステップ離散化（第40〜42章）。

**[研究に近い実務（第II部サスペンション③、第IV部過渡ラップシム、第V部DIL）] 14自由度モデル（車体6：3並進＋3回転 ＋ 各輪上下4 ＋ 各輪回転4）**

- 仮定・成立条件: 車体を完全な剛体6自由度として扱い、各輪のばね下質量に上下1自由度、車輪回転に1自由度を与える。ばね・ダンパ・ARB は非線形特性テーブルで与える。サスペンション運動学（バンプステア、キャンバゲイン、アンチダイブ／アンチスクワット）はマルチボディから抽出した K&C（Kinematics & Compliance）テーブルとして外から与える。タイヤは点接地。路面は高さプロファイルとして与えられる。
- 破綻条件（次の階層へ進むべき時）: （1）サスペンションのリンク・ブッシュのコンプライアンスは K&C テーブルに縮約されている。テーブルが無いか不正確なら、この階層に上げても精度は上がらない（むしろパラメータ不確かさが増えて悪化する）。（2）シャシ（フレーム）は剛体のまま。FSAE の捩り剛性不足はここでも表現できない。（3）タイヤの点接地仮定は縁石乗り越しや大きな段差で破綻する（enveloping model が必要）。（4）パラメータ数が一気に数百に増える。第III部（同定と検証）を先にやらずにこの階層に上がると、確実に「もっともらしいが検証不能なモデル」になる。→ 次階層に進むべき条件：サスペンション運動学そのものを設計変数にしたい／ブッシュやフレーム剛性を評価したい。
- 学生フォーミュラでの実行可能性: 条件付きで使える。MathWorks の FSAE 無償ライセンスに Vehicle Dynamics Blockset が含まれるので**入手は可能**。しかし FSAE チームの実力を規定するのはモデルの階層ではなく**パラメータの質**なので、慣性諸元（特に I_z, I_x）と K&C テーブルとタイヤ係数が測定・同定できていないチームがこの階層に上がるのは有害。「使えるが、第III部を終えるまで使ってはいけない」と明記すべき階層。DIL（第44〜46章）のプラントモデルとしては、ステア反力とキューイングの質を左右するので価値が高い。
- MATLAB実装経路: Vehicle Dynamics Blockset の Passenger 14DOF リファレンスアプリケーション（車体6自由度＋各輪2自由度＝14）。プロジェクトテンプレートから Double Lane Change 等のマヌーバが起動できる。K&C テーブルは Simscape Multibody で組んだ運動学モデルから掃引して抽出し、Lookup Table として持ち込む。リアルタイム／HIL 化するときは可変ステップ ode45 のままではなく、固定ステップ（ode1/ode3）＋剛性の高いモードの扱いを設計し直すこと（第40章）。

**[研究に近い実務（第II部サスペンション①の生成元、第III部の検証手段）] マルチボディ動力学モデル（数十〜数百自由度、拘束付き DAE）**

- 仮定・成立条件: アップライト、Aアーム、プッシュロッド、ベルクランク、タイロッド、ステアラック等を個別の剛体として扱い、球面／回転／並進拘束とブッシュ（6分力の柔性要素）で結合する。CAD から質量・慣性・ジオメトリを取り込む。運動方程式は拘束付き DAE となり、Baumgarte 安定化や座標分割で解く。シャシ弾性は FE の縮約モード（Craig–Bampton）で入れられる。
- 破綻条件（次の階層へ進むべき時）: （1）実時間で回らない。HIL/DIL には縮約が必須。（2）ブッシュのばね・減衰特性を測っていなければ、細かくした分だけ推測パラメータが増え、精度は上がらず不確かさだけが増える。（3）DAE ソルバの収束・ドリフトの問題が出る。（4）**最大の誤解**：階層を上げれば精度が上がるという思い込み。全体誤差はタイヤモデルの不確かさが支配していることが多く、サスペンションを精密化しても全体精度は動かない。→ この階層を「使う」正しい方法は、ハンドリング解析そのものをここでやるのではなく、**K&C テーブル生成の前処理装置として使う**こと。
- 学生フォーミュラでの実行可能性: 限定的。フルビークルのハンドリング解析用途では「知る価値はあるが、FSAE の工数では実行できない」。一方、**運動学のみ（力を解かず幾何拘束だけ）のマルチボディでバンプステア・キャンバゲイン・ロールセンタ移動・モーションレシオを掃引する**用途は、工数が小さく効果が大きいので FSAE でも十分実行可能かつ推奨。CAD がすでにあるチームなら数日で回せる。
- MATLAB実装経路: Simscape Multibody（https://www.mathworks.com/help/sm/index.html）。SolidWorks / Inventor / CATIA からアセンブリをインポートすると質量・慣性・拘束・3D形状がそのまま入る。MathWorks の FSAE 無償バンドルに含まれる。運動学掃引は、アップライトを上下に動かすアクチュエータを付けてトー角・キャンバ角・ホイールセンタ変位をログし、Lookup Table 化して 14DOF モデルへ渡す。商用の Adams/Car は大学経由で使える場合がある（未確認、各大学のライセンス状況次第）。C コード生成による HIL 化も可能だが縮約が前提。

**[研究最前線（第32章 最小ラップタイム最適化、第33章 感度解析、第39章 MPC）] 最小ラップタイム最適制御（OCP／NLP）＋データ駆動ハイブリッドモデル**

- 仮定・成立条件: 車両モデル（通常は上の3〜14自由度）を微分方程式制約として持ち、時間ではなく弧長 s を独立変数に取り替え（周回問題を境界値問題にするため）、min ∫ds/(ẋ·...)  すなわち最小時間を目的関数とする最適制御問題を解く。直接法（直接コロケーション／擬スペクトル法）で NLP に離散化し、IPOPT / SQP で解く。タイヤ・空力・パワートレインの制約、トラック幅の経路制約、（研究水準では）タイヤ温度・摩耗・エネルギ回生の状態も入れる。ドライバモデルを置かず「理論上最速のドライバ」を最適化が代替する点が QSS との本質的な違い（Kelly & Sharp 2010）。
- 破綻条件（次の階層へ進むべき時）: （1）解が非凸で局所解に落ちる。初期推定に強く依存する。（2）「理論最速」は学生ドライバが再現できない。得られたラップタイムは絶対値として無意味で、**設計変更の相対比較にのみ意味がある**。（3）モデルの誤りがそのまま最適化に増幅される（最適化は必ずモデルの穴を突く：例えばタイヤモデルが荷重外挿域で非物理的に強いと、最適解はそこに張り付く）。（4）計算時間が長く、セットアップ感度解析で何十ケースも回すと現実的でなくなる。（5）データ駆動タイヤモデルは学習データ範囲外で無保証。→ この階層は「モデルが正しいことを第III部で確認した後」でなければ使ってはいけない。
- 学生フォーミュラでの実行可能性: 上位チームなら使える。オープンソースの直接法実装が公開されており、点質量〜3自由度の最小時間最適化なら FSAE でも実行可能（Christ et al. 2021 は可変摩擦を含む定式化、Perantoni & Limebeer 2014 は F1 だが定式化の教科書的な参照先）。FSAE 向けの現実解は「4輪モデルで g-g / YMD を作る → QSS で経路と速度を最適化 → 主要コーナだけ過渡モデルで検証」という段階的アプローチ。Costa & Bortolussi（SAE 2016-36-0164）と Doyle et al.（SAE 2019-01-0163）が FSAE / Formula Student での QSS ラップシム構築の実例。Anselment et al.（SAE 2026-01-0762）は Formula Student 向けの解釈可能なタイヤ力モデルという最新の方向性。
- MATLAB実装経路: MATLAB 側は Optimization Toolbox の fmincon（コロケーションを自作、勾配はスパースヤコビアンを供給しないと実用速度にならない）。Symbolic Math Toolbox で解析ヤコビアンを生成すると効く。より実務的には CasADi（オープンソースの自動微分＋NLP フレームワーク、MATLAB インタフェースあり）＋ IPOPT の組み合わせが標準的（ただし本調査では公式サイトを開いて確認していない＝未確認）。GPOPS-II は商用。MPC は Model Predictive Control Toolbox の Nonlinear MPC Controller ブロック（内部予測モデルは非線形2輪が現実的）。

### 実務でよく起きる誤り

- 【係数2の罠】コーナリングスティフネスが「1輪あたり」か「1軸あたり」かを取り違える。安部は1輪あたり C で書き式中に 2C が現れる、Gillespie は軸あたりで書く。同じスタビリティファクタの式が文献ごとに2の因子で違って見える原因はほぼこれ。教科書では冒頭で「本書は軸あたり K_f, K_r を使う。C を使う文献は K = 2C」と宣言し、全式で貫くこと。単位も deg か rad かで57.3倍ずれる（Gillespie は deg/g を使う）
- 【座標系の罠】ISO 8855（x前・y左・z上）と SAE J670e（1976年版、x前・y右・z下）を混ぜる。y と z が逆になるので、横加速度・ヨーレート・ロール角・スリップ角・キャンバ角の符号が全部反転する。さらに厄介なのは、現行の SAE J670（2008年改訂以降、最新は J670_202206）が z-down と z-up の**両方**を定義していること。「SAE 系＝z 下向き」と決めつけるのも誤り。実務では、TTC のタイヤデータは SAE 系で配布されることが多く、MATLAB の Vehicle Dynamics Blockset の Vehicle Body 3DOF ブロックも SAE J670 の X前・Y右・Z下系である。ISO で自作したモデルと接続すると符号が合わない
- 【ロール軸の誤解】「車体はロール軸まわりに回転する」と信じる。Guiggiani（arXiv:2604.22815, 2026）が明示的に否定しており、車体はサスペンションとタイヤに支持された変形系なので固定軸まわりの純回転には還元できない。ロールセンタ／ロール軸は**荷重移動配分を評価するための構成概念**であって物理的な回転軸ではなく、"no-roll axis" と呼ぶべきもの。ロールセンタ移動が大きいサスペンションでは、この誤解が設計予測を直接壊す
- 【慣性力の誤解】慣性力の合力が常に重心を通ると思い込む。合力の大きさは m·a_G で正しいが、慣性力系は重心まわりのモーメントも持つので、合力の作用線が重心を通るのは**定常状態のときだけ**（Guiggiani 2026）。過渡のフリーボディダイアグラムを重心通過で描くと荷重移動を誤る
- 【瞬間中心の誤解】瞬間速度中心（速度がゼロの点）＝軌跡の曲率中心と思い込む。速度ゼロの点は加速度がゼロではない。過渡では車体の各点がそれぞれ固有の曲率中心を持つ。定常でのみ一致する（Guiggiani 2026）
- 【2輪モデルの誤解】単軌道（2輪）モデルを「2輪車のモデル」だと思う、あるいは「重心が路面高さにある」「質点である」という余計な仮定が必要だと思い込む。実際には4輪車を表現するモデルであり、そのような仮定はモデルが要求していないし典型的な車両挙動を反映してもいない（Guiggiani 2026）。加えて文献用語の罠：Sharp の "single track vehicles"（Vehicle System Dynamics 1976）は本物の二輪車を指す。日本語「2輪モデル」がどちらを指すか必ず明示すること
- 【横加速度の分解の誤解】a_y = u·r + v̇ の2項を「向心加速度」と「横滑り加速度」という独立した物理効果として解釈する。これは回転座標系での時間微分から出る**運動学的恒等式**であり、同一の加速度ベクトルの成分にすぎない（Guiggiani 2026）。ここを物理的に解釈させると学生は必ず混乱する
- 【ヨーレートは1つ】「重心まわりのヨーレート」と「旋回中心まわりのヨーレート」が別々に存在すると思う。剛体の角速度ベクトルは1つしかない（Guiggiani 2026）
- 【ライドモードの誤解】前輪側ばね上と後輪側ばね上に「それぞれの固有振動数」を割り当てる。2自由度系は2つのモードを持ち、各モードに両方の自由度が参加する（Guiggiani 2026）。ピッチモードとバウンスモードは独立した質量に属するものではない
- 【アンダーステア勾配を定数と思う】線形2輪モデルで得た K_us や A は a_y → 0 の極限値。実車ではタイヤ非線形と荷重移動で K_us が横加速度とともに変化し、「低 a_y でアンダー、高 a_y でオーバー」という遷移が起きる。学生フォーミュラは常時 1 g 超で走るので、線形域の A でセットアップを議論することは物理的に無意味。ハンドリングダイアグラムや MAP のように a_y の関数として提示すること
- 【臨界速度の誤読】V_cr = 1/√(−A) を「その速度で必ずスピンする速度」と読む。V_cr は**開ループ**（舵角固定）での発散速度であり、ドライバが閉ループで安定化していれば走れてしまう。逆に V_cr 以下でも舵角過大でタイヤが飽和すればスピンする。線形安定性は限界挙動の必要条件でも十分条件でもない
- 【位相面の誤読】(β, r) 位相ポートレートを「旋回中の車両挙動そのもの」と読む。位相図は前進速度 u と舵角 δ を**凍結した**2次元自励系の図。実際のスピンは u が落ちながら起きるので、軌道は複数の位相図をまたいで動く。教材として使うときは「凍結系の図である」と必ず書き、u を変えた複数枚を並べること
- 【QSS の楽観バイアス】準定常ラップシムを FSAE のオートクロス／エンデュランスのような小半径・短直線のコースに適用すると、コーナ進入・脱出のヨーとタイヤ力の立ち上がり時間が無視され、ラップタイムを必ず楽観側に外す。Siegler et al.（SAE 2000-01-3563）が定常・準定常・過渡の差を比較している。QSS の出力は絶対値ではなく相対比較にのみ使うと明記すること
- 【階層を上げれば精度が上がるという誤解】全体誤差はタイヤモデルとパラメータ（特に I_z、重心高、実効摩擦係数）の不確かさが支配していることが多く、サスペンションを14自由度やマルチボディに精密化しても全体精度が動かない、あるいは推測パラメータが増えて悪化することがある。**階層を上げる前に、現在の階層のパラメータ不確かさを見積もり、感度解析で「どのパラメータが支配的か」を確認せよ**。これが本教科書の第III部を第IV部より前に置くべき理由
- 【フレーム捩り剛性の無視】ロール剛性配分がバランスの主要な調整手段であることは正しいが、フレームの捩り剛性が全ロール剛性と同オーダーだと、設計したロール剛性配分がそのまま実現しない。学生フォーミュラは軽量化圧力が強くフレームが柔らかくなりがちなので、この失敗は日常的に起きる。4輪モデル以上を使うなら、フレーム捩り剛性を直列ばねとしてモデルに入れるか、少なくとも計測して「無視できる」ことを示すこと
- 【慣性諸元を CAD で済ませる】I_z を CAD から出して満足する。ドライバ（体重差数十 kg が重心高の高い位置に乗る）、燃料、ハーネス、実装誤差で大きくずれる。振り子試験（3線式トリフィラー、あるいは複合振り子）で同定すべき。I_z の 10% 誤差はヨー固有振動数 ω_n に約 5% の誤差として直接効く（ω_n ∝ 1/√I_z）
- 【TTC データの過信】フラットベルト試験機（Calspan TIRF）で得た μ をそのまま実路面に使う。路面粗さ、温度履歴、ベルト材質が違うため実車より高く出るのが通例で、実務ではスケーリング係数を掛ける慣行がある。**ただしその係数は合わせ込みの結果であって物理定数ではない。** 他チームや論文の係数を「根拠」として引用してはいけない。自チームのスキッドパッド／アクセラレーション実測で校正し、その手順と数値を記録すること。同様に、同定した Magic Formula 係数を試験した荷重・空気圧・キャンバ・スリップ角の範囲外に外挿しない（位相ポートレートの平衡点の個数まで変わりうる）
- 【LSD の無視】差動をオープンデフや剛結として扱う、あるいは無視する。実際には駆動時・惰行時に左右駆動力差から大きなヨーモーメントが発生し、コーナ脱出のバランスを支配する。これは4輪モデル以上でないと表現できない。2輪モデルで「脱出でアンダーが出る」原因を探しても永久に見つからない
- 【最適化がモデルの穴を突く】最小ラップタイム最適制御は、タイヤモデルが荷重外挿域で非物理的に強ければ必ずそこに解を張り付ける。最適解の動作点が同定データの範囲内にあるかを毎回チェックし、範囲外なら制約を追加すること。また「理論最速ラップタイム」は学生ドライバが再現できないので、絶対値として設計判断に使わない
- 【リアルタイム化の後回し】可変ステップ ode45 で作った14自由度モデルをそのまま HIL/DIL に持っていこうとする。剛性の高いモード（タイヤ縦剛性、ばね下）が固定ステップの上限を決めるので、離散化方式とステップサイズはモデル構築の**前**に決めるべき設計事項（第40章）。DIL ではさらにレイテンシ（第44章）が支配的になるので、モデル忠実度を上げてフレームレートを落とすとドライバ評価が逆に悪化する

### 学生フォーミュラ固有の事情

【現象 → 必要な最低階層 の対応表（第I部・第II部の章立ての根拠になる）】

| 説明したい現象 | 最低限必要な階層 | 理由 |
|---|---|---|
| 直線加速・制動の限界、摩擦円／摩擦楕円 | 点質量 | 姿勢が要らない |
| コーナ最高速 V = √(μgR)、ダウンフォースの一次効果 | 点質量 | 同上 |
| 経路計画・パス追従（低 a_y、ピットマヌーバ） | 運動学的2輪 | 幾何のみで足りる |
| アンダー／オーバーステアの定義、スタビリティファクタ A、特性速度、臨界速度 | 線形2輪 | ヨー自由度が必要 |
| ヨーレートゲイン r/δ とその速度依存 | 線形2輪 | 同上 |
| ステップ操舵の応答遅れ・オーバーシュート（ω_n, ζ, T_r） | 線形2輪 | ヨー慣性が必要 |
| ニュートラルステアポイント、スタティックマージン | 線形2輪 | 前後軸の剛性差が必要 |
| 横風・路面外乱への挙動 | 線形2輪 | NSP と風圧中心の相対位置で決まる |
| タイヤ緩和長による応答の追加遅れ | 線形2輪＋1次遅れ | タイヤ動特性 |
| 限界域でのアンダー→オーバー遷移 | 非線形2輪 | タイヤ飽和が必要 |
| スピン、カウンタステア、ドリフト平衡、吸引領域 | 非線形2輪（位相面） | サドル点と分岐が必要 |
| 車体すべり角 β の非線形挙動、EKF 推定の設計 | 非線形2輪 | 同上 |
| **荷重移動によるバランス変化、ARB／ばね／車高のチューニング** | **4輪＋準静的荷重移動** | **左右輪の分離とタイヤ荷重感度が必須** |
| タイヤ荷重感度によるトータルグリップ低下 | 4輪 | 同上 |
| 前後ブレーキバランス、制動旋回 | 4輪＋縦荷重移動 | 縦荷重移動が必要 |
| LSD による駆動時ヨーモーメント | 4輪＋駆動系 | 左右駆動力差が必要 |
| ステア反力トルク（DIL 用） | 4輪＋操舵系（ニューマチックトレール＋キャスタトレール＋コンプライアンス） | M_z が必要 |
| ABS／TC、ホイールロック・ホイールスピン | 7自由度 | 車輪回転が状態 |
| ダンパチューニング、ライド、路面入力、切り返しの過渡バランス | 14自由度 | 上下自由度が必要 |
| エアロプラットフォーム（車高変化→ダウンフォース変化） | 14自由度 | 同上 |
| バンプステア、キャンバゲイン、ロールセンタ移動、アンチダイブ | マルチボディ（またはそこから抽出した K&C テーブル） | 実際のリンク幾何が必要 |
| ブッシュ／フレーム捩りコンプライアンス | マルチボディ＋FE縮約 | 弾性体が必要 |
| 理論最速ライン、最適セットアップ | 最適制御（QSS または過渡） | 最適化が必要 |

---

【学生フォーミュラ特有の事情】

**1. 速度域が低く狭い。** 速度レンジが狭いので線形2輪モデルの V 依存性（特性速度・臨界速度）は乗用車ほど劇的に効かない。一方でコーナ半径が小さく直線が短いため、**定常旋回に到達しないコーナが大半**になる。これが最大の帰結：準定常（QSS）ラップシムの誤差が乗用車サーキットより大きく、過渡モデル（第31章）の価値が相対的に高い。競技の具体的な平均速度・最高速度は Formula SAE Rules および各大会のコース設計から必ず裏取りすること（本調査では未検証）。

**2. ホイールベースが短い。** 規則で最小ホイールベースが定められている（数値は Formula SAE Rules の該当条項で必ず確認）。l が短いと l_f·l_r が小さくなり、動特性指数 k²/(l_f·l_r)（k² = I_z/m）が乗用車より大きくなりやすい。理屈上は ω_n が高く（ヨーが速く立ち上がり）、減衰が取りにくい傾向になる。**これは仮説として書き、自チームの実測（第26章）で検証させること。**

**3. タイヤが小さい。** 10 インチまたは 13 インチリムの小径スリック。緩和長 σ はタイヤ寸法に概ね比例するので乗用車より短く、タイヤ由来の応答遅れは相対的に小さい。その代わり、**ステアリング系・サスペンション取付部のコンプライアンス**が応答遅れの支配要因になりやすい（第21章・第22章の重要度が上がる）。

**4. タイヤデータは TTC しかない。** FSAE Tire Test Consortium（https://www.fsaettc.org/、加盟チームのみダウンロード可）が Calspan TIRF フラットベルト試験機で測ったデータが、学生が入手できる唯一のまとまった実測タイヤデータ。測定装置・データ形式・後処理は Kasprzak & Gentz（SAE 2006-01-3606）に記載。**未加盟チームも読者に含まれる**ので、本教科書は「TTC データがある場合」と「無い場合（公開文献の代表値と自チームのスキッドパッド実測から逆算する場合）」の両方の手順を書く必要がある。

**5. ダウンフォースは小さいが無視できない。** F1 と違い速度が低いのでダウンフォースの絶対値は小さいが、車重も軽い（車重は F1 の1/3以下）ため、**重量比で見たダウンフォースは意外に効く**。逆に、車高変化によるエアロマップの変化（第18章）は速度が低いぶん相対的な影響が小さく、14自由度モデルに上がるインセンティブは F1 ほど強くない。

**6. フレーム捩り剛性が効く。** 軽量化圧力が強く、フレーム捩り剛性が全ロール剛性と同オーダーになりやすい。この場合、4輪モデルで設計したロール剛性配分がそのまま実現せず、**バランス予測が根本から狂う**。第16章（荷重移動とロール剛性配分）では必ずフレーム剛性の直列ばね効果を扱い、「捩り剛性を測っていないなら、この章の予測は信じるな」と明記すること。

**7. 慣性諸元がドライバで変わる。** 学生ドライバは体重差が大きく（数十 kg）、着座位置が高いので、重心高・重心前後位置・I_z がドライバ交代で有意に変わる。ラップシムやセットアップの結論を「ドライバ非依存」と書くのは誤り。第25章（慣性諸元同定）はドライバ込みで測る手順にすべき。

**8. センサが乏しい。** 光学式／GPS 式の対地速度センサ（β 直接計測）を持つ FSAE チームは稀。多くは IMU＋ホイールスピードのみ。だから β は推定するしかなく、第34章（可観測性）と第35章（EKF）が実務上の必修になる。線形2輪モデルは「限界性能の予測モデル」としてはほぼ役に立たないが、**EKF のプロセスモデル／LQR・MPC の予測モデルとしては現役**である、という位置づけを明確にすること。

**9. ドライバが素人。** ラップシムが出す「理論最速」は学生ドライバには再現できない。したがってラップシムの出力は絶対ラップタイムではなく**設計変更の相対比較**にのみ使う。DIL（第44〜46章）が FSAE で価値を持つのはこの点で、モデルの精度よりもドライバの学習と一貫した比較条件のほうが効く。

**10. MATLAB/Simulink は無償で全階層が揃う。** MathWorks の Formula SAE / Formula Student 支援（https://www.mathworks.com/academia/student-competitions/formula-sae.html）で、MATLAB・Simulink 本体に加え **Vehicle Dynamics Blockset、Simscape Multibody、Simscape Driveline、Control System Toolbox、Automated Driving Toolbox、Embedded Coder** が無償提供される（チームリーダーまたは指導教員が Student Competition Software Request Form から申請）。つまり点質量からマルチボディ、SIL/コード生成/HIL まで、本教科書の全階層が追加費用なしで実装できる。**ただし「入手できる＝使うべき」ではない。** 第III部（同定と検証）を終えていないチームが14自由度やマルチボディに手を出すと、検証不能なモデルを作って時間を失う。本教科書は各階層に「この階層に上がる前提条件」を必ず添えること。

**11. 推奨する実務フロー（FSAE の工数で回るもの）：**
 (a) 点質量 QSS ラップシムを作り、質量・μ・ダウンフォースの一次感度を掴む（1週間）
 (b) 線形2輪モデルで用語・応答指標（ω_n, ζ, ヨーレートゲイン）の設計目標を決める（1週間）
 (c) 慣性諸元と TTC タイヤ係数を同定する（第III部。ここが最も時間がかかるが最も効く）
 (d) 非線形4輪＋準静的荷重移動モデルを作り、g-g ダイアグラムと Yaw Moment Diagram を生成する
 (e) (d) の g-g を (a) の QSS に食わせ直す。ここで初めてセットアップ感度解析が意味を持つ
 (f) 主要コーナだけ過渡モデル（非線形2輪または4輪）で検証し、QSS の楽観バイアスを定量化する
 (g) 実車データ（第26章）で突き合わせ、合わないなら階層を上げるのではなく**まずパラメータを疑う**
 マルチボディは (c) と (d) の間に「K&C テーブル生成器」としてだけ使う。フルビークルのハンドリング解析には使わない。

### 参照文献

- **安部正人『自動車の運動と制御 ― 車両運動力学の理論形成と応用』第2版, 東京電機大学出版局, 2012年1月, A5判322ページ, ISBN 978-4-501-41920-2**
  - 種別: 書籍 / 入手性: 有料（約3,960円）。多くの工学系大学図書館に所蔵。日本語で最も標準的な車両運動力学の教科書
  - https://www.tdupress.jp/book/b349553.html
  - 用途: 第3〜5章（線形2輪モデル、定常円旋回、スタビリティファクタ、過渡応答）の一次典拠。出版社ページで確認した目次は：第1章 車両の運動とその制御／第2章 タイヤの力学／第3章 車両運動の基礎／第4章 外乱による車両の運動／第5章 操舵系と車両の運動／第6章 車体のロールと車両の運動／第7章 駆動や制動を伴う車両の運動／第8章 運動のアクティブ制御と車両の運動／第9章 人に制御される車両の運動／第10章 制御しやすい車両。第2版は MATLAB/Simulink のシミュレーション例を含む。スタビリティファクタ A・特性速度・臨界速度・NSP・過渡応答の伝達関数の記法は本書に合わせるのが日本語読者に親切。ただし本書は「1輪あたりコーナリングスティフネス C」で書き 2C を使うので、軸あたり K で書く場合の係数2の扱いを本文で必ず明示すること
- **Masato Abe, "Vehicle Handling Dynamics: Theory and Application", 2nd Edition, Butterworth-Heinemann, 2015, 322 pages, ISBN 978-0-08-100390-9**
  - 種別: 書籍 / 入手性: 有料。大学経由で ScienceDirect から電子版が読める場合がある。ISBN・出版社・年は複数の書誌（ScienceDirect / VitalSource / 書店）の検索結果で一致を確認したが、出版社ページは直接開けていない（ScienceDirect が 403）
  - 用途: 上記日本語版の英語版。国際的な引用の際にはこちらを挙げる。第2版で電気自動車の運動制御の章が追加されている。教科書の参考文献欄で和英を併記するために必要
- **Rajesh Rajamani, "Vehicle Dynamics and Control", 2nd Edition, Springer US (Mechanical Engineering Series), 2012, 498 pages, ISBN 978-1-4614-1432-2 (print) / 978-1-4614-1433-9 (eBook)**
  - 種別: 書籍 / 入手性: 有料。多くの大学が Springer Link 契約経由で全文アクセス可能（学内ネットワークから無料で読める可能性が高い）
  - https://doi.org/10.1007/978-1-4614-1433-9
  - 用途: 第V部（制御設計）の主柱。線形2輪モデルの状態方程式を制御工学の記法（誤差ダイナミクス、ラテラル制御）で提示しており、第34章（センサと可観測性）、第35章（EKF による車体すべり角推定）、第37章（状態フィードバックと LQR）、第38章（トラクションコントロール）で直接使える。Crossref API で書誌を確認済み
- **William F. Milliken and Douglas L. Milliken, "Race Car Vehicle Dynamics", SAE International, Warrendale PA, 1995, R-146, 922 pages, ISBN 978-1-56091-526-3**
  - 種別: 書籍 / 入手性: 有料（比較的高価）。FSAE チームの定番所有書。WorldCat / Open Library に書誌あり
  - 用途: レース車両運動力学の事実上の標準文献。ニュートラルステアポイント、スタティックマージン、Moment Method（YMD）、荷重移動、g-g の実務的な扱いはここが典拠。第4章（定常円旋回）、第10章（荷重移動とロール剛性配分）、第23章（非線形4輪モデル）、第28章（g-g）で参照。書誌（出版社・年・ISBN・ページ数）は検索結果で確認したが、SAE の商品ページ自体は開けていない
- **Thomas D. Gillespie, "Fundamentals of Vehicle Dynamics", SAE International, 1992, R-114, 520 pages, ISBN 978-1-56091-199-9**
  - 種別: 書籍 / 入手性: 有料。SAE Mobilus 経由の電子版あり。多くの大学図書館に所蔵
  - 用途: アンダーステア勾配 K_us = W_f/C_αf − W_r/C_αr、特性速度、臨界速度、ニュートラルステアポイントの定義の標準的な典拠（安部のスタビリティファクタ A と A = K_us/(g·l) の関係を示す章で必須）。第4章と第II部サスペンション②で参照。書誌は検索結果で確認
- **Massimo Guiggiani, "The Science of Vehicle Dynamics: Handling, Braking, and Ride of Road and Race Cars", 3rd Edition, Springer, 2023, DOI 10.1007/978-3-031-06461-6（第2版 2018: DOI 10.1007/978-3-319-73220-6、初版 2014: DOI 10.1007/978-94-017-8533-4）**
  - 種別: 書籍 / 入手性: 有料。大学の Springer Link 契約経由で読める場合が多い。第2版は 2019 TAA Textbook Excellence Award 受賞
  - https://doi.org/10.1007/978-3-031-06461-6
  - 用途: 「モデルの仮定を毎回明示する」という本教科書の方針に最も近い既存書。第6章 Map of Achievable Performance (MAP) は g-g / YMD を一般化した表現で、第IV部の感度解析に使える。第3章 Vehicle Model for Handling and Performance が4輪モデルの厳密な導出。Crossref で各章 DOI を確認済み
- **Massimo Guiggiani, "On Common Misconceptions in Classical Vehicle Dynamics", arXiv:2604.22815, 13 pages, 2026年4月14日投稿**
  - 種別: 論文（プレプリント） / 入手性: オープンアクセス（arXiv、誰でも無料）。学生に直接読ませられる
  - https://arxiv.org/abs/2604.22815
  - 用途: **第6章（このモデルの限界）と各章の「限界と適用範囲」節の最重要素材。** 著者本人が挙げる誤解は7項目：(1) 慣性力の合力は常に重心を通るという誤解（定常時のみ成立、過渡では慣性力系は重心まわりのモーメントも持つ）、(2) 瞬間速度中心＝曲率中心という誤解（過渡では車体の各点が各自の曲率中心を持つ）、(3) 単軌道（2輪）モデルは2輪車のモデルだという誤解（4輪車を表現しており、重心を路面高さに置くとか質点とみなすといった仮定はモデルが要求していない）、(4) a_y = u·r + v̇ の2項を独立した物理効果と解釈する誤解（回転座標系の時間微分から出る運動学的恒等式）、(5) ヨーレートが複数あるという誤解（剛体の角速度ベクトルは1つ）、(6) 車体はロール軸まわりに回転するという誤解（ロール軸は物理的な回転軸ではなく「no-roll axis」と呼ぶべき構成概念で、荷重移動配分の評価にのみ意味がある）、(7) 2自由度ライド系で各質量が固有の固有振動数を持つという誤解（2自由度系は2つのモードを持ち、各モードに両方の自由度が参加する）。査読前プレプリントである点は本文で明示すること
- **Hans B. Pacejka, "Tire and Vehicle Dynamics", 3rd Edition, Butterworth-Heinemann, Oxford, 2012, 672 pages, ISBN 978-0-08-097016-5**
  - 種別: 書籍 / 入手性: 有料。大学経由で ScienceDirect から読める場合が多い
  - 用途: 第II部タイヤ①〜⑤（スリップ定義、Magic Formula、係数同定、複合スリップ）の一次典拠。また緩和長（relaxation length）による1次遅れの定式化は、線形2輪モデルに過渡を足す際（第5章）と第31章（過渡を含むラップシム）に必要。書誌は検索結果で確認
- **Leonard Segel, "Theoretical Prediction and Experimental Substantiation of the Response of the Automobile to Steering Control", Proceedings of the Institution of Mechanical Engineers: Automobile Division, Vol. 10, No. 1, pp. 310–330, 1956, DOI 10.1243/PIME_AUTO_1956_000_032_02**
  - 種別: 論文 / 入手性: 有料（SAGE）。大学契約経由でアクセス可
  - https://doi.org/10.1243/PIME_AUTO_1956_000_032_02
  - 用途: 線形3自由度（ヨー・横・ロール）車両モデルを実車応答試験で検証した原典。第I部の歴史的導入と、第26章（実車データとの突き合わせ）で「モデル検証とは何をすることか」の原型として引用する。Crossref/SAGE で DOI 確認済み
- **David W. Whitcomb and William F. Milliken Jr., "Design Implications of a General Theory of Automobile Stability and Control", Proceedings of the Institution of Mechanical Engineers: Automobile Division, Vol. 10, No. 1, pp. 367–425, 1956, DOI 10.1243/PIME_AUTO_1956_000_035_02**
  - 種別: 論文 / 入手性: 有料（SAGE）。大学契約経由
  - https://doi.org/10.1243/PIME_AUTO_1956_000_035_02
  - 用途: 航空機の安定微係数の考え方を自動車に持ち込み、ニュートラルステアポイント・スタティックマージン・安定微係数の枠組みを確立した原典。第4章（定常円旋回とスタビリティファクタ）で NSP を導入するときの歴史的典拠。同シリーズの Milliken & Whitcomb, "General Introduction to a Programme of Dynamic Research", 同誌 pp. 287–309, 1956, DOI 10.1243/PIME_AUTO_1956_000_031_02 も対で引用できる
- **William F. Milliken, Peter G. Wright, Douglas L. Milliken, "Moment Method – A Comprehensive Tool for Race Car Development", SAE Technical Paper 942538, SAE International, 1994年12月, DOI 10.4271/942538**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学が SAE Mobilus を契約していれば無料
  - https://doi.org/10.4271/942538
  - 用途: Yaw Moment Diagram（MMM）の標準文献。第23章（非線形4輪モデル）で作ったモデルから YMD を生成し、第28章の g-g と合わせて第IV部に渡すというデータフローの根拠。先行文献 Roy S. Rice and W. F. Milliken, "Static Stability and Control of the Automobile Utilizing the Moment Method", SAE 800847, 1980, DOI 10.4271/800847 も併記可
- **E. Ono, S. Hosoe, H. D. Tuan, S. Doi, "Bifurcation in Vehicle Dynamics and Robust Front Wheel Steering Control", IEEE Transactions on Control Systems Technology, Vol. 6, No. 3, pp. 412–420, May 1998**
  - 種別: 論文 / 入手性: 有料（IEEE Xplore、文書番号 668041）。大学の IEEE 契約経由で無料の場合が多い
  - 用途: 非線形2輪モデルの平衡点が舵角増大に伴ってサドルノード分岐で消滅し、スピンに至ることを示した基礎文献。第6章（このモデルの限界）と第V部の安定性議論の理論的裏づけ。書誌（巻・号・ページ・年）は検索で確認したが、IEEE Xplore のページは開いていないため DOI は記載しない
- **S. Inagaki, I. Kshiro（Kushiro）, M. Yamamoto, "Analysis on Vehicle Stability in Critical Cornering Using Phase-Plane Method", Proceedings of the International Symposium on Advanced Vehicle Control (AVEC '94), Tsukuba, Japan, pp. 287–292, 1994**
  - 種別: 論文 / 入手性: 会議録のため入手が難しい（JSAE 9438411）。多数の後続論文が内容を要約しているので二次的に辿れる。DOI なし
  - 用途: 位相面（β, β̇）による限界旋回時の安定性解析の原典で、ESC の介入しきい値設計の原型。第39章・第6章で参照。**注意：第2著者名は多くの文献で "Kshiro" と綴られているが "Kushiro" の誤植と考えられる。原典を確認できていないため、引用時はこの点を注記すること**
- **Carrie G. Bobier-Tiu, Craig E. Beal, John C. Kegelman, Rami Y. Hindiyeh, J. Christian Gerdes, "Vehicle control synthesis using phase portraits of planar dynamics", Vehicle System Dynamics, Vol. 57, No. 9, pp. 1318–1337, 2019, DOI 10.1080/00423114.2018.1502456**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学契約経由。Stanford Dynamic Design Lab のサイトに著者版がある可能性（未確認）
  - https://doi.org/10.1080/00423114.2018.1502456
  - 用途: 位相ポートレートを可視化ツールではなく制御合成の道具として使う方法論の整理。安定ハンドリング包絡（stable handling envelope）の定義と、鞍点の安定多様体が吸引領域境界を作るという構造の説明。第39章（MPC）と第6章で参照。Crossref API で著者・巻号・ページ確認済み
- **Craig E. Beal and J. Christian Gerdes, "Model Predictive Control for Vehicle Stabilization at the Limits of Handling", IEEE Transactions on Control Systems Technology, Vol. 21, No. 4, pp. 1258–1269, 2013, DOI 10.1109/TCST.2012.2200826**
  - 種別: 論文 / 入手性: 有料（IEEE）。大学契約経由で無料の場合が多い
  - https://doi.org/10.1109/TCST.2012.2200826
  - 用途: 第39章（MPC）の主典拠。線形化した2輪モデル＋包絡制約という構成が、非線形2輪モデル階層と制御階層をどう接続するかの実例になる。Crossref API で確認済み
- **Blake Siegler, Andrew Deakin, David Crolla, "Lap Time Simulation: Comparison of Steady State, Quasi-Static and Transient Racing Car Cornering Strategies", SAE Technical Paper 2000-01-3563, 2000, DOI 10.4271/2000-01-3563**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約経由
  - https://doi.org/10.4271/2000-01-3563
  - 用途: **第28〜31章の骨格を決める文献。** 定常・準定常（QSS）・過渡の3つのラップシム戦略を同一車両で比較し、どこで差が出るかを示す。FSAE のように半径の小さいコーナが連続するコースでは QSS の誤差が大きいという主張の根拠として使える（本教科書ではこの主張を FSAE のコースで自分で再現して数値を示すのが望ましい）。Crossref で確認済み
- **D. L. Brayshaw and M. F. Harrison, "A quasi steady state approach to race car lap simulation in order to understand the effects of racing line and centre of gravity location", Proceedings of the Institution of Mechanical Engineers, Part D: Journal of Automobile Engineering, Vol. 219, No. 6, pp. 725–739, 2005, DOI 10.1243/095440705X11211**
  - 種別: 論文 / 入手性: 有料（SAGE）。大学契約経由
  - https://doi.org/10.1243/095440705X11211
  - 用途: 第29章（QSS）と第30章（コースモデル）の実装指針。走行ライン選択と重心位置がラップタイムに与える影響を QSS で扱う手順が具体的。Crossref で確認済み
- **D. P. Kelly and R. S. Sharp, "Time-optimal control of the race car: a numerical method to emulate the ideal driver", Vehicle System Dynamics, Vol. 48, No. 12, pp. 1461–1474, 2010, DOI 10.1080/00423110903514236**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学契約経由
  - https://doi.org/10.1080/00423110903514236
  - 用途: 第32章（最小ラップタイム最適化）の入口。「ドライバモデルを置かず最適化で理想ドライバを代替する」という発想の説明に最適。続編 Kelly & Sharp, "Time-optimal control of the race car: influence of a thermodynamic tyre model", Vehicle System Dynamics 50(4), 641–662, 2012, DOI 10.1080/00423114.2011.622406 はタイヤ温度を状態に加えた版で、第13章（荷重・温度・摩耗）と接続できる。両方 Crossref で確認済み
- **Giacomo Perantoni and David J. N. Limebeer, "Optimal control for a Formula One car with variable parameters", Vehicle System Dynamics, Vol. 52, No. 5, pp. 653–678, 2014, DOI 10.1080/00423114.2014.889315**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学契約経由
  - https://doi.org/10.1080/00423114.2014.889315
  - 用途: 第32章と第33章（セットアップ感度解析）の主典拠。最適制御の中で車両パラメータ自体を設計変数に含める定式化＝「最適セットアップを解で求める」手法。関連 D. J. N. Limebeer and G. Perantoni, "Optimal Control of a Formula One Car on a Three-Dimensional Track—Part 2: Optimal Control", Journal of Dynamic Systems, Measurement, and Control 137(5), 2015, DOI 10.1115/1.4029466 は3次元路面（バンク・勾配）版。Crossref で確認済み
- **Fabian Christ, Alexander Wischnewski, Alexander Heilmeier, Boris Lohmann, "Time-optimal trajectory planning for a race car considering variable tyre-road friction coefficients", Vehicle System Dynamics, Vol. 59, No. 4, pp. 588–612, 2021（オンライン公開 2019）, DOI 10.1080/00423114.2019.1704804**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学契約経由。TUM のグループは関連コードを公開している（リポジトリの所在は本調査では未確認）
  - https://doi.org/10.1080/00423114.2019.1704804
  - 用途: 第32章で、点質量モデル／2輪モデルの両方に対する時間最適軌道計画の実装可能な定式化を与える。摩擦係数が場所によって変わる場合の扱いは、路面が均一でない FSAE 会場（駐車場・空港滑走路など）に直結する。Crossref で確認済み
- **Edward M. Kasprzak and David Gentz, "The Formula SAE Tire Test Consortium – Tire Testing and Data Handling", SAE Technical Paper 2006-01-3606, 2006, DOI 10.4271/2006-01-3606（著者所属: University at Buffalo / Calspan Corp.）**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約経由。TTC のデータ自体は加盟チームのみ（https://www.fsaettc.org/ がダウンロードと議論のフォーラム）
  - https://doi.org/10.4271/2006-01-3606
  - 用途: **第III部（パラメータ入手）と第II部タイヤ③（係数同定）の要。** 学生フォーミュラで唯一まとまって入手できるタイヤ実測データの出所・測定装置（Calspan の TIRF フラットベルト試験機）・データ形式・後処理の作法がここに書かれている。第9〜11章のタイヤモデル同定を「実データで」やるための前提
- **Edward M. Kasprzak and Douglas L. Milliken, "MRA Vehicle Dynamics Simulation – Matlab/Simulink", SAE Technical Paper 2000-01-1624, 2000, DOI 10.4271/2000-01-1624**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約経由
  - https://doi.org/10.4271/2000-01-1624
  - 用途: Milliken Research Associates が MATLAB/Simulink 上に構築した車両モデルの構成を記述したもの。本教科書が「実装の正典は MATLAB/Simulink」と掲げる根拠になる先例で、第23章（非線形4輪モデル）の実装方針を組む際の参照。Crossref で確認済み
- **Rodrigo Pasiani Costa and Roberto Bortolussi, "Lap Time Simulation of Formula SAE Vehicle With Quasi-steady State Model", SAE Technical Paper 2016-36-0164, 2016, DOI 10.4271/2016-36-0164**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約経由
  - https://doi.org/10.4271/2016-36-0164
  - 用途: FSAE 車両そのものに QSS ラップシムを適用した数少ない査読付き実例。第29章で「学生フォーミュラでの先例」として引用できる。Crossref で確認済み
- **Darryl Alan Doyle, Geoffrey Cunningham, Gavin White, Juliana Early, "Lap Time Simulation Tool for the Development of an Electric Formula Student Car", SAE Technical Paper 2019-01-0163, 2019, DOI 10.4271/2019-01-0163**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約経由
  - https://doi.org/10.4271/2019-01-0163
  - 用途: Formula Student チームがラップシムをどう構築し、どう設計判断に使ったかの実例。パワーユニットは EV だが、ラップシムの構成・検証手順の部分は内燃機関でもそのまま適用できる。第29〜33章の「学生チームが実際にやったこと」の参照点。Crossref で確認済み
- **Marcel Anselment, Julian Borowski, Stephan Rudolph, "Interpretable Tire Force Modeling for Formula Student Vehicle Dynamics and Lap Time Applications", SAE Technical Paper 2026-01-0762, 2026, DOI 10.4271/2026-01-0762**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約経由。2026年発表の最新文献
  - https://doi.org/10.4271/2026-01-0762
  - 用途: Formula Student 向けの「解釈可能な」タイヤ力モデル。ブラックボックスの機械学習タイヤモデルに対する現在の反省（外挿で無保証）を踏まえた方向性で、第11章（係数同定）と第27章（妥当性判断基準）の最新動向として引用できる。Crossref で確認済み
- **Michael Blundell and Damian Harty, "The Multibody Systems Approach to Vehicle Dynamics", 2nd Edition, Butterworth-Heinemann (Elsevier), 2015, ISBN 978-0-08-099425-3（初版 2004, ISBN 978-0-7506-5112-7）**
  - 種別: 書籍 / 入手性: 有料。大学経由で ScienceDirect から章単位で読める場合が多い
  - 用途: マルチボディ階層の標準教科書。「なぜモデルを細かくしても精度が上がらないことがあるか」「どの階層をどの目的に使うか」という本教科書の核心的な議論に直接対応する内容を持つ。第II部サスペンション①（運動学）と、マルチボディを K&C 抽出の前処理として使う方針の典拠。Crossref で章の書誌を確認済み
- **Dieter Schramm, Manfred Hiller, Roberto Bardini, "Vehicle Dynamics: Modeling and Simulation", Springer, 2014, ISBN 978-3-540-36044-5 / 978-3-540-36045-2, DOI 10.1007/978-3-540-36045-2**
  - 種別: 書籍 / 入手性: 有料。大学の Springer Link 契約経由で読める場合が多い
  - https://doi.org/10.1007/978-3-540-36045-2
  - 用途: モデル階層（単純な平面モデルから空間マルチボディまで）を明示的に段階構成で扱う数少ない教科書。本教科書の「階層」という編成方針そのものの参照先。第23章と第II部全体の構成の裏づけ。Crossref で確認済み
- **Georg Rill and Abel Arrieta Castro, "Road Vehicle Dynamics", 2nd Edition, CRC Press, 2020, DOI 10.1201/9780429244476**
  - 種別: 書籍 / 入手性: 有料。大学の Taylor & Francis / CRC 契約経由。MATLAB を前提にした記述が多い
  - https://doi.org/10.1201/9780429244476
  - 用途: MATLAB での実装を前提に車両モデルを段階的に構築する教科書で、本教科書の実装方針と最も相性がよい。第8章 Longitudinal Dynamics / 第9章 Lateral Dynamics が第I部・第II部に対応。**注意：副題（"Fundamentals and Modeling with MATLAB" 等）は Crossref のタイトルには含まれていないため、引用時は書影で確認すること**
- **Giancarlo Genta, "Motor Vehicle Dynamics: Modeling and Simulation", World Scientific, 1997, ISBN 978-981-02-2911-5, DOI 10.1142/3329**
  - 種別: 書籍 / 入手性: 有料。大学契約経由。続編 Genta & Genta, "Road Vehicle Dynamics", World Scientific, 2015, DOI 10.1142/9738 もある
  - https://doi.org/10.1142/3329
  - 用途: 数学的に厳密なモデル導出（線形化の手順、固有値解析、剛体力学の一般論）が本教科書の「数学は妥協しない」方針に合う。第3章の状態方程式導出、第5章の過渡応答の固有値解析の参照先。Crossref で確認済み
- **John C. Dixon, "Tires, Suspension and Handling", 2nd Edition, SAE International, 1996, R-168, ISBN 978-0-7680-6289-2, DOI 10.4271/r-168**
  - 種別: 書籍 / 入手性: 有料（SAE Mobilus）。大学契約経由
  - https://doi.org/10.4271/r-168
  - 用途: タイヤ・サスペンション・ハンドリングを1冊で厳密に扱う古典。ロール剛性配分と荷重移動の解析、コーナリングスティフネスの定義の揺れ（軸あたりか輪あたりか）の整理に使える。第16章（荷重移動とロール剛性配分）で参照。Crossref で確認済み
- **R. S. Sharp, "The Dynamics of Single Track Vehicles", Vehicle System Dynamics, 1976, DOI 10.1080/00423117508968406**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学契約経由
  - https://doi.org/10.1080/00423117508968406
  - 用途: **用語の罠を示すために引用する。** 文献で "single track vehicle" と言うとき、四輪車の2輪等価モデル（bicycle model）ではなく**本物の二輪車（オートバイ・自転車）**を指す場合がある。この論文は後者。第3章の用語定義で、日本語「2輪モデル」「単軌道モデル」がどちらの意味かを必ず明示せよ、という注意喚起の根拠。Crossref で確認済み
- **MathWorks, "Passenger Vehicle Dynamics Models", Vehicle Dynamics Blockset Documentation（Passenger 3DOF / 7DOF / 14DOF の自由度構成）**
  - 種別: 公式ドキュメント / 入手性: 無料（誰でも閲覧可）。ブロック自体の使用には Vehicle Dynamics Blockset ライセンスが必要だが、FSAE チームは MathWorks 学生大会無償ライセンスで入手できる
  - https://www.mathworks.com/help/vdynblks/ug/passenger-vehicle-dynamics-models.html
  - 用途: 本教科書の階層と MathWorks 製品の階層を対応づける根拠。公式ドキュメントで確認した自由度の内訳：**3DOF** = 車体の前後・横・ヨー（車輪自由度なし、理想タイヤ）／**7DOF** = 車体3（前後・横・ヨー）＋各輪の転動回転4／**14DOF** = 車体6（前後・横・上下の並進＋ロール・ピッチ・ヨーの回転）＋各輪2（上下並進＋転動回転）×4。第23章・第38章・第II部サスペンション③の実装章で引用
- **MathWorks, "Vehicle Body 3DOF" ブロックリファレンス（Vehicle Dynamics Blockset）**
  - 種別: 公式ドキュメント / 入手性: 無料（閲覧）。使用には Vehicle Dynamics Blockset ライセンス
  - https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html
  - 用途: 第3章・第23章の実装。**Single track（バイシクル、左右荷重移動なし）と Dual track（4隅で力が作用し左右荷重移動を計算）の2バリアント**を1ブロックで切り替えられるので、「線形2輪 → 4輪＋荷重移動」の階層移動を教材として1つのモデルで見せられる。**重要：本ブロックは SAE J670 の X前・Y右・Z下（z-down）系で、正の舵角は右向き。** 本教科書が採る ISO 8855（x前・y左・z上）とは y と z が逆なので、接続時に符号変換が必要。この事実は第1章（座標系）の実践的な例として必ず載せること
- **MathWorks, "Coordinate Systems in Vehicle Dynamics Blockset"（ISO 8855:2011 と SAE J670 の座標系の扱い）**
  - 種別: 公式ドキュメント / 入手性: 無料（誰でも閲覧可）
  - https://www.mathworks.com/help/vdynblks/ug/coordinate-systems-in-vehicle-dynamics-blockset.html
  - 用途: 第1章（座標系）の実務的典拠。本ページの参考文献欄で **ISO 8855:2011 "Road vehicles — Vehicle dynamics and road-holding ability — Vocabulary"（International Organization for Standardization, Geneva, 2011）** の書名と年を確認した（ISO 公式カタログページは自動取得が 403 で拒否されたため、正本は各自 ISO サイトで確認すること）。また **SAE J670 は z-down と z-up の両方の向きを定義している**（z-up は z-down を X 軸まわりに180度回転させたもの）ことが明記されており、「SAE 系＝必ず z 下向き」という思い込みが誤りであることの根拠になる
- **SAE International, SAE J670_202206 "Vehicle Dynamics Terminology"（Recommended Practice、2022年6月9日 Reaffirmed、Vehicle Dynamics Standards Committee）**
  - 種別: 公式ドキュメント / 入手性: 有料（SAE Mobilus）。大学が SAE Mobilus を契約していれば閲覧可。書誌情報ページは無料で見える
  - https://saemobilus.sae.org/standards/j670_202206-vehicle-dynamics-terminology
  - 用途: 第1章（座標系）と全巻の用語定義の典拠。スコープに「axis systems, vehicle bodies, suspension and steering systems, brakes, tires and wheels, operating states and modes, control and disturbance inputs, vehicle responses, and vehicle characterizing descriptors」が含まれることを確認済み。**注意：読者が「SAE J670e」（1976年版、x前・y右・z下）と現行の J670（2008年改訂以降）を混同しやすい。本教科書の方針文にある「SAE J670e」は1976年版を指すことを明示し、現行版では z-up も定義されている点を併記すべき**
- **MathWorks, "Simscape Multibody" Documentation**
  - 種別: 公式ドキュメント / 入手性: 無料（閲覧）。使用には Simscape Multibody ライセンス（FSAE 無償バンドルに含まれる）
  - https://www.mathworks.com/help/sm/index.html
  - 用途: マルチボディ階層の実装経路。CAD アセンブリ（質量・慣性・ジョイント・拘束・3D形状）をそのままインポートでき、運動方程式は自動生成される。C コード生成による HIL 展開も可能。第II部サスペンション①（運動学）で K&C テーブルを掃引生成する手順の典拠
- **MathWorks, "Formula SAE / Formula Student" 学生大会支援ページ**
  - 種別: 公式ドキュメント / 入手性: 無料（誰でも閲覧可）。ソフトウェア自体はチームリーダーまたは指導教員が Student Competition Software Request Form から申請
  - https://www.mathworks.com/academia/student-competitions/formula-sae.html
  - 用途: 本教科書が「実装の正典は MATLAB/Simulink」と掲げる前提の根拠。**確認できた無償提供内容**：MATLAB / Simulink 本体、100を超える製品群、自己学習オンライントレーニング、MathWorks エンジニアによるメンタリング、テクニカルサポート。名指しで含まれるものに **Vehicle Dynamics Blockset、Simscape（Driveline / Electrical / Fluids / Multibody）、Control System Toolbox、Automated Driving Toolbox、Embedded Coder** があり、本調査で示した階層すべての実装経路が無償で揃うことを意味する
- **FSAE Tire Test Consortium 公式サイト（https://www.fsaettc.org/）**
  - 種別: 公式ドキュメント / 入手性: サイト閲覧は無料。データのダウンロードは加盟チーム（登録・ログイン）のみ。2026年8月時点で 290 topics / 1,846 posts / 3,245 members のフォーラムとして稼働
  - https://www.fsaettc.org/
  - 用途: 第II部タイヤ③（係数同定）と第24章（パラメータ入手）で「学生がどこから実測タイヤデータを得るか」の唯一の現実解。本教科書の再現手順は TTC データを持つチームと持たないチームの両方を想定して書く必要がある
- **Juraj Kabzan ほか（AMZ Racing / ETH Zürich）, "AMZ Driverless: The Full Autonomous Racing System", arXiv:1905.05150, 2019年5月13日投稿, 40 pages, 32 figures（Journal of Field Robotics 投稿版）**
  - 種別: 論文（プレプリント） / 入手性: オープンアクセス（arXiv、無料）
  - https://arxiv.org/abs/1905.05150
  - 用途: Formula Student チームが実車で運用したフルスタック（知覚・推定・制御）の記述。第34章（センサと可観測性）、第35章（状態推定）、第39章（MPC）で「学生チームが実際に何を実装できたか」の実在の到達点として引用できる。学生が全文無料で読めるのが大きい
- **Solange D. R. Santos, José Raul Azinheira, Miguel Ayala Botto, Duarte Valério, "Path Planning and Guidance Laws of a Formula Student Driverless Car", World Electric Vehicle Journal, Vol. 13, No. 6, Article 100, 2022, DOI 10.3390/wevj13060100**
  - 種別: 論文 / 入手性: オープンアクセス（MDPI、無料）。学生に直接読ませられる
  - https://doi.org/10.3390/wevj13060100
  - 用途: Formula Student 車両に対する経路計画と誘導則。運動学的2輪モデルと動力学モデルの使い分けが具体的で、第V部の入口教材として無料で配布できる。Crossref 検索で書誌を確認

---

## 空力の車両モデルへの取り込み（Aerodynamics as an input to the vehicle model）— 第II部 空力①②（ダウンフォースの入れ方／エアロマップ）を主担当、第IV部 ラップタイムシミュレーション・第III部 同定と検証に接続

### モデル階層

**[入門] L1: 定数 C_D·A のみ（抗力＝走行抵抗）。F_D = ½·ρ·C_D·A·V²。ダウンフォースはモデルに存在しない**

- 仮定・成立条件: 空力は縦運動の抵抗としてのみ効く／揚力・ダウンフォースはゼロ／着力点を考えない（重心に作用と仮定）／ρ は一定（標準大気 1.225 kg/m³）／相対風＝車速（自然風なし）／姿勢（車高・ピッチ・ロール・ヨー）に依存しない／レイノルズ数依存なし。前提を1つの数 C_D·A（単位 m²）に押し込んでいることを自覚すること。C_D 単体は基準面積 A の定義に依存するので、C_D と A を別々に持つのは事故のもと
- 破綻条件（次の階層へ進むべき時）: (1) ダウンフォース発生装置を付けた瞬間に破綻する。(2) 翼なしのフォーミュラ形状でも正の揚力が出うる。Wordley & Saunders は翼なし Monash 2003 車を実車風洞で測って『揚力はごく小さく無視できる』と確認しており、この『無視できる』は測定して初めて言える主張である。仮定ではなく検証結果として扱うこと。(3) 車速が上がるほど揚力の見落としが接地荷重誤差として効く。次の階層に進むべき条件＝『空力デバイスを1つでも付ける』または『80 km/h を超える領域を議論する』
- 学生フォーミュラでの実行可能性: 使える。加速イベント（75 m）とトップスピード見積りはこの階層で十分。Wordley & Saunders の『使える馬力』計算がそのまま使える：P[kW] = C_D·A·V³/1633（これは ρ=1.225 のときの ½·ρ·C_D·A·V³ と厳密に一致する）。翼なし Monash 2003 車の実測は C_D=0.83, A=0.9 m²（C_D·A=0.747 m²）、45 kW で理論最高速 46.2 m/s＝166 km/h。FS Rules 2026 は直線を最長 80 m に制限しており（D 6.1.1／D 7.1.1）、この距離では抗力が最高速を律速しない。『FSAE ではドラッグはほとんど効かない』という定説の定量的根拠がここにある
- MATLAB実装経路: 自作で十分（Gain + Product の2ブロック）。既製品なら Simscape Driveline の Vehicle Body ブロック（2軸・縦運動・抗力のみ）。係数同定は Simulink Design Optimization の Parameter Estimator アプリ。公式例『Estimate Vehicle Drag Coefficients by Coast-Down Testing』（モデル coastdownmodel.slx、データ coastDownExampleData.mat）が惰行試験から F_drag = a + b·ẋ + c·ẋ² の3係数を推定する手順をそのまま示している。FSAE では駐車場での惰行試験で C_D·A と転がり抵抗を分離するのに直接使える

**[入門〜実用（意思決定の階層）] L2: 定数 C_L·A と C_D·A。ダウンフォースは車速の二乗で増える単一の力として重心（または車体固定の1点）に作用させる**

- 仮定・成立条件: 姿勢に依存しない／CoP（空力着力点）は固定で、前後配分は静的荷重配分に等しいと置く／準定常／自然風なし／翼はたわまない／C_L·A は車速によらない。この階層の本質は『空力を C_L·A と C_D·A という2つのスカラーに縮約する』こと。この2数を実測または信頼できるCFDで持てば、翼を付けるべきか否かの一次判断は完結する
- 破綻条件（次の階層へ進むべき時）: (1) 前後バランス（アンダー／オーバー）を議論した瞬間に破綻する → L3 へ。(2) ヨー角がつく旋回中に破綻する。Balasko & Zonta (2025) の FS 車CFDでは旋回時に総ダウンフォースが約25%低下し抗力が約10%増加した → L5 へ。(3) 車高が動く（ダウンフォースで沈む、ブレーキでノーズダイブ）と破綻する → L4 へ。(4) 単体翼の自由流データを足し算して C_L·A を作ると大きく外す：Wordley & Saunders の実測は自由流ベースの予測より約35%低かった（前翼 −39%、後翼 −33%）
- 学生フォーミュラでの実行可能性: 最重要かつ最も費用対効果が高い階層。FSAE の『空力を付けるべきか』の意思決定はここで完結する。検証済み実測値（Monash 2003, 翼あり）: C_L=2.57, C_D=1.33, A=1.35 m² → C_L·A=3.47 m², C_D·A=1.80 m²。翼なしは C_D·A=0.747 m²（+140%）。低ドラッグ設定は C_L=0.44, C_D=0.73（C_D·A は +32%）。ペナルティ側：車重 305→317 kg（翼+マウント 12 kg）、CG高 270→300 mm、ヨー慣性 106→118 kg·m²。

この C_L·A=3.47 m² と ρ=1.225 から計算した『低速域でダウンフォースがどれだけ効くか』の答え（317 kg 車重に対する比）：30 km/h → 148 N（4.7%）、40 → 262 N（8.4%）、50 → 410 N（13.2%）、60 → 590 N（19.0%）、80 → 1049 N（33.7%）、100 → 1640 N（52.7%）。つまり FSAE の主戦場である 30〜60 km/h では、ダウンフォースは車重の5〜19%にすぎない。

それでも効く、というのが Wordley & Saunders の結論：30〜80 km/h の範囲（豪州FSAE実走で計測されたコーナー速度域）で旋回能力は +8〜+30%、実コースの平均では +10〜15%。一方で加速75 m は 3.70 s（翼なし）→ 3.89 s（高DF）→ 3.80 s（低ドラッグ設定）と悪化。スキッドパッドは単純計算では 5.20→4.93 s だが、非ばね上荷重移動とヨー角でのDF低下を入れると『ほぼ互角』。32 km/h 以下ではヨー慣性増加によりヨー加速度が翼なし車に劣る。近年の実例として UMD 2025 車の6要素アクティブエアロ（Kuchar 2026）はオートクロス −1.47 s、エンデュランス −42.4 s（2.6%）、加速 −0.08 s（1.9%）を予測している
- MATLAB実装経路: Vehicle Dynamics Blockset の Vehicle Body 3DOF / Vehicle Body 6DOF に Cd, Cl, Af, Cpm（いずれもスカラ）を入れるだけ。実装式は Fdx = −½·ρ·Cd·Af·w̄²、Fdy = −½·ρ·Cs·Af·w̄²、Fdz = −½·ρ·Cl·Af·w̄²、Mdp = −½·ρ·Cpm·Af·w̄²·(a+b)。w̄ は WindXYZ 入力を差し引いた相対対気速度なので、自然風の影響も入力できる。符号規約は必ず単体テストで検算すること（静止→V で前後軸荷重が増えるか減るかを数値で確認する）。ラップシムなら OptimumLap（Duke FSAE がこの階層の判断に使用したと公表）や自作の準定常ソルバでこの2数を回すだけでよい

**[実用（FSAEで空力をやるなら必須）] L3: 前後別 C_Lf·A / C_Lr·A（あるいは総 C_L·A ＋ CoP%）＋ 抗力着力点高さによるピッチモーメント**

- 仮定・成立条件: CoP（Centre of Pressure、前軸に載るダウンフォースの割合）が車速・姿勢によらず一定／前後の空力荷重は瞬時に軸荷重になる（サスペンションの動的遅れ無視）／抗力の作用高さが既知
- 破綻条件（次の階層へ進むべき時）: (1) ダウンフォースで車高が沈むと CoP が動く（前後で沈み量が違えばレーキが変わる）→ L4。(2) 翼がたわむと CoP が速度で動く。FS Rules 2026 T 8.3.1 は『225 cm² 以上に分散した 200 N に対してたわみ 10 mm 以下』を要求している。つまり規則は 10 mm までのたわみを許容しており、翼は必ず速度に応じて変形する。(3) ヨー角で前後の感度が違う（後端の方が敏感になりやすい）→ L5。(4) 非ばね上マウントの翼を『ばね上に作用』としてモデル化すると車高応答も荷重も間違う
- 学生フォーミュラでの実行可能性: 必須。FSAE で空力を付けるチームが最初に間違えるのがここ。Wordley & Saunders は前後翼の設計要求をモーメント釣り合いから決めている：ホイールベース 1650 mm・前後 50:50 の車で、後翼 240 N @ 40 km/h に対し前翼 165 N @ 40 km/h が必要（合計 405 N @ 40 km/h、自由流ベース）。前翼が地面効果で必要な −C_L を出せるかどうかが、この車で作れるバランス済みダウンフォースの上限を決める、という結論が重要。

FSAE 固有の論点として、FSAE 規則は可動空力面を禁じていないため、翼をアップライト直結の『非ばね上』に載せてダウンフォースをばねを介さずタイヤに直接届ける設計が成立する。この場合、空力荷重は車体の上下運動を励起せず、前翼は地上高をほぼ一定に保つ。モデル上の力の注入点がまったく変わるので、L3 の実装で最初に決めるべき設計変数である
- MATLAB実装経路: VDB の外力入力ポート（FExt / MExt）に自作の前後ダウンフォースを注入する。ブロック内部の軸荷重式 Fzf = [b·m·g − (ẍ−ẏ·r)·m·h + h·Fxext + b·Fzext − Myext]/(a+b)、Fzr = [a·m·g + (ẍ−ẏ·r)·m·h − h·Fxext + a·Fzext + Myext]/(a+b) にそのまま入るので、Fzext に総ダウンフォース、Myext にバランス由来のピッチモーメントを与えれば前後配分を任意に作れる。4輪モデルなら各輪の Fz に直接加算する方が明快。Cpm（ピッチモーメント係数）だけで済ませようとすると、ダウンフォースの絶対値とバランスを独立に振れなくなるので推奨しない

**[実務標準] L4: エアロマップ（前車高 h_f × 後車高 h_r の2次元ルックアップテーブル）。C_L·A、C_D·A、CoP をそれぞれマップで持つ**

- 仮定・成立条件: 準定常：車両姿勢が決まれば空力が瞬時に一意に決まる／マップは定常CFDまたは風洞の離散点＋補間／格子の張られた範囲内でのみ有効／路面は平坦（移動床相当）／ロール・ヨー・ステアはゼロ
- 破綻条件（次の階層へ進むべき時）: (1) 車高がマップ格子の外に出た瞬間（縁石乗り上げ、強ブレーキのノーズダイブ）。外挿すると非物理的な巨大ダウンフォースが出てソルバが発散する。(2) 地面効果の『force enhancement → ピーク → force reduction（急減）』領域に入るとマップが急峻になり、補間誤差と数値不安定が同時に来る。Zhang, Toet & Zerihan のレビュー（Appl. Mech. Rev. 2006）がこの力の regime 分類を体系化しており、Zerihan & Zhang（J. Aircraft 2000）／Zhang & Zerihan（AIAA J. 2003）が単要素・二要素翼の地面効果を実測している。(3) 車高変化が速いとき（ヒーブ・ピッチ振動）→ L6。(4) 旋回中 → L5
- 学生フォーミュラでの実行可能性: 条件付きで使える。ただし FSAE 特有の強い制約がある：FS Rules 2026 T 2.2.1 は静的最低地上高 30 mm を課し、T 2.2.2 はスライディングスカート等『設計上・製作上・運動の結果として路面に接触する空力デバイス』を禁じている。この2つにより、F1 のような急峻な車高感度（＝アンダーボディのシール）は原理的に作れない。したがって FSAE の車高マップは F1 ほど非線形ではなく、翼だけのチームでは L3 で足りることが多い。

一方でアンダートレイ／ディフューザを持つチームには意味がある。SimScale の Formula Student 事例では、レーキ角 1° の変更でアンダートレイのダウンフォースが約15%変化したと報告されている。プロの参考値として theRacingLine 掲載の実マップ例では、後車高 6 mm の変化で CzA が約2.1%、バランスが約1.5%動いている（プロドライバーは明確に感じ取れる差、との記述）。

費用の見積りを先にやること：2次元マップを 5×5 で切るだけで25ケース。学生チームの計算資源で回るかを判断してから着手する。回らないなら L3 に留まるのが正しい
- MATLAB実装経路: Simulink の n-D Lookup Table ブロック（1〜30次元、breakpoint は非等間隔可、補間は flat / linear point-slope / linear Lagrange / nearest / cubic-spline / Akima spline、外挿は Clip / Linear / Cubic spline から選択）。**外挿は必ず Clip にする**（Linear のままにすると格子外で発散する）。MATLAB 側は griddedInterpolant（構造格子）、CFD 点が非構造なら scatteredInterpolant。CFD 点からマップ面を作るのは Curve Fitting Toolbox の fit、あるいは Model-Based Calibration Toolbox（DoE ＋ モデルフィット ＋ マップ出力が一貫して扱える）。

**重要な実装上の事実**：VDB の Vehicle Body 3DOF / 6DOF は Cd, Cl, Cpm がスカラなので、車高依存のエアロマップを組込みパラメータでは表現できない。マップは自作して外力ポートに注入する以外に道はない。この事実を教科書で明示すること

**[実務標準（FSAEではヨー依存が最優先）] L5: 多次元エアロマップ（車高 × レーキ × ヨー角 × ロール角 × ステア角）。出力は C_L·A、C_D·A、CoP に加えて横力 C_S·A とヨーモーメント C_YM·A**

- 仮定・成立条件: 各軸が独立ではなく交互作用があると認め、全組合せを張る（または DoE ＋ 代理モデル）／依然として準定常／自然風はヨー軸に重畳できるとする
- 破綻条件（次の階層へ進むべき時）: (1) 点数の爆発。5軸×各5点 = 3125 ケース。学生チームには不可能なので DoE ＋ サロゲートに切り替える判断点になる。(2) 交互作用の強い領域で補間誤差が効く。(3) 実測での検証なしにマップを信じると CFD の誤差がそのまま車両モデルに入る。Monash Motorsport は圧力タップの実走データで CFD マップを補正すると公表している。(4) 過渡（急なヨーレート変化、スラローム）→ L6
- 学生フォーミュラでの実行可能性: **FSAE ではヨー依存が最も重要で、しかも最も無視されている。** FS Rules 2026 D 4.1.2 のスキッドパッドは内円直径 15.25 m・外円 21.25 m・走行路幅 3 m で、車両重心の描く半径は約 8.5〜9.1 m。この半径では車体前後で流れの入射角が大きく異なる（実質的なヨー角がつく）。

Balasko & Zonta（J. Fluids Eng. 2025, オープンアクセス CC-BY）は FS 車を r=9.125 m（＝FSスキッドパッド半径そのもの）と r=22 m でCFD解析し、旋回時に**総ダウンフォースが約25%低下し、抗力係数が約10%上昇**すると報告している。またエンドプレートやシャークフィンが横力を生み、タイヤ負荷を下げる（＝タイヤ寿命向上またはコーナー速度向上）と述べている。直進マップをスキッドパッドに適用すれば確実に外す、という具体的な根拠がこれ。

Wordley & Saunders も『高ヨー角ではダウンフォースがわずかに低下する』ため、スキッドパッド予測 4.93 s は楽観的であり、非ばね上荷重移動と合わせるとスキッドパッドは『翼あり・なしでほぼ互角』になると述べている。この2つの独立な情報源が同じ結論を指している。

Monash Motorsport（現役FSAEチーム）が前後車高・ロール・ヨー・ステアを振ったCFDでマップを作り、圧力タップの実走で補正しているのが学生チームで到達可能な上限の実例
- MATLAB実装経路: n-D Lookup Table（最大30次元）で自作するのが基本。ただし**横力とヨーモーメントに限れば組込みブロックで表現できる**：VDB の Vehicle Body 3DOF / 6DOF は Cs（側力係数）と Cym（ヨーモーメント係数）を beta_w（相対風角ベクトル, rad）に対する**ベクトル**として受け付けるので、ヨー依存の横力・ヨーモーメントはパラメータ設定だけで入る（Cd / Cl / Cpm はスカラのまま）。この非対称性は教科書で明示する価値がある。

DoE と代理モデルは Model-Based Calibration Toolbox、Statistics and Machine Learning Toolbox の fitrgp（ガウス過程回帰）が現実解。マップ生成用のCFD点を最小化する設計（Latin Hypercube 等）を先に考えること

**[研究最前線] L6: 過渡空力（非定常）。空力荷重が姿勢の瞬時値ではなく履歴に依存する。準定常マップの後段に伝達関数／状態空間の動特性を付ける形で近似する**

- 仮定・成立条件: 準定常マップからの偏差を線形時不変系で近似できる／流れの応答時間スケールが車両運動の時間スケールと分離できる
- 破綻条件（次の階層へ進むべき時）: 判定量は**換算周波数** k = ω·L/(2·U)（定義により f·L/U とする流儀もあるので、必ずどちらの定義かを明記すること）。道路車両の実験研究では k ≲ 0.05 なら準定常でよい、k > 0.2 は強く非定常、という目安が使われる。FSAE 車（代表長さ L≈1.6 m、U≈11 m/s＝40 km/h）で 1 Hz のピッチ／ヒーブ振動なら k = 2π·1·1.6/(2·11) ≈ 0.46 となり、原理的には準定常の外にある。ただし低速では動圧そのものが小さいため、誤差の絶対値（N）は小さい。**『無次元数では非定常だが、絶対値では無視できる』というのが FSAE の正しい結論**であり、これを数字で示すのがこの教科書の見せ場になる。Fuller, Best, Garret & Passmore (2013) は過渡のヨーモーメント応答が準定常予測を最大30%上回りうることを示している
- 学生フォーミュラでの実行可能性: **知る価値はあるが、学生チームでは実行できない。** 係数を決めるには非定常CFD（DES/LES）または動的風洞試験が必要で、FSAE の計算資源・設備では取得できない。教科書での正しい扱いは『準定常マップを使っているという自覚を持ち、換算周波数を一度計算して、自分のモデルがどこに立っているかを言えるようにする』という規律として扱うこと。実装せよ、とは書かない
- MATLAB実装経路: 実装自体は容易（tf / ss を作って Simulink の Transfer Fcn または State-Space ブロックを準定常マップ出力の後段に置く。同定は System Identification Toolbox / Simulink Control Design）。問題は係数を決めるデータが無いこと。換算周波数の判定は数行の MATLAB で書けるので、教科書ではこの『判定スクリプト』を成果物にするのが現実的

**[研究最前線] L7: CFD／風洞との連成（co-simulation）と空力弾性（翼のたわみと空力の連成）**

- 仮定・成立条件: 計算コストを無視できる／CFD と車両モデルの時間刻みを整合できる
- 破綻条件（次の階層へ進むべき時）: 1ラップぶんの CFD 連成は現実的でない（1姿勢の定常CFDでも数時間〜。SimScale の Formula Student 事例では5か月で約40,000コア時間を消費している）。空力弾性については、FS Rules 2026 T 8.3.1 が『225 cm² 以上に分散した 200 N に対してたわみ 10 mm 以下』かつ T 8.3.2 が『任意方向 50 N でたわみ 25 mm 以下』を要求している。**規則が 10 mm までのたわみを許容している**ということは、翼は速度に応じて必ず変形し、したがってエアロマップ自体が速度依存になる。学生チームの大半はこれを無視している
- 学生フォーミュラでの実行可能性: co-simulation は実行不可能。ただし**サロゲートモデル（CFD 結果を機械学習で代理し、車両モデルから高速に呼ぶ）**なら学生でも到達可能で、これが現実的な最前線。空力弾性も『翼のたわみ→迎角変化→C_L 変化』を1次元マップに縮約し、入力を空力荷重（＝速度の二乗）にすれば、簡易な速度依存 C_L·A モデルとして L2〜L4 に折り返せる。この『最前線を簡易モデルに折り返す』作業こそ実務のモデリング
- MATLAB実装経路: co-simulation は Simulink の外部ツール連成（FMI Import 等）だが FSAE では非現実的。サロゲートは Statistics and Machine Learning Toolbox の fitrgp（ガウス過程回帰・不確かさも出る）または Deep Learning Toolbox。空力弾性の折り返しは n-D Lookup Table（入力：動圧、出力：C_L·A 補正係数）を自作。FEA 側で 200 N・10 mm の規則試験を模擬してたわみ剛性を出し、それを迎角変化に換算する経路が学生に現実的

### 実務でよく起きる誤り

- 【基準面積の呪い】C_L や C_D を単独で持ってはいけない。これらは基準面積 A の定義に完全に依存し、A の定義はチームごと・文献ごとに違う（正投影面積か、翼を含むか、ドライバーヘルメットを含むか）。持つべきは C_L·A と C_D·A（単位 m²）。Wordley & Saunders の論文でさえ低ドラッグ設定について『実際は前面投影面積が小さくなるが便宜上同じ面積を使った。よって C_D と C_L は正しくないが C_D·A と C_L·A は正しい』と明記している。文献の C_L を引用するときは必ず A も一緒に引用し、それが無ければ引用しない。
- 【符号規約を検算しない】ISO 8855 は z 上向きなのでダウンフォースは −z。航空の C_L は上向き正。CFD ソルバの出力規約はさらに別。MATLAB VDB の実装式は Fdz = −½·ρ·Cl·Af·w̄² であり、係数の符号と軸の向きが二重に効く。文書を読んで納得するのではなく、必ず単体テストで検算すること：静止状態から V まで加速して前後軸荷重が『増える』のを数値で確認する。減っていたら符号が逆。この検算を第II部の演習として明示的に課すべき。
- 【単体翼の自由流データを足し算する】これが実務で最も頻繁で最も高くつく誤り。Wordley & Saunders の実測は自由流ベースの積み上げ予測より約35%低かった（前翼 −39%、後翼 −33%）。翼どうしの干渉、車体・ノーズ・タイヤとの干渉、地面効果の実効車高の違いがすべて効く。『前翼のCFD + 後翼のCFD + ディフューザのCFD = 車両の空力』は成り立たない。フルビークルで解くか、係数を実測で校正するか、どちらかしかない。
- 【ダウンフォースをグリップの比例増として扱う】タイヤの荷重感度により μ は荷重増加で低下し、横力は概ね Fy ∝ Fz^0.7〜0.9 になる。μ 一定でダウンフォースの利得を計算すると系統的に過大評価する。検算例：μ=1.6 一定で r=8.5 m のスキッドパッドを v=√(μ·g·r) で解くと 41.6 km/h だが、荷重移動と荷重感度を入れた Wordley & Saunders のモデルは 37 km/h。約12%の過大評価。TTC データが無いチームは、この過大評価を抱えていることを設計レポートに明記すべき。
- 【質量・CG高・ヨー慣性のペナルティを勘定に入れない】Wordley & Saunders の実測：翼とマウントで +12 kg（305→317 kg）、CG高 270→300 mm、ヨー慣性 106→118 kg·m²。結果として、32 km/h 以下では翼あり車のヨー加速度は翼なし車に劣る。FSAE のスラロームは 30 km/h 付近から始まるので、これは無視できない。ダウンフォースの利得だけを計算して『速くなる』と結論するレポートは審査で落ちる。
- 【ダウンフォースが増えれば必ず速い、と言う】加速イベント（75 m）は Wordley & Saunders の予測で 3.70 s（翼なし）→ 3.89 s（高ダウンフォース設定）と 0.19 s 悪化する。低ドラッグ設定でも 3.80 s。悪化分の内訳は『翼のドラッグと翼の重量がおおむね半々』。種目ごとに評価し、種目ごとに配点を掛けて合計するまでが空力の正当化。
- 【直進のエアロマップをスキッドパッドに使う】FS スキッドパッドの走行半径は約8.5〜9.1 m（FS Rules 2026 D 4.1.2 の内円15.25 m・外円21.25 m・路幅3 m から）。この半径では車体に大きな相対ヨー角がつく。Balasko & Zonta (2025) の FS 車CFDでは r=9.125 m の旋回で総ダウンフォースが約25%低下、抗力が約10%上昇した。直進係数をそのまま使えばスキッドパッドのラップタイムを必ず楽観側に外す。
- 【エアロマップの外挿】n-D Lookup Table の Extrapolation を既定の Linear のままにしておくと、車高が格子外に出た瞬間に非物理的な巨大ダウンフォースが出て、接地荷重が発散し、タイヤモデルが破綻し、ソルバが止まる。しかも『マップの外に出た』というエラーが出ないまま数値だけが壊れるので発見が遅れる。外挿は必ず Clip にし、さらに『格子外に出た時間の割合』をログに残すこと。
- 【FSAE の車高感度を F1 の常識で語る】FS Rules 2026 T 2.2.1 は静的最低地上高 30 mm を課し、T 2.2.2 はスライディングスカート等の接地する空力デバイスを禁じている。アンダーボディをシールできないので、F1 のような急峻な地面効果カーブは原理的に作れない。したがって FSAE で 2D 車高マップ（L4）に投資する前に、まず自チームの車高感度を測って『そもそも感度があるのか』を確認すること。翼だけのチームなら L3 で足りる可能性が高い。
- 【翼が剛体だと仮定する】FS Rules 2026 T 8.3.1 は『225 cm² 以上に分散した 200 N に対してたわみ 10 mm 以下』を要求する。裏を返せば規則は 10 mm までのたわみを許容しており、翼は速度に応じて必ず変形し、迎角が変わり、エアロマップ自体が速度依存になる。合格＝たわまない、ではない。少なくとも『速度で C_L·A が何%変わるか』を一度見積もること。
- 【空力をばね上にしか入れない】FSAE 規則は可動空力面を禁じていないため、翼をアップライト直結の非ばね上に載せる設計が成立する。この場合ダウンフォースはばねを介さず直接タイヤに届き、車体の上下運動を励起せず、前翼は地上高をほぼ一定に保つ。Wordley & Saunders が明示的に論じている。ばね上に入れるか非ばね上に入れるかで、車高応答も接地荷重も CoP の速度依存性もすべて変わる。モデリングの第一決定事項であり、後から直すのは大工事になる。
- 【CoP を静的重心位置と同じに固定して満足する】設計初期の割り切りとしては正しい（Wordley & Saunders も中間軸位置に置いている）。しかし実車では車高沈み込み・翼たわみ・ヨー角で CoP が動き、それが『速度依存のアンダー／オーバーステア』としてドライバーに現れる。ドライバーの『速いコーナーで曲がらない』というコメントは、機械的セットアップではなく CoP の移動が原因のことがある。第V部の制御設計まで含めて、CoP 移動は速度依存の外乱として扱う必要がある。
- 【空気密度を 1.225 kg/m³ に固定する】標準大気（15℃・海面）の値。日本の夏の大会（気温35℃）では ρ = 101325/(287×308.15) ≈ 1.146 kg/m³ となり、ダウンフォースも抗力も約6%減る。エアロマップは無次元係数で持ち、ρ は走行時の気温・気圧から毎回計算するのが正しい実装。予選と決勝で気温が10℃違えばセットアップの前提が変わる。
- 【準定常仮定を使っている自覚がない】エアロマップは『姿勢が決まれば力が瞬時に決まる』という準定常仮定に立つ。判定量は換算周波数 k = ω·L/(2·U)（f·L/U とする流儀もあるので定義を明記すること）。目安は k ≲ 0.05 で準定常可、k > 0.2 で強く非定常。FSAE 車（L≈1.6 m、U≈11 m/s）で 1 Hz のピッチ振動なら k ≈ 0.46 で、無次元数の上では準定常の外にある。ただし低速では動圧そのものが小さいので誤差の絶対値は小さい。『無次元では非定常、絶対値では無視できる』という二段構えの結論を出せることが、この教科書の実務水準の証明になる。Fuller et al. (2013) は過渡のヨーモーメント応答が準定常予測を最大30%上回りうることを示している。
- 【CFD の精度を検証せずにマップにする】マップは補間器にすぎず、精度は元の CFD 点の精度を超えない。メッシュ依存性、乱流モデル、移動床・回転タイヤの有無、対称面の使用（半車モデル）で結果は容易に10〜30%動く。特に半車モデルは旋回・ヨーの解析には原理的に使えない。Monash Motorsport が翼上の圧力タップで実走補正しているのは、CFD 単独を信じていないから。第III部の妥当性判断基準の章で、空力の受け入れ基準（何%以内なら使ってよいか）を明示的に定義すること。
- 【ラップシムで『速くなった』で止める】DesignJudges.com が明示している基準：『翼を付けたら速くなりました、では不十分』。要求されるのは (1) 各ブレーキング区間・コーナー中・立ち上がり・全開区間ごとの性能変化の計算、(2) 過去の実コースレイアウトに対する評価、(3) 実走データからあらゆる方法で力と係数を逆算して全部が一致することの確認。さらに『空力チームが車両運動と切り離されたサイロで作業している』ことを審査側は悪い設計と見なす。
- 【最適化ソルバにマップを直接渡す】第IV部32章（最小ラップタイム最適化）では、ルックアップテーブルの区分線形補間は微分不連続を持つため、勾配ベースの最適化が停滞・発散する。マップは滑らかな関数（多項式・スプライン・ガウス過程回帰など）に近似してから最適化に渡すこと。逆に、滑らかすぎる近似は地面効果の force reduction のような物理的に急峻な現象を消してしまう。この trade-off を自覚的に選ぶこと。
- 【調査上の未確認事項（重要・引用前に必ず一次資料を確認すること）】(1) Wordley & Saunders の姉妹論文 SAE 2006-01-0808 は書誌・DOI・抄録のみ確認しており、全文は有料のため未取得。同論文の具体的数値（風洞での多要素翼の係数、高ヨー角でのダウンフォース低下率、前翼地面効果の3測定法）を教科書に書く際は必ず原典を入手すること。(2) Takács & Zelei (DOI 10.3390/engproc2024079086) は Crossref で書誌のみ確認、全文は未取得。この論文に由来するとされる『60 kgf @ 60 km/h で60秒コースが2秒短縮』という数値は本調査では原典確認できていない。ただし本調査で検証済みの Monash 実測値 C_L·A=3.47 m² から独立に計算すると 60 km/h で 590 N ＝ 60.2 kgf となり、ダウンフォースの桁は一致する。(3) Balasko & Zonta (2025) はオープンアクセスだが本調査では PDF 全文を取得できず、Crossref 経由の抄録のみ確認した。『旋回時にダウンフォース約25%低下・抗力約10%上昇』は抄録記載の数値であり、条件（車速、ヨー角、どちらの半径か）の詳細は全文で確認が必要。(4) Marchesin et al. (2018) は書誌のみ確認、抄録・全文とも未取得。(5) Hucho『Aerodynamics of Road Vehicles』は OpenLibrary で 1987年版（Butterworth-Heinemann）と1998年版（SAE International, ISBN 978-0-7680-0029-0）の実在を確認したが、内容は未確認のため references には含めていない。(6) OptimumLap は Duke FSAE の公開記事で使用実績が確認できたが、公式配布ページの URL は本調査で確認できなかった（404）。ツールの現在の入手可否は各自確認のこと。

### 学生フォーミュラ固有の事情

【速度域】FS Rules 2026 が課すコース制約が空力の答えをほぼ決めている。直線は最長 80 m（D 6.1.1 / D 7.1.1）、エンデュランス1周 約1 km・総距離 約22 km（D 7.1.2 / D 7.1.3）、最小旋回直径 9 m（D 1.1.10 参照）、スキッドパッドは内円 15.25 m・外円 21.25 m・路幅 3 m（D 4.1.2）。旧規則時代の Wordley & Saunders は『最大直線 77 m、コーナー半径 9〜45 m、スラローム間隔 7.62〜15 m、目標最高速 105 km/h、目標平均速度 50 km/h』と記録しており、コース設計思想は20年変わっていない。実走データでは全開率が豪州で15%未満、米国でも20%未満 ＝ FSAE 車はパワーリミテッドではなくトラクションリミテッド。これが『ドラッグは軽視してよい、ダウンフォースを取れ』という FSAE 特有の結論の根拠。

【ダウンフォースの絶対量】検証済みの Monash 2003 車（C_L·A = 3.47 m²、車重＋ドライバー 317 kg）から計算すると、40 km/h で 262 N（車重の8.4%）、60 km/h で 590 N（19.0%）。これが FSAE の主戦場での実力。100 km/h まで行けば 1640 N（52.7%）だが、そこにはほとんど到達しない。『低速だから空力は無駄』という主張と『空力は必ず効く』という主張の両方が間違いで、正しくは『30〜60 km/h では車重の5〜19%であり、それでも旋回能力は +10〜15% 得られる』。

【規則が作る空力の天井】T 2.2.1 静的最低地上高 30 mm、T 2.2.2 スライディングスカート禁止 → アンダーボディのシールができないので F1 的な急峻な地面効果は作れず、車高感度マップ（L4）の投資対効果が F1 より低い。歴史的経緯として、1990年に Cornell がサクションファンでスキッドパッド 1.32 g を記録したことを受けて『パワード・グラウンドエフェクト』が禁止された（Wordley & Saunders の記述）。T 8.2 は寸法も厳しく縛る：ヘッドレスト後端より前方の空力デバイスは地上 500 mm 未満、前軸より前でフロントタイヤ内側面より外側は 250 mm 未満、後方は 1.1 m 未満。幅は 500 mm 未満なら前後輪最外点の面まで、500 mm 超なら後輪最内点まで。長さは後輪後端から後方 250 mm、前輪前端から前方 700 mm まで。

【FSAE だけの自由度】FSAE は可動空力面を禁じていないため、(a) 翼をアップライト直結の非ばね上に載せてダウンフォースをばねを介さず直接タイヤへ届ける、(b) イベントごとに設定を変える（加速＝低ドラッグ、スキッドパッド＝最大ダウンフォース）という設計が成立する。Wordley & Saunders はこの非ばね上マウントを明示的に論じており、『高い車体剛性やばね定数でボトミングを防ぐ必要がなくなり、メカニカルグリップを損なわない』『前翼が地上高をほぼ一定に保てる』と述べている。これは車両モデルの力の注入点を根本から変えるので、モデリングの第一決定事項。

【TTC（Tire Test Consortium）との接続】空力の利得はタイヤの荷重感度に食われる。TTC データを持っているチームは、Magic Formula の荷重依存項（μ が Fz 増加で低下、Fy ∝ Fz^0.7〜0.9 相当）を同定できるので、L2 のダウンフォース値をそのまま『グリップ比例増』と扱わずに済む。持っていないチームは μ 一定と置くしかなく、その場合は空力の利得を系統的に過大評価していることを明記すべき。検算例：μ=1.6 一定、r=8.5 m で単純に v=√(μ·g·r) を解くと 41.6 km/h だが、荷重移動と荷重感度を入れた Wordley & Saunders のモデルは 37 km/h を出している。約12%の過大評価。

【MathWorks 無償ライセンス下で実際に使えるもの】Vehicle Dynamics Blockset（Vehicle Body 3DOF / 6DOF）、Simulink の n-D Lookup Table、Simulink Design Optimization（惰行試験からの C_D·A 同定）、Curve Fitting Toolbox / Model-Based Calibration Toolbox（CFD 点からのマップ生成）、Statistics and Machine Learning Toolbox の fitrgp（CFD サロゲート）。決定的な制約として、VDB の Cd / Cl / Cpm はスカラであり車高依存エアロマップを表現できない。一方 Cs / Cym は beta_w に対するベクトルなのでヨー依存の横力・ヨーモーメントだけは組込みで入る。エアロマップは外力ポート（FExt / MExt）への自作注入が唯一の道。

### 参照文献

- **Katz, J., "Race Car Aerodynamics: Designing for Speed", Bentley Publishers, 初版1995・改訂第2版1996, 316ページ, ISBN 978-0-8376-0142-7** ✓実在確認（訂正: 書籍の実在は OpenLibrary で確認：Joseph Katz "Race car aerodynamics: designing for speed"、R. Bentley（Bentley Publishers）、**1995年、270ページ**、ISBN-10 0837601428 / ISBN-13 9780837601427。**リスト記載の「改訂第2版1996年・316ページ」は確認できなかった**（OpenLibrary の検索でも該当版は1件のみで1995年・270ページ）。Bentley Publishers の公式ページはリダイレクトループで取得不能。**教科書では「Bentley Publishers, 1995, ISBN 978-0-8376-0142-7」までにとどめ、版表記とページ数は書かないこと。**）
  - 種別: 書籍 / 入手性: 有料（市販書籍・中古流通豊富）。Internet Archive に貸出可能な蔵書あり
  - https://openlibrary.org/search?q=Race+Car+Aerodynamics+Katz
  - 用途: 第II部 空力①（ダウンフォースの入れ方）の一次教科書。翼・ディフューザ・渦発生器などダウンフォース生成機構の物理と、なぜ『流線形化・抗力低減』より『ダウンフォース』が優先されるかの原理。Wordley & Saunders も設計資源としてこれを挙げている。実在を書店・Internet Archive・OpenLibrary の複数経路で確認済み
- **Katz, J., "Aerodynamics of Race Cars", Annual Review of Fluid Mechanics, Vol. 38, pp. 27-63, 2006** ✓実在確認（訂正: Crossref で Joseph Katz（San Diego State University, Dept. of Aerospace Engineering）・ARFM 巻38・pp.27-63・2006年を完全一致で確認。訂正不要。本文中に「流体力学現象は依然として強い非線形性を持ち、多様な車両形態にわたる性能予測は難しい」という記述があり、本教科書の「モデルの適用限界」方針にそのまま使える。）
  - 種別: 論文 / 入手性: 有料または大学経由（Annual Reviews 購読）。多くの大学でアクセス可
  - https://doi.org/10.1146/annurev.fluid.38.050304.092016
  - 用途: 第II部 空力①の導入として、書籍1冊を読ませる前に配る総説。ダウンフォースの原理・生成手段（逆翼・ディフューザ・渦）を36ページで俯瞰できる。DOI 実在確認済み
- **Zhang, X., Toet, W., Zerihan, J., "Ground Effect Aerodynamics of Race Cars", Applied Mechanics Reviews, Vol. 59, No. 1, pp. 33-49, 2006** ✓実在確認（訂正: Crossref で Xin Zhang, Willem Toet, Jonathan Zerihan・AMR 巻59・号1・pp.33-49・2006年を完全一致で確認。引用文献89件のレビュー論文。訂正不要。）
  - 種別: 論文 / 入手性: 有料または大学経由（ASME Digital Collection）。Southampton の eprints に著者版があるが直接取得は403で未確認
  - https://doi.org/10.1115/1.2110263
  - 用途: 第II部 空力②（エアロマップ）の理論的背骨。車高低下に伴う『force enhancement（ダウンフォース増大）→ ピーク → force reduction（急減）』という力のレジーム分類が、なぜエアロマップが非線形で、なぜ格子外への外挿が危険かを説明する。著者の Willem Toet は元 F1 空力責任者、Xin Zhang は Southampton の地面効果研究の中心人物。DOI 実在確認済み（OpenAIRE で書誌・抄録を確認）
- **Zerihan, J., Zhang, X., "Aerodynamics of a Single Element Wing in Ground Effect", Journal of Aircraft, Vol. 37, No. 6, pp. 1058-1064, 2000** ✓実在確認（訂正: Crossref で Jonathan Zerihan, Xin Zhang・Journal of Aircraft 巻37・号6・pp.1058-1064・2000年を完全一致で確認。著者順もリスト記載どおり（Zerihan が第一著者）。訂正不要。）
  - 種別: 論文 / 入手性: 有料または大学経由（AIAA ARC）
  - https://doi.org/10.2514/2.2711
  - 用途: 第II部 空力②で、前翼の地面効果を『実験で測るとどうなるか』の一次データ。FSAE の前翼設計はこの曲線の上で行われる。Wordley & Saunders が前翼の C_L 見積りに直接使っている文献。DOI 実在確認済み
- **Zhang, X., Zerihan, J., "Aerodynamics of a Double-Element Wing in Ground Effect", AIAA Journal, Vol. 41, No. 6, pp. 1007-1016, 2003** ✓実在確認（訂正: Crossref で Xin Zhang, Jonathan Zerihan・AIAA Journal 巻41・号6・pp.1007-1016・2003年を完全一致で確認。No.61 とは著者順が逆（こちらは Zhang が第一著者）である点も正しい。訂正不要。）
  - 種別: 論文 / 入手性: 有料または大学経由（AIAA ARC）
  - https://doi.org/10.2514/2.2057
  - 用途: 上記の多要素翼版。FSAE の前翼は多要素が標準なのでこちらが実用上重要。DOI 実在確認済み
- **Wordley, S., Saunders, J., "Aerodynamics for Formula SAE: Initial Design and Performance Prediction", SAE Technical Paper 2006-01-0806, SAE 2006 World Congress, 2006** ✓実在確認（訂正: Crossref で Scott Wordley, Jeff Saunders・2006年・SAE Technical Paper Series を確認。訂正不要。Monash 大学チームによる学生フォーミュラ空力の定番一次ソースで、No.80 の Monash Motorsport のエアロマップ記事と対で使える。）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。ただし著者版PDFが複数の大学サイトに公開されており実質入手可能
  - https://doi.org/10.4271/2006-01-0806
  - 用途: **この領域で最重要の一次文献。全文を読んで数値を検証済み。** 第II部 空力①②と第IV部 ラップタイムシミュレーションの両方で使う。FSAE 空力の費用対効果を、実測係数（C_L=2.57, C_D=1.33, A=1.35 m²）・質量ペナルティ（+12 kg）・CG高（270→300 mm）・ヨー慣性（106→118 kg·m²）を全部載せて種目別に評価した唯一の公開文献。加速 3.70→3.89 s、スキッドパッド 5.20→4.93 s（ただし補正後はほぼ互角）、旋回能力 30〜80 km/h で +8〜30%。さらに『実測は自由流予測より約35%低い（前 −39%、後 −33%）』という、第III部 同定と検証で使うモデル過信の実例を提供する。P[kW] = C_D·A·V³/1633 という設計初期の見積り式もここから
- **Wordley, S., Saunders, J., "Aerodynamics for Formula SAE: A Numerical, Wind Tunnel and On-Track Study", SAE Technical Paper 2006-01-0808, SAE 2006 World Congress, Vehicle Aerodynamics SP-1991, pp. 237-249, 2006** ✓実在確認（訂正: Crossref で Scott Wordley, Jeff Saunders・2006年・SAE Technical Paper Series を確認。訂正不要。CFD・風洞・実車の3手法の突き合わせを扱っており、第III部（同定と検証）の妥当性判断基準の実例として使える。なおリスト記載の収録集（SP-1991, pp.237-249）は Crossref からは確認できなかったため、教科書には論文番号と年のみ書くのが安全。）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）
  - https://doi.org/10.4271/2006-01-0808
  - 用途: 上記の姉妹論文。第III部 同定と検証で使う。多要素翼の設計、実車風洞試験、実走試験の相関、前翼の地面効果測定手法3種、高ヨー角でのダウンフォース低下の実測を扱う。DOI・書誌は確認済みだが有料のため全文は未取得（抄録のみ確認）。数値を引用する際は必ず原典に当たること
- **Balasko, D., Zonta, F., "Aerodynamics of a Cornering Formula Student Car", Journal of Fluids Engineering, Vol. 148, No. 3, 031202, 2025** ✓実在確認（訂正: Crossref で Dominik Balasko, Francesco Zonta・Journal of Fluids Engineering 巻148・号3・論文番号 031202 を確認（Crossref 登録年 2025）。巻148・号3 の印刷号は2026年3月にあたるため、教科書では「Vol.148, No.3, 031202（2025年オンライン公開）」のように書くか、DOI を主表記にするのが安全。新しい論文なので引用の際は発行状態（オンライン先行か印刷済みか）を確認すること。）
  - 種別: 論文 / 入手性: オープンアクセス（CC-BY, ASME Digital Collection）
  - https://doi.org/10.1115/1.4069995
  - 用途: 第II部 空力②（エアロマップのヨー依存）の決定打。FS 車を r=9.125 m（＝FSスキッドパッドの実半径）と r=22 m でCFD解析し、旋回時に総ダウンフォースが約25%低下・抗力係数が約10%上昇することを示した。『直進のCFD値をスキッドパッドに使ってはいけない』という教科書の主張に、FSAE 固有かつ最新の定量的根拠を与える。エンドプレート・シャークフィンが横力を生みタイヤ負荷を下げる点も、第II部 サスペンションとの結合で使える。DOI・書誌・抄録を Crossref で確認、Unpaywall で CC-BY オープンアクセスであることを確認済み（PDF直取得は publisher 側で403、要ブラウザ）
- **Fuller, J., Best, M., Garret, N., Passmore, M., "The importance of unsteady aerodynamics to road vehicle dynamics", Journal of Wind Engineering and Industrial Aerodynamics, Vol. 117, pp. 1-10, 2013** ✓実在確認（訂正: Crossref で Joshua Fuller, Matt Best, Nikhil Garret, Martin Passmore・JWEIA 巻117・pp.1-10・2013年を完全一致で確認。訂正不要（第3著者は Nikhil Garret）。非定常空力が車両運動に与える影響を扱っており、エアロマップ（準定常仮定）の適用限界を論じる節の一次ソースになる。）
  - 種別: 論文 / 入手性: 有料または大学経由（Elsevier）
  - https://doi.org/10.1016/j.jweia.2013.03.006
  - 用途: 第II部 空力②の最後（過渡空力・L6）と、教科書全体の『モデルをいつ信じてはいけないか』の素材。準定常仮定が破れるとき過渡のヨーモーメント応答が準定常予測を最大30%上回りうることを示す。FSAE では実行できない階層だが、準定常マップを使っている自覚を持たせるために引く。Crossref で書誌を確認済み（著者・巻・ページ・DOI）
- **Marchesin, F.P., Barbosa, R.S., Gadola, M., Chindamo, D., "High downforce race car vertical dynamics: aerodynamic index", Vehicle System Dynamics, Vol. 56, No. 8, pp. 1269-1288, 2018**
  - 種別: 論文 / 入手性: 有料または大学経由（Taylor & Francis）
  - https://doi.org/10.1080/00423114.2017.1413196
  - 用途: 第II部 空力②と サスペンション③（スプリング・ダンパ・ARB）の結合章で使う。高ダウンフォース車では『空力が車高を決め、車高が空力を決める』という閉ループができ、サスペンション設定の目的関数が変わる。この連成を扱う数少ない査読論文。Crossref と Semantic Scholar で書誌を確認済み（抄録は未取得）
- **Kuchar, D., "Design and Implementation of a Six-Element Autonomous Active Aerodynamics System for Formula SAE", Undergraduate Honors Thesis, University of Maryland, 2026（指導: Leonard Hamilton, Huan Xu）** ✓実在確認（訂正: **Crossref には存在しないが、DataCite（DRUM = Digital Repository at the University of Maryland が発行する DOI）で実在を確認**：タイトル完全一致、著者 Kuchar, Duncan、publication year 2026、publisher "Digital Repository at the University of Maryland"、resource type Thesis（Dissertation）。著者のフルネームは Duncan Kuchar。リスト記載の指導教員（Leonard Hamilton, Huan Xu）は DataCite レコードからは確認できなかったため、教科書には書かないこと。学部の Honors Thesis であり査読論文ではない点を明記すべき。）
  - 種別: 学位論文 / 入手性: オープンアクセス（UMD DRUM リポジトリ）
  - https://doi.org/10.13016/irhd-u4aq
  - 用途: 第II部 空力②と第IV部 セットアップ感度解析で使う、最新のFSAE実例。6要素アクティブ翼（前4・後2フラップ）で抗力係数 1.44→0.73（49%低減）、CoP を前軸配分 78%→20% まで移動させ、シミュレーションでオートクロス −1.47 s、エンデュランス −42.4 s（2.6%）、加速 −0.08 s（1.9%）、燃費 +7.2% を予測。『CoP を能動的に動かす』という L3 の発展形が学生の手で実現できることを示す。DOI 付き機関リポジトリで実在・抄録・数値を確認済み
- **Formula Student Germany, "Formula Student Rules 2026", Version 1.1, 135ページ, 2026**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料PDF）
  - https://www.formulastudent.de/fsg/rules/
  - 用途: 第II部 空力①②の設計制約すべての出典。PDF をダウンロードして本文を直接確認済み。T 8.1 空力デバイスの定義、T 8.2.1/8.2.2/8.2.3 高さ・幅・長さ制限、T 8.3.1（200 N / 225 cm² でたわみ10 mm以下）・T 8.3.2（任意方向50 Nでたわみ25 mm以下）、T 2.2.1 静的最低地上高 30 mm、T 2.2.2 スライディングスカート禁止、D 4.1.2 スキッドパッド寸法（内円15.25 m・外円21.25 m・路幅3 m・中心間18.25 m）、D 6.1.1/D 7.1.1 直線最長80 m、D 7.1.2/7.1.3 エンデュランス1周約1 km・総22 km。T 8.3.1 のたわみ許容値は『規則が空力弾性を許している』という論点の根拠になる
- **Milliken, W.F., Milliken, D.L., "Race Car Vehicle Dynamics", SAE International, 1995, ISBN 978-1-56091-526-3** ✓実在確認（訂正: No.2 / No.29 と同一書籍。OpenLibrary（OL1111145M）で1995年・SAE International・890ページ・ISBN-10 1560915269 を確認。ISBN-13 978-1-56091-526-3 は ISBN-10 1560915269 と整合する。**教科書内で同一書籍を No.2 / No.29 / No.70 と3回別々に挙げているので、書誌を1つに統一すること（推奨：890ページ表記）。**）
  - 種別: 書籍 / 入手性: 有料（市販書籍）。多くの大学図書館に所蔵
  - https://openlibrary.org/search?q=Race+Car+Vehicle+Dynamics+Milliken
  - 用途: 教科書全体の参照点。空力については、ダウンフォースを車両運動方程式にどう入れるか（軸荷重・空力バランス・速度依存の安定性）を扱う章がある。Wordley & Saunders も車両モデルの根拠としてこれを引いている。OpenLibrary で実在・出版社・ISBN を確認済み
- **McBeath, S., "Competition Car Downforce", Haynes Publishing, 1998, ISBN 978-0-85429-977-5 ／ McBeath, S. & Toet, W., "Competition Car Aerodynamics", 3rd ed., Veloce Publishing, 2017, ISBN 978-1-78711-102-8**
  - 種別: 書籍 / 入手性: 有料（市販書籍）
  - https://openlibrary.org/search?q=Competition+Car+Aerodynamics+McBeath
  - 用途: 第II部 空力①の実務的な補助教材。Wordley & Saunders が『使える馬力から後翼の C_D·A を決め、モーメント釣り合いから前翼を決める』という設計手順を McBeath から引いている。第3版は元F1空力責任者 Willem Toet が共著。OpenLibrary で両書の実在・出版社・ISBN を確認済み
- **Brayshaw, D.L., Harrison, M.F., "A quasi steady state approach to race car lap simulation in order to understand the effects of racing line and centre of gravity location", Proc. IMechE Part D: J. Automobile Engineering, Vol. 219, pp. 725-739, 2005** ✓実在確認（訂正: Crossref で D L Brayshaw, M F Harrison・Part D 巻219・**号6**・pp.725-739・2005年を確認。リストに号（Issue 6）が欠けているので補うとよい。訂正はそれのみ。第IV部（QSS ラップタイムシミュレーション）の中核的一次ソース。）
  - 種別: 論文 / 入手性: 有料または大学経由（SAGE）
  - https://doi.org/10.1243/095440705X11211
  - 用途: 第IV部 QSS（準定常ラップタイムシミュレーション）で、空力を C_L·A / C_D·A として組み込む標準的な枠組み。L2 のエアロモデルがどのソルバに入るかを示す。Crossref で書誌・DOI を確認済み
- **Siegler, B., Deakin, A., Crolla, D., "Lap Time Simulation: Comparison of Steady State, Quasi-Static and Transient Racing Car Cornering Strategies", SAE Technical Paper 2000-01-3563, 2000** ✓実在確認（訂正: Crossref で Blake Siegler, Andrew Deakin, David Crolla・2000年・SAE Technical Paper Series を確認。訂正不要。定常・準静的・過渡の3手法を直接比較しており、第IV部28-31章（g-g／QSS／過渡）の構成をそのまま裏づける一次ソース。）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）
  - https://doi.org/10.4271/2000-01-3563
  - 用途: 第IV部 28〜31章で『定常・準定常・過渡』のラップシムを比較する際の一次文献。空力モデルの階層とラップシムの階層が独立に選べること（＝どちらを上げるべきかの判断）を示す。Crossref で書誌・DOI を確認済み
- **Massaro, M., Limebeer, D.J.N., "Minimum-lap-time optimisation and simulation", Vehicle System Dynamics, Vol. 59, No. 7, pp. 1069-1113, 2021** ✓実在確認（訂正: Crossref で M. Massaro, D. J. N. Limebeer・VSD 巻59・号7・pp.1069-1113・2021年を完全一致で確認。訂正不要。第IV部第32章（最小ラップタイム最適化）の決定版レビュー論文。）
  - 種別: 論文 / 入手性: 有料または大学経由（Taylor & Francis）
  - https://doi.org/10.1080/00423114.2021.1910718
  - 用途: 第IV部 32章（最小ラップタイム最適化）の総説。エアロマップが最適化問題の中でどう扱われるか（滑らかさ・微分可能性の要求）を押さえるのに必要。マップを直接使うと最適化が壊れるため滑らかな近似が要る、という実装上の要請の根拠。Crossref で書誌・DOI を確認済み
- **Abid, M., Wajid, H.A., Iqbal, M.Z., Najam, S., Arshad, A., Ahmad, A., "Design and Analysis of an Aerodynamic Downforce Package for a Formula Student Race Car", IIUM Engineering Journal, Vol. 18, No. 2, pp. 212-224, 2017**
  - 種別: 論文 / 入手性: オープンアクセス（IIUM Engineering Journal）
  - https://doi.org/10.31436/iiumej.v18i2.679
  - 用途: 第II部 空力①の学生向け事例。FS 車の前翼・後翼・ディフューザをCFDと風洞の両方で扱い、相関を取っている。オープンアクセスなので学生がそのまま読める数少ない査読論文。書誌・抄録・DOI を出版社サイトで確認済み（全文の数値は未確認）
- **Takács, D., Zelei, A., "Performance Optimization of a Formula Student Racing Car Using IPG CarMaker, Part 1", Engineering Proceedings, Vol. 79, No. 86, 2024** ✓実在確認（訂正: Crossref で実在を確認。著者 Dominik Takács, Ambrus Zelei、2024年、論文番号86。**正式タイトルには副題があり、リスト記載は不完全**："Performance Optimization of a Formula Student Racing Car Using **the** IPG CarMaker, **Part 1: Lap Time Convergence and Sensitivity Analysis**"。DOI（10.3390/engproc2024079086）から Engineering Proceedings 巻79・論文86・2024年であることも整合。Crossref の container-title は会議名 "SMTS 2024" で登録されている点に注意。教科書では正式な副題まで含めて書くこと。）
  - 種別: 論文 / 入手性: オープンアクセス（MDPI Engineering Proceedings）
  - https://doi.org/10.3390/engproc2024079086
  - 用途: 第IV部で商用ラップシム（IPG CarMaker）に FS 車の空力を入れる実例。オープンアクセスのはずだが本調査では全文取得が publisher 側で403となり、書誌・DOI・著者のみ Crossref で確認した。数値を引用する前に全文を読むこと
- **MathWorks, "Vehicle Body 3DOF" / "Vehicle Body 6DOF"（Vehicle Dynamics Blockset リファレンス）** ✓実在確認（訂正: **Vehicle Body 3DOF は実取得で確認**：正式タイトル "Vehicle Body 3DOF - 3DOF rigid vehicle body to calculate longitudinal, lateral, and yaw motion"、Vehicle Dynamics Blockset。空力パラメータとして **Cd（空気抵抗係数, 既定0.3）、Cl（揚力係数, 既定0.1）、Cpm（ピッチモーメント係数）、Cs（横力係数）、Cym（ヨーモーメント係数）** を持ち、相対対気速度から抗力・モーメントを重心まわりに計算することを確認。第II部空力①（ダウンフォースの入れ方）の実装先として正しい。**一方 "Vehicle Body 6DOF" のページは今回取得していないため未確認**。教科書に併記するなら 6DOF ページを別途確認すること（同ブロックセット内に存在する可能性は高いが、本検証では裏を取っていない）。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MathWorks Help）
  - https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html
  - 用途: 第II部 空力①の実装章。空力の実装式 Fdx = −½·ρ·Cd·Af·w̄²、Fdz = −½·ρ·Cl·Af·w̄²、Mdp = −½·ρ·Cpm·Af·w̄²·(a+b) と、軸荷重式 Fzf = [b·m·g − (ẍ−ẏ·r)·m·h + h·Fxext + b·Fzext − Myext]/(a+b) を確認済み。決定的な事実として Cd/Cl/Cpm はスカラ（車高マップ不可）、Cs/Cym は beta_w に対するベクトル（ヨー依存可）。外力ポート FExt/MExt がエアロマップ注入点になる
- **MathWorks, "n-D Lookup Table"（Simulink ブロックリファレンス）** ✓実在確認（訂正: ページ実取得で確認。正式タイトル "n-D Lookup Table — Approximate n-dimensional function"、製品は Simulink 本体。**1〜30次元まで対応**。エアロマップ（フロント／リア車高×ヨー角など多次元）の実装ブロックとして正しい。訂正不要。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MathWorks Help）
  - https://www.mathworks.com/help/simulink/slref/ndlookuptable.html
  - 用途: 第II部 空力②（エアロマップ実装）と第VI部 コード生成の接点。1〜30次元、非等間隔breakpoint可、補間は flat / linear point-slope / linear Lagrange / nearest / cubic-spline / Akima、外挿は Clip / Linear / Cubic spline を確認済み。『外挿は必ず Clip』という規律の根拠。等間隔breakpointは生成コードから除算を消せる、という記述は第VI部リアルタイム実装でも使える
- **MathWorks, "Estimate Vehicle Drag Coefficients by Coast-Down Testing"（Simulink Design Optimization 例）** ✓実在確認（訂正: ページ実取得で確認。タイトル完全一致、製品は Simulink Design Optimization。内容：抗力式 Fdrag = a + b·ẋ + c·ẋ² を Simulink で組み、初速40 / 60 / 80 m/s の3つの惰行（コーストダウン）データから Cd・Cr・Cr0 を Parameter Estimator アプリで推定（収束値 Cd=0.314, Cr=6.422, Cr0=302.5）、実測速度曲線との一致で検証する。**SAE J1263（コーストダウン試験規格）を参照している**点も確認。第III部（パラメータ同定）で学生が実車で実施できる数少ない手順として価値が高い。訂正不要。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MathWorks Help）
  - https://www.mathworks.com/help/sldo/ug/estimate-vehicle-drag-coefficients-by-coast-down-testing.html
  - 用途: 第III部 24章（パラメータ入手）で、実車の惰行試験から C_D·A と転がり抵抗を分離する手順。Parameter Estimator アプリ、モデル coastdownmodel.slx、F_drag = a + b·ẋ + c·ẋ² の3係数推定を確認済み。FSAE チームが駐車場で今日から実行できる唯一の空力同定手順
- **Monash Motorsport, "Aero Mapping"（チーム技術ブログ）** ✓実在確認（訂正: ページ実取得で確認。タイトル "Aero Mapping"。内容：ピッチ・ロール・ヨー・ステアの車両姿勢変化に対してダウンフォース係数などがどう変わるかを図表化し、頻出姿勢でのベースライン CFD＋パラメータを振った複数解析で作成する。ウイングの圧力タップによる実走データで CFD を検証している旨も記載。**著者は「Guest User」表記、日付は「9月14日」で年が明記されていない**（文脈上2020年前後）。教科書では日付を書かず「Monash Motorsport, "Aero Mapping"（チーム技術ブログ, 閲覧日 2026-08-10）」とすること。査読を経ていないチームブログである点も明記すべき。）
  - 種別: FSAE設計レポート / 入手性: オープンアクセス（Web）
  - https://www.monashmotorsport.com/blog/aeromapping
  - 用途: 第II部 空力②で『学生チームがどこまでやれるか』の実例。前後車高・ロール・ヨー・ステアを振ったCFDでマップを作り、最も頻度の高い姿勢をベースラインに置き、翼上の圧力タップの実走データでマップを補正する、という手順を公開している。実走の車高分布をマップ上に重ねて『実際に使う領域』を可視化する考え方は第IV部セットアップ感度解析にも効く。査読は無いが、Wordley & Saunders と同じチームの現在形として価値がある
- **theRACINGLINE.net, "Aeromaps, wind tunnel testing and CFD Part 1", 2018** ✓実在確認（訂正: ページ実取得で確認。**著者は Andrea Quintarelli、公開日は2018年6月5日**（リストには著者名がなかったので補うこと）。内容：ダウンフォース・ドラッグ・空力バランスが速度と前後車高で変わること、エアロマップは前後車高の組み合わせごとに CzA・CxA・バランスを格納した表であること、Nicolas Perrin の LMP1 の実例で**リア車高6 mm の変化がダウンフォース約2.1%の変動を生み、プロドライバは1%未満のバランス変化を感知する**という具体数値を提示。CFD・風洞・実走の3手法も比較。第II部空力②の「なぜ車高感度が効くのか」の定量的裏付けに使える。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（Web）
  - http://theracingline.net/2018/race-car-tech/race-tech-explained/aeromaps-wind-tunnel-testing-and-cfd-part-1/
  - 用途: 第II部 空力②で、プロのエアロマップが実際にどういう数表なのかを見せる実例。前後車高の組合せに対して CzA・CxA・バランス%を持つ表という形式、および『後車高6 mmの変化で CzA 約2.1%・バランス約1.5%が動く（プロドライバーが明確に感じ取る差）』『ダウンフォースは抗力より車高変化に敏感』という感度の桁感。査読なしの業界ブログなので、数値は『実務の桁感』としてのみ扱い、根拠が要る箇所には使わない
- **DesignJudges.com, "Adding Aero, Justifying Aero"** ✓実在確認（訂正: ページ実取得で確認。タイトル完全一致。**著者は Skitter Yaeger**（リストに著者名がなかったので補うこと）。日付は「7月14日」で年の明記なし。内容：FSAE では低速コーナーが多く追加重量がグリップ増を打ち消しうるため空力が自動的に有利になるとは限らない、という前提から、(1)効果の定量化（計算＋ラップシミュレーション）、(2)いきなり CFD ではなく簡素で安価な設計から始める、(3)駐車場での実走試験、(4)ダウンフォース／ドラッグの複数手法での計測、(5)データに基づく反復、という6段階を提示。「最速ラップになる組み合わせを探すだけでは要点を外している」という指摘は、本教科書の『各効果の大きさを理解してから判断する』という方針と一致する。）
  - 種別: FSAE設計レポート / 入手性: オープンアクセス（Web）
  - https://www.designjudges.com/articles/adding-aero-justifying-aero
  - 用途: 第II部 空力①の『限界と適用範囲』節の素材。FSAE デザイン審査員側が空力の正当化に何を求めるかを明示している。『翼を付けたら速くなった、では不十分』『各ブレーキング・コーナー中・立ち上がり・全開区間ごとに性能変化を計算せよ』『実走データからあらゆる方法で力と係数を逆算し、全部が一致することを示せ』『空力チームが車両運動と切り離されたサイロで作業しているのは悪い設計』。この教科書が空力を『車両モデルへの入力』として扱う理由そのもの
- **Duke FSAE, "Aerodynamics Update Summer 2022: Justifying Aero and Setting Goals"（チーム技術ブログ）** ✓実在確認（訂正: ページ実取得で確認。タイトル完全一致、**著者は Heath Springman（共同リードとして Cody Rosolowsky）、掲載日は2023年1月18日**（タイトルの "Summer 2022" は対象期間であって掲載年ではない。リストが「2022」としているなら訂正が必要）。内容の具体数値：2022年車両の CL=1.66 / CD=0.67、Optimum Lap による Michigan エンデュランスコースのシミュレーションで **145.28秒→140.40秒（3.4%短縮）**、2023年目標としてダウンフォース／ドラッグのスケーリング120%、40 mph で CoP を CG の10%後方、アクティブエアロ導入、空力パッケージ総重量25 lb 未満、許容トレードオフ比 1:2.333。Before/After の数字が揃っており、教科書の「独自の比較・数字」の実例として引用しやすい。）
  - 種別: FSAE設計レポート / 入手性: オープンアクセス（Web）
  - https://www.dukefsae.com/single-post/aerodynamics-update-summer-2022-justifying-aero-and-setting-goals
  - 用途: 第IV部で学生が実際に使うツールチェーンの実例。SolidWorks Flow Simulation（半車・950万セル）で C_L=1.66, C_D=0.67 を出し、OptimumLap でミシガンのエンデュランスコースを 145.28 s → 140.40 s（3.4%改善）と評価。全開率6.71%を手計算で確認してドラッグ許容量を裏取りしている。査読なしだが、L2の意思決定を学生の手で回した実例として引用価値がある
- **SimScale, "Formula Student Aerodynamics – Growing Wings with CFD"** ✓実在確認（訂正: ページ実取得で確認。タイトル完全一致。**著者は Niklas Pfeiffer、公開日は2023年6月5日**（リストに著者・日付がなかったので補うこと）。内容：eMotorsports Cologne の2017年車両を題材に、3枚翼＋ガーニーフラップのリアウイング（2D解析→3D CFD）、フロントウイング（ダウンフォース／アンダートレイへの整流／タイヤ後流処理の両立）、アンダートレイ（ディフューザとレーキ角）を解説。**計算量は約40,000コア時間**と明記。ベンダー（SimScale）の技術マーケティング記事である点は必ず注記し、中立性の観点から他ツール（OpenFOAM 等）にも触れること。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（Web）
  - https://www.simscale.com/blog/formula-student-aerodynamics/
  - 用途: 第II部 空力②のレーキ感度の桁感（レーキ角1°の変更でアンダートレイのダウンフォース約15%変化）と、CFD の実コスト（5か月で約40,000コア時間）の実例。後者は L4/L7 で『やる価値があるか』を判断させるために使う。ベンダーのマーケティング記事なので、数値は桁感としてのみ扱い、査読文献で裏を取ること

---

## 車両の状態推定と制御（第V部 制御設計 34–39章、および第III部・第VI部と接続する層）

### モデル階層

**[入門（ただし全階層の前提。ここを飛ばすと以降が全部無駄になる）] 可観測性解析（線形：可観測性行列 obsv(A,C) のランク / PBHテスト、非線形：リー微分による局所弱可観測性）**

- 仮定・成立条件: 線形時不変なら obsv(A,C) のランクだけで判定できる。非線形系では動作点まわりの局所判定にとどまり、大域的可観測性は保証しない。コーナリングスティフネス Cf,Cr や路面摩擦 μ を状態に含めて拡大系にすると、可観測性は入力の励振（persistent excitation, 持続的励振）に依存する量になる。
- 破綻条件（次の階層へ進むべき時）: 定常円旋回のように入力（舵角・車速）が一定だと拡大系の可観測性が失われ、車体すべり角 β の誤差とコーナリングスティフネス Cf の誤差が原理的に区別できなくなる。線形2輪モデル＋ヨーレート出力のみでは、Cf/Cr が正確に既知でない限り β は実用的に推定できない。横加速度計を足しても、ロール角/バンク角による重力成分 g·sinφ と真の横加速度が分離できないため可観測性は回復しない。 → 「可観測でない」と判明したときの正しい対処は、推定器を高度化することではなく、(a) 独立したセンサを足す（GNSS/光学式対地速度計）か、(b) モデルを縮約する（AMZ の zero-slip-ratio measurement update のように、破綻した状態を落として低次の可観測な系に切り替える）かのどちらかである。
- 学生フォーミュラでの実行可能性: 必ず最初にやる。FSAEでは「限られたセンサ予算をどこに使うか」を決める唯一の合理的根拠になる。obsv() のランクチェックは数行で書けるので、コストゼロで「そのセンサ構成では原理的に無理」を証明できる。Kabzan らの AMZ Driverless は付録で非線形可観測性解析を行い、GSS/IMU/GNSS/WSS の各センサを1つずつ落としたときの可観測性表（Table 2）を提示している — 教科書の演習として理想的な実例。
- MATLAB実装経路: Control System Toolbox: obsv, rank, ss, c2d, ctrb, gram。非線形の局所弱可観測性は Symbolic Math Toolbox の jacobian でリー微分を記号的に構成して自作。既製の非線形可観測性判定ブロックは無いので自作方針。

**[入門] 運動学的積分（直接積分法）: β̇ = a_y/v_x − r、あるいは v̇_y = a_y − r·v_x を積分**

- 仮定・成立条件: 平坦路（バンク角ゼロ）、ロール角ゼロ、IMUバイアスなし、v_x が既知、IMU が重心位置にある（そうでなければ r と ṙ によるレバーアーム補正が必要）。車両モデルもタイヤモデルも一切不要。
- 破綻条件（次の階層へ進むべき時）: IMU のバイアスと初期値誤差が積分され、β の誤差が時間に比例して発散する。安価な MEMS IMU（FSAE の現実的な予算帯）ではバイアス不安定性が支配的で、数秒〜十数秒で使い物にならない。バンク角 φ があると a_y に g·sinφ が混入し、恒常的なドリフト源になる（ロール角 2° で約 0.34 m/s² ≒ 0.035 g の見かけ横加速度）。 → v_x が小さいとき（コーナー出口・スタート）は a_y/v_x が発散するので低速で特に悪い。ドリフトが観測されたら即座に次の階層（モデルとの融合）へ進むべき。
- 学生フォーミュラでの実行可能性: 使える。ただし「短時間のみ」。実装は10行以下で、タイヤモデルが未同定の段階でも動く唯一の手法なので、最初の一歩として必ずやる価値がある。「ドリフトを自分の目で見る」ことが、以降の全階層の動機づけになる。
- MATLAB実装経路: Simulink の Discrete-Time Integrator のみ。完全自作。追加Toolbox不要。

**[入門] モデルベース開ループ推定（線形2輪モデルを舵角と車速から積分して β を出す／定常仮定で β_ss を代数的に解く）**

- 仮定・成立条件: 線形タイヤ（Cf, Cr 一定）、小舵角、一定 v_x、荷重移動なし、空力なし、路面 μ 一定。第I部で作った線形2輪モデルをそのまま流用する。
- 破綻条件（次の階層へ進むべき時）: モデル誤差がそのまま推定誤差になる。Cf/Cr は接地荷重・タイヤ温度・内圧で容易に ±30 % 変わるため、定常誤差が大きい。横加速度が高い領域でタイヤが飽和すると、線形モデルは β を過小評価して完全に破綻する（実車がスピンしているのに推定器は「まだ余裕がある」と言う）。 → この階層は積分ドリフトしないという性質を持つので、破綻を見たら「捨てる」のではなく「運動学的積分と融合する」に進むのが正しい。
- 学生フォーミュラでの実行可能性: 単独では実車に使えない。しかし「低周波は正確、ドリフトしない」という性質が運動学的積分と完全に相補的なので、次の融合層の片割れとして必須。第I部の成果物がそのまま再利用できることを示す良い接続点。
- MATLAB実装経路: 第I部の線形2輪モデルを ss() で組み、lsim() で応答。Simulink では State-Space ブロック。追加Toolbox不要。

**[実用] ルーエンベルガ観測器（線形2輪モデル + ヨーレート計測でフィードバック補正）**

- 仮定・成立条件: 上記の線形2輪モデルの仮定に加え、ヨーレートセンサがある。誤差ダイナミクス ė = (A − LC)e が線形で、極配置により任意に速くできる。
- 破綻条件（次の階層へ進むべき時）: Cf/Cr が誤っていると、ヨーレートは正しく追従するのに β だけが恒常的にずれる — 可観測性が弱いために、モデル誤差が β のオフセットとして吸収されてしまう。オブザーバゲイン L を上げても改善せず、むしろセンサノイズを増幅するだけになる。これは「フィードバックを掛ければモデル誤差が消える」という素朴な期待が成り立たない典型例。 → ゲインを上げても直らないと分かったら、それは推定器の問題ではなく可観測性の問題。センサ追加（GNSS）か、パラメータ同時推定（拡大系）へ進む。
- 学生フォーミュラでの実行可能性: 教育的価値は非常に高いが、実車で単独運用はしない。place() で極配置して Simulink に置くのは1日でできるので、「線形制御理論の道具が車両に届く」体験として第V部の入口に最適。
- MATLAB実装経路: Control System Toolbox: place, acker で極配置、obsv でランクチェック。Simulink は State-Space + Gain。追加Toolbox不要。

**[実用（FSAEで費用対効果が最も良い層）] 運動学×動力学の相補的融合（相補フィルタ／重み付き融合）: 高周波帯は運動学的積分、低周波帯はモデルベースを採用し、クロスオーバー周波数で繋ぐ**

- 仮定・成立条件: 2つの推定の誤差が周波数的に分離できる（積分は低周波でドリフト、モデルは高周波で応答遅れ・パラメータ誤差）。クロスオーバー周波数は設計者が手で決める固定値。
- 破綻条件（次の階層へ進むべき時）: 誤差の統計が変わる場面 — 低μ路面、タイヤ飽和域、急激な荷重移動 — で固定重みが不適切になる。適応則がないので、モデルが信用できない状況でもモデルを同じ重みで信じ続ける。 → 「路面や走行状況によって最適な重みが変わる」と実感したら、重みを共分散から自動決定する層（カルマン系）へ進む。これがカルマンフィルタの動機づけとして最も自然な導入。
- 学生フォーミュラでの実行可能性: 使える。FSAEで最も費用対効果が良い層。EKF のチューニングに何ヶ月も苦しむより、まずここを実車で成立させるべき。Chindamo らのレビューでもこの「kinematic + dynamic のハイブリッド」が独立した分類として扱われている。
- MATLAB実装経路: 自作（1次 LPF / HPF の組み合わせ）。Simulink で Transfer Fcn 数ブロック。追加Toolbox不要。Embedded Coder でそのままECUへ。

**[実務標準] 拡張カルマンフィルタ EKF（非線形車両モデル + Magic Formula タイヤモデル）**

- 仮定・成立条件: 状態遷移と観測が「穏やかに」非線形（1次テイラー展開で十分）、プロセス／観測ノイズがガウス白色、ヤコビアンが評価できる、共分散 Q・R が正しく設定されている、初期共分散 P0 が妥当。
- 破綻条件（次の階層へ進むべき時）: タイヤ飽和域では ∂F_y/∂α ≈ 0 になり1次線形化が破綻する — つまり「限界域こそ β の推定が必要」なのに「限界域で最も精度が落ちる」という、この手法の本質的な弱点。これを Q を大きくして逃げると、実質的にモデルを信じない＝運動学的積分に戻ってしまう（よくある失敗）。初期共分散や Q/R が不適切だと発散する。ロール角/バンク角を状態に入れないと重力成分の混入は解決しない。 → 飽和域での劣化が問題なら UKF（シグマ点で高次モーメントを保つ）へ、ドリフトが問題なら独立速度計測（GNSS/GSS）へ。どちらの問題かを切り分けることが重要。
- 学生フォーミュラでの実行可能性: 使える。ただし検証用の真値（RTK-GNSS または光学式対地速度計）がなければ「動いているように見えるだけ」になり、正しさを永遠に確認できない。AMZ Driverless はこの層＋高級センサで、9状態EKF（v_x, v_y, r, a_x, a_y, 4輪スリップ率）に6センサを融合し、GSS を外した推定でも 310 m 走行で位置ドリフト 1.5 m 未満（0.5 %未満）を実測で示している。
- MATLAB実装経路: Control System Toolbox: extendedKalmanFilter オブジェクト（predict / correct / residual / clone メソッド）、generateJacobianFcn で自動ヤコビアン生成。Simulink は Extended Kalman Filter ブロック。Embedded Coder でコード生成可（HIL/実車へそのまま）。

**[実務標準] アンセンテッドカルマンフィルタ UKF / Square-root UKF**

- 仮定・成立条件: 確率分布をシグマ点集合で近似できる。ヤコビアン不要（微分不可能な項があっても扱える）。強い非線形でも平均・共分散の伝播が EKF より正確（2次まで一致）。
- 破綻条件（次の階層へ進むべき時）: 計算量が状態次元に対して増える（2n+1 個のシグマ点を毎ステップ伝播）。ノイズが非ガウス・多峰性なら依然として破綻する（この場合はパーティクルフィルタ領域）。EKF に対する優位は「非線形性が強いとき」に限られ、そうでない場面では差が出ないため、UKFにしたのに改善しないという結果になりがち。Doumiati らは ECC 2009 で EKF と UKF を横力推定について実験比較しており、無条件にUKFが勝つわけではないことが示されている。 → EKF を実測データで検証し、飽和域で明確に劣化していることを確認してから進むべき。
- 学生フォーミュラでの実行可能性: 知る価値はあるが、FSAEで「EKFで足りないからUKF」と判断できるだけの検証データを持つチームは稀。まずEKFを検証してから。MATLAB上では置き換えがほぼ1行なので、比較実験の教材としては優秀。
- MATLAB実装経路: Control System Toolbox: unscentedKalmanFilter オブジェクト、Simulink は Unscented Kalman Filter ブロック。EKF からの置き換えは関数名の変更のみ（Alpha, Beta, Kappa のシグマ点パラメータ調整が追加）。

**[実務標準（センサが揃えば最も確実）] GNSS/INS 統合（2アンテナRTK-GNSS または光学式対地速度計で対地速度ベクトルを直接計測し、βを幾何的に確定してIMUと融合）**

- 仮定・成立条件: 衛星可視、マルチパスなし、レイテンシ補正済み、GNSSアンテナ位置とIMU位置のレバーアーム補正済み、時刻同期が取れている。光学式（Correvit 型 / Ground Speed Sensor）なら衛星条件に依存しないが、路面からの高さと汚れに敏感。
- 破綻条件（次の階層へ進むべき時）: GNSS は更新レートが低く（5〜20 Hz）、100〜200 ms の遅れを持つ。遅延補正なしに「現在時刻の状態」に対して更新をかけると推定が発振する（AMZ が observation delay compensation を明示的に持っているのはこのため）。建物・木・パドックのテント下で欠落する。RTK は基準局が要る。 → GNSSが欠落する場面が読めているなら、欠落時に自動で低次モデルへ縮退するフォールバック設計（AMZ の ZSMU: 6 m/s 以下でスリップ率をゼロと見なす擬似観測を入れ、IMU＋速度センサ同時故障時でもヨーレートを可観測に保つ）が必要。
- 学生フォーミュラでの実行可能性: 予算次第だが優先度は高い。ここに到達したチームだけが、下位階層の推定器を「検証」できる。つまりこれは推定精度を上げるための投資であると同時に、他の全推定器を評価可能にするための投資でもある。Bevly・Ryu・Gerdes の一連の研究（2003–2006）がこの層の正典で、GPS速度からコーナリングスティフネスまで同時推定できることを示している。
- MATLAB実装経路: Sensor Fusion and Tracking Toolbox: insfilterNonholonomic（非ホロノミック拘束付き、地上車両向け）、insfilterErrorState、insfilterMARG、insfilterAsync、insEKF。Navigation Toolbox。※注意: FSAE無償ライセンスに Sensor Fusion and Tracking Toolbox が含まれるかは本調査では確認できなかった（Control System / MPC / Vehicle Dynamics Blockset / Automated Driving は確認済み）。含まれない場合は Control System Toolbox の extendedKalmanFilter で自作する。

**[研究最前線] 非線形観測器（スライディングモード観測器 SMO・区間観測器 interval observer・移動ホライズン推定 MHE）**

- 仮定・成立条件: SMO: 不確かさの上界が既知で、有限時間収束とパラメータ不確かさへのロバスト性を理論的に保証できる。区間観測器: パラメータの区間（Cf ∈ [Cf_min, Cf_max] 等）が既知で、推定値の上下界を保証する。MHE: 制約付き最適化として過去ホライズンのデータを使い、状態に物理的制約（|β| < 15° 等）を明示的に課せる。
- 破綻条件（次の階層へ進むべき時）: SMO はチャタリングと離散化で劣化し、実装では理論的ロバスト性が崩れる。区間観測器は保証がある代わりに保守的で、区間幅が広すぎて制御に使えないことがある。MHE は毎周期に最適化問題を解くため計算量が大きく、リアルタイム性が最大の課題。いずれも「保証があること」と「実車で数字が良いこと」が一致しない。
- 学生フォーミュラでの実行可能性: 実行できない層に近い。ただし知る価値は高い — 「タイヤパラメータが分からない」というFSAEの本質的問題（TTCデータを持たないチームでは Cf/Cr の不確かさが数十%ある）に正面から答えるのはこの層だけである。学部卒論・修論のテーマとしては適切だが、競技車両への搭載は勧めない。
- MATLAB実装経路: 既製ブロックなし、全て自作。MHE は Optimization Toolbox の fmincon、または MPC Toolbox の非線形ソルバを流用。SMO は Sign / Saturation ブロックで自作。

**[研究最前線（FSAEでは現状使えない）] 学習ベース推定（RNN/LSTM による β 推定、物理情報付きニューラルネット、深層強化学習とUKFの併用）**

- 仮定・成立条件: 学習データが動作領域を十分にカバーしている。訓練分布と実走分布が一致する。
- 破綻条件（次の階層へ進むべき時）: 学習データの分布外（未経験の路面μ、未経験の限界域、雨天）で無警告に間違える — 「間違っていることを教えてくれない」ことが最大の問題で、レース車両の安全要求と根本的に衝突する。検証手段が確立していない。
- 学生フォーミュラでの実行可能性: 実行できない。FSAEチームの年間走行データ量は分布をカバーするには桁違いに足りない。デザインレポートで「やってみた」以上の主張はできないと明記すべき。ただし「なぜ使えないか」を説明できることには価値がある。
- MATLAB実装経路: Deep Learning Toolbox（FSAE無償ライセンスに含まれることを確認済み）。ただし推奨しない。

**[入門（制御の出発点。ここを飛ばしてフィードバックに行くのが最大の失敗）] フィードフォワード／オープンループ制御（アッカーマン舵角、スロットルマップ、固定バイアスバーによるブレーキバランス）**

- 仮定・成立条件: 外乱がない、モデル（マップ）が正しい、走行の繰り返し性がある。
- 破綻条件（次の階層へ進むべき時）: 路面μ変化、タイヤ温度変化、風、燃料減少による質量変化で崩れる。誤差を検出する手段がない。
- 学生フォーミュラでの実行可能性: 使える。実際、多くのFSAE車がこの層にいる。それは悪いことではない。フィードバックを足す前にFFをきちんと作るのが正しい順序で、FFが悪いままフィードバックゲインを上げるとアクチュエータが飽和して破綻する。
- MATLAB実装経路: Simulink の 1-D / 2-D Lookup Table ブロック。Embedded Coder でECUへ。追加Toolbox不要。

**[入門] PID制御（スリップ率制御、ヨーレート追従の最初の実装）**

- 仮定・成立条件: SISO（1入力1出力）、動作点まわりで動特性がほぼ線形、むだ時間が小さい、アクチュエータが飽和しない。
- 破綻条件（次の階層へ進むべき時）: (a) MIMO干渉を扱えない — 舵角もブレーキも駆動トルクも全部ヨーに効くのに、PIDは1対1しか見ない。(b) 制約（タイヤの摩擦円）を知らないので、物理的に不可能な指令を出し続ける。(c) 動作点（車速）が変わるとゲインが不適切になる。(d) アクチュエータ飽和で積分ワインドアップを起こす。(e) むだ時間が大きいと位相余裕を食い潰す。 → 車速で挙動が変わると分かったらゲインスケジューリングへ。干渉と制約が問題なら状態フィードバック/MPCへ。どちらが効いているかを切り分けること。
- 学生フォーミュラでの実行可能性: 使える。トラクションコントロールのスリップ率制御の最初の実装は必ずPI。anti-windup は必須（オプションではない）。FSAE向けの実装例として SAE 2007-32-0119（Formula SAE車向け自作ECUによるトラクションコントロール開発）が実在する。
- MATLAB実装経路: Simulink の PID Controller ブロック（anti-windup 内蔵、Clamping / Back-calculation を選択）、PID Tuner アプリで自動整定。Control System Toolbox。

**[実用] ゲインスケジューリング（車速 v_x でゲインをスケジュール）**

- 仮定・成立条件: スケジューリング変数（v_x）が制御帯域に対して十分ゆっくり変化する。各設計点で線形化した設計が、その近傍で有効。
- 破綻条件（次の階層へ進むべき時）: スケジューリング変数が速く変化すると（急加速・急制動・スピン）安定性の保証が消える。さらに重要な落とし穴として、各動作点で安定なコントローラを補間しても、補間された系の安定性は保証されない（古典的な既知の罠）。設計点の間で不安定になりうる。 → 遷移が速い、または設計点数が増えすぎたら、線形時変MPC や LPV設計へ。
- 学生フォーミュラでの実行可能性: 使える。FSAEの速度域（20〜100 km/h 程度）でも横方向動特性は明確に変わる（スタビリティファクタと車速の積で定常ヨーレートゲインが決まる、ヨー固有振動数が車速依存）ので、実利がある。第I部の定常円旋回・過渡応答の議論が直接つながる。
- MATLAB実装経路: Control System Toolbox: tunableSurface でゲイン面をパラメータ化 → systune で全設計点を同時に満たすように一括チューニング → slTuner で Simulink モデルに紐付け → viewSurf / evalSurf で確認 → ルックアップテーブル化してコード生成。基底関数は polyBasis / fourierBasis / ndBasis。Simulink Control Design。

**[実務標準] 状態フィードバック / LQR（および LQI、オブザーバと組んだ LQG）**

- 仮定・成立条件: 状態が全部測れる（測れないならオブザーバと組む＝LQG。ここで推定階層と必然的に結合する）。線形モデルが有効な範囲で動く。制約に当たらない。重み行列 Q, R が設計意図を正しく表している。
- 破綻条件（次の階層へ進むべき時）: 制約（摩擦円・舵角リミット・トルクリミット）を一切扱えない。限界走行とは定義上「常に制約上にいる」状態なので、限界域ではLQRは最適ではない — これが LQR → MPC へ進む本質的な理由であり、この教科書が最も強調すべき点。また LQG では、分離定理によりゲインとオブザーバを別々に設計できる代わりに、LQR が持っていたロバスト性の保証（位相余裕60°・ゲイン余裕無限大）が失われる（Doyle の有名な結果）。「LQRは頑健」と覚えて LQG に持ち込むのは誤り。
- 学生フォーミュラでの実行可能性: 使える。ヨーレート追従とβ抑制を同時に扱う設計として、教育的にも実務的にも価値が高い。ただし状態に β が含まれるため、推定階層（相補フィルタ以上）が前提になる。本書が推定と制御を同じ部で扱う理由がここにある — 制御は推定より良くならない。
- MATLAB実装経路: Control System Toolbox: lqr / dlqr（連続・離散）、lqi（積分器付き）、kalman、lqg、care/dare。重みは Bryson則（各状態・入力の許容最大値の2乗の逆数）から始める。Simulink は Gain + State-Space。

**[実務標準] ヨーモーメント制御（ESC構造）: 参照ヨーレート生成 → 誤差 → ヨーモーメント指令 → アクチュエータ配分**

- 仮定・成立条件: 参照ヨーレートが妥当に生成されている（線形2輪モデルの定常ヨーレートを路面μで上限クリップする）。β が推定できている。左右で独立にヨーモーメントを作れるアクチュエータがある。van Zanten の Bosch VDC/ESP（SAE 950759, 2000-01-1633）が正典で、Rajamani 第8章が教科書的解説。
- 破綻条件（次の階層へ進むべき時）: 参照ヨーレートを摩擦上限（概ね r_max ≈ μg/v_x）でクリップしないと、低μ路で物理的に不可能な目標を出し、制御が飽和して逆に不安定化する — 実装で最も多い事故。β の推定誤差はそのまま介入誤差になるので、推定が悪ければ ESC は害になる。アクチュエータ配分（どの輪をどれだけ制動するか）は非自明な最適化問題。
- 学生フォーミュラでの実行可能性: 条件付き。ICE の FSAE 車では実行手段が限られる。左右独立ブレーキ（個別に圧力を作れる油圧ユニット）が無ければブレーキベースのヨー制御は不可能。電動4輪独立駆動を前提とする トルクベクタリング文献（De Novellis, Sorniotti らの一連の研究）は本書の対象（内燃機関）にそのままは適用できない — この点は明記すべき。ICE FSAE の現実解は LSD のランプ角・プリロード設定によるパッシブなヨーモーメント配分（第II部エンジン②の駆動系と接続）。
- MATLAB実装経路: 自作。プラント側は Vehicle Dynamics Blockset の Vehicle Body 3DOF（Dual Track 構成で左右の荷重移動を含む）で組める。制御則は Simulink 基本ブロックで自作。

**[実務標準] スリップ率制御（トラクションコントロール TC / ABS）**

- 仮定・成立条件: 基準車体速度 v が既知（＝推定階層に完全に依存する）。μ-λ 曲線のピーク位置が既知、または探索する。アクチュエータ帯域が制御帯域に対して十分。Savaresi & Tanelli の Active Braking Control Systems Design for Vehicles（Springer 2010）がABS側の正典。
- 破綻条件（次の階層へ進むべき時）: μ-λ 曲線のピーク λ は路面・タイヤ温度・荷重で動くので、固定目標 λ では最適にならない。さらに重要なのは、ピークの右側（λ が大きい側）は ∂μ/∂λ < 0 の不安定領域であり、制御が遅い／推定が悪いと発散的にホイールスピン（またはロック）する。ICE ではスロットル応答が遅く（吸気系の輸送遅れ）、点火リタード・燃料カットの方が桁違いに速い — アクチュエータ選定が制御性能を決める。
- 学生フォーミュラでの実行可能性: 使える。FSAE特有の実装事例（SAE 2007-32-0119、Formula SAE車向け自作ECU）とF1の古典（SAE 942475）の両方が実在する。ただし「λ を作るには車体速度の推定が要る」ので、TC は状態推定と分離できない — 非駆動輪があっても加速中は微小スリップするため、輪速だけでは基準速度にならない。推定精度がそのままTCの性能上限になる。
- MATLAB実装経路: PI + anti-windup（PID Controller ブロック）+ 点火リタード/燃料カットの離散出力。Stateflow で介入ロジックの状態遷移を書くと見通しが良い。Embedded Coder で自作ECUへ。

**[実用〜研究（FSAEでは費用対効果が微妙）] スライディングモード制御 SMC（および高次SMC / super-twisting、積分SMC）**

- 仮定・成立条件: 不確かさの上界が既知、切替が十分速い、相対次数が既知。マッチング条件を満たす不確かさに対して理論的に不変性（invariance）を持つ。Shtessel, Edwards, Fridman, Levant の Sliding Mode Control and Observation（2014）が標準教科書。
- 破綻条件（次の階層へ進むべき時）: チャタリング。不連続な sign() は実機のアクチュエータを傷め、離散化周期（FSAEのECUは典型的に1〜10 ms）で切替が粗くなって実効的に振動する。境界層 sat() で緩和すると、緩和した分だけ理論的ロバスト性が落ちる（保証していたはずのものが消える）。高次SMC（super-twisting）で改善できるが、ゲイン調整が難しくなる。「理論的にロバスト」が実装で崩れる最も典型的な例として、教科書の「限界と適用範囲」節に最適な素材。
- 学生フォーミュラでの実行可能性: 条件付きで使える。トルクベクタリングへの積分SMC適用例（Goggia, Sorniotti, De Novellis, Ferrara, ACC 2014）が実在する。ただしFSAEでは実装・検証コストに見合わないことが多く、「知る価値はあるが、PIDとMPCの間にわざわざ入れる理由が薄い」というのが正直な評価。
- MATLAB実装経路: 既製ブロックなし、全て自作（Sign / Saturation / Switch ブロック）。離散化の影響を見るために固定ステップソルバで必ず確認すること。

**[研究最前線（ただしドライバレスでは事実上の実務標準）] モデル予測制御 MPC（線形MPC → 線形時変/適応MPC → 非線形MPC → MPCC: Model Predictive Contouring Control）**

- 仮定・成立条件: 予測モデルが予測ホライズン全体にわたって十分正確。制約が正しく定式化されている。ソルバが最悪ケースで制御周期内に解ける。状態が推定できている。Falcone ら（IEEE TCST 2007）が車両操舵MPCの、Borrelli ら（IEEE TCST 2006）がトラクション制御MPCの、Liniger ら（OCAM 2015）がレーシングMPCCの原典。
- 破綻条件（次の階層へ進むべき時）: (a) モデル誤差が予測ホライズン全体で積算するため、MPCは「自信を持って間違える」— 間違ったモデルに基づく最適解は、PIDの誤差より質が悪い。(b) 実行不可能（infeasible）になったときのフォールバックを設計しないと、実車で制御が無反応になる → トラック制約はスラック変数で軟化するのが必須（AMZ も track constraints を slack で軟化している）。(c) 計算時間の平均ではなく最悪ケースが制御周期を超えたら破綻する。(d) 動力学自転車モデルは低速で特異（α = atan(v_y/v_x) が v_x → 0 で定義不能）— AMZ は v_x ∈ [3, 5] m/s の範囲でキネマティックモデルとダイナミックモデルを線形ブレンド（λ で重み付け）して回避している。
- 学生フォーミュラでの実行可能性: FS Driverless では事実上の標準。AMZ Driverless の実装は具体的で参考になる: ソルバ ForcesPro NLP、サンプリング時間 50 ms、予測ホライズン N = 40（＝2秒先読み）、タイヤ摩擦楕円を制約として陽に記述、β_dyn と β_kin の差にコストを掛けて挙動の攻撃性を調整。有人FSAEでは制御対象（ドライバがすでに閉ループを構成している）が限られるため使いどころが少ない。商用ソルバのライセンスも障壁。
- MATLAB実装経路: Model Predictive Control Toolbox: 線形は mpc / mpcmove、非線形は nlmpc / nlmpcmove / Nonlinear MPC Controller ブロック。validateFcns で予測モデルの整合性を事前検証（必須）。convertToMPC で線形MPCに落として高速化。実装は nlmpcmoveCodeGeneration + Embedded Coder。Optimization Toolbox（fmincon）が下支え。FSAE無償ライセンスに MPC Toolbox と Optimization Toolbox が含まれることは確認済み。

**[研究最前線（FSAEでは実行不可）] 学習ベース制御（Learning MPC / LMPC、強化学習、残差方策学習、学習によるモデル補正）**

- 仮定・成立条件: シミュレータと実車のギャップが小さい、または大量の実走データがある。訓練分布が実走分布をカバーする。
- 破綻条件（次の階層へ進むべき時）: 分布外での性能保証がない。サンプル効率が悪く、必要な走行量がFSAEの現実と桁違い。シミュレータと実車のギャップ（sim-to-real）が最大の障害。安全性の形式的保証と両立しにくい。Betz らのサーベイ（IEEE OJ-ITS 2022）がこの分野の現状と未解決課題を整理している。
- 学生フォーミュラでの実行可能性: 実行できない。ただし「なぜ実行できないか」— データ量、検証不能性、安全要求との衝突 — を説明できることには価値がある。第VI部の検証の議論と接続させると良い。
- MATLAB実装経路: Reinforcement Learning Toolbox（FSAE無償ライセンスへの含有は未確認）。推奨しない。

### 実務でよく起きる誤り

- 【推定】運動学的積分のドリフトを甘く見る。IMUのバイアスと初期値誤差は速度誤差として時間に比例、位置誤差として時間の2乗で増大する。FSAEが使う安価なMEMS IMUではバイアス不安定性が支配的で、β推定は数秒〜十数秒で使い物にならなくなる。「1周分は持つだろう」は成り立たない。
- 【推定】横加速度計が重力を分離できないことを忘れる。バンク角/ロール角 φ があると a_y,計測 = a_y,真 + g·sinφ になる。ロール剛性の高いFSAE車でもロール角1〜2°で 0.17〜0.34 m/s² の誤差が乗り、これは β の恒常的なオフセットに直結する。ロール角を推定するか、無視できる根拠を数字で示すか、どちらかを必ずやること。
- 【推定】線形モデルベース観測器で、同定したコーナリングスティフネス Cf/Cr を定数として使い続ける。Cf/Cr は接地荷重・タイヤ温度・内圧で容易に ±30 % 変わる。TTC（Tire Test Consortium）データを持たないチームでは初期値の不確かさがさらに大きい。定数扱いは「たまたま合っている領域でしか合わない」推定器を作ることになる。
- 【推定】定常円旋回で β を推定しようとする。入力が一定だと拡大系の可観測性が失われ、β の誤差と Cf の誤差が原理的に区別できない（持続的励振の不足）。ヨーレート出力だけの線形2輪モデルでは、Cf/Cr が既知でない限り β は推定できない。これは推定器の出来の問題ではなく、情報が存在しないという問題。Bevly・Gerdes 系の研究が独立した速度計測に向かった動機がここにある。
- 【推定】「EKFにすれば非線形が扱える」という誤解。EKFは1次テイラー展開にすぎない。Magic Formula の飽和域では ∂F_y/∂α ≈ 0 になり、ヤコビアンが劣化して観測更新がほとんど効かなくなる。つまり限界域こそ β の推定が必要なのに、限界域で最も精度が落ちる。この非対称性を教科書は明記すべき。
- 【推定】プロセスノイズ共分散 Q を「とりあえず大きくして安定させる」チューニングパラメータとして扱う。Q を大きくすることはモデルを信じないことであり、極端に振ると実質的にセンサの生積分（＝最下層の運動学的積分）に戻る。「EKFを組んだのに挙動が積分と同じ」という失敗は極めて多い。Q と R には物理的な根拠（センサのデータシートのノイズ密度、モデル誤差の実測分散）を持たせること。
- 【推定】低速で動力学モデルが特異になることを設計に織り込まない。スリップ角 α = atan(v_y/v_x) は v_x → 0 で定義不能。FSAEはオートクロスの低速コーナーとスタートで必ずこの領域に入る。AMZ Driverless は v_x ∈ [3, 5] m/s でキネマティックモデルとダイナミックモデルを線形ブレンドしている。単に「低速では推定を止める」と、止めた瞬間に状態が飛ぶ。
- 【推定】輪速を車体速度の代用にする。駆動輪は加速中に必ずスリップしており（AMZ は高加速時に最大30%、強制動時はさらに大きいと報告）、非駆動輪も制動時にはロックしうる。FSAEでは4輪とも影響を受ける場面がある。輪速だけで作った基準速度は、トラクションコントロールのスリップ率の分母として使った瞬間に制御全体を汚染する。
- 【推定・制御共通】座標系の取り違え。ISO 8855（x前方・y左・z上）と SAE J670e（y右・z下）で y と z の符号が逆になる。IMUの取付軸、CANの符号定義、Simulinkモデル内部の符号が混在し、βやヨーレートの符号が反転する事故が頻発する。FS Driverless Specification は ISO 8855 を明示的に採用しているので、DVをやるチームはこれに合わせるのが正しい。符号は「図に描いて」確認すること、式だけで確認しないこと。
- 【推定】センサのタイムスタンプとレイテンシを無視する。GNSSは典型的に100〜200 ms遅れる。遅れた計測を「現在時刻の状態」に対して更新すると、推定器は発振する。AMZ Driverless が observation delay compensation を明示的なモジュールとして持っているのはこのため。マルチレート・非同期の計測を扱うなら、遅延補正は追加機能ではなく必須要件。
- 【推定】検証用の真値がないまま上位階層に進む。RTK-GNSSや光学式対地速度計がなければ、推定器が合っているかは永遠に分からない。「推定器を作った」ことと「推定器が正しい」ことは別。FSAEでセンサ予算を配分するとき、推定精度を上げるセンサより先に、検証を可能にするセンサを買うべき場面が多い。
- 【推定】論文が前提としているセンサ構成を確認せずに実装する。学術論文の大半は量産ESC搭載車（ヨーレートセンサ・4輪ABS輪速・舵角センサが標準装備、車両パラメータも既知）を前提にしている。FSAE車は輪速すら付いていないことがある。「論文どおりに作ったのに動かない」の大半はここ。
- 【制御】PIDのゲインを1つの車速で合わせて全速度域に使う。車両の横方向動特性は車速の関数で、定常ヨーレートゲインはスタビリティファクタと車速で決まり、ヨー固有振動数も車速依存。40 km/h で整定したゲインが 80 km/h で不安定になることは普通に起きる。第I部の定常円旋回・過渡応答の結果が、そのままこの警告の根拠になる。
- 【制御】アクチュエータ飽和と積分ワインドアップを設計に入れない。摩擦円の限界、舵角リミット、スロットル全開はすべて飽和。飽和中に積分器が積み上がると、飽和から抜けた瞬間に大きく行き過ぎる。anti-windup はオプションではなく必須。
- 【制御】LQRの重み行列 Q, R を物理的根拠なしに決める。Bryson則（各状態・各入力の許容最大値の2乗の逆数を対角に置く）から始めるのが最低限の作法。「なんとなく大きくした/小さくした」で得たゲインは、設計意図を後から説明できない。
- 【制御】LQRのロバスト性がLQGでも保たれると誤解する。LQRの位相余裕60°・ゲイン余裕無限大という性質は、状態が全部測れる場合の話。カルマンフィルタと組んだLQGではこの保証は失われる（Doyleの有名な結果）。本書は推定と制御を同じ部で扱うので、この接合部の落とし穴を必ず書くこと。
- 【制御】LQRで限界走行を設計しようとする。LQRは制約を扱えない。しかし限界走行とは定義上「タイヤの摩擦円という制約の上にいる」状態である。したがって限界域ではLQRは最適ではない。これがLQR→MPCへ進む本質的な理由であり、逆に言えば限界に当たらない領域ではMPCの利点はほとんど出ない。
- 【制御】スライディングモードの理論的ロバスト性が実装で残ると信じる。不連続な sign() は実機アクチュエータを傷め、離散化周期（FSAEのECUは典型的に1〜10 ms）で切替が粗くなって実効的に振動する（チャタリング）。境界層 sat() で緩和すると、緩和した分だけ保証していたロバスト性が消える。「理論上ロバスト」と「実装してロバスト」の差の教科書的な実例。
- 【制御】MPCは最適だから安心、という誤解。モデルが間違っていればMPCは自信を持って間違える。しかも予測ホライズン全体でモデル誤差が積算するので、同じモデル誤差でもPIDより結果が悪くなりうる。MPCの前提は「良いモデル」であり、モデルが良くないならMPCに進む段階ではない。
- 【制御】MPCが実行不可能（infeasible）になったときのフォールバックを設計しない。ソルバが解を返せないと実車で制御が無反応になる。トラック制約・状態制約はスラック変数で軟化するのが定石（AMZ Driverless もトラック制約をスラックで軟化して常時実行可能性を保証している）。ハード制約だけで組むのは実車では危険。
- 【制御】MPCの計算時間を平均値で評価する。評価すべきは最悪ケース。平均10 msでも最悪80 msなら50 ms周期は破綻する。第40章（離散化とリアルタイム）と第44章（HIL）で、最悪実行時間の計測を必ず要求すること。
- 【制御】制御周期を速くすればレイテンシ問題が解決すると思う。支配的なのはセンサ→推定→制御→アクチュエータの総遅れであり、制御周期はその一部にすぎない。AMZ Driverless はコーン検出から制御指令到達まで約300 msの遅延があり、これが原因で最高速とホイールトルクを制限せざるを得ず、人間ドライバの性能に届かないと明記している。世界トップの学生チームですらこれが最大のボトルネック。
- 【制御】トラクションコントロールを状態推定と切り離して設計する。スリップ率 λ の分母は車体速度であり、その推定精度がそのままTCの性能上限になる。TCと推定は同じ問題の表と裏。第38章は第35章に依存すると明示すべき。
- 【制御】μ-λ曲線のピーク右側が不安定領域であることを軽視する。∂μ/∂λ < 0 の領域では、スリップが増えるほど摩擦が減って更にスリップが増える。制御が遅い、または基準速度の推定が悪いと、発散的にホイールスピン（またはロック）する。固定の目標λは、路面・タイヤ温度でピークが動くので最適にならない。
- 【制御】ESCの参照ヨーレートを摩擦上限でクリップしない。線形2輪モデルの定常ヨーレートをそのまま目標にすると、低μ路で物理的に不可能な目標を出し、制御が飽和して逆に不安定化する。概ね r_max ≈ μg/v_x でのクリップが必要。実装で最も多い事故のひとつ。
- 【制御】電動車前提の文献をそのまま内燃機関FSAEに適用する。トルクベクタリングの論文の多くは4輪独立電動駆動を前提にしている。ICE の FSAE で実行可能なのは、(1) スロットル／点火リタード／燃料カットによるトラクションコントロール、(2) LSDのランプ角・プリロードによるパッシブなヨーモーメント配分、(3) 左右独立に圧力を作れる油圧系があればブレーキベースのヨー制御、に限られる。文献の適用限界を明記せずに引用すると、実現不可能な設計を書くことになる。
- 【制御】有人FSAE車にESC/トルクベクタリングを載せる意味を取り違える。ドライバはすでに閉ループを構成している。介入は「ドライバが違和感を持たない」範囲でしか使えず、ラップタイムへの寄与は自明でない。DIL（第44-46章）と実車テスト（第47-48章）による評価が必須で、シミュレーションだけで効果を主張してはいけない。
- 【共通】FSAEチームの走行時間の少なさを設計に織り込まない。実走テストは絶対的に足りない。AMZ Driverless の「教訓」節も、自動テストシステム（ATS）でシミュレーション上で多数の試行を回してパラメータを詰め、テスト現場では微調整だけにする、という運用が成功要因だったと述べている。推定器・制御器のパラメータを実車で初めて触るのは失敗パターン。

### 学生フォーミュラ固有の事情

【センサ予算の階層 — この教科書で最も実務的な判断軸】
学術論文の大半は量産ESC搭載車（ヨーレートセンサ・4輪ABS輪速・舵角センサが標準装備、車両パラメータも既知）を前提にしている。FSAE車はこれを自分で全部載せる。現実的な予算階層は概ね次の3段で、推定の到達可能な階層がそのまま決まる。
(a) 最小構成（車載MEMS 6軸IMU + 舵角ポテンショメータ）→ 運動学的積分のみ。ドリフトを見て終わる。ただし第I部のモデルと突き合わせる価値はある。
(b) 中位構成（4輪ホール輪速 + IMU + 単独GNSS）→ 相補フィルタ、EKFが成立する。FSAEで最も費用対効果が良い到達点。
(c) 上位構成（2アンテナRTK-GNSS または光学式対地速度計 Correvit/GSS）→ βの真値が得られ、初めて下位階層の推定器を「検証」できる。AMZ Driverless が9状態EKFを定量評価できたのは光学式GSSを持っていたから。
重要な含意: 推定精度を上げるセンサより先に、検証を可能にするセンサを買うべき場面が多い。「推定器を作った」と「推定器が正しい」は別問題であり、後者を示せないチームのデザインレポートは審査で弱い。

【低速域と小径タイヤ】
FSAEオートクロス／エンデュランスの平均速度は概ね40〜50 km/h、最低速コーナーは20 km/h台。v_x が小さいため α = atan(v_y/v_x) が敏感になり、動力学モデルの特異領域に頻繁に入る。AMZ Driverless が v_x ∈ [3, 5] m/s でキネマティックモデルとダイナミックモデルをブレンドしているのは、この事情の直接の反映であり、乗用車向け文献にはほとんど出てこないFSAE固有の設計事項。教科書の第35章・第39章の両方でこの区間を明示的に扱うべき。

【軽量・低ダウンフォース・高ヨー固有振動数】
車両質量は概ね200〜250 kg（ドライバ込みでも300 kg台）でヨー慣性が小さく、ヨー運動の固有振動数が乗用車より高い。したがって制御周期とセンサ帯域の要求は乗用車より厳しくなる。第40章で離散化周期を決めるとき、乗用車の感覚（10 ms）をそのまま持ち込むと足りない可能性がある。第I部で求めたヨー固有振動数から、ナイキストではなく実務的な10〜20倍のマージンで周期を決める、という筋道を示すのが良い。空力ダウンフォースが小さいので、高速域での接地荷重増加によるコーナリングスティフネス変化は乗用車ほどではないが、荷重移動の影響は軽量ゆえ相対的に大きい。

【パワーユニットが内燃機関であることの帰結】
本書はEVを対象外としているため、トルクベクタリング文献（De Novellis, Sorniotti ら）の大半は前提が合わない。ICE FSAEで実行可能なヨー／トラクション制御は次に限られる:
(1) スロットル／点火リタード／燃料カットによるトラクションコントロール（点火リタードと燃料カットはスロットルより桁違いに応答が速く、Savaresi & Tanelli の「離散ダイナミクスのアクチュエータ」の議論が直接効く）。FSAE向けの実装事例が SAE 2007-32-0119 として実在する。
(2) LSDのランプ角・プリロードによるパッシブなヨーモーメント配分（第II部エンジン②の駆動系と接続）。
(3) 左右独立に圧力を作れる油圧系があればブレーキベースのヨー制御（FSAEでは実装例が少なく、ハードウェアの追加が前提）。
教科書はこの適用限界を明記したうえで電動TV文献を引用すべきで、そうしないと実現不可能な設計を学生に書かせることになる。

【FS Driverless の要求 — 公式仕様書から直接確認した事実】
Formula Student Driverless Specification 2026 v1.1（2026-05-16発行）より:
・座標系は ISO 8855（z上）と明記され、自転車モデルの図で舵角δの正方向が定義されている。本書の座標系方針（ISO 8855採用、SAE J670eとの差異を明示）が公式規則と完全に一致することの裏付けになる。第1章で引用する価値がある。
・トラックは青コーン=左境界、黄コーン=右境界、オレンジ=出入口、大オレンジ=スタート／フィニッシュ／計時線の前後。進行方向のコーン間隔は最大5 m（コーナーではより密）。
・主催者は地図データを提供せず、人工ランドマークの設置も禁止。つまりSLAMが必須。加えて「予備コーンが路側に積んである」「計時機器がコーンと誤認されうる」「他の競技の白線が残っている」といった外乱が規則上明記されている。
・データロガーへ CAN-ID 0x500（速度・舵角・ブレーキ・モータトルクの実値と目標値）、0x501（前後加速度・横加速度・ヨーレート、スケールは加速度 1/512 m/s²、ヨーレート 1/128 °/s）、0x502（AS状態・EBS状態・AMI状態・ラップ数・検出コーン数）を各100 ms周期で提供する義務がある。
・重要: 0x500 と 0x502 は必ず埋めなければならないが、0x501 は「利用可能なセンサデータに依存する」とされている。つまり規則上はIMU非搭載でも成立する。これは裏を返せば「状態推定をやるならIMUはチームの設計判断として必須」という議論を教科書で展開できる、良い教材である。

【MATLAB/Simulink 入手性の確認結果】
MathWorks の学生競技会プログラムで無償提供されることを公式ページで確認した製品のうち、本領域に関係するもの: MATLAB, Simulink, Control System Toolbox, Model Predictive Control Toolbox, Optimization Toolbox, Vehicle Dynamics Blockset, Powertrain Blockset, Automated Driving Toolbox, Simscape 各種, Embedded Coder, MATLAB Coder, Deep Learning Toolbox, Computer Vision Toolbox, Lidar Toolbox。申請はチームリーダーまたは指導教員が Student Competition Software Request Form から行う。
つまり本調査で示した実装経路のうち、EKF/UKF（Control System Toolbox の extendedKalmanFilter / unscentedKalmanFilter とSimulinkブロック）、ゲインスケジューリング（tunableSurface + systune + slTuner）、LQR（lqr/dlqr/lqi）、MPC（nlmpc + Nonlinear MPC Controller ブロック）、プラントモデル（Vehicle Body 3DOF）は、いずれもFSAEチームが無償で実行できる。
※ただし Sensor Fusion and Tracking Toolbox（insfilterNonholonomic 等）が無償提供リストに含まれるかは確認できなかった。含まれない場合、GNSS/INS統合は Control System Toolbox の extendedKalmanFilter で自作する経路になる。教科書はこの自作経路も示しておくべき。

【調査上の未確認事項 — 執筆時に再確認すべき点】
1. Milliken & Milliken "Race Car Vehicle Dynamics"（SAE International, 1995）は、出版社の書誌ページを直接開いて確認できていない。AMZ Driverless 論文の参考文献リストに記載されているのを確認した二次的裏付けにとどまる。ISBN・ページ数を書く場合は一次確認が必要。邦訳の書誌情報も未確認。
2. Guiggiani "The Science of Vehicle Dynamics" は章DOIを2つ（2014年版 10.1007/978-94-017-8533-4_3、2022年版 10.1007/978-3-031-06461-6_3）確認したが、それぞれの正確な版数表記（第2版/第3版）は未確認。
3. Sensor Fusion and Tracking Toolbox のFSAE無償ライセンス含有可否（上記）。
4. Rajamani 第2版の第15章の章題は未取得（第8章 Electronic Stability Control pp.201-240、第14章 Tire-Road Friction Measurement on Highway Vehicles pp.397-425 は確認済み）。
5. Chindamo らのレビュー（Applied Sciences 2018）と Pušćul らのサーベイ（IEEE Access 2024）は、書誌情報と要旨は確認したが、本文の詳細な手法分類表までは取得できていない（MDPI・IEEE Xploreが自動取得を拒否）。本文の具体的主張を引用する際は原文にあたること。
6. AMZ Driverless の遅延図（Figure 32）には 200 ms / 350 ms / 500 ms という数値と Velocity Estimation / LiDAR Pipeline / Vision Pipeline というラベルが並ぶが、PDFからのテキスト抽出では数値とパイプラインの対応が一意に確定できなかった。本文が明記している「コーン検出から制御指令到達まで約300 ms」という数値のみを引用するのが安全。

### 参照文献

- **Rajesh Rajamani, "Vehicle Dynamics and Control", 2nd edition, Springer (Mechanical Engineering Series), 2011. Print ISBN 978-1-4614-1432-2**
  - 種別: 書籍 / 入手性: 有料（大学経由でSpringerLinkからアクセス可能な場合が多い）
  - https://doi.org/10.1007/978-1-4614-1433-9
  - 用途: 第V部全体の背骨。CrossRefで章立てを確認済み: 第2章 Lateral Vehicle Dynamics (pp.15-46) は第3章の線形2輪モデルに、第8章 Electronic Stability Control (pp.201-240) は第38-39章のヨー安定性制御に、第13章 Lateral and Longitudinal Tire Forces (pp.355-396) は第II部タイヤ編に、第14章 Tire-Road Friction Measurement on Highway Vehicles (pp.397-425) は路面μ推定に対応する。英語で数学を妥協していない点が本書の方針と一致。
- **Uwe Kiencke, Lars Nielsen, "Automotive Control Systems: For Engine, Driveline, and Vehicle", 2nd edition, Springer Berlin Heidelberg, 2005. Print ISBN 978-3-540-23139-4 / eBook ISBN 978-3-540-26484-2** ✓実在確認（訂正: 訂正不要。著者2名・出版社 Springer Berlin Heidelberg・年2005・ISBN 9783540231394／9783540264842 すべて一致）
  - 種別: 書籍 / 入手性: 有料（大学経由でSpringerLink）
  - https://doi.org/10.1007/b137654
  - 用途: 推定と制御を「量産車の実務」の視点で扱う数少ない教科書。CrossRefで章立て確認済み: 第8章 Vehicle Modelling (pp.301-349)、第9章 Vehicle Parameters and States (pp.351-408) が状態・パラメータ推定の中核で第35章（EKFによる車体すべり角推定）と第24-25章（パラメータ同定）に、第10章 Vehicle Control Systems (pp.409-424) が第34-39章に、第7章 Driveline Control (pp.193-299) が第II部エンジン②の駆動系に対応。
- **A. Galip Ulsoy, Huei Peng, Melih Çakmakcı, "Automotive Control Systems", Cambridge University Press, 2012. ISBN 978-1-107-01011-6** ✓実在確認（訂正: 訂正不要。著者3名・出版社・年2012・ISBN 9781107010116 一致（他に eBook 9780511844577、ペーパーバック 9781107686045 あり））
  - 種別: 書籍 / 入手性: 有料（大学経由でCambridge Core）
  - https://doi.org/10.1017/CBO9780511844577
  - 用途: Rajamani・Kiencke と並ぶ第3の柱。制御理論の道具立て（状態フィードバック、オブザーバ、最適制御）を自動車応用に落とす流れが整理されており、第34章（センサと可観測性）・第37章（状態フィードバックとLQR）の構成を組む際の参照枠として使う。
- **Dan Simon, "Optimal State Estimation: Kalman, H∞, and Nonlinear Approaches", John Wiley & Sons, 2006. ISBN 978-0-471-70858-2** ✓実在確認（訂正: 訂正不要。著者・出版社 Wiley・年2006・ISBN 9780471708582 一致（eBook 9780470045343））
  - 種別: 書籍 / 入手性: 有料（大学経由でWiley Online Library）
  - https://doi.org/10.1002/0470045345
  - 用途: 推定側の数学的正典。第13章 Nonlinear Kalman filtering、第14章 The unscented Kalman filter（pp.433-459）、第7章 Kalman filter generalizations の章構成をCrossRefで確認済み。第35章でEKFを導出する際、「なぜ1次線形化で良いのか／いつ悪いのか」を数学的に妥協せず示すための出典。
- **Moustapha Doumiati, Ali Charara, Alessandro Victorino, Daniel Lechner, "Vehicle Dynamics Estimation using Kalman Filtering: Experimental Validation", ISTE Ltd / John Wiley & Sons, 2012. ISBN 978-1-84821-366-1** ✓実在確認（訂正: 訂正不要。Crossref は編著扱いで著者欄が空だったため Open Library（ISBN 9781848213661）で著者4名 Doumiati / Charara / Victorino / Lechner を確認。副題 "Experimental Validation"・出版社 Wiley（ISTE）・年2012・262頁・LCCN 2012949422 も一致）
  - 種別: 書籍 / 入手性: 有料（大学経由でWiley Online Library）
  - https://doi.org/10.1002/9781118578988
  - 用途: 本テーマに完全に特化した唯一の単行本。章構成をCrossRefで確認済み: 第1章 Modeling of Tire and Vehicle Dynamics、第2章 Estimation Methods Based on Kalman Filtering、第3章 Estimation of the Vertical Tire Forces、第4章 Estimation of the Lateral Tire Forces (pp.101-158)。副題どおり実験検証まで含むのが本書の「実務水準」の方針と合致。AMZ Driverless もタイヤ剛性の扱いでこの本を引用している。
- **Daniel Chindamo, Basilio Lenzo, Marco Gadola, "On the Vehicle Sideslip Angle Estimation: A Literature Review of Methods, Models, and Innovations", Applied Sciences, Vol.8, No.3, Article 355, 2018** ✓実在確認（訂正: 訂正不要。著者3名・巻8・号3・論文番号355・年2018すべて一致）
  - 種別: 論文 / 入手性: オープンアクセス（MDPI）
  - https://doi.org/10.3390/app8030355
  - 用途: 車体すべり角推定の手法分類（オブザーバベース／ニューラルネットベース）を俯瞰する総説。第35章の冒頭で「どんな選択肢があるか」を読者に地図として与えるのに使う。著者の Gadola はブレシア大学でFormula SAE に関与しており、レース寄りの視点がある。オープンアクセスなので学生が確実に読める点が重要。
- **Dženana Pušćul, Cornelia Lex, Michele Vignati, Liang Shao, "A Literature Survey on Sideslip Angle Estimation Using Vehicle Dynamics Based Methods", IEEE Access, Vol.12, pp.70263-70277, 2024** ✓実在確認（訂正: 訂正不要。著者4名・巻12・頁70263-70277・年2024すべて一致（Crossrefの綴りは Puscul, Dzenana。発音区別符号付きの Pušćul が正式表記））
  - 種別: 論文 / 入手性: オープンアクセス（IEEE Access）
  - https://doi.org/10.1109/ACCESS.2024.3402429
  - 用途: Chindamo らより新しく、動力学ベース手法（カルマン系、逐次最小二乗 RLS、スライディングモード観測器 SMO、非線形オブザーバ NLO、カスケード構成）を横並びで比較する。第35章の「階層の全体像」と、各手法の限界を対比する節の一次ソース。
- **David M. Bevly, Jihan Ryu, J. Christian Gerdes, "Integrating INS Sensors With GPS Measurements for Continuous Estimation of Vehicle Sideslip, Roll, and Tire Cornering Stiffness", IEEE Transactions on Intelligent Transportation Systems, Vol.7, No.4, pp.483-493, 2006** ✓実在確認（訂正: 訂正不要。著者3名・順序・巻7・号4・頁483-493・年2006すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/TITS.2006.883110
  - 用途: 「なぜ独立した速度計測が必要か」を最も明快に示した論文。β だけでなくロール角とコーナリングスティフネスまで同時推定できることを示しており、第34章（可観測性）で「センサを足すと何が可観測になるか」を具体的に語る主要ソース。
- **Jihan Ryu, J. Christian Gerdes, "Integrating Inertial Sensors With Global Positioning System (GPS) for Vehicle Dynamics Control", ASME Journal of Dynamic Systems, Measurement, and Control, Vol.126, No.2, pp.243-254, 2004** ✓実在確認（訂正: 訂正不要。著者2名・巻126・号2・頁243-254・年2004すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でASME Digital Collection）
  - https://doi.org/10.1115/1.1766026
  - 用途: GPS/INS統合の車両制御向け原典のひとつ。バンク角・路面勾配の分離という、加速度計だけでは解けない問題を扱っており、第35章の「重力成分の混入」の落とし穴を裏付ける一次ソース。
- **J. Christian Gerdes, Christopher Wilson, David M. Bevly, "The Use of GPS Based Velocity Measurements for Measurement of Sideslip and Wheel Slip", Vehicle System Dynamics, Vol.38, No.2, pp.127-147, 2003** ✓実在確認（訂正: 訂正不要。著者3名・順序・巻38・号2・頁127-147・年2003すべて一致（当時の版元は Swets & Zeitlinger、現在は Taylor & Francis が継承））
  - 種別: 論文 / 入手性: 有料（大学経由でTaylor & Francis）
  - https://doi.org/10.1076/vesd.38.2.127.5619
  - 用途: β とホイールスリップの両方を GPS 速度から「測る」ことを示した論文。第38章（トラクションコントロール）で「スリップ率の分母である車体速度をどう得るか」という核心的問題に答えるソースとして使う。
- **Damrongrit Piyabongkarn, Rajesh Rajamani, John A. Grogg, Jae Y. Lew, "Development and Experimental Evaluation of a Slip Angle Estimator for Vehicle Stability Control", IEEE Transactions on Control Systems Technology, Vol.17, No.1, pp.78-88, 2009** ✓実在確認（訂正: 訂正不要。著者4名・巻17・号1・頁78-88・年2009すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/TCST.2008.922503
  - 用途: 運動学的手法と動力学モデルベース手法を組み合わせる設計を、実験検証つきで示す。第35章の「相補的融合」階層の代表的一次ソース。Rajamani の教科書第8章と対応させて読ませると理解が深まる。
- **J. Farrelly, P. Wellstead, "Estimation of vehicle lateral velocity", Proceedings of the 1996 IEEE International Conference on Control Applications, pp.552-557, 1996** ✓実在確認（訂正: 訂正不要。著者2名・頁552-557一致。年について：Crossrefの登録年フィールドは2002（IEEEの遡及登録による表示上の値）だが、会議録名が "Proceeding of the 1996 IEEE International Conference on Control Applications" であり**1996年が正しい**）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/CCA.1996.558920
  - 用途: 横速度推定の古典。オブザーバベース手法の初期の定式化であり、第35章で「この問題が30年前から解かれ続けている」という歴史的文脈を与える。可観測性の議論の出発点としても使える。
- **B.-C. Chen, F.-C. Hsieh, "Sideslip angle estimation using extended Kalman filter", Vehicle System Dynamics, Vol.46, Supplement 1, pp.353-364, 2008** ✓実在確認（訂正: 訂正不要。著者2名・巻46・補遺号（sup1）・頁353-364・年2008すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でTaylor & Francis）
  - https://doi.org/10.1080/00423110801958550
  - 用途: EKFによるβ推定の標準的な定式化を、比較的短く読みやすい形で示す。第35章の実装演習の下敷きとして学生に読ませるのに適した長さ・難度。
- **Moustapha Doumiati, Alessandro Correa Victorino, Ali Charara, Daniel Lechner, "Onboard Real-Time Estimation of Vehicle Lateral Tire-Road Forces and Sideslip Angle", IEEE/ASME Transactions on Mechatronics, Vol.16, No.4, pp.601-614, 2011** ✓実在確認（訂正: 訂正不要。著者4名・巻16・号4・頁601-614・年2011すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/TMECH.2010.2048118
  - 用途: 横力とβを同時にオンボード実時間で推定するカスケード構成の代表例。第35章の上位階層（EKF/UKF実装）と、第VI部のリアルタイム実装要件を橋渡しする。
- **Moustapha Doumiati, Alessandro Victorino, Ali Charara, Daniel Lechner, "Estimation of vehicle lateral tire-road forces: A comparison between extended and unscented Kalman filtering", 2009 European Control Conference (ECC), pp.4804-4809, 2009** ✓実在確認（訂正: 訂正不要。著者4名・会議名 2009 European Control Conference (ECC)・頁4804-4809・年2009すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.23919/ECC.2009.7075160
  - 用途: EKF と UKF を同一問題・同一データで比較した論文。第35章で「UKFにすれば必ず良くなるわけではない」という重要な但し書きを、憶測でなく実験結果として書くための一次ソース。
- **E. A. Wan, R. Van Der Merwe, "The unscented Kalman filter for nonlinear estimation", Proceedings of the IEEE 2000 Adaptive Systems for Signal Processing, Communications, and Control Symposium (AS-SPCC), pp.153-158, 2000** ✓実在確認（訂正: 訂正不要。著者2名・頁153-158一致。年について：Crossrefの登録年フィールドは2002だが、会議録名が "Proceedings of the IEEE 2000 Adaptive Systems for Signal Processing, Communications, and Control Symposium (Cat. No.00EX373)" であり**2000年が正しい**）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/ASSPCC.2000.882463
  - 用途: UKFの標準的な原典のひとつ。第35章でシグマ点変換を導入する際の出典。Simon の教科書第14章と併読させる。
- **Anton T. van Zanten, "Bosch ESP Systems: 5 Years of Experience", SAE Technical Paper 2000-01-1633, SAE International, 2000** ✓実在確認（訂正: 訂正不要。著者・論文番号2000-01-1633・出版社SAE International・年2000すべて一致）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus。大学によっては契約あり）
  - https://doi.org/10.4271/2000-01-1633
  - 用途: ヨー安定性制御の実務の正典。参照ヨーレート生成・β制限・ブレーキ配分という ESC の標準構造と、量産で5年運用した実績からの知見。第38-39章の設計構造をここから取る。
- **Anton T. van Zanten, Rainer Erhardt, Georg Pfaff, "VDC, The Vehicle Dynamics Control System of Bosch", SAE Technical Paper 950759, SAE International, 1995** ✓実在確認（訂正: 訂正不要。著者3名・論文番号950759・出版社・年1995すべて一致）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）
  - https://doi.org/10.4271/950759
  - 用途: 上記の原典にあたる1995年の論文。ESC/VDC の最初の体系的記述で、第38章の歴史的導入に使う。
- **F. Borrelli, A. Bemporad, M. Fodor, D. Hrovat, "An MPC/hybrid system approach to traction control", IEEE Transactions on Control Systems Technology, Vol.14, No.3, pp.541-552, 2006** ✓実在確認（訂正: 訂正不要。著者4名・巻14・号3・頁541-552・年2006すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/TCST.2005.860527
  - 用途: トラクションコントロールにMPCを適用した代表的論文。第38章（トラクションコントロール）と第39章（MPC）を接続する。「なぜ制約を陽に扱えることが効くのか」を具体例で示せる。
- **Paolo Falcone, Francesco Borrelli, Jahan Asgari, Hongtei Eric Tseng, Davor Hrovat, "Predictive Active Steering Control for Autonomous Vehicle Systems", IEEE Transactions on Control Systems Technology, Vol.15, No.3, pp.566-580, 2007** ✓実在確認（訂正: 訂正不要。著者5名・巻15・号3・頁566-580・年2007すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/TCST.2007.894653
  - 用途: 車両操舵MPCの最も引用される原典。非線形MPCと線形時変MPCの計算量トレードオフを実車で議論しており、第39章（MPC）の中核ソース。第40章（離散化とリアルタイム）にも直結する。
- **Sergio M. Savaresi, Mara Tanelli, "Active Braking Control Systems Design for Vehicles", Springer London (Advances in Industrial Control), 2010. ISBN 978-1-84996-349-7**
  - 種別: 書籍 / 入手性: 有料（大学経由でSpringerLink）
  - https://doi.org/10.1007/978-1-84996-350-3
  - 用途: ABS/スリップ率制御の単行本正典。CrossRefで章立て確認済み（第3章 Braking Control Systems Design: Actuators with Continuous Dynamics、第4章 同 Discrete Dynamics）。アクチュエータの離散/連続という区別は、ICE FSAE の点火リタード・燃料カット（離散）とスロットル（連続）の設計判断に直接効く。
- **Yuri Shtessel, Christopher Edwards, Leonid Fridman, Arie Levant, "Sliding Mode Control and Observation", Birkhäuser / Springer New York, 2014. ISBN 978-0-8176-4892-3** ✓実在確認（訂正: 訂正不要。著者4名・出版社 Springer New York（Birkhäuser）・年2014・ISBN 9780817648923／9780817648930 すべて一致。シリーズ名 Control Engineering）
  - 種別: 書籍 / 入手性: 有料（大学経由でSpringerLink）
  - https://doi.org/10.1007/978-0-8176-4893-0
  - 用途: スライディングモードの制御と観測器を一冊で扱う標準教科書。CrossRefで章立て確認済み（第2章 Conventional Sliding Modes、第3章 Conventional Sliding Mode Observers）。第37章と第35章の両方から参照でき、チャタリング問題の理論的背景を正確に書くために必要。
- **Leonardo De Novellis, Aldo Sorniotti, Patrick Gruber, Andrew Pennycott, "Comparison of Feedback Control Techniques for Torque-Vectoring Control of Fully Electric Vehicles", IEEE Transactions on Vehicular Technology, Vol.63, No.8, pp.3612-3623, 2014** ✓実在確認（訂正: 訂正不要。著者4名・巻63・号8・頁3612-3623・年2014すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/TVT.2014.2305475
  - 用途: 同一の車両・同一の目標に対して複数のフィードバック手法（PID系、状態フィードバック系、SMC系など）を横並び比較した稀な論文。第36-37章で「制御手法の階層を上げると何がどれだけ良くなるのか」を数字で語るために使う。ただし電動車前提なので、本書（内燃機関）への適用限界を明記して引用すること。
- **Tommaso Goggia, Aldo Sorniotti, Leonardo De Novellis, Antonella Ferrara, "Torque-vectoring control in fully electric vehicles via integral sliding modes", 2014 American Control Conference (ACC), pp.3918-3923, 2014** ✓実在確認（訂正: 訂正不要。著者4名・会議名 2014 American Control Conference・頁3918-3923・年2014すべて一致）
  - 種別: 論文 / 入手性: 有料（大学経由でIEEE Xplore）
  - https://doi.org/10.1109/ACC.2014.6858807
  - 用途: 積分スライディングモードの車両応用例。第37章でSMCを扱う際の実応用ソース。同じく電動前提なので適用限界を添えること。
- **Juraj Kabzan, Miguel I. Valls, Victor J. F. Reijgwart, Hubertus F. C. Hendrikx, et al. (22名), "AMZ Driverless: The full autonomous racing system", Journal of Field Robotics, Vol.37, No.7, pp.1267-1294, 2020. プレプリント: arXiv:1905.05150** ✓実在確認（訂正: 訂正不要。Crossrefで巻37・号7・頁1267-1294・年2020・**著者22名**（記載の「22名」と一致）を確認。arXiv:1905.05150 も arXiv API で実在確認（"AMZ Driverless: The Full Autonomous Racing System"、2019-05-13投稿、著者22名））
  - 種別: 論文 / 入手性: arXiv:1905.05150 でプレプリントが無料。学生が確実に読める。
  - https://doi.org/10.1002/rob.21977
  - 用途: 本調査で最も価値の高い一次ソース。学生フォーミュラ（FSG/FSI優勝）の実車で、推定と制御の全階層が具体的な数字つきで書かれている。本文PDFから直接確認した内容: 9状態EKF（v_x, v_y, r, a_x, a_y, 4輪スリップ率）に6センサ（GSS光学式対地速度計・IMU・GNSS・輪速WSS・SLAM・モータトルク）を融合／付録の非線形可観測性解析とセンサ欠落時の可観測性表（Table 2）／IMUと速度センサ同時故障時にヨーレートが不可観測になるため 6 m/s 以下で zero-slip-ratio measurement update に縮退／カイ二乗検定による外れ値検出＋分散ベースのドリフト検出／GSS を外した推定でも 310 m 走行で位置ドリフト 1.5 m 未満（0.5 %未満）／MPCC は ForcesPro NLP、サンプリング 50 ms、ホライズン N=40（2秒先読み）、タイヤ摩擦楕円を制約化、β_dyn と β_kin の差にコスト／動力学モデルは低速で特異なため v_x ∈ [3, 5] m/s でキネマティックモデルと線形ブレンド／コーン検出から制御指令までの総遅延が約300 ms あり、これが原因で最高速とトルクを制限せざるを得ず人間ドライバに及ばない、と明記。第34-39章と第40-48章（レイテンシ・実装）の両方の主要ソースになる。
- **Alexander Liniger, Alexander Domahidi, Manfred Morari, "Optimization-based autonomous racing of 1:43 scale RC cars", Optimal Control Applications and Methods, Vol.36, No.5, pp.628-647, 2015. プレプリント: arXiv:1711.07300** ✓実在確認（訂正: 訂正不要。Crossrefで著者3名・巻36・号5・頁628-647を確認（オンライン公開2014年、収録巻は2015年なので「2015」で正しい）。arXiv:1711.07300 も実在確認 — arXiv側の journal_ref が "Optimal Control Applications and Methods, 36(5), 2015, pp.628-647"、DOI 10.1002/oca.2123 と自己申告しており、掲載誌情報と完全に一致）
  - 種別: 論文 / 入手性: arXiv:1711.07300 でプレプリントが無料
  - https://doi.org/10.1002/oca.2123
  - 用途: MPCC（Model Predictive Contouring Control）の原典で、AMZ Driverless の制御はこれを拡張したもの。「中心線に沿った進捗を最大化しつつ車両モデルとトラック制約を守る」という定式化は、第32章（最小ラップタイム最適化）と第39章（MPC）を繋ぐ鍵。
- **Johannes Betz, Hongrui Zheng, Alexander Liniger, Ugo Rosolia, Phillip Karle, Madhur Behl, Venkat Krovi, Rahul Mangharam, "Autonomous Vehicles on the Edge: A Survey on Autonomous Vehicle Racing", IEEE Open Journal of Intelligent Transportation Systems, Vol.3, pp.458-488, 2022. プレプリント: arXiv:2202.07008** ✓実在確認（訂正: 訂正不要。著者8名・巻3・頁458-488・年2022すべて一致。arXiv:2202.07008 も実在確認（journal_ref・DOIとも本誌と一致））
  - 種別: 論文 / 入手性: オープンアクセス（IEEE OJ-ITS）＋ arXiv:2202.07008
  - https://doi.org/10.1109/OJITS.2022.3181510
  - 用途: 自律レーシングの認識・計画・制御・end-to-end学習を横断する最新の大規模サーベイ。第39章のMPC以降、および学習ベース制御を「なぜまだ使えないか」も含めて位置づけるための地図。オープンアクセスで学生が読める点も大きい。
- **Alexander Wischnewski, Tim Stahl, Johannes Betz, Boris Lohmann, "Vehicle Dynamics State Estimation and Localization for High Performance Race Cars", IFAC-PapersOnLine, Vol.52, No.8, pp.154-161, 2019** ✓実在確認（訂正: 訂正不要。著者4名・巻52・号8・頁154-161・年2019すべて一致）
  - 種別: 論文 / 入手性: IFAC-PapersOnLine はオープンアクセス（ScienceDirect、Elsevier）
  - https://doi.org/10.1016/j.ifacol.2019.08.064
  - 用途: 高性能レース車両に特化した状態推定・自己位置推定の構成を扱う（TUM、Roborace系）。AMZ（学生フォーミュラ）と対比させることで、「車速域と要求が上がると推定構成がどう変わるか」を示せる。第35章と第41-42章の橋渡し。
- **Hiroshi Enomoto, Hitoshi Nakao, Yosuke Fukunaga, Taira Maeda, Toshiyuki Sakai, Masahiro Kontani, "Development of the Traction Control System with the Custom Electrical Control Unit for the Formula SAE Car", SAE Technical Paper 2007-32-0119, SAE International, 2007** ✓実在確認（訂正: **要修正（発行団体）：Crossref上の publisher は「Society of Automotive Engineers of Japan（自動車技術会・JSAE）」**であり「SAE International」ではない。論文番号 2007-32-0119 の "-32-" は JSAE 小型エンジン技術会議（SETC）系列を示す。著者6名・タイトル・年2007は一致）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）
  - https://doi.org/10.4271/2007-32-0119
  - 用途: 学生フォーミュラ車両に自作ECUでトラクションコントロールを実装した、まさに本書の読者層に一致する事例。第38章（トラクションコントロール）で「FSAEで実際にやった人がいる」ことを示す一次ソース。日本のチームによる論文。
- **Kim Lyon, Matthias Philipp, Erwin Grommes, "Traction Control for a Formula 1 Race Car: Conceptual Design, Algorithm Development, and Calibration Methodology", SAE Technical Paper 942475, SAE International, 1994** ✓実在確認（訂正: 訂正不要。著者3名・論文番号942475・出版社SAE International・年1994すべて一致）
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）
  - https://doi.org/10.4271/942475
  - 用途: レース専用トラクションコントロールの古典。概念設計→アルゴリズム→キャリブレーション手法という流れが、本書の第38章の章構成そのものに使える。「実務のレース車両開発と同じ水準」という本書の看板を支える。
- **Hans B. Pacejka, Egbert Bakker, "The Magic Formula Tyre Model", Vehicle System Dynamics, Vol.21, Supplement 1, pp.1-18, 1992** ✓実在確認（訂正: 訂正不要。著者2名・巻21・補遺号（sup001）・頁1-18・年1992すべて一致（原題は大文字表記 "THE MAGIC FORMULA TYRE MODEL"））
  - 種別: 論文 / 入手性: 有料（大学経由でTaylor & Francis）
  - https://doi.org/10.1080/00423119208969994
  - 用途: 第II部タイヤ②の原典であると同時に、第35章のEKF/UKFで観測モデルとして使うタイヤモデルの出典。AMZ Driverless もEKFの観測更新にこれを使っている。推定と第II部を接続する要の文献。
- **Formula Student Germany, "Formula Student Rules 2026", Version 1.1 および "Formula Student Driverless Specification 2026", Version 1.1（2026-05-16発行）**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（PDFを無料ダウンロード可）
  - https://www.formulastudent.de/fsg/rules/
  - 用途: 第VI部および第34章の要求仕様の一次ソース。Driverless Specification から直接確認した内容: 座標系は ISO 8855（z上）と明記され図示されている（本書の座標系方針と完全一致、第1章の裏付けになる）／トラックは青コーン=左、黄コーン=右、進行方向のコーン間隔は最大5 m／主催者は地図データを提供せず、人工ランドマークの設置も禁止（＝SLAM必須）／データロガーへ CAN-ID 0x500（速度・舵角・ブレーキ・モータトルクの実値と目標値）、0x501（前後加速度・横加速度・ヨーレート）、0x502（AS状態・EBS状態・AMI状態・ラップ数・コーン数）を各100 ms周期で提供／重要な点として 0x500 と 0x502 は必須だが 0x501 は「利用可能なセンサデータに依存」とされており、規則上はIMU非搭載でも成立する（＝IMUはチームの設計判断であり、状態推定を行うなら実質必須という議論ができる）／0x501 のスケールは加速度 1/512 m/s²、ヨーレート 1/128 °/s。
- **MathWorks, "extendedKalmanFilter" 関数リファレンス（Control System Toolbox）** ✓実在確認（訂正: 訂正不要。当該URLに関数ページが実在し、所属ツールボックスも Control System Toolbox で一致。説明文「creates an object for online state estimation of a discrete-time nonlinear system using the first-order discrete-time extended Kalman filter algorithm」）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料閲覧可。実行にはライセンスが必要だがFSAE無償ライセンスに含まれる）
  - https://www.mathworks.com/help/control/ref/extendedkalmanfilter.html
  - 用途: 第35章の実装経路の一次ソース。ページから直接確認: extendedKalmanFilter は Control System Toolbox。メソッドは predict / correct / residual / clone、関連関数は unscentedKalmanFilter, kalman, kalmd, generateJacobianFcn（ヤコビアン自動生成）。Simulinkブロックは Kalman Filter / Extended Kalman Filter / Unscented Kalman Filter の3種。加法性・非加法性ノイズの両方に対応。
- **MathWorks, "nlmpc" 関数リファレンス（Model Predictive Control Toolbox）** ✓実在確認（訂正: 訂正不要。当該URLにページが実在し、所属ツールボックスも Model Predictive Control Toolbox で一致（非線形予測モデル・非線形コスト関数・非線形制約に基づく非線形MPCコントローラオブジェクト））
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料閲覧可）
  - https://www.mathworks.com/help/mpc/ref/nlmpc.html
  - 用途: 第39章の実装経路。ページから直接確認: nlmpc は Model Predictive Control Toolbox。関連は nlmpcmove（最適制御入力の計算）、nlmpcmoveCodeGeneration（コード生成向け）、validateFcns（予測モデルの事前検証）、convertToMPC（線形MPCへの変換）、createParameterBus。Simulinkブロックは Nonlinear MPC Controller。動作モードに "Adaptive"（現在動作点の線形モデル）と "TimeVarying"（ホライズン上で複数線形モデル）があり、これがそのまま第39章の階層（線形→適応→線形時変→非線形）に対応する。
- **MathWorks, "insfilterNonholonomic" 関数リファレンス（Sensor Fusion and Tracking Toolbox）** ✓実在確認（訂正: 訂正不要。当該URLにページが実在し、所属ツールボックスも Sensor Fusion and Tracking Toolbox で一致。説明文「implements sensor fusion of inertial measurement unit (IMU) and GPS data to estimate pose in the NED (or ENU) reference frame」）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料閲覧可）
  - https://www.mathworks.com/help/fusion/ref/insfilternonholonomic.html
  - 用途: 第35章のGNSS/INS統合階層の実装経路。ページから直接確認: insfilterNonholonomic は Sensor Fusion and Tracking Toolbox で、IMUとGPSを融合してNED（またはENU）座標系で姿勢・位置を推定する。地上車両向けに運動学的拘束（ZeroVelocityConstraintNoise プロパティ、拘束補正のデシメーション係数）を持つ。関連は insfilterErrorState, insfilterMARG, insfilterAsync, insEKF。※このToolboxがFSAE無償ライセンスに含まれるかは本調査では未確認。
- **MathWorks, "tunableSurface" 関数リファレンス（Control System Toolbox）** ✓実在確認（訂正: 訂正不要。当該URLにページが実在し、所属ツールボックスも Control System Toolbox で一致（ゲインスケジューリング用の可調整ゲインサーフェス。systune で調整））
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料閲覧可）
  - https://www.mathworks.com/help/control/ref/tunablesurface.html
  - 用途: 第36-37章のゲインスケジューリング実装経路。ページから直接確認: tunableSurface は Control System Toolbox で、スケジューリング変数（車速など）の関数としてゲイン面をパラメータ化する。systune で全設計点を同時に満たすよう一括チューニング、slTuner で Simulink モデルに紐付け、基底関数は polyBasis / fourierBasis / ndBasis、確認は viewSurf / evalSurf。「動作点ごとに手でPIDを合わせてルックアップテーブルに詰める」という素朴な方法との違いを示せる。
- **MathWorks, "Vehicle Body 3DOF" ブロックリファレンス（Vehicle Dynamics Blockset）**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料閲覧可）。Vehicle Dynamics Blockset はFSAE無償ライセンスに含まれることを確認済み。
  - https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html
  - 用途: 制御設計のプラント側を用意する経路。ページから直接確認: 前後・横・ヨーの3自由度を扱い、Single Track（自転車モデル、横荷重移動なし）と Dual Track（4輪、横荷重移動あり）の2構成を選べる。関連ブロックは Vehicle Body 3DOF Longitudinal、Vehicle Body 6DOF。第I部の線形2輪モデルから第23章の非線形4輪モデルへの橋渡しを、既製ブロックで確認しながら進められる。
- **MathWorks, Formula SAE / 学生フォーミュラ 向け 学生競技会ソフトウェア提供ページ** ✓実在確認（訂正: 訂正不要。ページ実在。「MathWorks is pleased to sponsor the 2026 Formula SAE Japan competition. MathWorks will provide software, self-paced online training, access to MathWorks engineering mentors, and technical support to teams that have completed the Student Competition Software Request Form」と明記され、100製品以上（MATLAB, Simulink, Vehicle Dynamics Blockset, Simscape 各種, Control System Toolbox 等）が対象。本書の前提「MathWorks の FSAE 無償ライセンス」の一次ソースとして使用可）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス
  - https://www.mathworks.com/academia/student-competitions/formula-sae.html
  - 用途: 「実装の正典は MATLAB/Simulink、学生は無償ライセンスで入手できる」という本書の前提の裏付け。ページから直接確認: 100を超える製品が提供され、本書に関係するものとして Control System Toolbox、Model Predictive Control Toolbox、Optimization Toolbox、Vehicle Dynamics Blockset、Powertrain Blockset、Automated Driving Toolbox、Simscape 各種、Embedded Coder、MATLAB Coder、Deep Learning Toolbox、Computer Vision Toolbox、Lidar Toolbox が明記されている。申請はチームリーダーまたは指導教員が Student Competition Software Request Form から行う。
- **Massimo Guiggiani, "The Science of Vehicle Dynamics", Springer（第3章 Vehicle Model for Handling and Performance）**
  - 種別: 書籍 / 入手性: 有料（大学経由でSpringerLink）
  - https://doi.org/10.1007/978-3-031-06461-6_3
  - 用途: 車両運動の数学的厳密さで定評があり、第I部・第II部の理論的裏付けに使える。第3章 Vehicle Model for Handling and Performance が本書の第3-6章に対応。※注意: 2014年版（章DOI 10.1007/978-94-017-8533-4_3、pp.47-98）と2022年版（章DOI 10.1007/978-3-031-06461-6_3、pp.67-176）の2つの章DOIをCrossRefで確認したが、それぞれの正確な版数表記（第2版/第3版）までは本調査では確認していない。引用時に版数を書く場合は要再確認。
- **William F. Milliken, Douglas L. Milliken, "Race Car Vehicle Dynamics", SAE International (Premiere Series), 1995**
  - 種別: 書籍 / 入手性: 有料（SAE Mobilus / 書籍販売。邦訳『レーシングカーの動力学』あり ※邦訳の書誌は本調査未確認）
  - 用途: レース車両運動の古典的正典。AMZ Driverless はトルクベクタリングの低レベル制御則（キネマティックなヨーレート目標を比例制御で追従させ、人間ドライバにとって予測しやすい挙動にする設計）の根拠としてこの本を引用しており、第39章・第II部の複数箇所で参照できる。※検証状況の注記: 本調査では出版社の書誌ページを直接開いて確認できておらず、AMZ Driverless 論文（Journal of Field Robotics 2020）の参考文献リストに「Milliken, W., Milliken, D., and Society of Automotive Engineers (1995). Race Car Vehicle Dynamics. Premiere Series. SAE International.」と記載されているのを確認した二次的裏付けにとどまる。ISBN やページ数を書く場合は一次確認が必要。

---

## サスペンション運動学と荷重移動（第II部 サスペンション①運動学／②荷重移動とロール剛性配分／③スプリング・ダンパ・ARB。第III部の同定・検証、第IV部のセットアップ感度解析へ接続）

### モデル階層

**[入門（前面図）] 2D前面図キネマティクス：瞬間中心(IC)とロールセンタ(RC)の作図法**

- 仮定・成立条件: (1)サス運動が前面図平面への射影で完結する（Aアームの前後スイープ、キャスタ角による軸の傾き、タイロッドを無視）。(2)上下Aアームを2直線とみなしその交点がIC。(3)RC＝「接地点とICを結ぶ線」と車両中心線の交点。(4)左右対称・静止姿勢・微小変位。(5)リンクは剛体、ジョイントに弾性もガタもない。(6)左右タイヤの横力が等しい。(7)ばね上質量は前後RCを結んだ『ロール軸』まわりに回転する。(8)モーションレシオは定数。
- 破綻条件（次の階層へ進むべき時）: ①ロール／ヒーブでICが大きく動き、RCは非線形かつ発散的に移動する。上下アームが平行に近いとICが無限遠に飛び、微小な姿勢変化でRCが中心線から外れて暴れる（短いアームのFSAEで顕著）。②左右横力は荷重移動がある限り必ず不等で、『横力がRCを通る』前提が最初から崩れている。ジャッキング力の実体はこの左右不等の幾何力（Gerrard, SAE 1999-01-0046）。③タイロッドという5本目のリンクを無視している。Mitchell（SAE 2006-01-3617）はこの missing link が力ベースRCと運動学的RCの差の主因であり、バンプステアを小さくするほど両者の差が縮むと示した。逆に言えばバンプステアが大きい設計ではKRCの数値自体が信用できない。④ばね上質量は実際にはロール軸まわりに回らない（Rouelle, OptimumG 2024）。実際の回転中心は慣性・タイヤ縦剛性・サス剛性で決まる別物。⑤空間運動学から見ると平面作図が正当化されるのは左右対称の初期姿勢に限られる（Lee & Shim, IJAT 2011）。→ RC移動量の定量化、ジャッキング、有意なバンプステアのいずれかが問題になったら3D運動学へ進む。
- 学生フォーミュラでの実行可能性: 必須。全チームが最初に描き、デザイン審査で必ず問われる。ただし『静止時RC高○○mm』という単一の数字を設計値として報告するのは不十分。本書ではこの階層を「概念の入口であり同時に批判対象」として教える。
- MATLAB実装経路: 自作。2直線の交点は媒介変数表示から2×2線形方程式になり、バックスラッシュ演算子で数行。Toolbox不要。教科書の第1コードとして最適。

**[入門（側面図）] 2D側面図キネマティクス：サイドビュー・スイングアーム(SVSA)によるアンチダイブ／アンチスクワット／アンチリフト**

- 仮定・成立条件: (1)側面図平面への射影で完結。(2)側面図の瞬間中心と接地点を結ぶ線が水平となす角で anti 率を定義。100%なら制動／加速による当該軸のサス変位がゼロ。(3)制動力配分・駆動力配分が既知かつ一定。(4)アウトボードブレーキ（接地点で力が発生）かインボードブレーキ（ホイールセンタで反力を受ける）かで式が変わる。(5)前後を独立に設計できる。
- 破綻条件（次の階層へ進むべき時）: ①前後独立という仮定が誤り。Rouelle（OptimumG 2024, The anti-antis）は前アンチダイブと後アンチスクワットが『ピッチセンタ』を通じて連成しており、片方だけ設計すると重大なハンドリング問題を招くと指摘する。②anti 率はブレーキバランスの関数なので、バランスバーを回した瞬間に実効 anti 率が変わる。設計時の値は1点でしか成立しない。③anti 100% はサスの動きを止めてしまい、路面入力に対する接地荷重変動の吸収とダンパによる減衰制御を失う。④ばね上のバウンス／ピッチ連成とタイヤ縦剛性を含む多自由度で見ると、静的 anti 率から予測される挙動と実挙動がずれる（Azman, Rahnejat, King & Gordon, Proc IMechE Part K 218(4), 2004）。→ ピッチ過渡や乗り心地との両立が問題になったら多体／全車両モデルへ。
- 学生フォーミュラでの実行可能性: 実用的。FSAEは加減速が激しく（アクセラレーション、ブレーキング）、かつホイールベースが短く重心が相対的に高いためピッチ変化が大きい。一方でアンチを入れすぎるとブレーキング時に前輪の接地性を失う。ダブルウィッシュボーンならアーム取付点の高さ差でanti率を作れるが、キャンバ変化・バンプステアとトレードオフになる点を必ず教える。
- MATLAB実装経路: 自作。前面図と同じ2直線交点の計算を側面図で行うだけ。3D階層に進めば、ハードポイントから側面図投影のSVSAを自動計算できる。Vehicle Dynamics Blockset の Independent Suspension - K and C ブロックは longitudinal SVSA を tan(θ_SVSA)=f(Zw), Fz_SVSA=Fx·tan(θ_SVSA) として実装しており、この階層の式がそのまま製品にも入っている。

**[入門〜実用] 定常横荷重移動の分解（幾何項＋弾性項＋非ばね上項）とLLTD（横荷重移動配分）**

- 仮定・成立条件: (1)定常旋回・微小ロール角。(2)総横荷重移動は m·a_y·h_cg / t で決まり、RC高には依存しない（RC高が変えるのは幾何／弾性の内訳）。(3)シャシねじり剛性が無限大で、前後のロール剛性が独立に効く。(4)ロール軸は前後RCを結ぶ直線で固定、RC高は姿勢によらず一定。(5)ロール剛性（ばね＋ARB）が線形、バンプストップ非接触。(6)非ばね上荷重移動は各軸のタイヤ／非ばね上質量重心高で別勘定。
- 破綻条件（次の階層へ進むべき時）: ①シャシねじり剛性が前後ロール剛性の合計と同オーダーだと、設計したLLTDが実現せず、ARB調整の効きも鈍る（Deakin, Crolla, Ramirez & Hanley, SAE 2000-01-3554）。軽量スペースフレームのFSAEでは現実の問題。②ロール中のRC移動で幾何項が姿勢とともに変わる。③過渡（ステア入力直後）ではロール慣性とダンパが支配し、定常LLTDは成立しない。ダンパは過渡的にLLTDを変える。④タイヤの荷重感度（コーナリング剛性の非線形性）を入れないとLLTDと実際のバランスが結びつかない。LLTDは目的ではなく、タイヤの荷重感度を通じてバランスに効く手段である。⑤空力ダウンフォースが加わると a_y と垂直荷重が結合する。→ 過渡・非線形が問題になったら第IV部QSS／過渡ラップシムと第II部タイヤモデルへ接続。
- 学生フォーミュラでの実行可能性: 本領域の設計自由度の中心。バランス調整の主変数はLLTDで、ばねレート・ARB・RC高・トレッドの4つが効く。ARBだけ回しても幾何項は動かないという事実は、セットアップ手順の設計に直結する。シャシねじり剛性の実測はFSAEでも治具が簡単なので実行可能であり、必ずロール剛性合計と比較させること。
- MATLAB実装経路: 自作スクリプトで十分（数十行）。Simulinkに載せるなら Vehicle Dynamics Blockset の Independent Suspension 系ブロック（anti-sway bar の torsion spring / arm geometry パラメータあり）。ただしブロック名と実装内容の乖離に注意（下記 pitfalls 参照）。

**[実用] 3Dハードポイント運動学：拘束方程式の数値求解**

- 仮定・成立条件: (1)全リンク剛体、ジョイント理想（球面／回転対偶）、ガタも弾性もない。(2)準静的（慣性項なし）。ホイールトラベル z とステアラック変位を入力、アップライト姿勢（6自由度）を出力。(3)ハードポイント座標が既知で製造誤差なし。(4)ダブルウィッシュボーンはステア固定時に自由度1：上下アームのアウタボールジョイントが各々球面上に、タイロッドエンドも球面上に拘束される。(5)出力はキャンバ／トー／キャスタ／KPI／スクラブ／トレッド変化／モーションレシオ／3DのIC・RC／SVSAによるanti率を、姿勢の関数として与える。
- 破綻条件（次の階層へ進むべき時）: ①コンプライアンスを完全に無視している。実車では横力によるトー変化（コンプライアンスステア）が幾何バンプステアと同等以上になり得る。②3D運動学から出るRCも『幾何RC』であり、力ベースRCとは一致しない（Mitchell 2006）。3Dにしても roll centre 批判は解消しない。③タイヤの横／縦コンプライアンス、キャンバによる接地点の横移動を無視。タイヤの横コンプライアンスはサス側より大きいことがある。④製造公差とロッドエンドのガタ（FSAEでは無視できない）。⑤慣性・ダンパを含まないのでピッチ／ヒーブ過渡は扱えない。→ コンプライアンス起因のトー／キャンバ変化が無視できないと分かった時点でK&C階層へ。
- 学生フォーミュラでの実行可能性: 良いチームが到達すべき現実的な上限であり、本書が『自分の手で解ける最上位』として実装させるべき階層。MATLABのfsolveで完全に自作でき、外部ツール（OptimumKinematics、Lotus Suspension Analysis 等）に依存する必要がない。自作すればRC移動、モーションレシオの姿勢依存、anti率のブレーキバランス依存をすべて自分で可視化できる。
- MATLAB実装経路: 自作が正道：拘束残差関数を書いて Optimization Toolbox の fsolve（無ければ自作Newton-Raphson）で解く。ヤコビアンは Symbolic Math Toolbox の jacobian で生成可能。Simscape Multibody でも同じ結果が得られる（Revolute/Spherical Joint ＋ Rigid Transform でリンク構成、Prismatic Joint で強制変位）。出発点は openExample('sm/DoubleWishboneExample') と openExample('sm/VehicleSuspensionTemplatesExample')（ダブルウィッシュボーン／ストラット／プッシュロッドのテンプレート）。

**[実務標準] K&C（Kinematics & Compliance）モデル：運動学マップ＋コンプライアンス勾配の重ね合わせ**

- 仮定・成立条件: (1)準静的。バウンス／ロール／ステアの運動学効果と、前後力・横力・セルフアライニングトルクによるコンプライアンス効果を線形重ね合わせする。MathWorks の Independent Suspension - K and C ブロックはまさにこの重ね合わせを実装している（kinematic の bounce/roll/steering と compliance の longitudinal/lateral force, aligning moment の各効果を加算する、と明記）。(2)コンプライアンスは勾配（deg/kN, deg/kN·m, mm/kN）で表現され、振幅・周波数に依存しない。(3)左右独立に扱える。
- 破綻条件（次の階層へ進むべき時）: ①大振幅で重ね合わせが成立しない（運動学が非線形、コンプライアンスが荷重依存）。②ゴムブッシュは粘弾性で周波数・振幅依存（Payne効果）を持ち、準静的勾配では過渡が合わない。③摩擦・ヒステリシスを表現できない。④タイヤ自身の横コンプライアンスがサスより大きい場合、サス側だけの勾配では実車のトー挙動を説明できない。⑤K&Cは準静的なので、ダンパ速度域の挙動やロール過渡は別モデルが要る。→ 過渡・周波数依存が問題になったらマルチボディへ。
- 学生フォーミュラでの実行可能性: 『知る価値はあるが、そのままは実行できない』階層と明記すべき。FSAEチームにK&C試験機は無い（Best, Neads, Whitehead & Willows, SAE 970096 が記述する四輪同時の商用設備は桁違いに高額）。代替策：(a) リンク＋アップライト＋シャシタブのFEAから剛性を出しコンプライアンス勾配を合成、(b) 簡易静的リグ（ホイールを横に引くターンバックル＋ロードセル、トー変化をレーザまたはダイヤルゲージで計測）、(c) シャシねじり剛性だけは実測（FSAEでは一般的）、(d) MATLABのK&C仮想試験ラボでSimscape Multibodyモデルから合成データを生成。ロッドエンド主体でブッシュ剛性は高いが、Aアーム曲げ・タブ変形・シャシねじりは効く。
- MATLAB実装経路: Vehicle Dynamics Blockset: Independent Suspension - K and C ブロック。パラメータ名は BumpSteer, BumpCamber, BumpCaster, LatWhlCtrDisp, LngWhlCtrDisp, NrmlWhlRates, NrmlWhlFrcOff, LngSteerCompl, LngCambCompl, LngCastCompl, LatSteerCompl, LatCambCompl, AlgnTrqSteerCompl, AlgnTrqCambCompl, StatToe, StatCamber, StatCaster, ShckFrcVsCompRate。実測データが無い場合は Kinematics and Compliance Virtual Test Laboratory（起動コマンド vdynblksKandCTestLabStart）を使い、Simscape MultibodyモデルをSobol列のDOE＋0.1〜2 Hzチャープで加振し、Model-Based Calibration Toolbox で応答曲面（キャンバ角・トー角・上下力）を同定して Independent Suspension - Mapped ブロックに流し込む。FSAEにとってはこれが『K&C試験機の代わり』になる正規ワークフロー。

**[実務標準] 3Dマルチボディ動力学（Simscape Multibody / ADAMS/Car）**

- 仮定・成立条件: (1)各リンクに質量・慣性を与え、ジョイント拘束＋力要素（ばね・ダンパ・ブッシュ・バンプストップ）で構成。(2)タイヤモデル（Magic Formula等）と連成。(3)DAEを索引低減して数値積分。(4)部品は剛体（必要ならFEAモード形状で弾性体化）。
- 破綻条件（次の階層へ進むべき時）: ①入力データの質で決まる。慣性諸元、ブッシュ／構造剛性、タイヤ係数が実測でなければ精度は出ない（第III部の同定と不可分）。②実時間実行が困難でHIL/DILには不向き。第VI部の簡約モデルが別途必要。③拘束の冗長・特異姿勢で収束しない。④検証データ（K&C実測・実車ログ）が無ければ妥当性を主張できない。モデルが複雑になるほど『合わせ込める自由度』が増え、間違ったパラメータで正しい応答を出せてしまう危険が増す。
- 学生フォーミュラでの実行可能性: Simscape Multibody は MathWorks の FSAE 支援ライセンス経由で入手できる可能性が高く（同梱Toolboxの正確な内容は年度・地域で異なるため要確認）、実行可能。mathworks/Simscape-Vehicle-Templates にはプッシュロッド／プルロッドを含む多数のサス形式と、クォータ／ハーフ／フルカーのテストリグがあり、FSAEのプッシュロッド構成をそのまま試せる。ADAMS/Carはスポンサー提供に依存するため、多くのチームでは『知る価値はあるが実行できない』。
- MATLAB実装経路: Simscape Multibody（+ Simscape）。既製資産：GitHub mathworks/Simscape-Vehicle-Templates（sm_car.slx、sm_car_proj.prj、Libraries/Testrigs/Scripts_Data/Workflows構成。ダブルウィッシュボーン、プッシュロッド／プルロッド、5リンク、ルックアップテーブル型キネマティクスサス等を収録、MathWorks著作 2018-2026、R2022a以降）。openExample('sm/FourPostTestrigExample') で四柱加振リグ。File Exchange 64648「MATLAB and Simulink Racing Lounge: Vehicle Modeling with Simscape Multibody」（MathWorks Student Competitions Team, 2017）も入口として有用。

**[研究最前線] 空間運動学（スクリュー理論）・力ベース解析・ロールセンタ運動の寸法合成**

- 仮定・成立条件: (1)ロール軸をばね上質量の対地ロール運動の瞬間スクリュー軸（roll twist axis）として定義する（Lee & Shim 2011）。(2)ツイスト（速度）とレンチ（力）の相反性でキネマティクスとスタティクスを結ぶ。(3)力ベースRCは接地点の実際の力の作用状態から定義され、SAEの定義上も幾何RCとは別物。(4)寸法合成（Raghavan 2005）はRC運動を指定してリンク寸法を逆算する。
- 破綻条件（次の階層へ進むべき時）: ①Lee & Shim (2011) は従来の平面作図法が正当なのは左右対称の初期姿勢に限られることを示した。姿勢が崩れると平面法は理論的根拠を失う。②力ベースRCはタイヤ力に依存するので『設計パラメータ』ではなく『結果』。設計変数として直接指定できない。③実験的に力ベースRCを取るには接地点の6分力とサス反力の同時計測が必要で、FSAEには手が届かない。④スクリュー理論の記述は数学的に厳密だが、そのままセットアップ指針にはならない。
- 学生フォーミュラでの実行可能性: 実行は困難。しかし『なぜ幾何RCを信じてはいけないか』の理論的根拠として本書の限界と適用範囲の節に必要。学生には概念と結論（平面法の妥当範囲、力ベースRCは結果であること）を教え、計算はSimscape Multibodyで各ジョイント反力を取り出して力の流れを可視化することで代替する。
- MATLAB実装経路: 既製Toolboxなし、自作。6次元ツイスト／レンチの演算はMATLABの行列演算で直接書ける。Simscape Multibody の各ジョイントで拘束力（Constraint Force）を出力させ、シャシに作用する合力の作用線を求めれば、力ベースRC相当を数値的に得られる。これは第III部の妥当性判断基準（幾何RCと力ベースRCがどれだけ乖離しているか）を定量化する実習になる。

### 実務でよく起きる誤り

- ロールセンタを「車体が実際にその点まわりに回る点」だと思い込む。Rouelle（OptimumG, Rolling About, 2024-01-29）は「ばね上質量は運動学的ロール軸まわりに回転しない」と明言している。実際の回転中心は慣性・タイヤ縦剛性・サス剛性で決まる別物で、幾何RCとは一致しない。
- 幾何（運動学的）RCと力ベースRCを混同する。両者はSAEの定義上も別物。Mitchell（SAE 2006-01-3617）は差の主因が「5本目のリンク＝ステアリングタイロッド」を従来の作図が無視していることだと示し、バンプステアを小さくするほど両者の差が縮むと述べた。裏を返せば、バンプステアが大きい設計ではKRCの数値そのものが信用できない。
- 「RCを上げるとジャッキングが増えるからとにかく低くしろ」という単純化。総横荷重移動量は m, a_y, 重心高, トレッドのみで決まりRC高では変わらない。RC高が変えるのは幾何／弾性の内訳と過渡応答とジャッキングであって、総量ではない。RCを下げれば弾性分が増えロール角とダンパ仕事が増える。
- 静止時のRC高だけを設計値として報告し、RC移動量（migration）を見ない。上下アームがほぼ平行だとICが遠方に飛び、微小な姿勢変化でRCが発散的に動く。FSAEの短いアームと大きなロール角では特に危険。
- LLTDをロール剛性配分だけで決められると思う。実際のLLTDは幾何項（RC高／トレッド）＋弾性項（ロール剛性配分）＋非ばね上項の和で、ARBだけ回しても幾何項は動かない。セットアップの効き幅を過大評価する原因になる。
- シャシねじり剛性を無視してLLTDを設計する。Deakinら（SAE 2000-01-3554）が示すとおり、ねじり剛性が前後ロール剛性の合計に対して十分大きくないと設計したLLTDが実現せず、ARB調整の効きも鈍る。軽量スペースフレームのFSAEでは絵に描いた餅になりやすい。
- モーションレシオの定義の取り違え。MR＝ホイール変位／スプリング変位か、その逆かが文献で両方使われる。ホイールレートはばねレートに変位比の二乗を掛ける／割るので、二乗を忘れる、あるいは逆数を掛けるミスが頻発する。さらにプッシュロッド角・ベルクランク比は変位とともに変わるためMRは定数ではない。
- MRをライドレート合わせにだけ使い、ダンパ速度域を確認しない。MRが小さいとダンパ速度がその分圧縮され、市販ダンパの有効減衰レンジから外れる。FSAEの小径タイヤ・短ストロークで顕著。
- アンチダイブとアンチスクワットを前後独立に設計する。Rouelle（OptimumG, The anti-antis, 2024-03-18）は両者がピッチセンタを通じて連成しており、片方だけ設計すると重大なハンドリング問題を招くと指摘する。
- アンチジオメトリがブレーキ配分・駆動方式の関数であることを忘れる。バランスバーを回した瞬間に実効anti率が変わる。またアウトボードブレーキとインボードブレーキで式が変わる。anti 100%はサスの動きを止めて接地荷重変動の吸収とダンパによる減衰制御を失う。
- コンプライアンスを「ゴムブッシュだけ」と考える。FSAEはロッドエンド主体でブッシュ剛性は高いが、Aアーム自体の曲げ、アップライトの変形、シャシタブ、ステアリングラック取付、そしてタイヤ自身の横剛性が効く。タイヤの横コンプライアンスはサス側より大きいことがある。
- K&Cモデルの線形重ね合わせを無条件に信じる。運動学効果とコンプライアンス効果の加算は準静的・小振幅の近似であり、大振幅では成立しない。ゴムブッシュは周波数・振幅依存（Payne効果）で、準静的勾配では過渡が合わない。
- ブロック名から実装内容を推測する。Vehicle Dynamics Blockset の Independent Suspension - Double Wishbone ブロックは名前に反してリンク幾何を解いていない。実体は線形ばね・ダンパ＋キャンバ／キャスタ／トーの線形勾配で、公式ドキュメントも「サス要素に質量が無い」「垂直方向の動特性を線形ばね・ダンパでモデル化する」と明記している。ハードポイント座標を入れる場所は無い。
- 座標系の取り違え。ISO 8855（x前方・y左・z上）とSAE J670e（y右・z下）でRC高・キャンバ・トー・ジャッキングの符号が反転する。ADAMS/Car、OptimumKinematics、Lotus等の外部ツールとMATLABの間でデータをやり取りするときに事故になる。
- 3D運動学にすればロールセンタ批判が解消すると思う。3Dで解いても得られるのは幾何RCであり、力ベースRCとは依然一致しない。次元を上げても仮定（左右横力が等しい）は消えない。
- LLTDそのものを目的化する。LLTDはタイヤの荷重感度（コーナリング剛性の非線形性）を通じてバランスに効く手段であり、タイヤモデル無しにLLTDだけ最適化しても意味がない。第II部タイヤ①〜⑤と併せて教える必要がある。
- 低品質ジャーナルのFSAEサスペンション論文を鵜呑みにする。「Formula Student suspension design」を冠した論文の一部は査読が実質的に無い媒体に掲載され、同じ図表と未検証の設計指針（例：特定のRC高やキャンバ値）を再生産している。SAE Technical Paper、大学の学位論文、Procedia等の査読誌を優先し、必ず一次の力学に立ち返って検算する。
- 動的（多体）モデルを作れば正しくなると思う。モデルが複雑になるほど合わせ込める自由度が増え、間違ったパラメータで正しい応答を出せてしまう。慣性諸元・剛性・タイヤ係数の実測（第III部）とセットでなければ多体モデルは信用できない。

### 学生フォーミュラ固有の事情

FSAE車はホイールベース約1.5〜1.6 m、トレッド約1.2 m、タイヤ外径10〜13インチ（数値は概数。ルール上の最小ホイールベース等は各年版の規則を要確認）と市販車の約半分で、ダブルウィッシュボーンのアーム長も短い。結果として (1) ICが近くRCがロール・ヒーブで激しく移動する、(2) 小径ホイール内側の限られた空間にアッパアームを収める制約でジオメトリの自由度が小さい、(3) スクラブ半径・キングピン軸の許容幅が狭い。ばね／ダンパはプッシュロッド／プルロッド＋ベルクランクで内側配置が主流で、モーションレシオは姿勢の関数になり、ダンパ速度域がMR倍に圧縮される（MR=0.5ならダンパ速度は半分）——小径タイヤ・短ストロークと相まって市販ダンパの有効レンジから外れやすく、ダンパ選定の失敗要因になる。ブッシュではなくロッドエンド（球面軸受）を使うためゴムのコンプライアンスは小さいが、代わりにガタ（free play）とAアーム自体の曲げ・シャシタブ変形が効く。K&C試験機は無い（SAE 970096 が記述する商用設備は桁違いに高額）ので、コンプライアンスはFEA合成か簡易静的リグ、あるいはMATLABのK&C仮想試験ラボで代替するしかない。一方でシャシねじり剛性試験は治具が単純なのでFSAEでも実測が普通に行われており、Deakinら（SAE 2000-01-3554）の指摘——ねじり剛性が前後ロール剛性の合計に対して十分でないとLLTD設計が実現せずARBの効きも鈍る——は軽量スペースフレームのFSAEでこそ直接効く。速度域は低く（スキッドパッドで概ね1.2〜1.6 g、チーム・タイヤによる）、ダウンフォースは低速のため絶対値が小さく、ジャッキングによる車高変化の空力影響はF1等より小さいが、サスの動作点変化としては効く。デザインイベントでは「なぜそのRC高／anti率／LLTDなのか」を力学で説明できることが問われるため、数値そのものより導出と限界の理解が評価対象になる。MATLAB/SimulinkはMathWorksのFSAE支援ライセンスで入手できるが、Simscape Multibody・Vehicle Dynamics Blockset・Model-Based Calibration Toolbox が含まれるかは年度・地域で異なるため要確認。TTCタイヤデータは加入チームなら入手できキャンバ目標やLLTD設計の荷重感度の根拠になるが、荷重レンジ・キャンバレンジが自チームの車重・目標キャンバに合致しているかの確認が必要。

### 参照文献

- **William F. Milliken, Douglas L. Milliken, "Race Car Vehicle Dynamics", SAE International (R-146), Warrendale PA, 1995, 890pp, ISBN 1-56091-526-9 (LCCN 94036941 / OCLC 31288484)**
  - 種別: 書籍 / 入手性: 有料（SAE書店・一般書店）。多くの工学系大学図書館に所蔵あり
  - https://openlibrary.org/isbn/1560915269
  - 用途: 本領域の正典。「Ride and Roll Rates」「Suspension Geometry」「Wheel Loads」の各章が第II部サスペンション①〜③の骨格になる。荷重移動の幾何／弾性分解、RC作図法、アンチジオメトリ、モーションレシオの標準的定義はここから引く。注意：今回の調査では章番号について矛盾する情報しか得られなかったため、本文で章番号を引用する際は実物で確認すること（書誌情報・出版社・年・ISBNは確認済み）。
- **Wm. C. Mitchell (Wm. C. Mitchell Software), "Force-Based Roll Centers and an Improved Kinematic Roll Center", SAE Technical Paper 2006-01-3617, Motorsports Engineering Conference & Exposition, Dearborn MI, 2006-12-05**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学のSAE契約経由で入手可
  - https://doi.org/10.4271/2006-01-3617
  - 用途: 第II部サスペンション①の「ロールセンタ批判」節の中核。力ベースRCと運動学的RCの差の主因が、従来の作図が無視してきた5本目のリンク（ステアリングタイロッド）にあることを示し、バンプステアを小さくすると両者の差が縮むと結論する。「いつRCの数字を信じてはいけないか」の定量的根拠になる。
- **M. B. Gerrard (Randle Engineering Solutions Ltd., Warwick), "Roll Centres and Jacking Forces in Independent Suspensions - A First Principles Explanation and a Designer's Toolkit", SAE Technical Paper 1999-01-0046, 1999-03-01 (SAE SP-1438, pp.81-92)**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約経由
  - https://doi.org/10.4271/1999-01-0046
  - 用途: ジャッキング力を第一原理から導く。左右タイヤ横力が不等であることがジャッキングの実体であるという、RC作図法の前提が崩れる理由を示す。第II部サスペンション②「荷重移動」の幾何項の説明に使う。
- **J. K. Lee, J. K. Shim, "Validity and limitations of the kinematic roll center concept from the viewpoint of spatial kinematics using screw theory", International Journal of Automotive Technology, Vol.12, No.5, pp.769-775, 2011**
  - 種別: 論文 / 入手性: 有料（Springer）。大学経由
  - https://doi.org/10.1007/s12239-011-0089-6
  - 用途: ロール軸を瞬間スクリュー軸（roll twist axis）として厳密に定義し、従来の平面作図法が正当化されるのは左右対称の初期姿勢に限られることを示す。第II部サスペンション①の「限界と適用範囲」節における最も強い理論的根拠。研究最前線階層の代表文献。
- **Jae Kil Lee, J. Shim, "Application of Screw Theory to the Analysis of Instant Screw Axis of Vehicle Suspension System", International Journal of Automotive Technology, 2011年論文の続編, 2019**
  - 種別: 論文 / 入手性: 有料（Springer）。大学経由
  - https://doi.org/10.1007/s12239-019-0013-z
  - 用途: 上記2011年論文のスクリュー理論的枠組みをサスペンション機構の瞬間スクリュー軸解析に拡張したもの。3D運動学階層から研究最前線階層への橋渡しとして紹介する。注意：DOIとタイトル・著者・年・掲載誌はSemantic Scholar経由で確認したが、巻号・ページは未確認。
- **Madhusudan Raghavan (GM R&D Center), "Suspension Synthesis for N:1 Roll Center Motion", Journal of Mechanical Design (ASME), 2005（オンライン公開 2004-07-29）。会議版: ASME DETC 2003, DAC-48810**
  - 種別: 論文 / 入手性: 有料（ASME Digital Collection）。大学経由
  - https://doi.org/10.1115/1.1867500
  - 用途: RCの運動そのものを指定してリンク寸法を逆算する寸法合成の例。「RC高をいくつにするか」ではなく「RCをどう動かすか」を設計変数にする発想を示し、研究最前線階層の具体例になる。会議版DOIは 10.1115/detc2003/dac-48810。
- **Tony Best, Steve J. Neads (Anthony Best Dynamics), John P. Whitehead, Ian R. Willows (MIRA), "Design and Operation of a New Vehicle Suspension Kinematics and Compliance Facility", SAE Technical Paper 970096, 1997-02-24**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由
  - https://doi.org/10.4271/970096
  - 用途: K&C試験機とは何を測る装置なのかの一次資料。四輪ステーションで準静的にサス・ステアリング系のK&C特性を測る設備で、初号機は1996年1月にMIRA（英国）に設置された。第II部サスペンション③および第III部（同定）で「実務ではこう測る／FSAEには無い」を対比させるために使う。
- **Phillip Morse (Morse Measurements, LLC), "Using K&C Measurements for Practical Suspension Tuning and Development", SAE Technical Paper 2004-01-3547, Motorsports Engineering Conference & Exposition, Dearborn MI, 2004-11-30**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由
  - https://doi.org/10.4271/2004-01-3547
  - 用途: K&C測定値を実際のセットアップ・開発にどう使うかの実務側の記述。第II部サスペンション③と第IV部セットアップ感度解析の橋渡しに使う。
- **Andrew Deakin, David Crolla, Juan Pablo Ramirez, Ray Hanley (University of Leeds), "The Effect of Chassis Stiffness on Race Car Handling Balance", SAE Technical Paper 2000-01-3554, Motorsports Engineering Conference & Exposition, Dearborn MI, 2000-11-13**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由
  - https://doi.org/10.4271/2000-01-3554
  - 用途: シャシねじり剛性が不足するとLLTD設計が実現せずレースエンジニアのバランス調整能力が失われることを準静的解析と動的シミュレーションの両方で示す。第II部サスペンション②の「LLTDが成立する条件」節の中核であり、軽量フレームのFSAEに直接効く。
- **M. Azman, H. Rahnejat, P. D. King (Loughborough University), T. J. Gordon (UMTRI), "Influence of anti-dive and anti-squat geometry in combined vehicle bounce and pitch dynamics", Proceedings of the Institution of Mechanical Engineers, Part K: Journal of Multi-body Dynamics, Vol.218, No.4, pp.231-242, 2004**
  - 種別: 論文 / 入手性: 有料（SAGE）。大学経由
  - https://doi.org/10.1243/1464419043541464
  - 用途: アンチダイブ／アンチスクワットをバウンス・ピッチ連成の6自由度多体モデルで扱い、実測と照合した査読論文。静的anti率から予測される挙動と実挙動のずれを示す、第II部サスペンション①のアンチジオメトリ節の学術的裏付け。
- **Daniel Lindvai-Soos (Magna Steyr), Martin Horn (Graz University of Technology), "New level of vehicle comfort and vehicle stability via utilisation of the suspensions anti-dive and anti-squat geometry", Vehicle System Dynamics, 2017-10-02**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由
  - https://doi.org/10.1080/00423114.2017.1378818
  - 用途: アンチジオメトリを快適性と安定性の両立という観点から扱う近年の査読論文。レース専用の視点だけでなく、アンチ設計のトレードオフを一般化して示すのに使う。
- **Edmund F. Gaffney, Anthony R. Salinas (University of Missouri-Rolla), "Introduction to Formula SAE® Suspension and Frame Design", SAE Technical Paper 971584, 1997-04-07**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由。FSAE参加校では入手しやすい
  - https://doi.org/10.4271/971584
  - 用途: FSAEサスペンション設計の古典的入門論文。学生チームが実際に何をどの順で決めるかの標準的な流れを示す。第II部の各章の「学生フォーミュラへの応用」節の出発点になる。
- **Badih A. Jawad, Jason Baumann (Lawrence Technological University), "Design of Formula SAE Suspension", SAE Technical Paper 2002-01-3310, 2002-12-02**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由
  - https://doi.org/10.4271/2002-01-3310
  - 用途: 2002年のLTU車両を題材にFSAEのサスペンション幾何と部品設計を具体的な数値とともに示す。学生が自チームの設計判断を比較する対象として使える。姉妹論文 SAE 2002-01-3308（Jawad & Polega, Design of Formula SAE Suspension Components, DOI 10.4271/2002-01-3308）は部品設計側。
- **Gabriel de Paula Eduardo, "Formula SAE Suspension Design", SAE Technical Paper 2005-01-3994, SAE Brasil 2005 Congress and Exhibit, São Paulo, 2005-11-22**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学経由
  - https://doi.org/10.4271/2005-01-3994
  - 用途: タイヤ挙動・サス幾何・車両運動を多体モデルで一貫して扱ったFSAE向け論文。第II部統合章（非線形4輪モデル）へつなぐFSAE事例として使う。
- **S. Chepkasov, G. Markin, A. Akulova, "Suspension Kinematics Study of the 'Formula SAE' Sports Car", Procedia Engineering, Vol.150, pp.1280-1286, 2016**
  - 種別: 論文 / 入手性: オープンアクセス（CC BY-NC-ND 4.0、Elsevier ScienceDirect）
  - https://doi.org/10.1016/j.proeng.2016.07.288
  - 用途: FSAE車のサス運動学を扱った査読論文でオープンアクセス（CC BY-NC-ND 4.0）。学生が費用ゼロで読める数少ないFSAEサス運動学文献であり、第II部サスペンション①の演習の題材にできる。
- **Y. Samant Saurabh, Santosh Kumar, Kaushal Kamal Jain, Sudhanshu Kumar Behera, Dhiraj Gandhi, Sivapuram Raghavendra, Karuna Kalita, "Design of Suspension System for Formula Student Race Car", Procedia Engineering, Vol.144, pp.1138-1149, 2016**
  - 種別: 論文 / 入手性: オープンアクセス（Elsevier ScienceDirect）
  - https://doi.org/10.1016/j.proeng.2016.05.081
  - 用途: プッシュロッド作動ダブルウィッシュボーンの選定理由とモーションレシオの扱いを含むFSAE設計論文でオープンアクセス。モーションレシオが姿勢の関数であること（progressive/digressive）を学生に示す事例として使える。
- **N. Ikhsan, R. Ramli, A. Alias, "Analysis of the Kinematics and Compliance of a Passive Suspension System Using Adams Car", Journal of Mechanical Engineering and Sciences, Vol.8, pp.1293-1301, 2015**
  - 種別: 論文 / 入手性: オープンアクセス（CC BY 4.0）
  - https://doi.org/10.15282/jmes.8.2015.4.0126
  - 用途: K&C解析をADAMS/Carで行う具体手順を示すオープンアクセス論文。マルチボディ階層で「K&C試験を仮想的に走らせる」とはどういう作業かを、学生が無料で読める形で示せる。
- **Gurur Ağakişi, Ferruh Özturk, "Kinematics & Compliance Validation of a Vehicle Suspension and Steering Kinematics Optimization Using Neural Networks", Mechanics (Kaunas University of Technology), 2023-06-17**
  - 種別: 論文 / 入手性: オープンアクセス（KTU、Mechanics誌）
  - https://doi.org/10.5755/j02.mech.31983
  - 用途: K&Cモデルの検証とサス・ステアリング運動学の最適化を扱う近年の論文。第III部（妥当性判断基準）と第IV部（感度解析）でK&Cモデルをどう検証するかの近年例として引く。
- **John C. Dixon, "Suspension Geometry and Computation", John Wiley & Sons, 2009, ISBN 978-0-470-51021-6（電子版 ISBN 978-0-470-68289-0 / 978-0-470-68290-6）**
  - 種別: 書籍 / 入手性: 有料（Wiley）。大学図書館所蔵あり
  - 用途: サスペンション幾何を計算として定式化した数少ない教科書。3D運動学階層（ハードポイントからの拘束方程式）を自作するときの数学的な下敷きになる。Millikenが概念と実務、Dixonが計算手順という役割分担で第II部サスペンション①を構成できる。
- **Michael Blundell, Damian Harty, "The Multibody Systems Approach to Vehicle Dynamics", Butterworth-Heinemann / Elsevier, 初版2004, ISBN 0-7506-5112-1（SAE版 ISBN 0-7680-1496-4。後年に第2版あり、刊行年は未確認）**
  - 種別: 書籍 / 入手性: 有料。大学図書館所蔵あり。Internet Archiveに貸出可能な電子版あり
  - 用途: マルチボディ階層の標準教科書。剛体多体系の定式化、拘束、サスペンションのモデル化、そして「多体モデルをいつ信じてよいか」の議論が第II部統合章と第VI部（実装と検証）の理論的土台になる。
- **Thomas D. Gillespie, "Fundamentals of Vehicle Dynamics", SAE International, 1992, ISBN 1-56091-199-9（Revised Edition, 2021, ISBN 978-1-4686-0176-3）**
  - 種別: 書籍 / 入手性: 有料（SAE）。大学図書館所蔵が多い
  - 用途: 荷重移動、アンチダイブ／アンチスクワット、ロール剛性の教科書的定義を最も平易に与える。第I部から第II部への橋渡しと、学生が最初に読む参考書として推奨する。
- **Claude Rouelle, "Rolling About", OptimumG（技術記事）, 2024-01-29**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料公開）
  - https://optimumg.com/rolling-about/
  - 用途: 「ばね上質量は運動学的ロール軸まわりに回転しない」ことを明言し、総荷重移動が一定である一方で幾何／弾性の内訳が入れ替わること、ジャッキングにより1〜10 mmの車高変化が生じ空力に影響することを示す。第II部サスペンション①②の批判節で最も学生に読ませやすい一次資料。
- **Claude Rouelle, "The anti-antis", OptimumG（技術記事）, 2024-03-18**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料公開）
  - https://optimumg.com/the-anti-antis/
  - 用途: 前アンチダイブと後アンチスクワットをピッチセンタで統合的に扱うべきこと、アウトボード／インボードブレーキで式が変わることを示す。前後を独立設計する誤りを正す節の一次資料。
- **MathWorks, "Kinematics and Compliance Virtual Test Laboratory", Vehicle Dynamics Blockset ドキュメント（起動コマンド vdynblksKandCTestLabStart）** ✓実在確認（訂正: ページ実取得で確認。タイトルは記載どおり完全一致。**起動コマンド vdynblksKandCTestLabStart も本文中に明記されていることを確認**（"To create and open a working copy of the K and C virtual test laboratory reference application, enter vdynblksKandCTestLabStart"）。リスト記載は完全に正確。訂正不要。第III部（同定と検証）で K&C を仮想試験する再現手順として、そのまま学生が実行できる。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ドキュメントは無料閲覧、実行にはライセンス要）
  - https://www.mathworks.com/help/vdynblks/ug/kinematics-and-compliance-virtual-test-laboratory.html
  - 用途: K&C試験機を持たないFSAEチームが取るべき正規ワークフローそのもの。Simscape MultibodyモデルをSobol列DOE＋0.1〜2 Hzチャープで加振し、Model-Based Calibration Toolboxでキャンバ角・トー角・上下力の応答曲面を同定して Independent Suspension - Mapped ブロックに流し込む。第II部サスペンション③の実習の骨格になる。
- **MathWorks, "Independent Suspension - K and C" ブロックリファレンス, Vehicle Dynamics Blockset** ✓実在確認（訂正: ページ実取得で確認。正式タイトルは "Independent Suspension - K and C - Independent kinematics and compliance test suspension"、Vehicle Dynamics Blockset の Suspension カテゴリ。2軸・各軸2輪の独立懸架4輪をまとめてモデル化し、FWD/RWD/AWD に対応。訂正不要。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ドキュメント無料閲覧）
  - https://www.mathworks.com/help/vdynblks/ref/independentsuspensionkandc.html
  - 用途: K&C階層の「線形重ね合わせ」という仮定が製品にどう実装されているかの一次資料。運動学（bounce/roll/steering）とコンプライアンス（前後力・横力・アライニングトルク）の効果を加算すると明記され、CPSA/SVSAの式 tan(θ)=f(Zw), Fz=Fy·tan(θ_CPSA) も示される。パラメータ名（BumpSteer, LatSteerCompl 等）がそのまま実測項目のチェックリストになる。
- **MathWorks, "Independent Suspension - Double Wishbone" ブロックリファレンス, Vehicle Dynamics Blockset** ✓実在確認（訂正: ページ実取得で確認。タイトル "Independent Suspension - Double Wishbone"、Vehicle Dynamics Blockset。**このブロックは Z-down 座標系（SAE J670e 系）で定式化されている**点をドキュメントが明示しており、本教科書が ISO 8855（z 上）を採用する方針との差異を必ず注記すること（符号の取り違えは学生が最も踏む地雷）。訂正不要。）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ドキュメント無料閲覧）
  - https://www.mathworks.com/help/vdynblks/ref/independentsuspensiondoublewishbone.html
  - 用途: 「ブロック名から実装内容を推測してはいけない」の実例。名前はダブルウィッシュボーンだが、実体は線形ばね・ダンパ＋キャンバ／キャスタ／トーの線形勾配であり、リンク幾何を解いていない。公式に「サス要素に質量が無い」「垂直方向の動特性を線形ばね・ダンパでモデル化」と明記されている。第VI部の実装章でも再引用する。
- **MathWorks, Simscape Multibody 自動車系サンプル一覧（openExample('sm/DoubleWishboneExample'), openExample('sm/VehicleSuspensionTemplatesExample'), openExample('sm/FourPostTestrigExample')）**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ドキュメント無料閲覧、実行にはライセンス要）
  - https://www.mathworks.com/help/sm/sm-automotive.html
  - 用途: 3D運動学およびマルチボディ階層の実装の出発点。ダブルウィッシュボーン／ストラット／プッシュロッドのテンプレートと四柱加振リグが揃っており、FSAEチームが自車ハードポイントを差し替えるだけで始められる。
- **MathWorks, "Simscape Vehicle Templates"（GitHub リポジトリ, Copyright 2018-2026 The MathWorks, Inc., R2022a以降）**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（GitHubで無料入手、実行にはMATLAB/Simulink/Simscapeライセンス要）
  - https://github.com/mathworks/Simscape-Vehicle-Templates
  - 用途: プッシュロッド／プルロッドを含む多数のサスペンション形式（ダブルウィッシュボーン、マクファーソン、5リンク、ルックアップテーブル型キネマティクスサス、Panhard/Wattsリンク付きソリッドアクスル等）と、クォータ／ハーフ／フルカーのテストリグを収録。FSAEのプッシュロッド構成をそのまま組める、マルチボディ階層の最短経路。sm_car.slx / sm_car_proj.prj。
- **Oliver Christian Morton Manhire, "Suspension geometry design of the 2001 University of Queensland Formula SAE-A racecar", University of Queensland（学位論文、刊行年は未確認）**
  - 種別: 学位論文 / 入手性: UQ eSpace経由（多くはオープンアクセス）
  - https://doi.org/10.14264/303145
  - 用途: FSAE車のサスペンション幾何設計を1台分通して記述した学位論文。学生が「設計レポートとはどこまで書くものか」を測る基準として使える。姉妹論文 Peter John Maria, "Suspension component design for formula SAE", University of Queensland（DOI 10.14264/303195）は部品設計側。注意：DOI・タイトル・著者・機関はCrossrefで確認したが、刊行年は未確認。

---

## ブレーキと駆動系（第17-18章 ブレーキ①②、第21-22章 エンジン①②／駆動系、および第23章 統合非線形4輪モデルへの入力）

### モデル階層

**[入門] [ブレーキ①] 理想制動力配分曲線と固定バランスバー直線（準静的・剛体）**

- 仮定・成立条件: 剛体車両・準静的（ピッチ動特性なし）。タイヤは `F_x = μ·F_z` の単純クーロン則で、μ は荷重・温度・スリップ率に依存しない。空力ダウンフォースゼロ。直進制動・左右対称。パッド μ 一定、ローター有効半径一定、油圧は瞬時に立つ。軸荷重は `F_zf = W·(b + h·(a_x/g))/L`、`F_zr = W·(a − h·(a_x/g))/L`。前後同時ロック条件が理想配分曲線（放物線）。実車のバランスバー配分は原点を通る直線で、その傾きは（バー比）×（前後マスターシリンダ断面積比）×（キャリパピストン面積比）×（ローター有効半径比）×（パッド μ 比）の積。
- 破綻条件（次の階層へ進むべき時）: (1) 直線は曲線に一点でしか接せない。したがって設計減速度以外では必ずどちらかの軸が先にロックする。「理想曲線に合わせる」ことは原理的に不可能で、どの a_x で交差させるかという設計判断に還元される — この誤解が最も多い。(2) タイヤの荷重感度（F_z 増で μ が低下）を無視しているため、理想曲線そのものが実タイヤでは正しくない。(3) 旋回中制動・複合スリップ・左右差を扱えない。→ 荷重感度つきタイヤ特性か実測 μ が必要になった時点で次の階層へ。
- 学生フォーミュラでの実行可能性: 使える。設計初期に必須。FS-Rules 2026 IN 11.1.1（ブレーキテストで4輪同時ロック、CVはエンスト不可）を満たすマスターシリンダ径・ローター径・キャリパ選定の根拠がここ。ただし「4輪ロックできる＝バランスが最適」ではない。ロックさせるだけならMC径を細くすれば済む。競技で効くのはロック直前の制動力最大化であり、車検合格と性能は別物。
- MATLAB実装経路: Toolbox不要。MATLABスクリプトで理想曲線と配分直線を重ね書き（plot）。Symbolic Math Toolbox があれば同時ロック条件の解析解を出せる。関数は完全自作でよく、むしろ自作すべき階層。

**[実用] [ブレーキ②] 荷重移動を含む動的配分と制動効率（adhesion utilisation / braking efficiency）**

- 仮定・成立条件: 準静的荷重移動を保持しつつ、路面 μ をパラメータとして走査する。制動効率 `η = a_x / (g·μ)` を μ に対してプロットし、どの μ 域でどちらの軸が先にロックするかを判定する。空力を入れる場合は速度依存の F_z を加算（FSAEでは寄与小）。ECE R13 / FMVSS の adhesion utilisation の考え方と同じ枠組み。
- 破綻条件（次の階層へ進むべき時）: (1) ピッチ動特性（サスペンションのばね・ダンパ、アンチダイブ）を無視するため、制動立ち上がりの 0.1〜0.3 s で実際に起きる荷重移動の遅れを再現できない。ターンイン直後の挙動は出ない。(2) パッド μ の温度依存を無視するのでフェードが原理的に表現できない。(3) 縦横複合不可。→ 過渡ピッチや旋回制動なら第23章の4輪モデルへ、フェードなら熱モデルへ。
- 学生フォーミュラでの実行可能性: 使える。バランスバー調整の実務は本質的にこの階層。手順は (a) 設計 μ を 1.2〜1.6 の範囲で走査、(b) ドライ／ウェット双方で先ロック軸を確認、(c) 実走でロック順をデータ（ホイール速度）と目視で確認し、バー比を1ノッチずつ動かす。フロント先ロックに寄せるのが安全側（リヤ先ロックはスピン）。
- MATLAB実装経路: MATLABスクリプト。Simulinkで組むなら Vehicle Dynamics Blockset の `Longitudinal Wheel`（Brake type: Disc、`T = μ·P·π·B_a²·R_m·N_pads / 4`）＋ `Vehicle Body 3DOF`。Toolboxが無くても自作関数で十分に足りる。

**[実務標準] [ブレーキ③] ホイールスリップを含む制動（ホイール回転動力学＋縦Magic Formula）**

- 仮定・成立条件: 各輪で `J·ω̇ = T_axle − T_brake + T_tire`、スリップ率 κ を定義し、縦力は Magic Formula（純縦すべり）または実測マップ。タイヤ緩和長による1次遅れを付ける。制動トルクは油圧から静的に決まる（配管コンプライアンス・パッド圧縮を無視）。
- 破綻条件（次の階層へ進むべき時）: (1) ロックアップ後（κ→−1）は MF の外挿域に入り信頼できない。ロック中の挙動を論じる用途には使ってはならない。(2) 旋回中制動は複合スリップが必須で、この階層では扱えない。(3) 緩和長を入れないと 15 Hz 以上のホイール振動が非物理的に速くなり、ABS/TC の制御帯域の議論が破綻する。(4) 数値剛性：ホイール慣性 J が小さくスリップ剛性が高いと固定ステップソルバで発散する。→ 第VI部の離散化・リアルタイム章の題材に直結。
- 学生フォーミュラでの実行可能性: 使える。ただし品質は縦力の実測データを持っているかで決まる。TTC（Tire Test Consortium）には FX データセットが含まれるが、多くのチームは横力データしか整備しておらず、結果としてブレーキ／トラクション側のタイヤモデルが手薄になりがち。ここは学生チームの典型的な穴。
- MATLAB実装経路: Vehicle Dynamics Blockset `Longitudinal Wheel`（Magic Formula pure longitudinal slip / Mapped force、転がり抵抗5方式、Brake type: None/Disc/Drum/Mapped）。教育用の下地として Simulink 標準例 `sldemo_absbrake`（1輪＋μ-slip 曲線）。Simscape Driveline `Tire (Magic Formula)`。

**[実務標準] [ブレーキ④] ローター熱モデル（集中容量）とパッド μ(T) によるフェード**

- 仮定・成立条件: ローターを等温の集中容量とみなす（Biot数 ≪ 1）。`m·c_p·dT/dt = Q_in − h·A·(T − T_amb) − ε·σ·A·(T⁴ − T_amb⁴)`。入熱は `Q_in = ζ·T_brake·ω`（ζ はローター側への配分率、鋼ローター＋有機パッドで概ね 0.85〜0.95）。h は車速の経験式（強制対流）。フェードは μ_pad = f(T) の1次元ルックアップで表現する。
- 破綻条件（次の階層へ進むべき時）: (1) h が最大の不確かさ源。ダクトの有無・ホイール内流れ場で数倍変わる。**実測なしに絶対温度を信じてはいけない**（セットアップ間の相対比較・順位づけには使える）。(2) 面内温度勾配（ホットスポット、コーニング、熱亀裂）は原理的に表現できない。(3) パッド背面・キャリパ・ブレーキ液温度を追わないと vapour lock（ペダルが床まで抜ける）が予測できず、フェードの本当に危険な形態を見落とす。(4) 厚肉ローターや急制動では Biot数が大きくなり等温仮定が崩れる。→ 面内勾配・熱応力が要るなら FEA、h を作るなら CFD。
- 学生フォーミュラでの実行可能性: 使える。エンデュランス（約22 km、ドライバ交代あり）で意味を持つ。ただし h の同定にはサーモカップルかサーモペイント／サーモクレヨンによる実測が要る。学生の最初の一歩は「サーモペイントを塗ってオートクロス1本走らせ、到達温度から集中容量モデルの h を逆算する」— これで絶対値がやっと使えるようになる。
- MATLAB実装経路: Simscape Driveline `Disc Brake`（Brakes & Detents / Rotational。`T = μ_k·P·π·D_b²·R_m·N/4`、平均パッド半径 `R_m = (R_o+R_i)/2`。Thermal Port を Model にすると熱ポート＋Thermal mass＋温度依存摩擦のルックアップが使える）。Simscape の Thermal ドメインで対流・熱容量を明示的に組んでもよい。Toolboxが無ければ Simulink の1次ODE＋1-D Lookup Table で自作可能で、むしろ教科書としては自作を薦めるべき階層。

**[研究最前線] [ブレーキ⑤] 3D FEA / 共役熱伝達CFDによるローター温度場**

- 仮定・成立条件: 3次元非定常熱伝導。対流境界はCFDまたは実験相関から与える。制動デューティサイクルは QSS ラップシムから供給する。
- 破綻条件（次の階層へ進むべき時）: 計算コストが桁違いで、ラップシムや制御設計のループには入れられない。境界条件（h の空間分布、ローター／パッドへの入熱分配、接触圧分布）の不確かさが解の精度を支配するため、「メッシュを細かくすれば正しくなる」は誤り。メッシュ収束は数値誤差の収束であって物理の正しさではない。
- 学生フォーミュラでの実行可能性: **知る価値はあるが、ラップタイムシミュレーションには実行できない。** 設計検証としては学生でも実行可能（SolidWorks Simulation / Ansys）。Otkur (2024, JFFHMT) は FSAE ローターで106ケースの熱シミュレーションを回し、DOEベースで最大温度を許容限界以下に下げた実例で、規模感の参考になる。
- MATLAB実装経路: MATLAB外（Ansys / STAR-CCM+ / SolidWorks Simulation）。MATLAB側は制動デューティサイクル生成とDOE／最適化ドライバとして使う（Optimization Toolbox、Statistics and Machine Learning Toolbox の実験計画）。1D/2D熱伝導であれば Partial Differential Equation Toolbox で MATLAB 内完結も可能。

**[研究最前線] [ブレーキ⑥] ABS的スリップ率制御（bang-bang → スライディングモード → MPC）**

- 仮定・成立条件: 目標スリップ率 κ* が既知、実スリップ率が観測できる、油圧モジュレータが十分速い（10〜20 Hz 級）。
- 破綻条件（次の階層へ進むべき時）: (1) **スリップ率は直接測れない。** 車速推定（4輪速＋縦加速度＋EKF）が必要で、4輪同時ロック時には推定の基準が消えて破綻する。(2) μ が未知かつ走行中に変動する。(3) MathWorks 自身が `sldemo_absbrake` のドキュメントで「実車ではスリップを直接測れないためこの制御則は実用的でない。概念構成を示すための例である」と明記している — 教科書の「モデルをいつ信じてはいけないか」の格好の教材。→ 第V部（可観測性・EKF）と直結する。
- 学生フォーミュラでの実行可能性: **知る価値はあるが、実行できない。** FS-Rules 2026 T 6.1 が「Brake-by-wire systems are prohibited in manual mode」と規定。油圧モジュレータを追加する形なら理屈上は不可能ではないが、2系統独立回路（T 6.1.3）、BOTS が全バランスバー設定で機能すること（T 6.2.2）、ペダル2 kN耐力（T 6.1.12）、車検・重量・信頼性を考えると採用チームはほぼ皆無。第V部・第34章（センサと可観測性）の題材としては非常に優秀。
- MATLAB実装経路: `sldemo_absbrake`（Simulink 標準例、bang-bang 制御）。発展は Control System Toolbox（スライディングモードは自作）、Model Predictive Control Toolbox。実装検証は SIL まで。HIL には油圧モジュレータ実機が要る。

**[入門] [駆動系①] 定常エンジントルクマップ＋固定ギヤ比（準静的トラクション）**

- 仮定・成立条件: `T_wheel = T_e(ω_e, α) · i_gear · i_final · η`、`F_x = T_wheel / r_eff`。変速は瞬時、クラッチ剛、吸気・燃焼の過渡ゼロ、マップは定常ダイナモ値。
- 破綻条件（次の階層へ進むべき時）: (1) FS-Rules CV 1.7.4 の 20 mm リストリクタ（ガソリン）／19 mm（E85）で高回転側が絞られるため、無過給カタログ値のマップをそのまま使うと出力を大幅に過大評価する。**必ず自チームのリストリクタ付きダイナモ実測を使う。** (2) 定常マップはスロットルステップ応答を過大評価する（吸気管容積・脈動効果・残留ガス）。過渡が問題になるのは特にシケイン連続区間。(3) 変速瞬時仮定の破綻（次項）。
- 学生フォーミュラでの実行可能性: 使える。第IV部ラップシムの入力そのもの。ダイナモが無いチームは 1D ガスダイナミクス（GT-Power / Ricardo WAVE）で作るか、最悪でも同型エンジンの FSAE 論文値を**出典を明記して**使い、感度解析で不確かさを可視化すること。数字を出典なしに書かないこと自体が教科書の規律に一致する。
- MATLAB実装経路: Simscape Driveline `Generic Engine`（Engines & Motors。正規化3次多項式 `P(ω)=P_p·p_N(ω_N)`／速度-トルク表／速度-出力表／トルク指令の4方式、点火型・ディーゼル・汎用で係数が異なる）。Powertrain Blockset `Mapped SI Engine`。Simulink の n-D Lookup Table で自作でも十分。

**[実用] [駆動系②] ギヤ比・最終減速比選定と加速シミュレーション**

- 仮定・成立条件: 変速時間ゼロまたは一定、タイヤは滑らない（トラクション律速でない）、駆動効率一定。
- 破綻条件（次の階層へ進むべき時）: (1) FSAE の75 m加速では2〜3回変速し、1変速あたり実測でおおむね 50〜150 ms のトルク抜けが生じる。これを無視した加速シムは必ず速すぎる結果を出す。(2) 発進はクラッチ滑りとタイヤスリップが支配的で、この階層では扱えない別問題。(3) チェーン最終減速はスプロケット歯数で離散的にしか変えられないため、連続最適化の解は必ず丸める必要があり、丸め後の再評価を怠ると机上の最適値が消える。
- 学生フォーミュラでの実行可能性: 使える。バイクエンジン流用のためギヤ比は既製で変更不可、調整自由度は最終減速（スプロケット歯数）にほぼ限られる。Biancolini (SAE 2007-01-3541) が 610 cc・20 mm リストリクタ制約下でのエンジン／車両マッチングの簡易法を提示しており、この階層の教科書的な出発点として使える。
- MATLAB実装経路: MATLABスクリプトで十分。Simulink化するなら Simscape Driveline `Simple Gear` ＋ `Variable Ratio Transmission`、あるいは Powertrain Blockset の変速機ブロック。

**[実務標準] [駆動系③] クラッチ（Karnopp摩擦、ロック／スリップ状態遷移）**

- 仮定・成立条件: 静摩擦限界 `τ_s = k_s·D·N·r_eff·P_fric·A`、動摩擦 `τ_k = μ·ω + τ_contact`、均一圧力仮定の有効半径 `r_eff = (2/3)·(R_o³−R_i³)/(R_o²−R_i²)`。均一摩耗へは de-rating 係数 `D → (3/4)·(R_o+R_i)²/(R_o²+R_o·R_i+R_i²)` で補正。ゼロ速度近傍のデッドバンドで固着を判定する（Karnopp 1985）。慣例的に μ_s > μ_k を仮定。
- 破綻条件（次の階層へ進むべき時）: (1) **μ_s > μ_k は必ずしも成り立たない。** Ingram et al. の ATF 実測では添加剤により静摩擦のほうが低くなりうる。この符号が逆転するとスティックスリップが起きるか否かの予測が真逆になる。同じ論点は LSD のクラッチパックにも及ぶ（Gadola et al. 2021 §4.3 が明示的に論じている）。(2) 温度による μ 変化を無視。(3) Karnopp モデルはゼロ速度近傍にデッドバンドを持つため、しきい値より小さい滑り速度は表現できない。しきい値を粗くすると固着が早すぎ、細かくするとソルバが重くなる — 第VI部リアルタイム化で必ず衝突する。
- 学生フォーミュラでの実行可能性: 使える。バイクエンジンは湿式多板クラッチが一体で入っている。発進のホイールスピン／エンストや、スリッパークラッチ有無によるコーナー進入の挙動を扱うなら必須。
- MATLAB実装経路: Simscape Driveline `Disc Friction Clutch`（Clutches。Geometry model: 有効半径直接指定／環状領域。Friction model: 固定／速度依存／温度依存／両方。故障モデル・熱ポート対応）。自作するなら Karnopp モデルを Simulink で組む（第VI部の離散化の題材として有益）。

**[実用] [駆動系④] 差動装置レベル0：オープンデフ と スプール（理想）**

- 仮定・成立条件: オープン：`C_m = C_1 + C_2`、`C_1 = C_2 = C_m/2`、`ω_m = (ω_1+ω_2)/2`、内部摩擦・慣性ゼロ。スプール：`ω_1 = ω_2` の運動学拘束のみで、トルク配分は左右タイヤの縦力特性（スリップ率と F_z）だけで決まる。旋回中の左右スリップ率差は運動学から `S_2 − S_1 ≈ c/R` 程度（c はトレッド、R は旋回半径）。
- 破綻条件（次の階層へ進むべき時）: (1) 実オープンデフもベベルギヤ内部摩擦で有限のロックを持つ。「理想オープン＝トルク完全等分」は近似であり、μ-split ではこの摩擦が効く。(2) **「スプールはアンダーステア」という単純化は誤り。** Gadola et al. の解析では、低横G・タイトコーナーではスプールはヨーを妨げる（US 寄与、しかも `1/R` に比例するので低速タイトほど強い）が、横荷重移動が大きくなると内外輪が別々の `F_x-κ` 曲線に乗り、ヨーモーメントが**反転してオーバーステア寄与になる**。さらに複合スリップにより外輪がより大きなスリップ角側へ移るため、RWD では OS 傾向が強まる。つまりスプールは「横G依存でバランスが変わる」デバイスで、限界付近で挙動が急変しうる。(3) オフパワーではスプールは高横Gでも反転せず常に US（安定側）に働く — オン／オフで非対称であることが本質。
- 学生フォーミュラでの実行可能性: 使える。スプールは FSAE で現実に多い選択（軽量・安価・信頼性・部品点数）。ただし最小旋回半径の小さい FSAE コースでは低速タイトコーナーでヨーを強く妨げ、内輪の接地面すべりでエネルギーを捨てる。代償はステア操舵力・タイヤ摩耗・スキッドパッドタイムに現れる。FS-Rules T 6.1 は「A single brake acting on a limited-slip differential is acceptable」を認めており、インボード単一ブレーキ構成が可能だが、T 6.1.8 により駆動系故障でブレーキを失わない保護が要る。
- MATLAB実装経路: Vehicle Dynamics Blockset / Powertrain Blockset `Open Differential`（Powertrain > Drivetrain > Final Drive Unit。効率 η（定数またはトルク・速度・温度ルックアップ）、慣性 J_d/J_w1/J_w2、粘性減衰 b、ギヤ比 N_diff）。Simscape Driveline `Differential`（Gears。ポート D/S1/S2＋熱ポート H）。スプールは `Simple Gear` ＋ 左右剛結合で表現。

**[実務標準] [駆動系⑤] トルク感応ランプ式LSD（Salisbury／Hewland Powerflow型）＋静的プリロード**

- 仮定・成立条件: ロックトルクは入力トルク比例 `C = f·C_m`。ランプ角 θ の楔作用で軸推力が立ち、Gadola et al. の式で `C = (2/3)·(C_m·cotθ / r_ramp)·((R_o³−R_i³)/(R_o²−R_i²))·n·μ_c`。オン／オフパワーで別ランプ角（例 45°/30°、60°/30°）。プリロードは皿ばねによる一定トルク P で、`Q ≤ C_m ≤ P` の低トルク域ではスプール同然に振る舞う。トルクバイアス比 `TB = C_slowerW_MAX / C_fasterW_MAX`。ピン／ランプ摩擦 μ_R と、ベベルギヤ背面の楔・歯面摩擦による追加ロックは経験定数 `k ≈ 0.08〜0.22` で補正。状態は完全ロックか完全スリップの二値。
- 破綻条件（次の階層へ進むべき時）: (1) 二値の状態判定ではスティックスリップと駆動系ねじり振動の連成を表現できない。(2) クラッチ圧分布を均一と仮定するため摩耗進行後に合わなくなる。(3) トルクバイアス図には「低入力トルクの空白域」があり、微小トルク域の実挙動は測定でしか埋まらない。(4) μ_c の値（静 0.12 / 動 0.08 程度が報告されている）は油種・面数・摩耗で変わる。**実測なしに TBR の絶対値を信じてはいけない。** (5) Dixon 等に見られる「トルク感応式はオーバーラン時にはフリーデフとして働く」という記述は誤りで、オフパワー側ランプが効くためブレーキング／ターンイン安定性に実際に寄与する（Gadola et al. が明示的に否定している）。
- 学生フォーミュラでの実行可能性: 使える（Drexler FSAE デフ等が定番）。ただしランプ角・プリロード・クラッチ面数を実際に把握し、可能ならベンチで軸トルクを測ること。プリロード過大＝ターンイン／ミッドコーナーのアンダー、過小＝コーナー出口で内輪空転、というトレードオフは Gadola/Lenzo が明記しており、そのまま学生の設定指針になる。実測例として、単座レーシングカーではターンイン／コースティング中は左右輪速に差が出るが、スロットル約15%で完全ロックする挙動が示されている。
- MATLAB実装経路: Vehicle Dynamics Blockset / Powertrain Blockset `Limited Slip Differential`。既定は preloaded ideal clutch：`T_c = F_c·N·μ(|ϖ|)·R_eff·tanh(4|ϖ|)`（ϖ = ω₁−ω₂、`R_eff = 2(R_o³−R_i³)/(3(R_o²−R_i²))`、既定 F_c=500 N、N_disks=4、R_eff=0.20 m）。代替パラメータ化として「Slip speed dependent torque data」「Input torque dependent torque data」のルックアップ。物理モデルで組むなら Simscape Driveline 公式例 `LimitedSlipDifferentialWithClutchesExample`（Differential ＋ Disc Friction Clutch ＋ Tire (Magic Formula) の可変摩擦バリアント）。**重要な限界：VDB の tanh(4|ϖ|) 近似は滑り速度ゼロでロックトルクがゼロになるため、真の固着状態を表現しない。**プリロードで停車保持するような挙動は出ないので、微小スリップ域の議論には使えない。

**[実用] [駆動系⑥] ギヤ分離力式LSD（Torsen／Quaife ATB）：トルクバイアス比一定モデル**

- 仮定・成立条件: TBR（概ね 2.5:1〜4:1）が一定。`C_slower / C_faster ≤ TBR` の範囲では速度差ゼロ（ロック）、超えたら比を保って配分。ウォームギヤ（Torsen）またはヘリカルギヤ（Quaife ATB）の分離力（ベベルは軸方向、円筒歯車は半径方向）で摩擦を発生させる。
- 破綻条件（次の階層へ進むべき時）: (1) **内輪が浮くと TBR × 0 = 0 で完全にトラクションを失う。** 反力トルクを取る相手がいないため、TBR がいくら高くても無意味。これは構造的な限界で、設定では回避できない。(2) TBR は実際には入力トルクと摩耗で変動する（Shih & Bowerman, SAE 2002-01-1046 がトルクバイアスと効率を実測評価）。(3) ギヤ摺動の効率損失を無視すると駆動損失を過小評価する。
- 学生フォーミュラでの実行可能性: 使える。ただし内輪リフトが起きるセットアップ（高ロール剛性・短ホイールベース・高重心・FSAEのタイトコーナー）ではデバイス選択自体を疑うべき。「LSDを入れたのに立ち上がりで内輪が空転する」報告の多くはこの構造的限界であって、設定不良ではない。
- MATLAB実装経路: Simscape Driveline 公式例 `TorsenDifferentialExample`（非可逆ウォームギヤを `Sun-Planet Worm Gear` で表現、split-friction 路面で Open Differential と比較）。簡易には VDB `Limited Slip Differential` の「Input torque dependent torque data」ルックアップに実測 TBR を入れる。

**[実務標準] [駆動系⑦] ドライブトレイン剛性・バックラッシュ（ねじり2〜4慣性系＋デッドバンド）**

- 仮定・成立条件: シャフト／チェーンをねじりばね-ダンパで表現し、遊びをデッドバンド（hard stop）で表現。FSAEはチェーン最終減速なので、チェーンのスラック（たるみ）＋伸び剛性＋スプロケット遊びが主要要素。
- 破綻条件（次の階層へ進むべき時）: (1) 剛性を高くすると系が数値的に stiff になり、固定ステップ・リアルタイム（第VI部・第40章）で回らなくなる。剛性を人為的に下げる／減衰を足すのは常套手段だが、**そうすると本来の共振周波数がずれる**ことを必ず明示しなければならない。ここは「モデルをいつ信じてはいけないか」の核心的な例。(2) 減衰係数の同定が難しく、文献値の流用は根拠が薄い。実測（駆動系のねじり応答、あるいはホイール速度の振動）で同定すべき。(3) バックラッシュ通過時の衝撃（clunk）は接触剛性のモデル化に強く依存し、絶対値の予測は困難。定性的傾向のみ信じる。
- 学生フォーミュラでの実行可能性: 使える。単気筒エンジンは2回転あたり1爆発でトルク脈動が非常に大きく、チェーンのたるみとデフのクラッチが連成して低速でガクガクする現象が実在する。オン／オフスロットル切り替え時のショック（shuffle）はドライバが必ず指摘するので、モデルと官能評価を突き合わせやすい題材。
- MATLAB実装経路: Simscape Driveline `Chain Drive`（Couplings & Drives。Sprocket A/B pitch radius、Chain slack length、Chain stiffness、Chain damping、Chain maximum tension。「Ideal - no chain compliance or backlash」と「Model chain compliance and backlash」のトグルがあり、両者の比較がそのまま教材になる）。`Torsional Spring-Damper`（Couplings & Drives。ばね剛性・粘性・クーロン摩擦・静／動摩擦比＋Hard stops で上下限・接触剛性・接触減衰・反発係数）。Vehicle Dynamics Blockset `Split Torsional Compliance`（並列ばね-ダンパ、k 既定 5e4 N·m/rad、b 既定 1e2 N·m·s/rad、減衰カットオフ 3000 rad/s）。

**[研究最前線] [駆動系⑧] シフト時トルク抜けを含む過渡駆動系（点火カット／ドグ係合）**

- 仮定・成立条件: 点火カット時間、ドグ歯の噛み合い遷移、クラッチ状態遷移をイベントで切り替えるハイブリッドシステムとして扱う。
- 破綻条件（次の階層へ進むべき時）: ドグ歯の衝突は接触モデルに敏感で、実測なしに絶対値は出ない。またシフトアクチュエータ（空圧／電動）の応答遅れが支配的になることが多く、駆動系内部より先にそこを測るべき。モデルを精緻化しても律速要素が別なら精度は上がらない — 典型的な「詳細化の方向を間違える」事例。
- 学生フォーミュラでの実行可能性: 実測から同定するのが現実的。**ホイール速度・エンジン回転・ギヤポジション・スロットル開度**を同時ログして変速1回あたりのトルク抜け時間を実測し、ラップシムには「一定時間トルクゼロ」の区間として入れるのが費用対効果が最も高い。フルの過渡モデル化は学部の年間サイクルでは過剰。
- MATLAB実装経路: Simulink の Enabled/Triggered Subsystem または Stateflow でイベント遷移を記述。Simscape Driveline のクラッチ＋ギヤで物理的に組むことも可能だがソルバが重くなり、リアルタイム化と両立しにくい。

**[研究最前線] [駆動系⑨] 最適制御によるLSD特性設計／最小ラップタイム最適化への統合**

- 仮定・成立条件: 車両モデル（4輪＋MFタイヤ＋LSD）を制約条件とし、デフ特性そのものを設計変数にして最小時間問題を解く。QSS 線形化により加速度エンベロープ（g-g）上でLSDの寄与を評価する手法も含む。
- 破綻条件（次の階層へ進むべき時）: 解はモデルの忠実度で決まる。タイヤモデルが甘いと「最適な」デフ特性は物理的意味を失う。局所最適・初期値依存。計算時間が長く、設計ループに乗せにくい。
- 学生フォーミュラでの実行可能性: 知る価値はあるが、学部の年間開発サイクルでは実行が難しい。第IV部・第32章（最小ラップタイム最適化）で「デフを設計変数に含めるとどうなるか」の題材として扱う価値は高い。Tremlett et al. (VSD 2015) が motorsport differential の最適制御、同 (VSD 2014) が LSD を例にした加速エンベロープの準定常線形化の実例。
- MATLAB実装経路: Optimization Toolbox の `fmincon`、または CasADi（外部・無償）による直接コリケーション。Model Predictive Control Toolbox。MATLAB単体では直接法を自作するのが一般的で、既製ブロックは存在しない。

### 実務でよく起きる誤り

- 【ブレーキ・最頻出】理想制動力配分曲線を「達成すべき目標」だと思う誤り。バランスバーが作れるのは原点を通る直線だけであり、放物線状の理想曲線と一致させることは原理的に不可能。正しい問いは「どの減速度で交差させるか」であって「どうすれば曲線に合わせるか」ではない。
- 【ブレーキ】FS-Rules のブレーキテスト（IN 11.1.1、4輪ロック）に合格したことをもって「ブレーキバランスが最適」と結論する誤り。ロックさせるだけならマスターシリンダ径を細くすれば済む。競技で効くのはロック直前の制動力最大化であり、車検合格と性能は別問題。
- 【ブレーキ】タイヤの荷重感度（F_z 増で μ 低下）を無視したまま理想配分曲線を描く誤り。荷重感度を入れると理想曲線そのものの形が変わるため、「教科書どおりの曲線」が実タイヤでは正しくない。
- 【ブレーキ・熱】集中容量モデルの対流係数 h を文献値のまま使い、算出されたローター絶対温度を信じる誤り。h はダクトの有無とホイール内流れ場で数倍変わる。相対比較・セットアップ間の順位づけには使えるが、絶対値は実測（サーモカップル／サーモペイント）で較正するまで信じてはならない。
- 【ブレーキ・熱】パッド摩擦係数を温度非依存の定数にしたままフェードを論じる誤り。フェードとは μ_pad(T) の低下そのものであり、μ を定数にした瞬間にフェードはモデルから消える。
- 【ブレーキ・熱】ローター温度だけを追い、ブレーキ液温度を追わない誤り。実際に競技を壊すのはローターの赤熱よりも vapour lock（液の気化でペダルが床まで抜ける）であることが多い。キャリパ・パッド背面への熱流を無視したモデルではこの故障モードが検出できない。
- 【ブレーキ・熱】FEA のメッシュを細かくすれば温度予測が正しくなるという誤解。境界条件（h の空間分布、ローター／パッドへの入熱分配率、接触圧分布）の不確かさが解の精度を支配するため、メッシュ収束は数値誤差の収束であって物理の正しさではない。
- 【ブレーキ・制御】FSAEでABSを作る計画を立てる誤り。FS-Rules 2026 T 6.1 は manual mode での brake-by-wire を禁止している。加えてスリップ率は直接測れず車速推定が要り、4輪同時ロック時にはその推定基準が消える。MathWorks 自身が sldemo_absbrake について「実車では非現実的」と明記している。
- 【駆動系・最頻出】「スプールはアンダーステア」という単純化。低横G・タイトコーナーではUS寄与（しかも 1/R に比例するので低速タイトほど強い）だが、横荷重移動が大きくなると内外輪が別々の F_x-κ 曲線に乗り、ヨーモーメントが反転してOS寄与になる。さらに複合スリップで外輪がより大きなスリップ角へ移るためRWDではOS傾向が増す。スプールは「横G依存でバランスが変わる」デバイスで、限界付近で挙動が急変しうる。
- 【駆動系】「トルク感応式LSDはオーバーラン時にはフリーデフとして働く」という記述をそのまま信じる誤り。Dixon 等の著名書にこの記述があるが、実機はオフパワー側にも別ランプ角を持ち、ブレーキング／ターンイン安定性に実際に寄与する。Gadola et al. が明示的に否定している。権威ある教科書でも誤りうる実例として扱う価値がある。
- 【駆動系】LSDのプリロード調整の方向を取り違える誤り。プリロード過大＝ターンイン／ミッドコーナーのアンダーステア、過小＝コーナー出口で内輪空転。この非対称なトレードオフを知らずに「グリップが足りないからプリロードを上げる」と、進入がさらに悪化する。
- 【駆動系】湿式クラッチ／LSDクラッチパックで μ_s > μ_k を無条件に仮定する誤り。ATF添加剤によっては静摩擦のほうが低くなりうる（Ingram et al. の実測）。この符号が逆転するとスティックスリップの発生予測が真逆になる。文献値の μ（静0.12／動0.08程度が報告される）を油種・面数・摩耗状態を確認せず流用しないこと。
- 【駆動系】Torsen／Quaife ATB を「TBRが高いから内輪が空転しない」と考える誤り。内輪が浮くと反力トルクを取る相手が消え、TBR × 0 = 0 でトラクションは完全に失われる。これは構造的限界であり設定では回避できない。高ロール剛性・短ホイールベースのFSAE車でタイトコーナーに入る場合、デバイス選択自体を疑うべき。
- 【駆動系】ラップシムでデフを「オープンかロックか」の二値で入れる誤り。LSDの実効特性は入力トルク依存であるため、二値化するとコーナー出口のトラクションとヨーモーメントが同時に外れる。しかも外れ方が横Gによって符号を変えるので、単純なオフセット補正では吸収できない。
- 【駆動系】VDB の Limited Slip Differential の tanh(4|ϖ|) 近似が真のロックを表さないことを見落とす誤り。滑り速度ゼロでロックトルクがゼロになるため、プリロードで停車保持するような挙動は出ない。微小スリップ域（ターンイン直後など）の議論にこのブロックをそのまま使うと結論が変わる。
- 【駆動系】エンジンのカタログトルクマップをそのまま使う誤り。FS-Rules CV 1.7.4 の 20 mm リストリクタ（E85は19 mm）で高回転域が大きく絞られるため、無過給カタログ値は出力を大幅に過大評価する。自チームのリストリクタ付きダイナモ実測か、少なくとも1Dガスダイナミクス解析の値を使い、出典を明記すること。
- 【駆動系】定常ダイナモのトルクマップを過渡（スロットルステップ）にそのまま適用する誤り。吸気管容積・脈動効果により定常マップは過渡応答を過大評価する。シケイン連続区間のラップタイムがモデルで速く出るのはこれが原因のことが多い。
- 【駆動系】変速時のトルク抜けを無視した加速シミュレーション。FSAEの75 m加速では2〜3回変速し、1変速あたり実測でおおむね 50〜150 ms のトルク抜けがある。無視すると必ず速すぎる結果になる。フルの過渡モデル化より先に、実測して「一定時間トルクゼロ」として入れるのが費用対効果が高い。
- 【駆動系・数値】ドライブトレイン剛性を実測値どおり入れて系が stiff になり、リアルタイム化のために剛性を下げる／減衰を足すという処置を、その代償を書かずに行う誤り。剛性を変えれば共振周波数がずれるため、駆動系振動の議論にはもはや使えなくなる。第VI部で必ず明記すべき点。
- 【駆動系】チェーン最終減速比の連続最適化結果をそのまま採用する誤り。スプロケット歯数は整数なので必ず丸めが入り、丸め後に再評価しないと机上の最適値が消える。
- 【実装】Simscape Driveline の Disc Brake（平均パッド半径 `R_m = (R_o+R_i)/2`）と Disc Friction Clutch（有効半径 `r_eff = (2/3)(R_o³−R_i³)/(R_o²−R_i²)`）で有効半径の定義が異なることを見落とし、両者の数値を混用する誤り。数パーセントのずれが入り、バランス計算では無視できない。
- 【座標系】ISO 8855（x前方・y左・z上）と SAE J670（y右・z下）の違いにより、制動力・駆動力・ヨーモーメントの符号を取り違える誤り。特にLSDのヨーモーメント寄与（US/OS）の符号は文献ごとに規約が異なるため、引用時に必ず座標系を確認すること。
- 【データ】TTC の縦力（FX）データセットを整備せず、横力データだけでブレーキ・トラクションのタイヤモデルを作る誤り。学生チームの典型的な穴で、結果としてブレーキ章と駆動系章のモデル精度だけが構造的に低いままになる。

### 学生フォーミュラ固有の事情

【タイヤ・車速・空力の帰結】10または13インチの小径タイヤのためローター外径が構造的に制約され、熱容量が小さい。一方で平均車速が低い（オートクロスで概ね50 km/h前後、最高でも約105 km/h）ため、1回あたりの制動エネルギーは小さいが冷却風速も小さく、対流係数 h が小さい。結果として「制動が軽いのに温度が下がりにくい」という高速レーシングカーとは異なる熱バランスになり、エンデュランス（約22 km、ドライバ交代あり）で効いてくる。ダウンフォースが小さいので制動時の F_z 増加が小さく、高速レーシングカーで問題になる「速度依存のブレーキバランス」の重要度は相対的に低い。逆に言えば、第17章の準静的配分モデルがFSAEでは高速カテゴリよりも長く有効。

【規則が決める設計制約（FS-Rules 2026 v1.1 で確認済み）】4輪に作用し単一操作の油圧ブレーキ（T 6.1.1-6.1.2）。2系統独立回路＋独立リザーバ（T 6.1.3-6.1.5）— これがバランスバーを事実上の標準解にしている。**LSDに作用する単一ブレーキが認められる**（T 6.1）ため、インボード単一リヤブレーキ構成が可能だが、駆動系故障でブレーキを失わない保護が要る（T 6.1.8）。manual mode での brake-by-wire は禁止（T 6.1）→ ABSは実質不可。ペダルは2 kN耐力（T 6.1.12）。BOTSは**全てのブレーキバランス設定で**機能すること（T 6.2.2）— バランスバー調整範囲を設計する際の隠れた制約。ブレーキテストは4輪ロック、CVはエンストなし（IN 11.1.1-11.1.2）。チェーン・ベルトには非穿孔2 mm鋼または3 mmアルミ6061-T6のスキャッタシールド（T 7.3.2-7.3.5）。吸気リストリクタはガソリン20 mm／E85 19 mm（CV 1.7.4）。

【エンジンの帰結】20 mm リストリクタが最高出力を厳しく制限するため、エンジントルクマップは必ずリストリクタ付きで実測または1D解析すること。単気筒（KTM 690 / Husqvarna 701 系）は2回転あたり1爆発でトルク脈動が非常に大きく、チェーンのたるみ・デフクラッチ・駆動系ねじりが連成して低速でガクガクする現象が実在する。4気筒（CBR600RR / YZF-R6 系）は高回転域でリストリクタの絞りが強く効き、実用回転域が狭くなる。この選択は第21章で中立に比較すべき論点。バイクエンジンは一体型シーケンシャルギヤボックス＋湿式多板クラッチのため、ギヤ比は既製で変更不可、調整自由度は最終減速（チェーンスプロケット歯数、整数）にほぼ限られる。

【デフ選択の実態】スプール／ランプ式LSD（Drexler FSAE等）／ギヤ分離力式（Torsen・Quaife ATB）／オープンの4択。FSAEコースは最小旋回半径が非常に小さく、スプールの US 寄与が `1/R` に比例するため低速タイトコーナーで顕著にヨーを妨げ、内輪の接地面すべりでエネルギーを捨てる。一方でスプールは軽量・安価・部品点数が少なく信頼性が高い。ギヤ分離力式は内輪リフト時に TBR に関わらず完全に無力になるので、高ロール剛性・短ホイールベースの車では選択自体を疑う必要がある。

【シフト時トルク抜け】75 m加速で2〜3回変速し、1変速あたりおおむね 50〜150 ms のトルク抜けが生じる。**ホイール速度・エンジン回転・ギヤポジション・スロットル開度を同時ログして実測し、ラップシムには一定時間のトルクゼロ区間として入れる**のが最も費用対効果が高い。フルの過渡モデル化は学部の年間サイクルでは過剰で、しかもシフトアクチュエータ（空圧／電動）の応答遅れが律速になることが多いため、駆動系内部を精緻化しても精度は上がらない。

【TTCデータ】Tire Test Consortium には縦力（FX）データセットが含まれるが、多くのチームは横力データしか整備していない。その結果、ブレーキ章と駆動系章のタイヤモデルだけが構造的に精度が低いままになる。第III部（同定と検証）でこの非対称性を明示し、FXデータの整備を「今すぐ試せる最初のステップ」として提示する価値が高い。

【MathWorksライセンス】MathWorks の FSAE 無償ライセンスで Simscape Driveline、Vehicle Dynamics Blockset、Powertrain Blockset が使える。ただし本領域では、Disc Brake の集中容量熱モデルや Karnopp クラッチは**自作したほうが教育効果が高い**階層（第17〜18章、第22章前半）と、既製ブロックを使うべき階層（Chain Drive のバックラッシュ、Torsen の非可逆ウォームギヤ）が明確に分かれる。第VI部（コード生成・リアルタイム）へ進む際は Simscape の物理モデルがソルバを重くするため、そこで自作の常微分方程式モデルへ落とす経路を設計しておくこと。

### 参照文献

- **Thomas D. Gillespie, "Fundamentals of Vehicle Dynamics", SAE International, 1992, 526 pages**
  - 種別: 書籍 / 入手性: 有料書籍（SAE、大学図書館に所蔵されることが多い）
  - https://doi.org/10.4271/r-114
  - 用途: 第17章（ブレーキ①）の基礎。制動性能（Braking Performance）章に前後制動力配分、制動効率、ABSの基礎が体系的にある。第1〜6部を通じた縦方向動力学の標準的な出発点。ISBN 978-1-56091-199-9。
- **William F. Milliken, Douglas L. Milliken, "Race Car Vehicle Dynamics", SAE International, 1995, 890 pages, ISBN 978-1-56091-526-3**
  - 種別: 書籍 / 入手性: 有料書籍（SAE、大学図書館に所蔵されることが多い）。DOI 10.4271/r-146 は存在しない（確認済み）
  - https://openlibrary.org/books/OL1111145M/Race_car_vehicle_dynamics
  - 用途: 第20章 "Driving and Braking" が本領域の正典。第17章・第22章の骨格。ただし本書はトルクバイアス図を説明なしに掲載しており、しかも掲載特性がオン／オフ対称になっている（実機は非対称）ため、そのまま鵜呑みにできない — この点は Gadola et al. が明示的に指摘しており、教科書の「限界と適用範囲」節でそのまま使える。第12章 Chassis Set-up も参照。
- **Rudolf Limpert, "Brake Design and Safety, Third Edition", SAE International, 2011, 434 pages, ISBN 978-0-7680-3438-7**
  - 種別: 書籍 / 入手性: 有料書籍／IEEE Xplore の SAE eBooks 経由（大学契約があれば閲覧可）。Internet Archive に旧版の貸出あり
  - https://doi.org/10.4271/r-398
  - 用途: 第17〜18章の主要典拠。理想制動力配分、adhesion utilisation、ブレーキ熱解析、フェードを一冊で扱う数少ない専門書。バランスバー・マスターシリンダ設計の実務式の出典としてここを引くのが最も安全。
- **John C. Dixon, "Tires, Suspension and Handling, Second Edition", SAE International, 1996, ISBN 978-0-7680-6289-2**
  - 種別: 書籍 / 入手性: 有料書籍（SAE）
  - https://doi.org/10.4271/r-168
  - 用途: LSD とハンドリングへの影響を体系的に扱う数少ない書籍。ただし「トルク感応式デフはオーバーラン時にフリーデフとして働く」という記述があり、これは誤りとして Gadola et al. に名指しで批判されている。第22章で「権威ある教科書でも誤りうる」実例として両論併記で扱うと価値が高い。
- **Massimo Guiggiani, "The Science of Vehicle Dynamics", 3rd edition, Springer, 2023, ISBN 978-3-031-06460-9 / 978-3-031-06461-6** ✓実在確認（訂正: **要追記：版と年を明示すべき。** 当該DOI（978-3-031-06461-6）は **第3版**にあたり、書籍レベルのCrossrefメタデータでは発行年 **2023**（章レベルは2022と表示されるが、書籍としては2023）。章タイトル「Vehicle Model for Handling and Performance」・第3章・頁67-176・著者 Massimo Guiggiani・出版社 Springer は一致。ISBN は 9783031064609（印刷）/ 9783031064616（eBook））
  - 種別: 書籍 / 入手性: 有料（Springer）。大学のSpringerLink契約があれば章単位でPDF入手可
  - https://doi.org/10.1007/978-3-031-06461-6
  - 用途: 数学的厳密性を妥協しない教科書。第I部・第23章の非線形4輪モデルの定式化と、縦横結合の扱いの参照先。第2版（2018）は DOI 10.1007/978-3-319-73220-6。
- **J. Y. Wong, "Theory of Ground Vehicles", 5th edition, Wiley, 2022, ISBN 978-1-119-71970-0**
  - 種別: 書籍 / 入手性: 有料書籍（Wiley）
  - https://doi.org/10.1002/9781119719984
  - 用途: 制動性能と駆動力配分の古典的定式化。Gillespie とは異なる導出を示すため、第17章で複数出典の突き合わせに使える。
- **Marco Gadola, Daniel Chindamo, Basilio Lenzo, "Revisiting the mechanical limited-slip differential for high-performance and race car applications", Engineering Letters, 29(3), 824-839, 2021**
  - 種別: 論文 / 入手性: オープンアクセス（Sheffield Hallam 大学リポジトリ SHURA、Version of Record）
  - https://shura.shu.ac.uk/30090/
  - 用途: **第22章の中核文献。**ランプ式LSDのロックトルク式、プリロード、トルクバイアス図の形状、静／動摩擦遷移、追加ロック効果の経験定数 k≈0.08〜0.22、負プリロード（Hewland EMA）、VCP、Torsen/Quaife ATB までを一本で網羅。実車ログ（ターンインで輪速差、スロットル約15%で完全ロック）も掲載。既存文献の誤り（Milliken の説明欠落、Dixon のオーバーラン記述）を名指しで指摘している点が、この教科書の「モデルをいつ信じてはいけないか」の方針と完全に一致する。
- **Marco Gadola, Daniel Chindamo, Basilio Lenzo, "On the Passive Limited Slip Differential for High Performance Vehicle Applications", 14th International Symposium on Advanced Vehicle Control (AVEC 2018), Beijing, China, 16-20 July 2018**
  - 種別: 論文 / 入手性: オープンアクセス（SHURA、Accepted Manuscript）
  - https://shura.shu.ac.uk/21372/
  - 用途: 上記2021年版の短縮先行版。スプールの旋回挙動（低横G=US、高横G=OS反転、オフパワーは常にUS）の導出が簡潔で、第22章の「差動装置の旋回挙動への影響」節の骨格として最も使いやすい。40年分のLSD文献レビューを含み、この領域の文献地図として機能する。
- **A. J. Tremlett, F. Assadian, D. J. Purdy, N. Vaughan, A. P. Moore, M. Halley, "Quasi-steady-state linearisation of the racing vehicle acceleration envelope: a limited slip differential example", Vehicle System Dynamics, 52(11), 1416-1442, 2014**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由で入手可
  - https://doi.org/10.1080/00423114.2014.943927
  - 用途: 第28章（g-gダイアグラム）と第22章の橋渡し。LSDが加速度エンベロープをどう変えるかを準定常線形化で扱う。「デフをオープンかロックかの二値で入れると g-g がどう狂うか」を論じる根拠になる。
- **A. J. Tremlett, M. Massaro, D. J. Purdy, E. Velenis, F. Assadian, A. P. Moore, M. Halley, "Optimal control of motorsport differentials", Vehicle System Dynamics, 53(12), 1772-1794, 2015**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由で入手可
  - https://doi.org/10.1080/00423114.2015.1093150
  - 用途: 第32章（最小ラップタイム最適化）で「デフ特性を設計変数にする」研究最前線の代表例。学生には実行困難だが、階層の最上段を示すために必要。
- **A. Tremlett, F. Assadian, D. Purdy, N. Vaughan, A. Moore, M. Halley, "The Control Authority of Passive and Active Torque Vectoring Differentials for Motorsport Applications", Proceedings of the FISITA 2012 World Automotive Congress, Lecture Notes in Electrical Engineering, 335-347, Springer, 2012**
  - 種別: 論文 / 入手性: 有料（Springer）。大学経由で入手可
  - https://doi.org/10.1007/978-3-642-33744-4_30
  - 用途: パッシブLSDとアクティブトルクベクタリングの制御権限（control authority）を比較。第22章で「LSDでできること／できないこと」の境界を示す。
- **Heinrich Huchtkoetter, Heinz Klein, "The Effect of Various Limited-Slip Differentials in Front-Wheel Drive Vehicles on Handling and Traction", SAE Technical Paper 960717, SAE International, 1996**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus、約$35）。大学契約があれば無料
  - https://doi.org/10.4271/960717
  - 用途: LSD種別（オープン／ビスカス／ランプ）のハンドリング・トラクションへの影響を実験的に比較した古典。トルク感応式と速度感応式の違いを一次資料で示せる。
- **Giampiero Mastinu, E. Battistini, "The influence of limited-slip differentials on the stability of rear-wheel-drive automobiles running on even road with dry surface", International Journal of Vehicle Design, 14(2/3), 166-183, 1993**
  - 種別: 論文 / 入手性: 有料（Inderscience）。大学経由で入手可
  - https://doi.org/10.1504/ijvd.1993.061832
  - 用途: RWD車でのLSD挙動の詳細解析。「サスペンションのセットアップはLSDの影響に合わせて調整すべき」という結論は、第13章（荷重移動とロール剛性配分）と第22章を結ぶ論拠になる。
- **Joško Deur, Vladimir Ivanović, Matthew Hancock, Francis Assadian, "Modeling and Analysis of Active Differential Dynamics", ASME Journal of Dynamic Systems, Measurement, and Control, 132(6), 2010**
  - 種別: 論文 / 入手性: 有料（ASME）。大学経由で入手可
  - https://doi.org/10.1115/1.4002482
  - 用途: デフのクラッチ動特性を制御工学の言語で定式化した標準文献。第22章の物理モデルと第V部（制御設計）を接続する。
- **Damrongrit Piyabongkarn, John Grogg, Qinghui Yuan, Jae Lew, Rajesh Rajamani, "Dynamic Modeling of Torque-Biasing Devices for Vehicle Yaw Control", SAE Technical Paper 2006-01-1963, SAE International, 2006**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2006-01-1963
  - 用途: トルクバイアス装置のロック／スリップ段階遷移を含む運動学モデルを提示し、MATLAB/Simulink と CarSim の連成で検証している。**MATLAB/Simulink を正典とする本教科書の実装方針と直接一致する数少ない一次文献。**
- **Shan Shih, Ward Bowerman, "An Evaluation of Torque Bias and Efficiency of Torsen Differential", SAE Technical Paper 2002-01-1046, SAE International, 2002**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2002-01-1046
  - 用途: Torsen の TBR と効率の実測評価。第22章で「TBRは一定ではない」「効率損失を無視できない」を示す一次資料。
- **B. Heißing, U. Bleck, J. Bensinger, E. Müller, "The Influence Of A Torsen Centre Differential On The Handling Of Four-Wheel Drive Vehicles", SAE Technical Paper 885140, SAE International, 1988**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/885140
  - 用途: Torsen のハンドリング影響を扱った古典。FSAE は2WDだが、ギヤ分離力式デフの原理と挙動影響の理解に使える。
- **Ronald H. Haas, Richard C. Manwaring, "Development of a Limited Slip Differential", SAE Technical Paper 710610, SAE International, 1971**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/710610
  - 用途: LSD開発の初期古典。第22章の歴史的導入と、機構原理の一次資料として。
- **Dean Karnopp, "Computer Simulation of Stick-Slip Friction in Mechanical Dynamic Systems", ASME Journal of Dynamic Systems, Measurement, and Control, 107(1), 100-103, 1985**
  - 種別: 論文 / 入手性: 有料（ASME）。大学経由で入手可
  - https://doi.org/10.1115/1.3140698
  - 用途: クラッチ／LSDの固着-滑り遷移モデルの原典。Simscape Driveline のクラッチブロックもこの系譜。第22章と第40章（離散化とリアルタイム）の両方で引く。デッドバンド幅とサンプル時間のトレードオフの根拠。
- **M. Ingram, J. Noles, R. Watts, S. Harris, H. A. Spikes, "Frictional Properties of Automatic Transmission Fluids: Part I — Measurement of Friction–Sliding Speed Behavior", Tribology Transactions, 54(1), 145-153, 2011（Crossref登録年 2010）**
  - 種別: 論文 / 入手性: 有料（Taylor & Francis）。大学経由で入手可
  - https://doi.org/10.1080/10402004.2010.531888
  - 用途: **「静摩擦係数は動摩擦係数より大きい」という常識が湿式クラッチでは成立しないことを示す実測。**Gadola et al. がLSDクラッチパックに援用している。第22章の「限界と適用範囲」節で最も価値の高い実測根拠。Part II は DOI 10.1080/10402004.2010.531889。
- **Sergio M. Savaresi, Mara Tanelli, "Active Braking Control Systems Design for Vehicles", Springer, 2010, ISBN 978-1-84996-349-7**
  - 種別: 書籍 / 入手性: 有料（Springer）。大学のSpringerLink契約があれば章単位でPDF入手可
  - https://doi.org/10.1007/978-1-84996-350-3
  - 用途: ABS／制動制御の設計を制御工学として体系化した標準書。第V部（PIDの限界、状態フィードバック、MPC）とブレーキ章を接続する。特にアクチュエータが離散動特性（油圧バルブ）である場合の設計章が実装現実に近い。
- **Murat Otkur, "Thermal Analysis and Optimization of a Disc Brake Rotor for a Formula SAE Race Car", Journal of Fluid Flow, Heat and Mass Transfer, Vol. 11, Avestia Publishing, 2024**
  - 種別: 論文 / 入手性: オープンアクセス（Avestia）※出版社サイトは一部403を返すことがあるためDOI経由推奨
  - https://doi.org/10.11159/jffhmt.2024.042
  - 用途: **FSAE専用のローター熱解析の実例。**106ケースの熱シミュレーションからDOEで最大温度を許容限界以下へ下げた過程が示されており、第18章（熱とフェード）で規模感と手順を示す実例として最適。
- **Murat Otkur, Issa Fasahi, Taleb Waseem, Osama Zattam, Mohammad Alazmi, "Disc Brake Rotor Thermal Analysis for a Formula SAE Race Car", World Congress on Mechanical, Chemical, and Material Engineering (ICMIE'24), Paper No. 151, Avestia Publishing, 2024**
  - 種別: 論文 / 入手性: オープンアクセス（Avestia）※DOI経由推奨
  - https://doi.org/10.11159/icmie24.151
  - 用途: 連続する制動・加速イベント下でのローター温度履歴の求め方（制動エネルギーからの入熱算出、平均速度に基づく対流係数）が具体的に書かれており、第18章の集中容量モデルの手順書としてそのまま使える。
- **Adam Adamowicz, Piotr Grzes, "Influence of convective cooling on a disc brake temperature distribution during repetitive braking", Applied Thermal Engineering, Elsevier, 2011**
  - 種別: 論文 / 入手性: 有料（Elsevier）。大学経由で入手可
  - https://doi.org/10.1016/j.applthermaleng.2011.05.016
  - 用途: 第18章で最大の不確かさである対流冷却係数 h の影響を定量的に示す。「h を文献値のまま使って絶対温度を信じてはいけない」という主張の根拠。
- **Navneet Kumar, Anurag Pandey, "The Design Process for a Formula Student Car Brake Disc", SAE Technical Paper 2021-28-0252, SAE International, 2021**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2021-28-0252
  - 用途: Formula Student 特化のブレーキディスク設計プロセス。第18章の「学生チームが今すぐ試せる最初のステップ」の下敷き。
- **Lucas Olenski Gomes, Francisco José Grandinetti, Marcelo Sampaio Martins, Alvaro Manoel Souza Soares, Antônio Reis de Faria Neto, Thais Santos Castro, Luís Fernando Almeida, "Brake Pedal Sizing and Preliminary Design of Balance Bar in the Brake of a SAE Formula Type Vehicle", SAE Technical Paper 2024-36-0054, SAE International, 2024**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2024-36-0054
  - 用途: **バランスバー設計の FSAE 専用一次資料。**第17章の実務節（ペダル比・MC径・バー比の決め方）の根拠として最も直接的。
- **Thomas A. Flaim, "Vehicle Brake Balance Using Objective Brake Factors", SAE Technical Paper 890804, SAE International, 1989**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/890804
  - 用途: ブレーキバランスを客観指標（brake factor）で扱う古典。第17章で「バランスをどう定量化するか」の枠組み。
- **Marco Evangelos Biancolini, "Engine/Vehicle Matching for a FSAE Race Car", SAE Technical Paper 2007-01-3541, SAE International, 2007**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2007-01-3541
  - 用途: **第21章（エンジン①トルクマップ）と第22章（ギヤ比）の FSAE 専用一次資料。**610 cc・20 mm リストリクタ制約下で、制限されたエンジントルク・空気抵抗・転がり損失・車両質量を統合して加速ミッションを評価する簡易法。学生が最初に実装すべきモデルそのもの。
- **Mark Claywell, Donald Horkheimer, Garrett Stockburger, "Investigation of Intake Concepts for a Formula SAE Four-Cylinder Engine Using 1D/3D (Ricardo WAVE-VECTIS) Coupled Modeling Techniques", SAE Technical Paper 2006-01-3652, SAE International, 2006**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2006-01-3652
  - 用途: 4気筒FSAEエンジンのリストリクタ付き吸気系を1D/3D連成で解析した代表例。第21章で「トルクマップはどこから来るのか」を示し、ダイナモが無い場合の代替手段を裏づける。
- **Thangavel Venugopal, Routray Anubhav, "A New Approach for Development of a High-Performance Intake Manifold for a Single-Cylinder Engine Used in Formula SAE Application", SAE International Journal of Engines, 2019**
  - 種別: 論文 / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/03-12-04-0027
  - 用途: 単気筒FSAEエンジンの吸気系開発。第21章で単気筒 vs 4気筒の選択を論じる際の単気筒側の一次資料。
- **Blake Siegler, Andrew Deakin, David Crolla, "Lap Time Simulation: Comparison of Steady State, Quasi-Static and Transient Racing Car Cornering Strategies", SAE Technical Paper 2000-01-3563, SAE International, 2000**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2000-01-3563
  - 用途: 第29〜31章（QSS vs 過渡）の判断基準の原典的比較。ブレーキ・駆動系モデルの詳細度をどこまで上げるべきかの費用対効果を論じる根拠。
- **Rodrigo Pasiani Costa, Roberto Bortolussi, "Lap Time Simulation of Formula SAE Vehicle With Quasi-steady State Model", SAE Technical Paper 2016-36-0164, SAE International, 2016**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）。大学契約があれば無料
  - https://doi.org/10.4271/2016-36-0164
  - 用途: FSAE車両のQSSラップシムの実例。第29章の実装参照と、ブレーキ・駆動系モデルがラップシムにどう入るかの具体例。
- **Formula Student Germany, "Formula Student Rules 2026, Version 1.1", 2025-11-25**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（PDF直接ダウンロード可）
  - https://formulastudent.de/fileadmin/user_upload/all/2026/rules/FS-Rules_2026_v1.1.pdf
  - 用途: **第17〜18章・第21〜22章の設計制約の一次ソース。**確認済みの該当条項：T 6.1.1-6.1.2（4輪作用・単一操作の油圧ブレーキ）、T 6.1.3-6.1.5（2系統独立回路＋独立リザーバ）、T 6.1（LSDに作用する単一ブレーキは許容／manual mode で brake-by-wire 禁止／非装甲樹脂ブレーキライン禁止）、T 6.1.8（駆動系故障からのブレーキ保護）、T 6.1.12（ペダル 2 kN 耐力）、T 6.2.2（BOTS は全ブレーキバランス設定で機能すること）、T 7.3.2-7.3.5（チェーン・ベルトのスキャッタシールド、非穿孔2 mm鋼／3 mmアルミ6061-T6）、CV 1.7.4（リストリクタ ガソリン20 mm／E85 19 mm）、IN 11.1.1（ブレーキテストで4輪ロック）、IN 11.1.2（CVはエンストなし）。
- **MathWorks, Simscape Driveline ドキュメント：Disc Brake / Disc Friction Clutch / Differential / Chain Drive / Torsional Spring-Damper / Generic Engine、および公式例 Limited Slip Differential with Clutches (LimitedSlipDifferentialWithClutchesExample)、Torsen Differential (TorsenDifferentialExample)**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MathWorks公式）。ブロック使用には MathWorks FSAE 無償ライセンスが必要
  - https://www.mathworks.com/help/sdl/ref/discbrake.html
  - 用途: 第17〜18章・第22章の MATLAB 実装経路の一次ソース。Disc Brake は熱ポート＋温度依存摩擦をサポートし、集中容量熱モデルとフェードをブロックだけで組める。Chain Drive は chain slack length とコンプライアンス／バックラッシュのトグルを持ち、FSAEのチェーン最終減速をそのまま表現できる。
- **MathWorks, Vehicle Dynamics Blockset / Powertrain Blockset ドキュメント：Open Differential / Limited Slip Differential / Longitudinal Wheel / Split Torsional Compliance / Longitudinal Driver**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MathWorks公式）。使用には MathWorks FSAE 無償ライセンスが必要
  - https://www.mathworks.com/help/vdynblks/ref/limitedslipdifferential.html
  - 用途: 第22章の LSD 実装の一次ソース。Limited Slip Differential の既定式 `T_c = F_c·N·μ(|ϖ|)·R_eff·tanh(4|ϖ|)` は tanh 近似のため滑り速度ゼロで真のロックを表現しない — この限界を明記することが教科書の規律に合致する。Longitudinal Wheel の Brake type は None/Disc/Drum/Mapped の4種。
- **MathWorks, Simulink 公式例 "Model an Anti-Lock Braking System" (sldemo_absbrake)**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MathWorks公式）。Simulink 標準搭載
  - https://www.mathworks.com/help/simulink/slref/modeling-an-anti-lock-braking-system.html
  - 用途: **第V部の「モデルをいつ信じてはいけないか」の教材として最良。**bang-bang制御で1輪＋μ-slip曲線を扱うが、MathWorks 自身が「実車ではスリップを直接測れないためこの制御則は実用的でない。概念構成を示すための例である」と明記している。この自己申告をそのまま引用して、第34章（センサと可観測性）・第35章（EKFによる状態推定）の必要性を導ける。

---

## ラップタイムシミュレーション（第IV部 第28〜33章：g-gダイアグラム／QSS／コースモデル／過渡／最小ラップタイム最適化／セットアップ感度解析）

### モデル階層

**[入門（第28章の前段・アクセラレーション種目）] 縦運動のみの点質量モデル（直線加速シミュレーション）**

- 仮定・成立条件: 横運動を持たない。前後方向の運動方程式のみ。駆動力は min(エンジントルク×総減速比/タイヤ有効半径, μ·Fz_駆動輪) で頭打ち。空力抗力・ダウンフォース・転がり抵抗・変速時のトルク抜け時間・駆動系慣性（等価質量）を入れるかは任意。タイヤは摩擦係数 μ の定数、または荷重感度 μ(Fz) 付き。ドライバは常に全開または全制動。
- 破綻条件（次の階層へ進むべき時）: 旋回が入った瞬間に破綻する。またローンチ（クラッチミート、ホイールスピン、リフト）を扱わないと最初の1〜2秒が合わない。FSAEのアクセラレーション（75 m）はローンチと1速域が全体の1/3〜1/2を占めるので、変速時トルク抜け時間（0.05〜0.2 s の仮定）の差がタイヤモデルの差より大きくなる。次に進むべき条件＝「曲率のある区間を評価したい」と思った瞬間。
- 学生フォーミュラでの実行可能性: FSAEアクセラレーション（直線75 m、Formula Student Rules 2025 D 5.1.1）はこの階層で完結して扱える唯一の種目。最終減速比・スプロケット歯数・シフトポイントの決定に直結する。学生が最初に自作すべきモデルで、実測（GPS速度・エンジン回転）との突き合わせも容易。
- MATLAB実装経路: 素のMATLABで距離刻みまたは時間刻みのループ（ode45でも可、追加Toolbox不要）。エンジントルクマップは interp1 / griddedInterpolant、変速はイベント処理。参考実装：OpenLAPパッケージ内の OpenDRAG.m（GPL v3、点質量による直線加速・制動シミュレーション）。

**[入門（第28章の中核）] g-gダイアグラム／GGV（g-g-V）性能包絡線**

- 仮定・成立条件: 車両を点質量とみなし、瞬時に発生できる水平加速度ベクトル (a_x, a_y) の可能領域（性能包絡線）が存在すると仮定する。最単純形は摩擦円 a_x²+a_y² ≤ (μg)²。実務形では (1) 前後非対称（駆動側は駆動輪荷重とパワーで頭打ち、制動側は4輪使えるので大きい）、(2) 速度依存（ダウンフォースで μ_eff が上がり、高速ではパワー律速に移る）を入れて GGV 曲面にする。包絡線の内側は達成可能、境界が限界。
- 破綻条件（次の階層へ進むべき時）: 包絡線に到達するまでの時間（過渡）を一切表現しない。ヨー慣性・タイヤ緩和長・ロール／ピッチ過渡・デフのロック状態が入らない。決定的な誤解として、実測ログの g-g 散布図は「包絡線」ではなく「そのドライバがその日使った領域」であり、両者を混同すると必ず性能を過小評価する（逆にタイヤ試験データだけから作った包絡線は必ず過大になる）。3次元路面（バンク・勾配）では g-g では足りず g-g-g が要る（Lovato & Massaro 2022）。
- 学生フォーミュラでの実行可能性: 必須の概念装置。スキッドパッド（内円直径15.25 m、外円21.25 m、走路幅3 m）は g-g 上の a_x≈0 の1点そのものであり、モデル検証の最良の入口。ログのIMUから g-g 散布図を描いて「どの象限が使えていないか（例：ブレーキング中の旋回が使えていない）」を示す図は設計審査で最も効く。ただし包絡線の絶対値をTTCデータだけから作ると必ず過大評価になることを明記すべき。
- MATLAB実装経路: 実測から：boundary / alphaShape（Statistics不要、基本MATLAB）で散布点の外形を抽出。モデルから：二輪または四輪モデルの釣り合いを fsolve（Optimization Toolbox）で解き、a_y を掃引して各 a_y での a_x 上下限を求め griddedInterpolant で GGV ルックアップ化。

**[実用（第29〜30章の中核・学生チームの主力）] 準定常（QSS）点質量＋固定走行ライン（3パス法：限界速度 → 前向き積分 → 後ろ向き積分）**

- 仮定・成立条件: コースを弧長 s で離散化し、曲率 κ(s) が既知（＝走行ラインが固定入力）。各点で車両は定常状態にあり v_max(s)=sqrt(a_y,max(v)/|κ(s)|)。その上で (1) v_max の局所最小＝エイペックスを検出、(2) エイペックスから前方へ「残余縦グリップ＋パワー」で加速積分、(3) 後方へ制動積分、(4) 三者の最小値を採る。限界状態間の遷移は瞬時。
- 破綻条件（次の階層へ進むべき時）: 「定常状態にある時間割合」が小さいコースで系統的に速すぎるタイムを出す。FSAEオートクロスはスラローム間隔 7.5〜12 m、最小旋回直径 9 m（FS Rules 2025 D 6.1）で、車速 10〜15 m/s なら向き変え周期は0.5〜1 s。タイヤ緩和長とヨー応答の時定数（0.1〜0.3 s オーダー）に対して無視できず、ラップの大半が過渡になる。さらに点質量なので荷重移動・ロール剛性配分・デフ・ダンパの効果が数学的に厳密にゼロになる（＝セットアップ感度が原理的に出ない）。走行ラインを固定した時点で「セットアップを変えるとラインも変わる」効果を捨てている。次に進むべき条件＝セットアップ（重心高、ロール配分、空力バランス）を評価したくなったら H3 へ、ラインそのものを問いたくなったら H4 へ。
- 学生フォーミュラでの実行可能性: 実際に最も使われる階層。OptimumLap（点質量QSS）、OpenLAP、各校の自作MATLABがほぼここに属する。質量・パワー・空力・タイヤμ・ギヤ比の一次選定には十分。逆に「サスペンションのセットアップをこの階層で評価する」のは典型的な誤用で、FSAE設計審査で頻出の減点要因になりうる。
- MATLAB実装経路: 自作可能（追加Toolbox不要）。参考実装：OpenLAP.m（GPL v3、MATLAB R2018b以降、Win/macOS/Linux。エイペックス検出＋加速モード／減速モードの2枚の解の最小値を採る構造、摩擦楕円 ay_max·sqrt(1-(ax/ax_tyre_max)^2) と GGV 曲面を使用）。周辺：OpenTRACK.m（形状データ／ログデータからのコースモデル生成）、OpenVEHICLE.m（車両モデル生成）。Python参考：TUMFTM/trajectory_planning_helpers の calc_vel_profile（前後進ソルバ、ggv と ax_max_machines を入力）。

**[実務標準（第31章）] 準定常（QSS）非線形四輪（ダブルトラック）モデル＋固定走行ライン**

- 仮定・成立条件: 各点で並進力の釣り合いに加えてヨーモーメントの釣り合いも同時に成立する（トリム状態）と仮定。前後左右の荷重移動、ロール剛性配分、空力マップ（CL・CD・空力バランスの車高／ピッチ依存）、Magic Formula の複合スリップ、LSD のトルクバイアス、タイヤ荷重感度を含む。各 (v, a_y) に対し非線形連立式を解いて a_x の上下限を求め、GGV 曲面を生成してから H2 と同じ3パス積分を回す。
- 破綻条件（次の階層へ進むべき時）: 過渡は依然ゼロ。加えて (a) 限界近傍で釣り合い解が複数存在／非存在になり数値的に不安定、(b) 「常にヨーモーメント釣り合い」は実車ドライバの挙動（進入で意図的にヨーを立てる）と異なる、(c) LSD・ダンパ・ARB のプリロードは本質的に過渡要素なので、この階層で評価すると符号を誤りうる（Tremlett らは差動装置のトルクバイアス最適値が過渡最適制御でしか出せないことを示した）。次に進むべき条件＝差動装置・ダンパ・過渡的な安定性を扱いたい、または走行ラインの変化を含めたい。
- 学生フォーミュラでの実行可能性: ここで初めてロール剛性配分・重心高・空力バランスがラップタイムに効くようになる。学生チームでも実装可能（釣り合いソルバ＋GGVルックアップ生成）。Brayshaw & Harrison のロール剛性配分最適化はまさにこの階層の代表例。ただしタイヤデータの質がそのまま結果の質になるので、TTCデータのスケーリング仮定を明記しないと数字が独り歩きする。
- MATLAB実装経路: 釣り合いは fsolve（Optimization Toolbox）または自作Newton法。GGV生成 → griddedInterpolant → 3パス積分。Simulink側で組むなら Vehicle Dynamics Blockset の Vehicle Body 3DOF（Dual Track バリアント、横荷重移動あり）＋ Magic Formula Tire を定常入力で掃引する手もあるが、専用スクリプトの方が速く見通しがよい。

**[実務標準（第31章の発展・第29章コースモデルと接続）] 自由軌跡QSS（free-trajectory QSS）— g-gマップを保ったまま走行ラインと速度を同時最適化**

- 仮定・成立条件: 車両性能は g-g（3次元路面なら g-g-g）マップで完全に記述できると仮定。状態は弧長 s 上の横オフセット n(s)、相対方位角、速度など少数次元。ラインと速度プロファイルを同時に最適制御問題として解く。マップは数値モデルからでも実測ログからでも生成できる（Veneri & Massaro 2020）。OCPの規模が「マップ生成に使った車両モデルの複雑さ」に依存しないのが最大の利点。
- 破綻条件（次の階層へ進むべき時）: 「性能が g-g マップで尽くされる」＝過渡が無視できる、という前提を引き継ぐので H2/H3 と同じ過渡の限界がある。一方で「固定ラインの誤り」は消える。マップが速度・路面μ・車高に依存する場合は次元が増え、外挿すると簡単に破綻する。次に進むべき条件＝ヨー過渡や差動装置が結果を支配していると疑われるとき。
- 学生フォーミュラでの実行可能性: 実行可能で費用対効果が高い。実測 g-g から出発できるため、タイヤモデル同定が未成熟なチームでも「うちの車の実力で最速ラインはどこか」を出せる。オートクロスのライン検討・コーン配置の読みに直接使える。ただし過渡が支配的なFSAEコースでは最適ラインが実走で再現できないことがあり、その差自体を過渡モデルの必要性の根拠として使うのが誠実。
- MATLAB実装経路: MATLAB + CasADi（Optiスタック）+ IPOPT。状態数が少ないためNLPが小さく、ノートPCで解ける。g-gマップは griddedInterpolant を CasADi の interpolant に置き換える（自動微分可能な形にする必要がある点が実装上の勘所）。

**[実務標準だが定義が曖昧（第31章・文献読解用）] 準過渡（quasi-transient / quasi-static）— 一部の状態のみ動的に扱う中間モデル**

- 仮定・成立条件: ヨー角加速度をゼロと置かない（ヨーのみ動的）、タイヤ緩和長による力の遅れを1次遅れで入れる、ロール／ピッチは準静的、といった部分的な動的化。Siegler・Deakin・Crolla（SAE 2000-01-3563）の分類でいう quasi-static がこれにあたり、同論文は「過渡挙動をヨーダンピング等の動的効果を無視した quasi-static で近似してきた」ことを問題として比較した。
- 破綻条件（次の階層へ進むべき時）: どの効果を入れどれを落としたかが実装ごとに違い、標準が存在しない。落とした効果と入れた効果が相殺して偶然合ってしまうことがあり、検証が原理的に難しい。教科書としては「文献の quasi-static / quasi-transient という語は著者ごとに定義が違うので、必ず定義節を読め」と明示すべき階層。
- 学生フォーミュラでの実行可能性: 中途半端になりやすい。学生チームには「H3 で止めて実測検証に注力するか、H6/H7 へ跳ぶか」を勧めるのが実務的。ただし論文を正しく読むために定義を知る価値は高い。「知る価値はあるが、自分で作る優先度は低い」階層。
- MATLAB実装経路: 自作（H3の釣り合いソルバにヨー方程式と1次遅れを追加）。この階層を明示的に提供する既製ツールはほぼ無い。

**[実務標準（第31章、および第V部・第VI部と共通の資産）] 完全過渡・閉ループ前向きシミュレーション（ドライバモデル付き時間積分）**

- 仮定・成立条件: 車両を常微分方程式系として時間積分する（7〜14自由度＋タイヤ緩和＋駆動系＋空力）。ドライバモデル（プレビュー操舵＋速度目標追従）が操舵・アクセル・ブレーキを生成する。速度目標は通常 H2/H3 の QSS プリパスから作る。Fernandez Colunga & Bradley はこの階層で「理想ドライバ」の制御戦略（有限時間制御・予測制御）を比較し、コース曲率が操舵の参照として有効であることを示した。
- 破綻条件（次の階層へ進むべき時）: **出てくるラップタイムは『そのドライバモデルのラップタイム』であって車両性能の上界ではない。** これが最大の落とし穴で、ドライバゲインを変えるとセットアップ比較の符号が反転しうる。コントローラが限界に届かなければ本当は速いセットアップが遅く出るし、プレビュー距離を長く取りすぎると人間には不可能な先読みになる。加えて計算コストが跳ね上がり、感度解析に必要な数百〜数千ケースが回せなくなる。次に進むべき条件＝ドライバモデルに依存しない「性能の上界」が欲しくなったら H7 へ。
- 学生フォーミュラでの実行可能性: 価値はラップタイムではなく操縦性・制御設計・DILにある。第V部（TC・LQR・MPC）と第VI部（SIL/コード生成/HIL/DIL）はこのモデルをそのまま使う。「セットアップのランキングには使わない、制御と体感の評価に使う」と割り切ると極めて有用。学生チームでも Simulink があれば構築可能。
- MATLAB実装経路: Simulink。Vehicle Dynamics Blockset：Vehicle Body 3DOF（Single Track / Dual Track バリアント）または Vehicle Body 6DOF、Magic Formula Tire / Fiala Wheel 2DOF、Predictive Driver（縦：PI / Scheduled PI / Predictive、横：Predictive / Stanley、MacAdam のプレビュー制御に基づく）。Longitudinal Driver / Lateral Driver 単体ブロックもある。Simscapeで組むなら Simscape Vehicle Templates、および GitHub simscape/Formula-Student-Vehicle-Simscape（MathWorks の Formula Student 向けテンプレート、マルチボディサス＋スキッドパッド等のイベント付き）。

**[研究最前線だが学生でも到達可能（第32章の中核）] 最小ラップタイム最適化（MLTP）— 完全動的モデル＋自由軌跡、直接法（direct collocation / multiple shooting）+ CasADi/IPOPT**

- 仮定・成立条件: 独立変数を時間 t ではなく弧長 s に取る（curvilinear abscissa、Lot & Biral 2014）。コースは中心線の曲率 κ(s) と左右幅で記述。状態＝車両の動的状態＋横オフセット n(s)＋相対方位角 ξ(s)。目的関数は ∫ (dt/ds) ds の最小化。直接法（直交Gauss-Legendreコロケーション等）でNLPに離散化し、内点法 IPOPT で解く。CasADi が自動微分で厳密な疎Jacobian/Hessianを供給する。ドライバは「完全先読みの最適制御器」＝人間ではない。
- 破綻条件（次の階層へ進むべき時）: (1) モデル誤差を最適化器が徹底的に食い物にする（タイヤデータ範囲外への外挿、非現実的な操舵レート、負の摩擦仕事など）。対策は操舵レート・ジャーク・スリップ角の明示的な上下限。(2) 非平滑要素（変速、ABS、バンプストップ、LSDのロック／アンロック）はそのままでは入らず平滑化・正則化が必要で、その平滑化パラメータが答えを変える。(3) 局所最適・初期推定依存（TUMFTM実装はウォームスタート用に w0.csv, lam_x0.csv, lam_g0.csv を保存する設計）。(4) 離散化が粗いと拘束がコロケーション点でしか効かず「速すぎる」解が出る → メッシュ収束確認が必須。(5) 得られた解が人間に再現不可能なことがある。次に進むべき条件＝間接法や凸化で速度・精度を稼ぎたいとき（H8）。
- 学生フォーミュラでの実行可能性: 実行可能。MATLAB + CasADi + IPOPT はすべて無償で、FSAE向け無償MathWorksライセンスと併用できる。価値は「理論上界の把握」と「NLPのLagrange乗数からパラメータ感度が副産物で得られる」こと。ただし H3 が実測と合っていない段階でこの階層に進むと、出てくるのは精緻な虚構にすぎない。順序を守ること自体が教科書の主張になる。
- MATLAB実装経路: MATLAB + CasADi（LGPL、公式MATLAB/Octaveインタフェース）。API：import casadi.* → opti = Opti(); x = opti.variable(nx,N+1); opti.minimize(J); opti.subject_to(...); opti.solver('ipopt', plugin_opts, solver_opts); sol = opti.solve();。代替：ICLOCS2（Imperial College London、直接コロケーション＋可変次数擬スペクトル＋積分残差最小化、IPOPT/fmincon/WORHP対応、無償）、GPOPS-II（商用）。fmincon 単体は疎構造と自動微分を活かせず現実的でない。参考実装：TUMFTM/global_racetrajectory_optimization の opt_mintime_traj（Python、CasADi＋IPOPT、直交Gauss-Legendreコロケーション、ダブルトラック＋Magic Formula＋準定常荷重移動、LGPL-3.0）。

**[研究最前線（第32〜33章の展望として紹介、実装は不要）] 間接法（Pontryagin最小原理）／凸最適化再定式化／3次元コース／機械学習代理モデル**

- 仮定・成立条件: 間接法は PMP から随伴方程式を導出し2点境界値問題として解く（Dal Bianco ら 2019 が直接法と定量比較）。凸最適化はエネルギーマネジメント側を凸に落として大域最適を保証（Salazar らのグループ、主にEV／ハイブリッド）。3次元コースはバンク・勾配・うねりを微分幾何的に扱う（Perantoni & Limebeer 2015 Part 1/2、Lovato & Massaro 2022）。ML代理はOCPの解を学習して実時間化（Garlick & Bradley 2022）。
- 破綻条件（次の階層へ進むべき時）: 間接法は随伴方程式の導出労力が大きく拘束の切り替え（アクティブセット変化）に弱いが、収束すれば高精度・高速。凸化はパワートレイン側にしか適用できないことが多く、タイヤ非線形を含む横運動には効かない。ML代理は学習データ範囲外で無言のまま外す（外挿の警告が出ない）ので、検証なしの使用は危険。
- 学生フォーミュラでの実行可能性: **知る価値はあるが、学生チームが実行するものではない。** 例外的に教材価値が高いのは3次元コース：FSAE会場（駐車場・空港滑走路等）はほぼ平坦なので3D化が不要だと根拠を持って書ける。「使わない理由を説明できる」ことは実務水準の一部であり、良い教材になる。凸最適化系はEV対象なのでICE前提の本教科書では対象外だが、手法として言及する価値はある。
- MATLAB実装経路: 間接法は PINS/XOptima（商用）または自作。凸最適化は CVX / YALMIP + MOSEK（学生無償ライセンスあり）。ML代理は Deep Learning Toolbox / Statistics and Machine Learning Toolbox。本教科書では概念紹介に留めるのが妥当。

### 実務でよく起きる誤り

- 【最大の誤り】絶対ラップタイムを信じる。ラップタイムシミュレーションが答えられるのは Δ（差）であって絶対値ではない。「シミュレーションで62.3秒」という報告は、相関誤差が数%（＝1〜2秒）ある以上、意味を持たない。教科書では最初にこれを宣言し、以後すべての例をΔで示すべき。
- 【辻褄合わせの誘惑】ラップタイムを実測に合わせるためにグローバルなグリップ係数（grip factor / tyre scaling）を1回だけ調整する。これはモデル誤差を1個のノブに押し込む行為で、その瞬間に感度解析の結果が全部無意味になる（誤差がパラメータ間に不均等に配分される）。OpenLAPのドキュメントは「グリップ係数は全域で1にし、特定区間の相関改善にのみ触れ」と明記している。
- 【タイヤデータの過信】FSAE TTC等のフラットトラック試験データをそのまま使うと必ずグリップを過大評価する。ベルト表面の性状、ゴムの堆積、路面テクスチャの不在、温度・内圧・キャンバの試験範囲が実走と違う。スケーリング係数は「物理定数」ではなく「未知の誤差をまとめた当てはめパラメータ」であり、その旨を明記せずに使うと、スケール後の絶対値を根拠に設計判断してしまう。
- 【QSSの適用限界の誤認】FSAEオートクロス／エンデュランスは、スラローム間隔7.5〜12 m（エンデュランスは9〜15 m）、最小旋回直径9 m、直線80 m以下。車速10〜15 m/sなら向き変え周期は0.5〜1 sで、タイヤ緩和長とヨー応答の時定数（0.1〜0.3 sオーダー）に対して無視できない。つまりラップの大半が過渡であり、QSSは系統的に「速すぎる」タイムを出す。F1やGPで確立されたQSSの妥当性をFSAEにそのまま持ち込んではいけない。
- 【点質量モデルで設定を論じる】OptimumLapなど点質量QSSでは、ロール剛性配分・重心高（横方向の効果）・ARB・ダンパ・デフの効果が数学的に厳密にゼロになる。「シミュレーションではロール配分の影響が見られなかった」は、モデルにその機構が無いという意味であって、影響が無いという意味ではない。感度解析の鉄則：問いたい機構がモデルに入っていなければ、答えは常にゼロになる。
- 【固定ラインのバイアス】走行ラインを固定して2つのセットアップを比較すると、「セットアップが変わればラインも変わる」効果を切り捨てる。Brayshaw & Harrison はF1で重心6%後方移動による最適ラインの差は小さいと報告したが、これはF1の話であり、旋回半径が桁違いに小さいFSAEに一般化できる保証はない。ラインの再最適化を含めるか、少なくとも含めないことによるバイアスを明示すること。
- 【最小曲率ライン＝最速ラインという誤解】最小曲率ラインはコーナーでは最小時間ラインに近いが、車両の加速度限界を使い切らない場面（低速コーナー立ち上がり、パワー律速の高速区間）ではずれる。TUMFTM の README がこれを明記している。FSAEの低速・低ダウンフォース領域はまさに「加速度限界を使い切らない場面」が多い。
- 【最適化器によるモデル誤差の搾取】MLTP（最適制御）は、タイヤモデルのデータ範囲外の外挿、非現実的な操舵レート、非平滑要素の抜け穴を必ず見つけて利用する。対策：操舵角レート・ジャーク・スリップ角・スリップ率に明示的な上下限を課し、解が得られたら必ず「タイヤモデルの当てはめ範囲内に留まっているか」を事後検査する。この検査を書かない実装は信用してはいけない。
- 【メッシュ収束の未確認】直接法では拘束がコロケーション点上でしか課されない。メッシュが粗いと点間で拘束が破られ、ラップタイムが実現不可能なほど短く出る。必ずメッシュを2倍・4倍に細かくして解が収束することを確認する。これを怠った「最適化により0.8秒短縮」の報告は数値誤差である可能性がある。
- 【初期推定と局所最適】MLTPは非凸で、初期推定次第で別の局所解に落ちる。TUMFTM実装がウォームスタート用に双対変数まで保存しているのはそのため。複数の初期推定から解いて同じ解に到達することを確認するのが最低限の作法。
- 【ドライバモデルの汚染】過渡・閉ループシミュレーションが出すのは「そのドライバモデルのラップタイム」であって車両性能の上界ではない。ドライバゲインを変えるとセットアップ比較の符号が反転しうる。閉ループ結果でセットアップをランキングするのは危険で、閉ループは操縦性・制御設計・DILに使い、ランキングはQSSかMLTPで行う、と役割分担するのが実務。
- 【周回収束の未確認】閉ループ過渡シミュレーションでは、燃料減少・タイヤ温度・熱的状態が周回とともに変化するため、1周だけ回した結果は初期条件に依存する。何周で収束するかを確認する必要がある（Takács & Zelei が「lap time convergence」として正面から扱っている）。
- 【ラップタイムだけで検証する】総ラップタイムだけを実測と合わせると、2つの誤差が打ち消し合っている状態を「相関が取れた」と誤認する。検証は必ず距離に対する速度トレース（および可能なら横加速度トレース、セクタタイム）で行う。区間ごとの符号が揃って初めてモデルが正しい。
- 【スキッドパッドで検証しない】スキッドパッド（内円直径15.25 m＋走路幅3 m）は真の定常円旋回であり、QSSが厳密に正しい唯一の条件。ここが合わないモデルは、他のどの種目でも合うはずがない。にもかかわらず、いきなりオートクロスで相関を取ろうとするチームが多い。検証は「アクセラレーション（縦のみ）→スキッドパッド（横のみ・定常）→オートクロス（複合・過渡）」の順に段階を踏むこと。
- 【アクセラレーションで支配的な要素を取り違える】75 mのアクセラレーションはローンチと変速が支配する。タイヤモデルを精緻化するより、変速時のトルク抜け時間（0.05〜0.2 s）を1回測る方が予測精度に効く。「モデルの精緻化と支配的不確かさは一致しない」ことの好例。
- 【コース曲率の数値微分ノイズ】FSAEコースは測量されていないので、GPS軌跡やIMUからκ(s)を作ることになる。位置を2回微分すると高周波ノイズが増幅し、偽のコーナーが多数生じてQSSがそこで無用に減速する。スプライン近似回帰やフィルタ（OpenTRACKは0.5 s推奨）で平滑化してから曲率を出す。平滑化の強さが答えを変えるので、その感度も見る。
- 【感度解析を一因子ずつ（OAT）で済ませる】ロール剛性配分と空力バランスのように交互作用の強いパラメータでは、1つずつ振る方法（OAT／トルネード図）は最適点を見落とす。ラテン超方格やSobol列で設定空間を大域的にサンプリングし、標準化回帰係数やSobol指数で評価する（Doyle らはFSAEでLHSを使用）。ただしサンプル数×計算時間の制約から、この目的では過渡モデルではなくQSSを使う判断が要る。
- 【ラップタイム最適化と得点最適化の混同】得点式は非線形（オートクロスは Tmax/Tteam の比の形、エンデュランスも同様、効率は EF = T²·E）。同じ0.1秒でも、トップ集団にいるときと後方にいるときで得点への寄与が大きく違う。さらに配点は大会ごとに異なる（本調査で確認したFSG 2025は Skidpad 50 / Acceleration 50 / Autocross 100 / Endurance 250 / Efficiency 75 ほか、合計1000点。FSAE米国大会・学生フォーミュラ日本大会は配点もコース諸元も異なる）。ラップタイムだけを目的関数にすると、得点上の最適から外れる。
- 【効率スコアを無視したラップタイム最適化】FSGの効率係数は EF = T²·E（Tは未補正走行時間、EはCVでは補正燃料質量）。ラップタイムが2乗で効くので効率は時間と強く結合しており、燃料消費を予測しないラップタイムシミュレータは効率の75点に一切答えられない。QSSに燃料流量モデルを足すのは比較的容易で、費用対効果が高い。
- 【ヨー慣性の軽視】F1のQSS研究由来の「ヨー慣性の影響は小さい」という結論をFSAEに持ち込むのは危険。ホイールベースが短く、要求ヨー角加速度が桁違いに大きいFSAEでは、ヨー慣性とその配分（前後の質量集中）が向き変え性能を直接支配しうる。Casanova の学位論文はヨー慣性の重要性を最小時間操縦の文脈で扱っている。
- 【階層を飛ばす】H3（四輪QSS）が実測と合っていない段階でH7（MLTP）に進むと、得られるのは精緻な虚構でしかない。最適制御はモデルの誤りを増幅する装置であって、補正する装置ではない。階層を上げる条件は「今の階層で答えられない問いが生じたとき」であり、「今の階層が実測と合わないとき」ではない（後者はモデルではなくデータと同定を疑うべき場面）。
- 【文献の用語の非統一】quasi-static / quasi-transient / quasi-steady-state は著者ごとに定義が違う。Siegler らは steady state / quasi-static / transient の3分類、Massaro & Limebeer は「QSS vs 過渡」×「固定軌跡 vs 自由軌跡」の2軸。論文を読むときは必ず定義節を確認し、教科書内では自前の定義を明示して使い切ること。

### 学生フォーミュラ固有の事情

【コース諸元が階層選択を決める】Formula Student Rules 2025（FSG）で確認した数値：アクセラレーション＝直線75 m（D 5.1.1）。スキッドパッド＝内円直径15.25 m・外円直径21.25 m・円中心間18.25 m・走路幅3 m、右2周＋左2周で2周目と4周目を計測して平均（D 4.1〜4.3）。オートクロス＝直線80 m以下、スラロームのコーン間隔7.5〜12 m、最小走路幅3 m、最小旋回直径9 m、全長1.5 km未満（D 6.1）。エンデュランス＝直線80 m以下、スラローム9〜15 m、1周約1 km、全長約22 km（D 7.1）。この「直線が短く、旋回半径が小さく、向き変えが絶え間ない」構造が、FSAEにおけるラップタイムシミュレーションの本質的困難そのものである。最小旋回直径9 m＝半径4.5 m、走路幅3 mを考えると、旋回半径はスキッドパッドの約8.4 mを含めて5〜20 mのオーダー。車速10〜15 m/sで半径10 mなら横加速度は1.0〜2.3 g、ヨー角速度は1.0〜1.5 rad/s。F1が数百 m の半径を200 km/h超で走るのとは、ヨーダイナミクスの時間スケールが完全に別物になる。

【なぜ準定常が苦しいか（定量）】スラローム間隔10 m・車速12 m/sなら向き変え周期は約0.83 s。タイヤ緩和長を0.3 m、車速12 m/sとすると力の立ち上がり時定数は約0.025 s（小さい）だが、ヨー慣性と操舵系コンプライアンスを含めた実効的なヨー応答時定数は0.1〜0.3 sになる。周期0.83 sに対して立ち上がり0.2 s級ということは、各向き変えの1/4程度が過渡である。つまりFSAEオートクロスは「定常状態が主・過渡が例外」ではなく「過渡が常態」。教科書はこの数字を第30章の冒頭で提示し、QSSを使う理由を「正しいから」ではなく「他に手軽な手段がないから、かつΔの傾向は保存されるから」と正直に説明すべきである。

【小さいタイヤ・低速・低ダウンフォースの帰結】(1) タイヤ径が小さい（10〜13インチ）ため接地長が短く、緩和長も短い＝タイヤ側の過渡はむしろ速い。逆に言えば車両側（ヨー慣性・ロール）の過渡が支配的になる。(2) 平均車速は40〜60 km/h程度で、ダウンフォースは車速の2乗に比例するため、GGV曲面の速度依存性がF1に比べて弱い。つまり「g-gがほぼ速度独立」に近づき、モデルは単純化できる一方で、タイヤの荷重感度（μがFzとともに低下する）と温度・内圧の効きが相対的に支配的になる。空力の議論より、まずタイヤの荷重感度を正しく入れる方が予測精度に効く。(3) 多くの領域でトラクション律速（駆動力不足ではなくグリップ不足で加速が決まる）になるため、FSAE.com等でも指摘される通り、シミュレーション結果はトラクション入力（＝タイヤμとその荷重感度）に極めて敏感になる。パワーを上げても結果が変わらない、という現象は正しい物理であってバグではない。

【TTCデータの有無と扱い】FSAE Tire Test Consortium（FSAE TTC、Calspan にて試験、Milliken Research Associates が運営）に加盟すればFSAE用タイヤの力・モーメントデータが入手できる。これは他のカテゴリの学生には無い決定的な優位点である一方、フラットトラック（ベルト）試験のデータをそのまま使うとグリップを過大評価する。ベルト表面性状・ゴム堆積・路面テクスチャの不在・温度と内圧の履歴が実走と異なるためで、スケーリング係数（多くのチームが0.5〜0.7程度を使う）は物理定数ではなく「未知の誤差をまとめた当てはめパラメータ」である。教科書はこの点を第10〜11章（タイヤ係数同定）と第30章（QSS）の両方で明示し、「スケーリングした瞬間に絶対値の主張は放棄される」ことを書くべき。TTCに加盟していないチーム向けには、実測 g-g から出発する自由軌跡QSS（Veneri & Massaro の方法）が現実的な代替経路になる。

【種目とモデル階層の対応（教科書の構成案）】アクセラレーション（75 m）＝縦運動のみ点質量で完結、支配要因はローンチと変速時トルク抜け時間。スキッドパッド＝定常円旋回そのもので、QSSが厳密に正しい唯一の条件、したがってモデル検証の第一段。オートクロス（<1.5 km、1周）＝QSSの主戦場だが過渡誤差が最大、ライン最適化の価値も最大。エンデュランス（約1 km×22 km）＝ラップタイムに加えて燃料消費・タイヤ摩耗・熱・ドライバ交代を含む「レースシミュレーション」の層が必要。この4種目の並びが、そのまま「モデル階層を上げていく理由」の物語になる。

【効率スコアという固有事情】FSGの効率係数は EF = T²·E（T＝未補正走行時間、E＝CVでは補正燃料質量、EVでは使用エネルギー、E85は1.45で除して98 RON相当に換算、燃料上限15 kg/100 km）。効率対象となるには「エンデュランスで得点している」「未補正エンデュランス時間が最速車の1.333倍以内」が条件。ラップタイムが2乗で効くため、時間と燃費は独立に最適化できない。したがってFSAE向けのラップタイムシミュレータは「燃料流量マップ（BSFC）を持ち、周回燃料を積算できる」ことが実質的な必須要件になる。これは市販のOptimumLapでは扱いにくく、自作MATLABを持つ強い動機になる。

【配点は大会ごとに違う】本調査で確認したFSG 2025のCV & EV配点は、Business Plan 75／Cost 100／Design 150／Skidpad 50／DV Skidpad 75／Acceleration 50／DV Acceleration 75／Autocross 100／Endurance 250／Efficiency 75＝合計1000点（静的325＋動的675で検算一致）。FSAE米国大会および学生フォーミュラ日本大会（JSAE）は配点もコース諸元も異なるため、日本語教科書としては「読者は自分が出る大会の規則書の該当章を必ず確認せよ」と明記し、本文の数値はFSGの版と年を明記して使うべきである。

【学生が実際に到達できる範囲の現実的な線引き】H0〜H3（縦運動点質量／g-g・GGV／QSS点質量3パス／QSS四輪）＝全チームが到達すべき。H4（自由軌跡QSS）とH7（CasADi+IPOPTのMLTP）＝強い学生1〜2名がいれば1シーズンで到達可能、しかもソフトウェアは全て無償（MathWorksのFSAE無償ライセンス＋CasADi LGPL＋IPOPT）。H6（過渡・閉ループ）＝Simulinkがあれば構築可能だが、ラップタイムのランキングに使うと誤るので、制御設計（第V部）とDIL（第VI部）の資産と位置づける。H8（間接法・凸最適化・3次元・ML代理）＝知る価値はあるが実行しない、と明記してよい。特に3次元コースについては「FSAE会場は駐車場や滑走路でほぼ平坦だから不要」と根拠を持って書ける、良い"適用範囲"の教材になる。

【実装経路のまとめ（MATLAB/Simulink）】追加Toolbox不要：H0〜H2（自作、またはOpenLAP をGPL v3で参照）。Optimization Toolbox：H3の釣り合いソルバ（fsolve）。Statistics and Machine Learning Toolbox：lhsdesign / sobolset（感度解析のサンプリング）。Simulink Design Optimization：Sensitivity Analyzer アプリと sdo.sample / sdo.evaluate / sdo.analyze / sdo.ParameterSpace / sdo.SampleOptions（Method は 'random' / 'latinHypercube' / 'sobol' / 'halton' / 'sequential'、sobol は Statistics and ML Toolbox が必要）。Vehicle Dynamics Blockset：H6（Vehicle Body 3DOF の Single Track/Dual Track、Vehicle Body 6DOF、Magic Formula Tire、Fiala Wheel 2DOF、Predictive Driver＝縦 PI/Scheduled PI/Predictive・横 Predictive/Stanley）。Simscape：Simscape Vehicle Templates および simscape/Formula-Student-Vehicle-Simscape。CasADi（LGPL、無償、MATLABインタフェース）+ IPOPT：H4とH7。代替として ICLOCS2（無償、MATLAB完結、直接コロケーション＋擬スペクトル）、GPOPS-II（商用）。fmincon 単体でのMLTPは疎構造と自動微分を活かせず非現実的。

【調査上の注記（引用の規律に関して）】本調査で挙げた文献は、Crossref API または Semantic Scholar Graph API でDOIレコードの実在（タイトル・著者・掲載誌・巻号頁）を確認したもの、もしくは出版社／リポジトリ／GitHubのページを直接取得して内容を確認したものに限っている。以下は「未確認」として扱うこと：(1) Casanova の学位論文（Cranfield 2000）はタイトル・大学・年を複数の二次情報源で確認したが、リポジトリのハンドルURLを直接開いていないためURLを記載していない。(2) Chalmers の学士論文のハンドル（20.500.12380/307698）は取得したページの記載に基づく。(3) OptimumLap の「実データとの誤差10%以内」「apex速度・ストレートエンド速度・エネルギー消費・総ラップタイムが一致」という精度主張は開発元OptimumG自身のものであり、第三者による検証ではない。(4) FSAE米国大会規則および学生フォーミュラ日本大会規則は本調査では確認していない（確認したのは Formula Student Germany の Formula Student Rules 2025 Version 1.1 のPDFのみ）。コース諸元・配点を本文に書く際は、対象大会の当該年度規則書を必ず参照し直すこと。(5) SAE Technical Paper（730018, 2000-01-3563, 2002-01-0567, 2016-36-0164, 2019-01-0163, 2026-01-0762）は Crossref でDOIの実在と書誌情報を確認したが、有料のため全文は未読であり、要旨レベルの情報にとどまる。本文で内容を詳述する際は必ず全文を入手して確認すること。

### 参照文献

- **William F. Milliken, Douglas L. Milliken, "Race Car Vehicle Dynamics", SAE International, 1995, ISBN 1-56091-526-9（922ページ）**
  - 種別: 書籍 / 入手性: 有料（SAE書籍。大学図書館にある場合が多い）
  - 用途: 第28章 g-gダイアグラムの原典的解説と、ラップタイムシミュレーションの古典的定式化。出版社紹介文が「Moment Method、g-g Diagram、pair analysis、lap time simulation、tire data normalization」を著者らの独自貢献として明記しており、g-gとラップシムの系譜を書くときの一次的な拠り所になる。第7〜11章（タイヤ）・第12〜16章（サスペンション）とも共通の参照。
- **Douglas L. Milliken, Edward M. Kasprzak, L. Daniel Metz, William F. Milliken, "Race Car Vehicle Dynamics — Problems, Answers and Experiments", SAE International, 2003, ISBN 978-0-7680-1127-2**
  - 種別: 書籍 / 入手性: 有料
  - 用途: 上記の演習書。第28章・第33章の章末問題を設計する際の難易度基準と、学生が自分で確かめられる実験手順の出典。
- **David J. N. Limebeer, Matteo Massaro, "Dynamics and Optimal Control of Road Vehicles", Oxford University Press, 2018, ISBN 9780198825715（hardback）/ 9780198825722（paperback）**
  - 種別: 書籍 / 入手性: 有料（大学図書館経由が現実的）
  - 用途: 第32章（最小ラップタイム最適化）の理論的正典。非線形最適制御を車両問題に適用する統一的扱い（タイヤ・四輪車・二輪車）を1冊で提供する唯一の書。最小時間問題・最小燃料問題を扱う。数学を妥協しない本教科書の方針に最も合致する。
- **James Balkwill, "Lap-Time, Manoeuvre and Full-Vehicle Simulation", in: Performance Vehicle Dynamics: Engineering and Applications, Elsevier/Butterworth-Heinemann, 2018, pp. 319–330, ISBN 9780128126936, DOI 10.1016/B978-0-12-812693-6.00009-2**
  - 種別: 書籍 / 入手性: 有料（大学のScienceDirect契約経由でアクセス可能な場合が多い）
  - https://doi.org/10.1016/b978-0-12-812693-6.00009-2
  - 用途: 学部生向けの平易さと実務性のバランスが本教科書に近い。第28章の導入部の書き方（どこまで簡略化してよいかの説明順序）の参考。
- **Matteo Massaro, David J. N. Limebeer, "Minimum-lap-time optimisation and simulation", Vehicle System Dynamics, Vol. 59, No. 7, pp. 1069–1113, 2021, DOI 10.1080/00423114.2021.1910718**
  - 種別: 論文 / 入手性: 有料（Bronze OA扱いで出版社PDFが読める場合あり。大学経由推奨）
  - https://doi.org/10.1080/00423114.2021.1910718
  - 用途: 第IV部全体の骨格を決めるサーベイ。手法を「準定常モデル vs 過渡モデル」×「あらかじめ与えた軌跡 vs 最適化する自由軌跡」の2軸で分類しており、本教科書の階層（H2〜H4 と H6〜H7）の分類根拠として直接引用できる。3次元路面モデリングと車両位置決めの扱いも含む。
- **R. S. Rice, "Measuring Car-Driver Interaction with the g-g Diagram", SAE Technical Paper 730018, 1973, DOI 10.4271/730018**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus。大学契約があれば可）
  - https://doi.org/10.4271/730018
  - 用途: 第28章 g-gダイアグラムの原典。「g-gは車両の限界ではなくドライバと車両の相互作用の測定である」という本来の意味づけを示す文献で、実測g-g散布図を性能包絡線と混同する誤りを正す根拠になる。
- **D. L. Brayshaw, M. F. Harrison, "A quasi steady state approach to race car lap simulation in order to understand the effects of racing line and centre of gravity location", Proceedings of the Institution of Mechanical Engineers, Part D: Journal of Automobile Engineering, Vol. 219, No. 6, pp. 725–739, 2005, DOI 10.1243/095440705X11211**
  - 種別: 論文 / 入手性: 有料（大学のSAGE契約経由）
  - https://doi.org/10.1243/095440705X11211
  - 用途: 第30章 QSSの標準的引用元。7自由度モデルからg-g速度線図を中間出力として生成する方法と、過渡最適制御に比べ計算量が桁違いに小さいことを示す。重心を6%後方に動かしても最適ラインの差はドライバが使えるほど大きくない、という結論は「ラインは固定してよいか」を論じる第29章の重要な材料。
- **D. L. Brayshaw, M. F. Harrison, "Use of numerical optimization to determine the effect of the roll stiffness distribution on race car performance", Proceedings of the Institution of Mechanical Engineers, Part D: Journal of Automobile Engineering, Vol. 219, No. 10, pp. 1141–1151, 2005, DOI 10.1243/095440705X34900**
  - 種別: 論文 / 入手性: 有料（大学のSAGE契約経由）
  - https://doi.org/10.1243/095440705x34900
  - 用途: 第33章 セットアップ感度解析の直接の手本。ロール剛性配分を最適化変数として扱い、20〜80 m/s の全速度域で横加速度能力が改善（特に複合制動旋回で顕著）、平均10%以上の操縦性能改善を示した。「点質量モデルではこの結論は原理的に出せない」＝モデル階層と問える問いの対応、を示す教材にもなる。
- **Blake Siegler, Andrew Deakin, David Crolla, "Lap Time Simulation: Comparison of Steady State, Quasi-Static and Transient Racing Car Cornering Strategies", SAE Technical Paper 2000-01-3563, 2000, DOI 10.4271/2000-01-3563（University of Leeds）**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）
  - https://doi.org/10.4271/2000-01-3563
  - 用途: 第31章「過渡を含む」の中心引用。定常／準静的／過渡の3方式を同一条件で比較し、従来の準静的近似がヨーダンピング等の動的効果を無視していることを問題提起した。本教科書の H2/H5/H6 の区別はこの論文の用語体系に合わせるのが安全。
- **Blake Siegler, David Crolla, "Lap Time Simulation for Racing Car Design", SAE Technical Paper 2002-01-0567, 2002, DOI 10.4271/2002-01-0567**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus）
  - https://doi.org/10.4271/2002-01-0567
  - 用途: 上記の続編。ラップタイムシミュレーションを「設計判断の道具」として位置づける枠組みの出典。第33章の導入に使える。
- **M. Veneri, M. Massaro, "A free-trajectory quasi-steady-state optimal-control method for minimum lap-time of race vehicles", Vehicle System Dynamics, Vol. 58, No. 6, pp. 933–954, 2020, DOI 10.1080/00423114.2019.1608364**
  - 種別: 論文 / 入手性: 有料（大学のTaylor & Francis契約経由）
  - https://doi.org/10.1080/00423114.2019.1608364
  - 用途: H4（自由軌跡QSS）の原典。「QSSモデル＋固定軌跡」でも「動的モデル＋自由軌跡」でもない第三の道を明確に定義した論文。g-gマップは数値でも実験でも作れると明記しており、実測g-gから出発するFSAE向けの実践経路の根拠になる。固定軌跡 vs 自由軌跡の差の議論も含む。
- **S. Lovato, M. Massaro, "A three-dimensional free-trajectory quasi-steady-state optimal-control method for minimum-lap-time of race vehicles", Vehicle System Dynamics, Vol. 60, No. 5, pp. 1512–1530, 2022, DOI 10.1080/00423114.2021.1878242**
  - 種別: 論文 / 入手性: 有料
  - https://doi.org/10.1080/00423114.2021.1878242
  - 用途: 上記の3次元拡張で、g-g ではなく g-g-g 線図を使う。重要な性質として「OCPの規模が、g-g-gを生成した車両モデルの複雑さに依存しない」ことを示す。FSAE会場が平坦なので3D化は不要、と根拠を持って書くための対照材料。
- **Alexander Heilmeier, Maximilian Geisslinger, Johannes Betz, "A Quasi-Steady-State Lap Time Simulation for Electrified Race Cars", 2019 Fourteenth International Conference on Ecological Vehicles and Renewable Energies (EVER), Monte-Carlo, IEEE, pp. 1–10, 2019, DOI 10.1109/EVER.2019.8813646**
  - 種別: 論文 / 入手性: 有料（IEEE Xplore。大学経由）
  - https://doi.org/10.1109/ever.2019.8813646
  - 用途: オープンソース実装 TUMFTM/laptime-simulation の理論論文。QSSでラップタイムとエネルギー消費を同時に予測する構成は、FSAEの効率スコア（EF = T²·E）を扱う第33章に直結する。
- **Ivan Fernandez Colunga, Andrew Bradley, "Modelling of transient cornering and suspension dynamics, and investigation into the control strategies for an ideal driver in a lap time simulator", Proceedings of the Institution of Mechanical Engineers, Part D: Journal of Automobile Engineering, Vol. 228, No. 10, pp. 1185–1199, 2014, DOI 10.1177/0954407014525362**
  - 種別: 論文 / 入手性: 有料（大学のSAGE契約経由）
  - https://doi.org/10.1177/0954407014525362
  - 用途: 第31章 H6（過渡・閉ループ）の中心引用。7自由度サスペンションモデルと過渡旋回を状態空間化し、「理想ドライバ」の制御戦略（有限時間制御・予測制御）を比較する。コース曲率を操舵の参照信号として使う手法は、Simulinkでドライバモデルを作る際の設計指針そのもの。
- **D. Casanova, "On minimum time vehicle manoeuvring: the theoretical optimal lap", PhD thesis, Cranfield University, 2000**
  - 種別: 学位論文 / 入手性: オープンアクセス（Cranfield CERES / CORE で全文公開されている。ただし本調査ではハンドルURLを直接開いて確認していないため、URLは記載しない）
  - 用途: 第32章 MLTPの出発点。最小時間操縦問題を最適制御問題として定式化し、数理計画法で解く枠組みを確立した。以後の文献がほぼ全て参照する。ヨー慣性の重要性に関する議論も含む（FSAEはホイールベースが短くヨー慣性の相対的影響が大きいので、本教科書では特に重要）。
- **D. P. Kelly, R. S. Sharp, "Time-optimal control of the race car: a numerical method to emulate the ideal driver", Vehicle System Dynamics, Vol. 48, No. 12, pp. 1461–1474, 2010, DOI 10.1080/00423110903514236**
  - 種別: 論文 / 入手性: 有料
  - https://doi.org/10.1080/00423110903514236
  - 用途: 「ドライバをモデル化せず、最適制御で理想ドライバを代替する」という第32章の中心的な考え方の代表文献。H6（ドライバモデル依存）と H7（ドライバ非依存）の違いを説明する際の対比軸になる。
- **Giacomo Perantoni, David J. N. Limebeer, "Optimal control for a Formula One car with variable parameters", Vehicle System Dynamics, Vol. 52, No. 5, pp. 653–678, 2014, DOI 10.1080/00423114.2014.889315**
  - 種別: 論文 / 入手性: 有料（Oxford ORA にリポジトリ版あり）
  - https://doi.org/10.1080/00423114.2014.889315
  - 用途: 最適制御を用いた車両パラメータ感度の研究。第33章「セットアップ感度解析」を最適制御の枠組みで行う方法論の代表例。
- **Giacomo Perantoni, David J. N. Limebeer, "Optimal Control of a Formula One Car on a Three-Dimensional Track—Part 1: Track Modeling and Identification", ASME Journal of Dynamic Systems, Measurement, and Control, Vol. 137, No. 5, 051018, 2015, DOI 10.1115/1.4028253**
  - 種別: 論文 / 入手性: 有料（Oxford ORA に著者版PDFあり）
  - https://doi.org/10.1115/1.4028253
  - 用途: 第29章 コースモデルの正典。GPS等の計測から3次元コース（中心線・曲率・バンク・勾配）を同定する手法を厳密に扱う。FSAEでは2次元で足りるが、「なぜ2次元で足りるのか」を説明するために必要な対照。
- **David J. N. Limebeer, Giacomo Perantoni, "Optimal Control of a Formula One Car on a Three-Dimensional Track—Part 2: Optimal Control", ASME Journal of Dynamic Systems, Measurement, and Control, Vol. 137, No. 5, 051019, 2015, DOI 10.1115/1.4029466**
  - 種別: 論文 / 入手性: 有料（Oxford ORA に著者版PDFあり）
  - https://doi.org/10.1115/1.4029466
  - 用途: 上記の最適制御編。3次元コース上でのMLTPの完全な定式化。第32章の到達点として提示できる。
- **R. Lot, F. Biral, "A Curvilinear Abscissa Approach for the Lap Time Optimization of Racing Vehicles", IFAC Proceedings Volumes, Vol. 47, No. 3, pp. 7559–7565, 2014（19th IFAC World Congress, Cape Town）, DOI 10.3182/20140824-6-ZA-1003.00868**
  - 種別: 論文 / 入手性: オープンアクセス（IFAC-PapersOnLine は ScienceDirect で無料公開されていることが多い）
  - https://doi.org/10.3182/20140824-6-za-1003.00868
  - 用途: 第32章の実装上の要である「独立変数を時間 t から弧長 s に変える」定式化の標準引用。この変換によりコース境界拘束が単純な n(s) の上下限になり、周回問題が固定区間の最適制御問題になる。
- **N. Dal Bianco, E. Bertolazzi, F. Biral, M. Massaro, "Comparison of direct and indirect methods for minimum lap time optimal control problems", Vehicle System Dynamics, Vol. 57, No. 5, pp. 665–696, 2019, DOI 10.1080/00423114.2018.1480048**
  - 種別: 論文 / 入手性: 有料（パドヴァ大学リポジトリに著者版PDFあり）
  - https://doi.org/10.1080/00423114.2018.1480048
  - 用途: 第32章「直接法 vs 間接法」の唯一といってよい定量比較。直接法（NLP、広く使われる）と間接法（Pontryagin原理、少数派だが場合により高効率）を複数の車両問題で比較。学生に「まず直接法（CasADi+IPOPT）でよい」と勧める根拠になる。
- **N. Dal Bianco, R. Lot, M. Gadola, "Minimum time optimal control simulation of a GP2 race car", Proceedings of the Institution of Mechanical Engineers, Part D: Journal of Automobile Engineering, Vol. 232, No. 9, pp. 1180–1195, 2018, DOI 10.1177/0954407017728158**
  - 種別: 論文 / 入手性: 有料（Southampton eprints に著者版PDFあり）
  - https://doi.org/10.1177/0954407017728158
  - 用途: 実車データを持つフォーミュラカーでのMLTP適用例。第32章の検証節（最適制御の解をどう実測と突き合わせるか）の手本。
- **R. Lot, N. Dal Bianco, "Lap time optimisation of a racing go-kart", Vehicle System Dynamics, Vol. 54, No. 2, pp. 210–230, 2016, DOI 10.1080/00423114.2015.1125514**
  - 種別: 論文 / 入手性: 有料
  - https://doi.org/10.1080/00423114.2015.1125514
  - 用途: 車格・速度域がFSAEに最も近い最適制御の実例（レーシングカート）。低速・低ダウンフォース・短ホイールベースという条件でMLTPが何を返すかを知る上で、F1文献より遥かに参考になる。第32章のFSAE応用節の主要典拠。
- **F. Christ, A. Wischnewski, A. Heilmeier, B. Lohmann, "Time-optimal trajectory planning for a race car considering variable tyre-road friction coefficients", Vehicle System Dynamics, Vol. 59, No. 4, pp. 588–612, 2021, DOI 10.1080/00423114.2019.1704804**
  - 種別: 論文 / 入手性: 有料（実装はGitHubでLGPL-3.0公開）
  - https://doi.org/10.1080/00423114.2019.1704804
  - 用途: TUMFTM の opt_mintime_traj の理論論文。MLTPを「直交Gauss-Legendreコロケーションで非線形計画に変換し、内点法IPOPTで解く」「弧長によるコース記述＋CasADiによる自動微分＋スプライン回帰によるコース平滑化で計算時間を削減」と明記しており、第32章の実装手順をそのまま書ける。単輪/二輪モデル＋準定常荷重移動＋非線形タイヤという構成もFSAEに移植しやすい。
- **A. J. Tremlett, M. Massaro, D. J. Purdy, E. Velenis, F. Assadian, A. P. Moore, M. Halley, "Optimal control of motorsport differentials", Vehicle System Dynamics, Vol. 53, No. 12, pp. 1772–1794, 2015, DOI 10.1080/00423114.2015.1093150**
  - 種別: 論文 / 入手性: 有料
  - https://doi.org/10.1080/00423114.2015.1093150
  - 用途: 第22章（駆動系・LSD）と第31〜32章を橋渡しする論文。LSDのトルクバイアスは進入・エイペックス・立ち上がりで最適値が異なり、準定常法では原理的に定量化できないと明示している。「なぜQSSではデフを評価できないのか」の決定的な根拠。ロックデフ比0.01 s、オープンデフ比0.2 s という具体的な数字も第33章の感度議論に使える。
- **Alexander Heilmeier, Alexander Wischnewski, Leonhard Hermansdorfer, Johannes Betz, Markus Lienkamp, Boris Lohmann, "Minimum curvature trajectory planning and control for an autonomous race car", Vehicle System Dynamics, Vol. 58, No. 10, pp. 1497–1527, 2020, DOI 10.1080/00423114.2019.1631455** ✓実在確認（訂正: 訂正不要。Crossref照合で著者6名・巻58・号10・頁1497-1527すべて一致。補足：オンライン先行公開2019年、印刷版2020年10月2日）
  - 種別: 論文 / 入手性: 有料（実装はGitHubで公開）
  - https://doi.org/10.1080/00423114.2019.1631455
  - 用途: 第29章「走行ライン最適化」の中核。最小曲率ラインを二次計画（QP）で解く定式化、曲率近似の精度改善、線形化誤差を抑える反復適用（IQP）、そして速度依存の加速度限界を考慮した前後進ソルバによる速度プロファイル生成までを扱う。2018年ベルリンFormula EでのRoborace DevBot実走で検証済み。
- **Rodrigo Pasiani Costa, Roberto Bortolussi, "Lap Time Simulation of Formula SAE Vehicle With Quasi-steady State Model", SAE Technical Paper 2016-36-0164, 2016, DOI 10.4271/2016-36-0164（Centro Universitário FEI）**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus。大学経由）
  - https://doi.org/10.4271/2016-36-0164
  - 用途: FSAE車両にQSSを適用した査読付き実例。OptimumLapと自作MATLABを併用し、Michigan 2014大会の実タイムでRS8車両を検証してから新型RS9を予測する、という「検証→予測」の順序が第26〜27章（実車データとの突き合わせ・妥当性判断）と第30章のFSAE応用節の直接の手本になる。
- **Darryl Alan Doyle, Geoffrey Cunningham, Gavin White, Juliana Early, "Lap Time Simulation Tool for the Development of an Electric Formula Student Car", SAE Technical Paper 2019-01-0163, 2019, DOI 10.4271/2019-01-0163（Queen's University Belfast）**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus。大学経由）
  - https://doi.org/10.4271/2019-01-0163
  - 用途: 第33章 セットアップ感度解析のFSAE版の決定版。Simulinkで性能包絡線を生成する準定常モデルを作り、OptimumLapと大会実データで検証したうえで、ラテン超方格サンプリング（Latin Hypercube Sampling）で感度解析を行い、ギヤ比とバッテリ容量の最適化に接続している。MATLAB/Simulink＋LHSという実装経路がそのまま学生に提示できる。
- **Dominik Takács, Ambrus Zelei, "Performance Optimization of a Formula Student Racing Car Using the IPG CarMaker, Part 1: Lap Time Convergence and Sensitivity Analysis", Engineering Proceedings (SMTS 2024), Vol. 79, Article 86, MDPI, 2024, DOI 10.3390/engproc2024079086** ✓実在確認（訂正: 訂正不要。Crossref・OpenAlex照合で著者2名・タイトル・年一致。正式には Engineering Proceedings 79(1), 86（SMTS 2024 会議録）。ISSN 2673-4591）
  - 種別: 論文 / 入手性: オープンアクセス（CC BY 4.0、https://www.mdpi.com/2673-4591/79/1/86）
  - https://doi.org/10.3390/engproc2024079086
  - 用途: 第33章の数少ないオープンアクセスかつFSAE特化の感度解析文献。「ラップタイム収束（何周回せば結果が安定するか）」という、閉ループ過渡シミュレーション特有の落とし穴を正面から扱っている点が貴重。CC BY 4.0 なので図表の引用条件が明確で、学生も全文を読める。
- **Tim Albertsson, Isak Nilsson, Alexander Wigh, "Lap time simulation for a Formula Student car", Bachelor Thesis（Examensarbete på kandidatnivå）, Chalmers University of Technology, 2024, handle 20.500.12380/307698** ✓実在確認（訂正: 訂正不要。著者3名・タイトル・学位種別（kandidatnivå = 学士）・機関・年すべて一致。Chalmers Formula Student のためのラップタイムシミュレータ開発が主題であることも本文要旨で確認）
  - 種別: 学位論文 / 入手性: オープンアクセス（Chalmers ODR で公開）
  - 用途: 学部生が到達できる水準の実例として最適。点質量QSSと二輪QSS（前後軸＋前後荷重移動）の2モデルを併存させ、後者は約10倍の計算時間を要すると定量報告している。「どの階層をいつ使うか」という本教科書の主題そのものを、学生の言葉で示した例。全ダイナミックイベントを同時にモデル化し、得点への影響まで評価する構成も第33章に合う。
- **Joseph McCarrison, "Development of Vehicle Dynamics Simulation Tools for the UQ Racing FSAE Team", Honours Thesis, School of Mechanical and Mining Engineering, The University of Queensland, 2021, DOI 10.14264/f38dac4** ✓実在確認（訂正: 訂正不要。DOIメタデータで degree="Honours Thesis"、institution="The University of Queensland / School of Mechanical and Mining Engineering" が完全一致。年について注意：一部のインデックスは2022年と表示するが、これはCrossrefへの登録（deposit）年であり、論文の approved 日付は2021-05-27。したがって**2021年が正しい**）
  - 種別: 学位論文 / 入手性: オープンアクセス（UQ eSpace）
  - https://doi.org/10.14264/f38dac4
  - 用途: FSAEチームが自前でシミュレーション基盤を立ち上げる過程の記録。ツール選定・検証・チーム内定着の実務的な難しさが書かれており、第27章（妥当性判断基準）や第33章の運用面の記述に使える。
- **Marcel Anselment, Julian Borowski, Stephan Rudolph, "Interpretable Tire Force Modeling for Formula Student Vehicle Dynamics and Lap Time Applications", SAE Technical Paper 2026-01-0762, 2026, DOI 10.4271/2026-01-0762（University of Stuttgart / IILS mbH）**
  - 種別: SAE Technical Paper / 入手性: 有料（SAE Mobilus。2026年1月刊行）
  - https://doi.org/10.4271/2026-01-0762
  - 用途: 最新のFSAE特化文献。記号回帰でMagic Formulaより低複雑度かつ同等以上の精度のタイヤ力モデルを導出し、200データセットで検証している。第9〜11章（タイヤ）と第30〜32章（ラップシム）の接点：「ラップシムに必要なタイヤモデルの複雑さは、タイヤ研究に必要なそれとは違う」という主張の典拠。
- **S. Garlick, A. Bradley, "Real-time optimal trajectory planning for autonomous vehicles and lap time simulation using machine learning", Vehicle System Dynamics, Vol. 60, No. 12, pp. 4269–4289, 2022, DOI 10.1080/00423114.2021.2011929** ✓実在確認（訂正: 訂正不要。著者2名・巻60・号12・頁4269-4289一致。補足：オンライン先行公開2021年、収録巻は2022年）
  - 種別: 論文 / 入手性: 有料
  - https://doi.org/10.1080/00423114.2021.2011929
  - 用途: 第33章の展望節。最適制御の解を機械学習で代理し実時間化する方向性。学習範囲外での外挿危険性を「モデルをいつ信じてはいけないか」の現代版事例として扱える。
- **J. Biniewicz, M. Pyrz, "A quasi-steady-state minimum lap time simulation of race motorcycles using experimental data", Vehicle System Dynamics, Vol. 62, No. 2, pp. 372–394, 2024, DOI 10.1080/00423114.2023.2170256** ✓実在確認（訂正: 訂正不要。著者2名・巻62・号2・頁372-394一致。補足：オンライン先行公開2023年、収録巻は2024年）
  - 種別: 論文 / 入手性: 有料
  - https://doi.org/10.1080/00423114.2023.2170256
  - 用途: 実験データからg-gを構築してQSS最小ラップタイムを解く手順の最新例。二輪車が対象だが、「タイヤモデル同定が困難なときに実測g-gから出発する」というFSAE向けの現実的経路の典拠として使える。
- **Soren Ebbesen, Mauro Salazar, Philipp Elbert, Carlo Bussi, Christopher H. Onder, "Time-optimal Control Strategies for a Hybrid Electric Race Car", IEEE Transactions on Control Systems Technology, Vol. 26, No. 1, pp. 233–247, 2018, DOI 10.1109/TCST.2017.2661824** ✓実在確認（訂正: 訂正不要。著者5名・巻26・号1・頁233-247・年2018すべて一致）
  - 種別: 論文 / 入手性: 有料（IEEE Xplore）
  - https://doi.org/10.1109/tcst.2017.2661824
  - 用途: 第32章の展望（凸最適化によるエネルギーマネジメント）。本教科書は内燃機関限定なので直接適用外だが、「燃料／エネルギー制約付き最小ラップタイム」という問題型はFSAE耐久・効率スコア（EF = T²·E）と同型であり、方法論として言及する価値がある。
- **Olaf Borsboom, Chyannie Amarillio Fahdzyana, Theo Hofman, Mauro Salazar, "A Convex Optimization Framework for Minimum Lap Time Design and Control of Electric Race Cars", IEEE Transactions on Vehicular Technology, Vol. 70, No. 9, pp. 8478–8489, 2021, DOI 10.1109/TVT.2021.3093164** ✓実在確認（訂正: 訂正不要。著者4名・巻70・号9・頁8478-8489・年2021すべて一致）
  - 種別: 論文 / 入手性: 有料（IEEE Xplore）
  - https://doi.org/10.1109/tvt.2021.3093164
  - 用途: 設計変数と制御変数を同時に凸最適化する枠組み。第33章「セットアップ最適化」の理論的上位形として紹介できる（ただしEV対象・凸化の適用範囲が限定的である点を必ず併記する）。
- **Formula Student Germany, "Formula Student Rules 2025", Version 1.1（133ページ）, 2025**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無料PDF）
  - https://www.formulastudent.de/fileadmin/user_upload/all/2025/rules/FS-Rules_2025_v1.1.pdf
  - 用途: 第IV部の全FSAE応用節で必要な一次ソース。本調査でPDFを直接取得して確認した数値：アクセラレーション＝スタートからフィニッシュまで直線75 m（D 5.1.1）／スキッドパッド＝内円直径15.25 m・外円直径21.25 m・円中心間18.25 m・走路幅3 m、右2周＋左2周で2周目と4周目を計測しその平均（D 4.1, D 4.2）／オートクロス＝直線80 m以下、スラロームのコーン間隔7.5〜12 m、最小走路幅3 m、最小旋回直径9 m、全長1.5 km未満（D 6.1）／エンデュランス＝直線80 m以下、スラローム9〜15 m、1周約1 km、全長約22 km（D 7.1）／効率係数 EF = T²·E（T＝未補正走行時間、E＝CVは補正燃料質量、EVは使用エネルギー）、燃料上限 15 kg/100 km（98 RON）（D 7.10）／配点（CV & EV）＝Business Plan 75・Cost 100・Design 150・Skidpad 50・DV Skidpad 75・Acceleration 50・DV Acceleration 75・Autocross 100・Endurance 250・Efficiency 75、合計1000点（Table 3、静的325＋動的675＝1000で検算一致）。
- **Michael Chalkiopoulos (Halkiopoulos), "OpenLAP Lap Time Simulator", GitHub: mc12027/OpenLAP-Lap-Time-Simulator, v1.00, 2020-04-17, GPL v3, MATLAB R2018b以降（Windows/macOS/Linux）** ✓実在確認（訂正: リポジトリ・作者・ライセンス・日付は確認済み（GitHub APIで created 2020-04-17T10:27:13Z、license GPL-3.0、言語MATLAB、タグ "V01.00"）。READMEに "Michael Chalkiopoulos" と記載があり、LinkedIn/メールは "halkiopoulos" 表記で両綴りとも実在。**要修正：「MATLAB R2018b以降（Windows/macOS/Linux）」は裏付けが取れなかった** — GitHub README にも File Exchange 掲載ページ（ID 75063）にも動作環境・対応リリースの記載がない。この動作環境の記述は削除するか「未確認」と明記すべき）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（GPL v3、GitHub / MATLAB File Exchange）
  - https://github.com/mc12027/OpenLAP-Lap-Time-Simulator
  - 用途: 第30章の実装の正典（MATLAB）。OpenTRACK（形状データまたはログデータからコースモデル生成、曲率・開閉ループ・標高・バンク・グリップ係数・セクタ対応）、OpenVEHICLE（慣性・エンジントルク曲線・駆動系・タイヤ・空力・ステアリング）、OpenLAP（距離ベースの点質量シミュレーション。エイペックス検出＋加速モード／減速モードの最小値、摩擦楕円 ay_max·sqrt(1-(ax/ax_tyre_max)^2)、GGV曲面）、OpenDRAG（直線加速）。ドキュメントはメッシュ1〜5 m、フィルタ0.5 sを推奨し、グリップ係数は全域1として特定区間の相関改善にのみ触るよう明記している（＝グローバルなグリップ調整で辻褄合わせをするなという警告そのもの）。MATLAB File Exchange 75063 でも配布。
- **TUM Institute of Automotive Technology (TUMFTM), "global_racetrajectory_optimization", GitHub, LGPL-3.0, Python 3.7+（cvxpy, quadprog, cython, numpy 等）** ✓実在確認（訂正: 訂正不要。GitHub APIでライセンス LGPL-3.0・言語Python を確認。README に「The code is developed with Ubuntu 20.04 LTS and Python 3.7」、依存に cvxpy・quadprog・cython の記載あり。最短経路／最小曲率／最小時間／パワートレイン考慮の最小時間の4目的をサポート）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（LGPL-3.0）
  - https://github.com/TUMFTM/global_racetrajectory_optimization
  - 用途: 第29章（走行ライン最適化）と第32章（MLTP）の参照実装。4手法（最短経路／最小曲率／最小曲率反復IQP／最小時間、および最小時間＋パワートレイン）を同一入力で比較できる。コース入力形式は CSV の [x, y, w_tr_right, w_tr_left]。opt_mintime_traj はダブルトラック＋準定常荷重移動＋Magic Formula を直交Gauss-Legendreコロケーションで離散化しCasADi/IPOPTで解く。README が「最小曲率ラインはコーナーでは最小時間ラインに近いが、車両の加速度限界を使い切らない場面ではずれる。最小時間はパラメータが遥かに多く計算時間も長い」と明記しており、第29章で階層の選択理由を書く際の一次典拠になる。ウォームスタート用に w0.csv / lam_x0.csv / lam_g0.csv を保存する設計も実務的示唆。
- **TUM Institute of Automotive Technology (TUMFTM), "laptime-simulation", GitHub, LGPL-3.0, Python 3.6.8+** ✓実在確認（訂正: 訂正不要。ライセンス LGPL-3.0 確認。README に「tested with Python 3.8.3 on Windows 10 and 3.6.8 on Ubuntu 18.04」とあり「Python 3.6.8+」の記述は妥当。準定常（QSS）ラップタイムシミュレーションであること、最小曲率レースライン最適化を含むことも README で確認）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（LGPL-3.0）
  - https://github.com/TUMFTM/laptime-simulation
  - 用途: QSSラップタイムシミュレーション＋最小曲率ラインの統合実装。ラップタイムとエネルギー消費を同時に出すので、FSAE効率スコアの検討に流用できる。Heilmeier et al. (EVER 2019) が理論論文。
- **TUM Institute of Automotive Technology (TUMFTM), "trajectory_planning_helpers", GitHub, LGPL-3.0** ✓実在確認（訂正: 訂正不要。GitHub APIでライセンス LGPL-3.0・言語Python を確認）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（LGPL-3.0）
  - https://github.com/TUMFTM/trajectory_planning_helpers
  - 用途: 第30章の速度プロファイル生成の参照実装。calc_vel_profile（前後進ソルバ、ggvとax_max_machinesを入力。ax_max_machinesは空力抗力を含めずに与えること、と明記）、calc_vel_profile_brake（純前進ソルバ）、calc_ax_profile、calc_t_profile。import_veh_dyn_info でGGVを読み込む。3パス法をコードで示す際、この関数分割をそのまま日本語で説明できる。
- **CasADi — a symbolic framework for algorithmic differentiation and numeric optimization, LGPL, MATLAB/Octave・Python・C++インタフェース、IPOPT同梱** ✓実在確認（訂正: 訂正不要。公式ドキュメントで「open-source software tool for numerical optimization in general and optimal control ... in particular」「LGPL license」「Python / MATLAB-Octave / C++」「IPOPT ... is included in CasADi installations」をすべて確認。SUNDIALS も同梱）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（LGPL、無償）
  - https://web.casadi.org/docs/
  - 用途: 第32章の実装基盤。自動微分（前進／随伴モード、疎Jacobian/Hessianの疎性検出とグラフ彩色）とNLPソルバ（IPOPT同梱、SNOPT/WORHP/KNITROは別途）を提供。Optiスタック（casadi.Opti / opti.variable / opti.minimize / opti.subject_to / opti.solver('ipopt') / opti.solve）で直接コロケーション・マルチプルシューティングを短く書ける。LGPLなので商用クローズドソースでもロイヤリティフリーと明記されており、学生チームでも懸念なく使える。
- **ICLOCS2 — Imperial College London Optimal Control Software, Version 2, Imperial College London（直接コロケーション、可変次数擬スペクトル法 Legendre-Gauss-Radau、積分残差最小化法、IPOPT/fmincon/WORHP対応）**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（GitHub公開）
  - http://www.ee.ic.ac.uk/ICLOCS/
  - 用途: 第32章のMATLAB純正に近い代替経路。CasADiより敷居が低くMATLAB上で完結する。GPOPS-II（商用）を買えないチーム向けの現実解として提示できる。
- **OptimumG, "OptimumLap"（無償、点質量・準定常モデル、Student Edition あり）** ✓実在確認（訂正: 訂正不要。公式ページで「OptimumLap is a FREE, simplified, vehicle simulation tool」「The vehicle model used in OptimumLap is a point mass, quasi-steady state model」「OptimumLap – Student Edition」をすべて確認）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（無償・登録制）
  - https://students.optimumg.com/product/optimumlap/
  - 用途: 第30章のFSAE現場での標準ツール。10個の基本パラメータで車両を定義、60チャンネル出力。公式が「点質量・準定常モデルであり、荷重移動と過渡効果は考慮しない」と明記している点が重要で、「このツールでサスペンションセットアップを論じてはいけない」という第33章の警告の直接の根拠になる。実データとの誤差10%以内という精度主張は開発元自身のものであり第三者検証ではない、と注記して扱うこと。
- **MathWorks, "Vehicle Dynamics Blockset" Documentation（Vehicle Body 3DOF: Single Track/Dual Track バリアント、Vehicle Body 6DOF、Magic Formula Tire、Fiala Wheel 2DOF、Predictive Driver、Longitudinal Driver、Lateral Driver 他）**
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ドキュメントは無償閲覧。製品はFSAE無償ライセンスに含まれるか要確認）
  - https://www.mathworks.com/help/vdynblks/index.html
  - 用途: 第31章 H6（過渡・閉ループ）と第VI部（SIL/HIL/DIL）の実装経路。Vehicle Body 3DOF は Single Track（車体中心線に力が作用、横荷重移動なし）と Dual Track（四隅に作用、横荷重移動あり）を切り替えられるので、第3章の線形2輪モデルから第23章の非線形4輪モデルまで同じブロックで連続的に説明できる。Predictive Driver は縦制御が PI / Scheduled PI / Predictive、横制御が Predictive / Stanley で、MacAdamのプレビュー制御に基づく。
- **MathWorks, "Simulink Design Optimization — Sensitivity Analysis" Documentation（Sensitivity Analyzer アプリ、sdo.sample / sdo.evaluate / sdo.analyze / sdo.ParameterSpace / sdo.GriddedSpace / sdo.combine / sdo.SampleOptions）** ✓実在確認（訂正: 訂正不要。列挙された Sensitivity Analyzer アプリおよび sdo.sample / sdo.evaluate / sdo.analyze / sdo.ParameterSpace / sdo.GriddedSpace / sdo.combine / sdo.SampleOptions の**7関数＋1アプリすべての実在を当該ページで確認**。他に sdo.GriddingOptions, sdo.SimulationTest, sdo.AnalyzeOptions, sdo.EvaluateOptions も存在）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（ドキュメント無償）
  - https://www.mathworks.com/help/sldo/sensitivity-analysis.html
  - 用途: 第33章 セットアップ感度解析のMATLAB実装経路。sdo.SampleOptions の Method で 'random' / 'latinHypercube' / 'sobol' / 'halton' / 'sequential' を選べる（sobol は Statistics and Machine Learning Toolbox が必要）。ラテン超方格やSobol列で設定空間をサンプリングし、相関・標準化回帰係数で影響度を可視化する流れをそのまま日本語で書ける。Toolboxが無い場合は lhsdesign / sobolset（Statistics and Machine Learning Toolbox）で自作可能。
- **MathWorks / Steve Miller, "Formula Student Vehicle with Simscape", MATLAB File Exchange 172279 / GitHub: simscape/Formula-Student-Vehicle-Simscape** ✓実在確認（訂正: 訂正不要。File Exchange ページでタイトル「Formula Student Vehicle with Simscape」・作者 Steve Miller・ID 172279・GitHubリンクをすべて確認。GitHubリポジトリも実在（作成2024-09-06、現在も更新中、タグ 26.1.4.12 等））
  - 種別: 公式ドキュメント / 入手性: オープンアクセス（MATLAB File Exchange / GitHub）
  - https://github.com/simscape/Formula-Student-Vehicle-Simscape
  - 用途: FSAE向けの公式Simscapeテンプレート。マルチボディサスペンション、複数のサスペンション形式、スキッドパッド等のイベント、3D可視化を含む。第31章 H6を学生が最短で立ち上げるための出発点として提示できる（電動パワートレイン前提の部分は本教科書のICE前提に合わせて置き換えが必要）。
- **TUM Institute of Automotive Technology (TUMFTM), "racetrack-database"（20以上のF1・DTMサーキットの中心線 x-y座標、走路幅、レースライン）** ✓実在確認（訂正: 訂正不要。GitHub の公式説明文が「center lines (x- and y-coordinates), track widths and race lines for over 20 race tracks (F1 and DTM) all over the world」で記載内容と完全一致。ライセンス LGPL-3.0）
  - 種別: 公式ドキュメント / 入手性: オープンアクセス
  - https://github.com/TUMFTM/racetrack-database
  - 用途: 第29章 コースモデルの練習用データ。FSAEコースは自前で作る必要があるが、アルゴリズム検証にはこの公開データが使える。走行ライン最適化の結果を既知のレースラインと比較できる。

---

