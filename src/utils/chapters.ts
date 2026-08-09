import { getCollection, type CollectionEntry } from 'astro:content';
import { PARTS, getPart, type Part } from './parts';

export type ChapterEntry = CollectionEntry<'chapters'>;

/** 章番号の昇順。全ページで並び順を統一するための唯一の入口 */
export async function getSortedChapters(): Promise<ChapterEntry[]> {
  const all = await getCollection('chapters');
  return all.sort((a, b) => a.data.chapter - b.data.chapter);
}

export async function getChaptersByPart(): Promise<{ part: Part; chapters: ChapterEntry[] }[]> {
  const sorted = await getSortedChapters();
  return PARTS.map((part) => ({
    part,
    chapters: sorted.filter((c) => c.data.part === part.id),
  }));
}

/** prereq の slug を章の実体に解決する。存在しない slug は無視する */
export async function getPrereqChapters(entry: ChapterEntry): Promise<ChapterEntry[]> {
  const sorted = await getSortedChapters();
  return entry.data.prereq
    .map((slug) => sorted.find((c) => c.slug === slug))
    .filter((c): c is ChapterEntry => Boolean(c));
}

/** この章を prereq に持つ章（＝次に読む章）を逆引きする */
export async function getNextChapters(entry: ChapterEntry): Promise<ChapterEntry[]> {
  const sorted = await getSortedChapters();
  return sorted.filter((c) => c.data.prereq.includes(entry.slug));
}

export async function getProgress() {
  const sorted = await getSortedChapters();
  const isPub = (c: ChapterEntry) => c.data.status === 'published';
  const byPart: Record<number, { total: number; published: number }> = {};
  for (const part of PARTS) {
    const list = sorted.filter((c) => c.data.part === part.id);
    byPart[part.id] = { total: list.length, published: list.filter(isPub).length };
  }
  return { total: sorted.length, published: sorted.filter(isPub).length, byPart };
}

export { PARTS, getPart };
export type { Part };
