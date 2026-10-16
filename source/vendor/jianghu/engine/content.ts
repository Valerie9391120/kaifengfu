// 开封府写的（tools/make_jianghu.mjs 生成，别手改）。
// 她原来的 content.ts 每回从文件里读一份新的；这里章节、身份、道具打进包里，每回照样给一份新的（引擎拿去随便改，不碍下一回）。
import type { ChapterDefinition, Identity, ItemDefinition } from './types.js';
import identities from '../content/identities.json';
import commonItems from '../content/common-items.json';
import map0 from '../chapters/chapter-1-zhongyuan/map.json';
import items0 from '../chapters/chapter-1-zhongyuan/items.json';
import map1 from '../chapters/chapter-2-saibei/map.json';
import items1 from '../chapters/chapter-2-saibei/items.json';
import map2 from '../chapters/chapter-3-jiangnan/map.json';
import items2 from '../chapters/chapter-3-jiangnan/items.json';

const fresh = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;

const CHAPTERS: Record<string, unknown> = {
  zhongyuan: map0,
  saibei: map1,
  jiangnan: map2,
};

export async function loadIdentities(): Promise<Identity[]> {
  return fresh<Identity[]>(identities);
}

export async function loadItems(): Promise<ItemDefinition[]> {
  const allItems = fresh<ItemDefinition[]>([...(commonItems as unknown[]), ...(items0 as unknown[]), ...(items1 as unknown[]), ...(items2 as unknown[])]);
  const seen = new Set<string>();
  for (const item of allItems) {
    if (seen.has(item.id)) throw new Error(`Duplicate item id across content files: ${item.id}`);
    seen.add(item.id);
  }
  return allItems;
}

export async function loadChapter(id: string): Promise<ChapterDefinition> {
  const map = CHAPTERS[id];
  if (!map) throw new Error(`Unknown chapter: ${id}`);
  return fresh<ChapterDefinition>(map);
}
