// 6つの部。V字モデルの工程に対応する。
export interface Part {
  id: number;
  roman: string;
  title: string;
  subtitle: string;
  /** V字モデル上の位置（トップページで工程を示すのに使う） */
  vphase: string;
}

export const PARTS: Part[] = [
  { id: 1, roman: 'I',   title: '車両運動から始める', subtitle: '全体像を先に立てる',        vphase: 'モデリング' },
  { id: 2, roman: 'II',  title: 'モデルの中身を作り込む', subtitle: 'タイヤ・空力・ブレーキ・操作系・エンジン', vphase: 'モデリング' },
  { id: 3, roman: 'III', title: 'モデルを信じてよくする', subtitle: '同定と検証',            vphase: '検証' },
  { id: 4, roman: 'IV',  title: '車の速さを予測する',   subtitle: 'ラップタイムシミュレーション', vphase: '解析' },
  { id: 5, roman: 'V',   title: '車を賢くする',         subtitle: '制御設計',                vphase: '設計' },
  { id: 6, roman: 'VI',  title: '実装して確かめる',     subtitle: 'SIL / HIL / DIL',        vphase: '実装・検証' },
];

export function getPart(id: number): Part {
  const p = PARTS.find((x) => x.id === id);
  if (!p) throw new Error(`未定義の部: ${id}`);
  return p;
}
