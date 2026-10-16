// 开封府写的（tools/make_jianghu.mjs 生成，别手改）。
// 她原来的 store.ts 把存档写成文件（.data/<编号>.json）。开封府里一段对话就是一局，存档跟着他的回话走（见 src/game/jianghu.js）：
// 调引擎之前把那一局放进这一格（putState），调完拿走（takeState）。引擎照旧按编号读写，编号对不上就当没有这一局。
import type { GameState } from './types.js';

let slot: string | null = null;

export function putState(state: GameState | null): void {
  slot = state ? JSON.stringify(state) : null;
}

export function takeState(): GameState | null {
  return slot ? (JSON.parse(slot) as GameState) : null;
}

export async function saveState(state: GameState): Promise<void> {
  slot = JSON.stringify(state);
}

export async function loadState(sessionId: string): Promise<GameState> {
  const state = slot ? (JSON.parse(slot) as GameState) : null;
  if (!state || state.sessionId !== sessionId) throw new Error(`Game session not found: ${sessionId}`);
  return state;
}
