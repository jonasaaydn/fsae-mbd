export interface Tool {
  name: string;
  developer: string;
  category: string;
  description: string;
  official_url: string;
  /** アフィリエイトリンク（任意）。設定時はカードのリンク先を公式URLからこちらに差し替え、rel に sponsored を付ける。 */
  affiliate_url?: string;
  use_cases: string[];
  mbd_relevance: 'high' | 'medium' | 'low';
  tags: string[];
}

export const tools: Tool[] = [
  {
    name: 'Claude',
    developer: 'Anthropic',
    category: 'LLM / Assistant',
    description:
      'Anthropicの最先端AIアシスタント。長文理解、コード生成、技術文書の要約・翻訳に優れ、複雑な工学的問題の思考整理にも活用できる。',
    official_url: 'https://claude.ai',
    use_cases: ['技術ドキュメント生成', 'コードレビュー', '要件定義の整理', '走行データの解釈補助'],
    mbd_relevance: 'high',
    tags: ['LLM', 'Assistant', 'Coding'],
  },
  {
    name: 'Claude Code',
    developer: 'Anthropic',
    category: 'AI Coding Agent',
    description:
      'ターミナルベースのAIコーディングエージェント。ファイル操作・スクリプト自動化・リファクタリングを自律的に実行。MATLABスクリプトやPythonデータ解析の自動化に活用できる。',
    official_url: 'https://claude.ai/code',
    use_cases: ['MATLABスクリプト自動化', 'テスト生成', 'ドキュメント作成', 'データ解析パイプライン構築'],
    mbd_relevance: 'high',
    tags: ['Coding Agent', 'Automation', 'CLI'],
  },
  {
    name: 'ChatGPT',
    developer: 'OpenAI',
    category: 'LLM / Assistant',
    description:
      'OpenAIの汎用AIアシスタント。GPT-4oによる画像・音声・テキストのマルチモーダル処理が可能。幅広いユースケースに対応する。',
    official_url: 'https://chatgpt.com',
    use_cases: ['技術質問', '文書作成', '画像からの図面解析', 'プレゼン資料作成'],
    mbd_relevance: 'medium',
    tags: ['LLM', 'Multimodal', 'Assistant'],
  },
  {
    name: 'GitHub Copilot',
    developer: 'GitHub / Microsoft',
    category: 'AI Coding',
    description:
      'IDEに統合されたAIコーディングアシスタント。リアルタイムのコード補完とChat機能でMATLAB/Pythonスクリプト開発を加速する。',
    official_url: 'https://github.com/features/copilot',
    use_cases: ['コード補完', 'テスト自動生成', 'コメント生成', 'バグ修正支援'],
    mbd_relevance: 'medium',
    tags: ['Coding', 'IDE', 'Autocomplete'],
  },
  {
    name: 'Gemini',
    developer: 'Google DeepMind',
    category: 'LLM / Assistant',
    description:
      'Googleの大規模マルチモーダルAI。長大なコンテキストウィンドウ（最大100万トークン）を持ち、大量のデータや文書を一括処理できる。',
    official_url: 'https://gemini.google.com',
    use_cases: ['大量ログ解析', '長文仕様書の要約', 'Googleサービス連携', 'コード生成'],
    mbd_relevance: 'medium',
    tags: ['LLM', 'Multimodal', 'Long Context'],
  },
  {
    name: 'MATLAB Copilot',
    developer: 'MathWorks',
    category: 'MBD / Simulink',
    description:
      'MATLABに統合されたAIアシスタント。自然言語によるMATLABコード生成・説明・デバッグを支援する。R2025aで正式搭載、R2026aではテスト自動生成（MATLAB Test連携）とPolyspace Copilotによる組込みソフトウェアコード解析にも対応。2026年4月にはMATLAB Agentic Toolkitが公式リリースされ、Claude Code・GitHub Copilot・Gemini CLIなどのAIエージェントがMCPを介してMATLABを直接実行・制御できるようになった。',
    official_url: 'https://www.mathworks.com/products/matlab-agentic-toolkit.html',
    use_cases: ['MATLABコード生成', 'エラー解説', '関数説明', 'テスト自動生成', 'Polyspace静的解析支援', 'AIエージェントによる自律実行'],
    mbd_relevance: 'high',
    tags: ['MATLAB', 'MBD', 'Coding', 'MCP', 'Agentic AI'],
  },
  {
    name: 'Simulink Copilot',
    developer: 'MathWorks',
    category: 'MBD / Simulink',
    description:
      'R2026aで正式製品化されたSimulinkのAIアシスタント。モデルの説明・エラー解析・設計ガイダンス・規格準拠チェックを自動化。2026年4月にはSimulink Agentic Toolkitが公式リリースされMCPを通じてClaude CodeなどのAIエージェントがSimulinkモデルをブロック単位で自律構築・編集・テストできるようになった。6つのMCPツールと7つのMBDスキルを搭載。',
    official_url: 'https://www.mathworks.com/products/simulink-agentic-toolkit.html',
    use_cases: ['Simulinkブロック生成', 'モデルデバッグ支援', '規格準拠自動チェック', 'テストケース生成', 'AIエージェントによる自律モデル構築'],
    mbd_relevance: 'high',
    tags: ['Simulink', 'MBD', 'Model Generation', 'MCP', 'Agentic AI'],
  },
  {
    name: 'Ansys SimAI',
    developer: 'Ansys',
    category: 'CAE / Simulation AI',
    description:
      'CAEシミュレーション結果をAIで高速予測するツール。2026 R1でSimAI Premium（クラウドSaaS、15TB超データセット対応）とSimAI Pro（ローカルGPU・デスクトップ版、ML専門知識不要）の2層構成に刷新。optiSLangとの直結コネクタにより、データ生成→AIモデル訓練→最適化探索を単一ワークフローで完結できる。',
    official_url: 'https://www.ansys.com/products/ai/simai',
    use_cases: ['空力特性の高速予測', 'NVHサロゲートモデル', '設計最適化ループ自動化', '計算時間の大幅短縮'],
    mbd_relevance: 'high',
    tags: ['CAE', 'Surrogate Model', 'CFD', 'FEA', 'optiSLang'],
  },
  {
    name: 'NVIDIA PhysicsNeMo',
    developer: 'NVIDIA',
    category: 'CAE / Simulation AI',
    description:
      'NVIDIAのオープンソース物理AI深層学習フレームワーク。v2.0（2026年3月）でモジュール型PyTorch-nativeアーキテクチャに大幅刷新。v2.1（2026年5月）ではDoMINO NIMを新版に更新し、複数車両クラスにわたる精度向上とエンドツーエンド学習レシピの10倍高速化を達成。KAN（Kolmogorov–Arnold Networks）を用いた洪水ダイナミクス向けGNN、構造力学サロゲート（MeshGraphNet）サンプルも追加。uv/pip・Linux/macOS/Windows対応でインストールが容易化。Luminary Cloud・nTop・Siemensとの提携でIndustrial AI統合が進む。',
    official_url: 'https://github.com/NVIDIA/physicsnemo',
    use_cases: ['PINNによるCFD高速化', '熱流体サロゲートモデル', '乱流モデリング', 'DoMINO NIMによる高速推論', '設計最適化ループ加速', '構造力学サロゲートモデル'],
    mbd_relevance: 'high',
    tags: ['PINN', 'Physics AI', 'CFD', 'Open Source', 'GPU', 'PyTorch Geometric', 'DoMINO', 'KAN'],
  },
  {
    name: 'Neural Concept',
    developer: 'Neural Concept SA',
    category: 'CAE / Simulation AI',
    description:
      'スイス発のエンジニアリングAIプラットフォーム。CFD/FEAシミュレーション結果をもとにGNNで形状最適化・設計変数探索を高速化する。2025年12月にGoldman Sachs主導で1億ドルのシリーズCを調達（累計1.5億ドル超）。Visa Cash App RacingBullsとの2026年F1レギュレーション対応パートナーシップを締結、数千の設計バリアントをAIデジタルツインで評価。2026年前半には生成AIを活用したジオメトリ生成機能もリリース予定。GM・GE Vernova・Safran・ルノーグループ等50社超が採用。',
    official_url: 'https://www.neuralconcept.com',
    use_cases: ['空力形状のAI高速予測', '設計パラメータスタディ自動化', 'CFDサロゲートモデル構築', '生成AIによる新形状提案', 'F1デジタルツイン評価'],
    mbd_relevance: 'high',
    tags: ['Aerodynamics', 'Surrogate Model', 'GNN', 'CAE', 'F1', 'Design Optimization', 'Generative AI'],
  },
  {
    name: 'Foam-Agent',
    developer: 'RPI CSML Lab',
    category: 'CAE / Simulation AI',
    description:
      'OpenFOAMベースのCFDシミュレーションを自然言語プロンプトから全自動化するマルチエージェントフレームワーク。NeurIPS 2025 ML4PS Workshop採択。Foam-Agent 2.0（arXiv 2509.18178v2）でコンポーザビリティと前後処理自動化を強化。Claude 3.5 Sonnetで成功率88.2%を達成し（MetaOpenFOAM比+32.7pt）、メッシュ生成からParaView可視化まで全工程を自動実行。CFDLLMBenchベンチマーク論文も2026年に公開。',
    official_url: 'https://github.com/csml-rpi/Foam-Agent',
    use_cases: ['OpenFOAM自動セットアップ', '空力形状パラメータスタディ', 'CFDケース量産', '乱流解析自動化', 'ParaView自動可視化'],
    mbd_relevance: 'high',
    tags: ['CFD', 'OpenFOAM', 'Multi-Agent', 'Automation', 'Open Source', 'Benchmark'],
  },
  {
    name: 'Flexcompute AutoInsight',
    developer: 'Flexcompute',
    category: 'CAE / Simulation AI',
    description:
      'MITスピンアウトのFlexcomputeが2026年3月にリリースした物理情報型AIプラットフォーム。既存CFDデータ（STAR-CCM+・Fluent・Flow360等）を10〜20ケースの少量サンプルから学習し、ジオメトリ変更時の抗力・ダウンフォースをリアルタイムに予測する。フルCFDを回す前に数千バリアントを高速スクリーニングできる。Northrop Grummanとの宇宙ミッションシミュレーション100倍高速化事例あり。',
    official_url: 'https://www.flexcompute.com/autoinsight/',
    use_cases: ['少量CFDデータからのサロゲート構築', '空力バリアントのリアルタイムスクリーニング', '設計初期フェーズの形状探索', '既存ソルバーデータ活用'],
    mbd_relevance: 'high',
    tags: ['CFD', 'Surrogate Model', 'Aerodynamics', 'Real-time', 'Few-shot Learning'],
  },
  {
    name: 'Ansys GeomAI',
    developer: 'Ansys',
    category: 'CAE / Simulation AI',
    description:
      'Ansys 2026 R1（2026年3月）でリリースされた生成AIジオメトリツール。参照CAD・シミュレーションデータセットから学習し、設計制約を満たしながら新たなジオメトリコンセプトを生成する。optiSLangと統合することで潜在空間上での設計最適化ループを実現。従来の形状パラメトリック変更を超え、「デザインランゲージ」を保持した新形状を自動提案する。',
    official_url: 'https://www.ansys.com/products/ai/geomai',
    use_cases: ['コンセプト設計ジオメトリ生成', '設計制約を満たす新形状提案', 'optiSLang連携最適化', '設計初期探索の高速化'],
    mbd_relevance: 'high',
    tags: ['Generative AI', 'CAD', 'Design Optimization', 'CAE', 'optiSLang'],
  },
  {
    name: 'PhysicsX',
    developer: 'PhysicsX Ltd.',
    category: 'CAE / Simulation AI',
    description:
      '英国発の物理AIスタートアップ。NVIDIA NVenturesの追加出資を含む累計1.55億ドルを調達。20万超のジオメトリ・物理シミュレーションで訓練した「LGM-Aero（Large Geometry Model）」と2万件超の車両CFDデータセット「PXNetCar」でLargePhysicsModel（LPM）を構築。航空弾性シミュレーション向け世界初LPM「Ai.rplane」を無償デモ公開。2026年3月にはCoreWeaveクラウドで一般提供開始。NVIDIA GTC 2026では物理AI向けオープン標準策定を発表。',
    official_url: 'https://www.physicsx.ai',
    use_cases: ['自動車空力サロゲートモデル', 'ブレーキ冷却最適化', '航空弾性予測（Ai.rplane）', '形状設計スタディ高速化', 'CoreWeaveクラウドでの推論'],
    mbd_relevance: 'high',
    tags: ['Large Physics Model', 'CFD', 'Surrogate Model', 'Automotive', 'Aerodynamics', 'NVIDIA', 'LGM'],
  },
  {
    name: 'nTop',
    developer: 'nTop Inc.',
    category: 'CAE / Simulation AI',
    description:
      '米国発のジェネラティブデザインプラットフォーム。GPU加速の暗黙的ジオメトリモデリング（Implicit Modeling）で、数百のパラメトリック形状バリアントを数秒で生成。2025年3月にLuminary CloudおよびNVIDIA PhysicsNeMoと統合し、「ジオメトリ生成→GPU並列CFD/FEA→物理AIサロゲート訓練」を1日で完結する「物理AI統合設計パイプライン」を実現。従来数週間〜数ヶ月かかっていた設計最適化が数時間に短縮される。NASA・SpaceX・GE Aerospaceを含む450社超が採用。',
    official_url: 'https://www.ntop.com',
    use_cases: ['トポロジー最適化', 'ラティス/ジャイロイド構造生成', '軽量化設計', 'AI物理サロゲート連携', '空力形状最適化'],
    mbd_relevance: 'high',
    tags: ['Topology Optimization', 'Generative Design', 'CAD', 'Lightweighting', 'Physics AI', 'GPU'],
  },
  {
    name: 'Amazon Q Developer',
    developer: 'Amazon Web Services',
    category: 'AI Coding',
    description:
      'AWSのAIコーディングアシスタント。2025年5月にAUTOSAR/SDV（ソフトウェア定義車両）向けの公式ブログを公開し、自動車組込みソフトウェア開発への適用例を実証。インラインコードコメントからAUTOSAR SWC（ソフトウェアコンポーネント）のC/C++コードおよびARXML設定ファイルを自動生成。VS Code・JetBrainsに統合されワークスペースのコンテキストを理解した上でAUTOSAR準拠コードを生成・リファクタリング・デバッグする。SWE-Bench Verifiedで66%を達成（2025年4月）。',
    official_url: 'https://aws.amazon.com/q/developer/',
    use_cases: ['AUTOSAR SWCコード生成', 'ARXML設定ファイル自動生成', '組込みC/C++リファクタリング', 'SDV開発支援', 'コードレビュー自動化'],
    mbd_relevance: 'medium',
    tags: ['AUTOSAR', 'SDV', 'Coding', 'IDE', 'AWS', 'Embedded C'],
  },
  {
    name: 'Collimator AI',
    developer: 'Collimator Inc.',
    category: 'AI Coding',
    description:
      'クラウドネイティブなモデルベース制御設計プラットフォーム。PythonでSimulinkライクなブロック線図を定義し、MPC・LQR・PIコントローラ設計とシミュレーションをブラウザ上で完結させる。PyTorch/ONNXモデルを制御ブロックとして直接挿入できるため、強化学習ポリシーのSIL検証まで同一フレームワーク内で完結。フリープランあり、プロプランは月$49。',
    official_url: 'https://www.collimator.ai',
    use_cases: ['アクティブサスペンションMPC設計', 'パワートレイン制御則の検証', 'RL制御ポリシーのSIL検証', 'クラウド並列パラメータスタディ', 'FMU連携シミュレーション'],
    mbd_relevance: 'medium',
    tags: ['MPC', 'Control Design', 'Python', 'Cloud MBD', 'Neural Network Control', 'FMU'],
  },
  {
    name: 'Simcenter STAR-CCM+',
    developer: 'Siemens Digital Industries Software',
    category: 'CAE / Simulation AI',
    description:
      'SiemensのフラッグシップCFD/マルチフィジクスソルバー。2026年2月リリースの2602バージョンでDesign Manager統合の幾何深層学習（GDL）サロゲートを搭載。わずか20〜40ケースのCFDデータからメッシュ節点単位の圧力場・剪断応力場フルフィールド予測モデルを自動構築し、新形状を5秒以内に評価できる。レガシーシミュレーションデータの再利用・GPU並列学習・Python Client APIにも対応。',
    official_url: 'https://plm.sw.siemens.com/en-US/simcenter/fluids-thermal-simulation/star-ccm/',
    use_cases: ['空力フルフィールドサロゲートモデル', '設計探索1000点をDOE40ケースで実現', 'NVH・熱流体マルチフィジクス解析', '過去CFDデータの転移学習活用', 'optiSLang連携ベイズ最適化'],
    mbd_relevance: 'high',
    tags: ['CFD', 'GDL', 'Surrogate Model', 'Aerodynamics', 'Siemens', 'Design Manager', 'Multi-fidelity'],
  },
  {
    name: 'Monolith AI',
    developer: 'Monolith AI (CoreWeave傘下)',
    category: 'CAE / Simulation AI',
    description:
      'インペリアル・カレッジ・ロンドン発のノーコードMLプラットフォーム。2025年10月にGPUクラウド大手CoreWeaveが買収。テスト/シミュレーションデータをアップロードするだけでCNN/GNNベースのサロゲートモデルを自動構築する。BMW・Nissan・Honeywell・WECハイパーカーチームが採用。クラッシュ性能予測・空力解析・NVH・バッテリー熱解析などに対応し、物理試験の大幅削減（80%超の事例あり）を実現。2026年ロードマップではモデル品質の自動監視・信頼区間・サインオフ可能なトレーサビリティ機能を追加予定。',
    official_url: 'https://www.monolithai.com',
    use_cases: ['クラッシュ性能サロゲートモデル', '空力特性予測', 'NVH解析', '試験計画最適化', 'バッテリー熱挙動予測'],
    mbd_relevance: 'high',
    tags: ['No-Code ML', 'Surrogate Model', 'Crash', 'NVH', 'Aerodynamics', 'CoreWeave', 'Test Reduction'],
  },
  {
    name: 'Ansys optiSLang',
    developer: 'Ansys (Synopsys傘下)',
    category: 'CAE / Simulation AI',
    description:
      'Ansysの設計最適化・不確かさ定量化（UQ）プラットフォーム。2026 R1（2026年3月）でSimAIネイティブ統合を実現し、DoEケース生成→GPU並列シミュレーション→AIサロゲート訓練→最適化探索を単一ワークフロー内で完結できるようになった。新たなDLS（減衰最小二乗法）キャリブレーションアルゴリズムにより実測ダイノデータへのノイズ耐性フィッティングが改善。Rocky・FreeFlow・LS-OPTの新ソルバー接続も追加。Python APIのモジュール化によりHPC・クラウド展開が容易化。',
    official_url: 'https://www.ansys.com/products/optislang',
    use_cases: ['空力形状多目的最適化', 'パワートレインキャリブレーション', 'ロバスト設計最適化（RDO）', '不確かさ定量化（UQ）', 'SimAI連携サロゲート最適化'],
    mbd_relevance: 'high',
    tags: ['Design Optimization', 'Surrogate Model', 'UQ', 'SimAI', 'Python', 'CAE', 'optiSLang'],
  },
  {
    name: 'Saphira AI',
    developer: 'Saphira AI',
    category: 'AI Coding',
    description:
      '2025年登場のSaaS型ISO/SAE 21434 TARA（脅威分析・リスクアセスメント）自動化プラットフォーム。高レベルのアーキテクチャ図を入力するだけでISO 21434準拠のLevel-2 TARAを自動生成し、工数を約70%削減。複数ECUにまたがるシステム横断的な脅威シナリオ生成・STRIDE適用・攻撃パス分析・サイバーセキュリティ要件生成を全自動化する。2026年2月には車載半導体向けISO 21434対応を公開。FEVのTARA CopilotやDefenseWeaver（arXiv 2504.18083）と並ぶ次世代車載サイバーセキュリティAIの代表格。',
    official_url: 'https://saphira.ai',
    use_cases: ['ISO 21434 TARA自動生成', '脅威シナリオ・攻撃パス分析', 'サイバーセキュリティ要件生成', 'AUTOSAR SecOC設計支援', '複数ECUシステムの横断的脅威分析'],
    mbd_relevance: 'medium',
    tags: ['ISO 21434', 'TARA', 'Cybersecurity', 'Automotive', 'AUTOSAR', 'LLM'],
  },
  {
    name: 'Amp',
    developer: 'Amp Inc.（Sourcegraph spinoff）',
    category: 'AI Coding',
    description:
      '2025年12月にSourcegraphからスピンオフして独立したAIコーディングエージェント。CEO Quinn Slack（Sourcegraph共同創業者）率いるAmp Inc.が運営。AGENT.mdでプロジェクト固有ルールを学習し、Oracle（コードベース解析）・Librarian（外部ライブラリ）の専用サブエージェントが並列処理する。VS Code・CLIに対応し、MCP（Model Context Protocol）をビルトインサポート。MATLAB MCP ServerおよびSimulink Agentic Toolkitと連携し、Simulinkモデルの参照モデル分割・加速器モード化・テストケース自動生成などのMBDワークフローを自律実行できる。20万行JSモノレポで工数50%削減を実証。',
    official_url: 'https://ampcode.com',
    use_cases: ['Simulinkモデル参照モデル分割', '加速器モード自動最適化', 'MATLABスクリプト自動リファクタリング', 'テストケース自動生成', 'コードグラフ活用の依存関係解析'],
    mbd_relevance: 'high',
    tags: ['AI Agent', 'MCP', 'Simulink', 'MATLAB', 'Refactoring', 'Coding', 'Sub-Agent'],
  },
  {
    name: 'Luminary Cloud SHIFT',
    developer: 'Luminary Cloud',
    category: 'CAE / Simulation AI',
    description:
      '米国スタートアップLuminary CloudがHondaとNVIDIAと共同開発した物理AI基盤モデルスイート「SHIFT」。SHIFT-SUV（2025年4月）は自動車SUV空力解析向けの世界初オープンソース物理AI基盤モデルで、AeroSUVパラメトリックジオメトリを用いた高精度DDES CFDシミュレーション1,000件超で事前学習済み。NVIDIA PhysicsNeMoのDoMINOアーキテクチャを採用し、STLジオメトリ入力から抵抗・揚力係数と表面圧力場全分布をミリ秒推論する。データセットと学習済みモデルをCC-BY-NC-4.0でHuggingFaceに公開。25,000シミュレーションへの拡張と航空機翼型向けSHIFT-WINGも展開中。nTopとの連携でジオメトリ生成→GPU CFD→物理AI訓練を1日で完結するパイプラインも構築済み。',
    official_url: 'https://huggingface.co/datasets/luminary-shift/SUV',
    use_cases: ['設計初期フェーズの空力バリアントスクリーニング', '1,000形状を数時間で評価するパラメータスタディ', 'ファインチューニングによる社内専用サロゲートモデル構築', 'CFDデータ生成コストの大幅削減', 'nTop連携による形状生成→AI評価ループ'],
    mbd_relevance: 'high',
    tags: ['Physics AI', 'Foundation Model', 'CFD', 'Aerodynamics', 'Open Source', 'DoMINO', 'Honda', 'NVIDIA', 'Automotive'],
  },
  {
    name: 'Emmi AI / Noether Framework',
    developer: 'Emmi AI',
    category: 'CAE / Simulation AI',
    description:
      'ドイツ発エンジニアリングAIスタートアップEmmi AIが2026年1月にオープンソース公開したPhysics AI深層学習フレームワーク。中核技術「AB-UPT（Anchored-Branched Universal Physics Transformers）」はGPU1枚で9百万サーフェス＋1億4000万ボリュームセルの自動車CFDを推論し、従来手法比100倍超のスケールを達成。発散ゼロ渦度定式化で物理的整合性をハード保証し、CADジオメトリから直接推論できる。学習は約100ケース・1GPU・1日以内で完了。arXiv 2502.09692で発表、GitHub: Emmi-AI/noetherで全コード公開済み。',
    official_url: 'https://github.com/Emmi-AI/noether',
    use_cases: ['自動車空力CFDサロゲートモデル構築', 'CAD直接入力による形状評価', 'GPU1枚での100点超パラメータスタディ', '発散ゼロ物理制約付き推論', 'optiSLang連携マルチフィデリティ最適化'],
    mbd_relevance: 'high',
    tags: ['CFD', 'Surrogate Model', 'Physics AI', 'Open Source', 'Transformer', 'Automotive', 'Aerodynamics'],
  },
  {
    name: 'Altair HyperWorks',
    developer: 'Altair Engineering（Siemens傘下）',
    category: 'CAE / Simulation AI',
    description:
      'SiemensがAltair Engineering（約1.5兆円）を2025年に買収し、2025年12月にHyperWorks 2026をリリース。PhysicsAI（幾何深層学習サロゲート：450件のFEAから新形状を5秒で予測、最大1000倍高速）とromAI（GPU加速削減次元モデル：CFD/DEM/構造のリアルタイム予測）が統合された初のSiemens版。OptiStruct・HyperCrash・MotionSolve・EDEM・RapidMinerをSimcenter/Xceleratorと組み合わせ、構造→CFD→NVH→システムをひとつの環境で完結できる。電磁気シミュレーションは40%高速化、e-motor最適化・バッテリー安全解析にも対応。',
    official_url: 'https://altair.com/hyperworks-2026',
    use_cases: ['クラッシュ解析サロゲートモデル（5秒/件）', '構造トポロジー最適化×AI高速スクリーニング', 'CFD翼型1000点バリアント評価', 'NVH（振動・騒音）解析', 'e-motor多目的最適化'],
    mbd_relevance: 'high',
    tags: ['CAE', 'PhysicsAI', 'romAI', 'Surrogate Model', 'Topology Optimization', 'Siemens', 'GDL', 'NVH'],
  },
  {
    name: 'Rescale AI Physics',
    developer: 'Rescale Inc.',
    category: 'CAE / Simulation AI',
    description:
      '2026年5月にAgentic Digital Engineering製品群を発表したクラウドHPC・AI物理プラットフォーム。AI Physicsモジュールはシミュレーションデータを入力とするサロゲートモデルをエンドツーエンドで構築・デプロイ（DoE生成→GPU並列シミュレーション→サロゲート訓練→最適化探索）。Agentic Digital Engineeringは入力バリデーション・トラブルシューティング・レポート生成・ハードウェア選定を自動化するAIエージェントを搭載。McLarenAutomotiveとのGTC 2026パートナーシップで複数物理ドメインを数時間で評価し専門家生産性3倍を実証。General Motors Motorsports・Samsung・米国防総省など大手顧客が採用。',
    official_url: 'https://rescale.com/platform/ai-physics/',
    use_cases: ['クラウドHPC並列シミュレーション', 'サロゲートモデルのエンドツーエンド構築', 'AIエージェントによる自動化ワークフロー', '設計候補4倍評価（AI Physicsによる加速）', 'McLaren事例：複数物理を数時間で評価'],
    mbd_relevance: 'high',
    tags: ['HPC', 'Cloud CAE', 'Surrogate Model', 'Agentic AI', 'DoE', 'Motorsport', 'McLaren'],
  },
  {
    name: 'Microsoft Agent Framework',
    developer: 'Microsoft',
    category: 'AI Coding',
    description:
      'AutoGenとSemantic Kernelを統合した企業向けAIエージェントフレームワーク。2026年4月2日にv1.0 GAリリース。Python・.NETで同一APIを提供し、MCP（Model Context Protocol）クライアントを標準搭載。MATLAB MCPサーバーに接続してMATLAB/Simulinkを操作するMBDエージェントを数行で構築できる。A2Aプロトコル・CodeAct・Agent Harnessデバッグ・Hosted Agents（Azureマネージド実行）を搭載し、AutoGenユーザー向け移行ライブラリ（maf.compat.autogen）も提供。MIT ライセンス・無料。',
    official_url: 'https://github.com/microsoft/autogen',
    use_cases: ['MATLAB MCPエージェント構築', 'Simulinkパラメータスタディ自動化', 'マルチエージェントMBDワークフロー', 'AutoGenコードの移行', 'Azure Hosted Agentsで本番デプロイ'],
    mbd_relevance: 'high',
    tags: ['Multi-Agent', 'MCP', 'Python', 'AutoGen', 'MATLAB', 'Simulink', 'Enterprise', 'Open Source'],
  },
  {
    name: 'Google Antigravity',
    developer: 'Google',
    category: 'AI Coding',
    description:
      'Google I/O 2026（2026年5月19日）で発表、同年6月18日にGemini CLIの後継として正式リリースされたエージェントファースト開発プラットフォーム。CLI（agコマンド）・デスクトップApp・SDK・IDEの4コンポーネントで構成。Gemini 3.5 Flashをデフォルトモデルとして搭載し、並列サブエージェント・スラッシュコマンド（/goal /schedule）・Skillsパッケージをサポート。Go製シングルバイナリでランタイム依存なし。MCP統合でMATLAB MCPサーバーに接続し、Simulinkモデルの構築・シミュレーション実行・データ解析を自律的に実行できる。Gemini Code Assist（IDE拡張）も廃止され、Antigravity IDEに集約された。',
    official_url: 'https://antigravity.google/',
    use_cases: ['MATLAB MCP経由のSimulinkモデル自動操作', '並列サブエージェントによる複数ケース同時シミュレーション', 'MBDワークフロー自動化スクリプト生成', 'Gemini CLI からの移行', 'Google Cloud AgentPlatformへの本番デプロイ'],
    mbd_relevance: 'high',
    tags: ['AI Agent', 'CLI', 'MCP', 'MATLAB', 'Simulink', 'Google', 'Gemini', 'Multi-Agent'],
  },
  {
    name: 'Siemens Digital Twin Composer',
    developer: 'Siemens Digital Industries Software',
    category: 'CAE / Simulation AI',
    description:
      'SiemensがCES 2026（2026年1月）で発表した次世代デジタルツインプラットフォーム。CAD・FEA/CFDシミュレーション・IoTセンサーデータ・AIをNVIDIA Omniverseベースの物理精度の高い3D仮想環境に統合する。設計変更がシミュレーション結果にリアルタイム反映され、現場センサーデータと仮想モデルを同一空間で比較可能。PepsiCo事例では工場建設前に90%の問題を仮想で発見。PAVE360 Automativeとの統合でSDV（ソフトウェア定義車両）システムレベルデジタルツインも構築できる。Siemens Xcelerator Marketplace経由で2026年中頃から提供。',
    official_url: 'https://www.siemens.com/en-us/company/digital-transformation/industrial-metaverse/introducing-digital-twin-composer/',
    use_cases: ['設計→シミュレーション→実データの統合可視化', 'IoTセンサーとシミュレーションのリアルタイム比較', 'AI異常検知・最適化提案', 'SDVシステムレベルデジタルツイン構築', '仮想コミッショニングによる物理試験前問題発見'],
    mbd_relevance: 'high',
    tags: ['Digital Twin', 'NVIDIA Omniverse', 'IoT', 'Industrial AI', 'Xcelerator', 'SDV', 'Real-time'],
  },
  {
    name: 'JetBrains Air',
    developer: 'JetBrains',
    category: 'AI Coding',
    description:
      'JetBrainsが2026年3月に公開プレビューを開始したエージェント型開発環境（Agentic IDE）。Claude Agent・OpenAI Codex・Gemini CLI・Junieを単一プロジェクト内で同時並列実行でき、各エージェントが独立したGitワークツリーまたはDockerコンテナで作業する。2026年6月にJetBrains Toolbox経由でLinux版が追加（macOS・Windows・Linux対応に）。MATLAB MCP Serverと組み合わせれば、制御設計・テスト生成・ドキュメント更新を複数AIが並行処理できる。プレビュー期間中は無料、JetBrains AI Proサブスクリプション（月$8）でClaude・Codex・Gemini・Junieを単一プランで利用可能。',
    official_url: 'https://air.dev',
    use_cases: ['複数AIエージェントのMBDタスク並列実行', 'MATLAB MCP経由での自律Simulink操作', 'Gitワークツリーによる安全な並列開発', 'CI/CDパイプラインへのJunie CLI統合', 'MCP経由での外部ツール連携'],
    mbd_relevance: 'high',
    tags: ['Multi-Agent', 'Agentic IDE', 'MCP', 'Parallel Development', 'MATLAB', 'Simulink', 'Junie'],
  },
];
