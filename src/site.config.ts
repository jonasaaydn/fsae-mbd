// サイト全体の設定（SEO・計測まわり）
export const SITE = {
  origin: 'https://jonasaaydn.github.io',
  base: '/mbd-ai-lab',
  title: '学生フォーミュラのモデルベース開発',
  description:
    '学生フォーミュラ車両のモデルベース開発（MBD）を、車両運動からラップタイムシミュレーション、DILシミュレータまで48章で扱う教科書。実装は MATLAB / Simulink。',

  // Google Analytics 4 の測定ID。空文字なら計測タグを出力しない
  gaMeasurementId: 'G-BEC8KPCN74',

  // Search Console「HTMLタグ」方式の content 値
  googleSiteVerification: 'MB0fOZd-Tv_QOs64LLhOXMLfu1Ci4zZuxeJgV0UY8g8',
} as const;
