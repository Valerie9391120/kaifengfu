// =====================================================
// 光义屋里的一张床（罗浮梦，见 src/luofu/parts.js、开发说明“罗浮梦”那一节）。卿卿 2026 年 11 月 1 日定的：他只在狐宇宙里睡——
// 闹钟叫醒他、他一个人在屋里的时候；平常的聊天里没有这一样。
//
// 规矩、字都在 src/luofu/parts.js（手机那头梦库、梦廊那两页用的是同一份）；这里只管：存档怎么读写、替他睡、屋里那一行小字。
// 存档：梦库 kfs2:luofu:pool 只读（她在手机上梦库那一页导的、改的，同步下来的）；进度和梦廊 kfs2:luofu:state 只有这里写（手机那头只读）。
// 同一个闹钟里一样一样排着来，先后两回不会互相盖掉（同拼豆板）。
// 屋里那一行小字：睡觉的一回一行（睡了几觉就几行，同秘戏钱匣“抽几回几行”）；翻梦廊、读一场，一回醒着里一样的只留一行（同拼豆板）
// 平常聊天里翻梦廊那一样（luofu_gallery，只能看，她 11 月 1 日 21:31 定的）不在这里：任务到点那一回 wake.js 直接用 src/luofu/parts.js 的 runLookCalls（只读，不写进度）
// =====================================================
import { LUOFU_TOOL, LUOFU_NAMES, isLuofuCall, LUOFU_POOL, LUOFU_STATE, readLuofuPool, readLuofuState, packLuofuState, napApply, cutLuofu, hasDreams, NOTE } from "../src/luofu/parts.js";

export { LUOFU_TOOL, LUOFU_NAMES, isLuofuCall, cutLuofu };

// 一张床。apply 替他办一样（睡了、头一回给过说明了才写进度）
export function luofuOf(store) {
  let queue = Promise.resolve();
  return {
    // 梦库里有没有梦（【醒来】里那一句给不给）
    hasDreams: async () => hasDreams(readLuofuPool(await store.get(LUOFU_POOL))),
    apply(call, at) {
      const run = queue.then(async () => {
        const pool = readLuofuPool(await store.get(LUOFU_POOL));
        const state = readLuofuState(await store.get(LUOFU_STATE));
        const r = napApply(pool, state, call.input && typeof call.input === "object" ? call.input : {}, { id: call.id, at });
        if (r.changed) await store.set(LUOFU_STATE, packLuofuState(r.state));
        return r;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

// 替他办他调的那几样（还没结果的）：结果给他看（睡了一觉、梦廊、那一场），另记一行小字（摆在狐宇宙里）。
// said：这一回醒着已经留过的小字（翻梦廊、读一场那几行去重用）；at：他这一步的时间（梦廊里记的哪天做的梦）
export async function runLuofuCalls(calls, lf, said = new Set(), at = Date.now()) {
  const out = [];
  for (const c of calls || []) {
    if (!isLuofuCall(c) || typeof c.out === "string") {
      out.push(c);
      continue;
    }
    const input = c.input && typeof c.input === "object" ? c.input : {};
    let r;
    try {
      r = await lf.apply({ ...c, input }, at);
    } catch (e) {
      if (e && (e.code === "badlogin" || e.code === "secret")) throw e; // 凭据坏了往外抛（同园子、妆台、拼豆板）
      const look = input.action === "gallery" || input.action === "read";
      r = { out: look ? "梦廊这会儿翻不了（存档出了岔子），下回再翻。" : "这会儿睡不了（存档出了岔子），下回再睡。", err: true, note: look ? NOTE.readFail : NOTE.napFail, nap: !look };
    }
    let note = r.note || "";
    if (note && !r.nap) {
      if (said.has(note)) note = "";
      else said.add(note);
    }
    out.push({ ...c, input, out: r.out, err: !!r.err, note });
  }
  return out;
}

// 交给 askCore 的那一样（他屋里能玩的，见 wake.js 的 toys）：一回醒着一份（翻梦廊那几行小字照这一份去重）。
// run 的第二样是这一步（askCore 递进来的 { at }：他这一步的时间）
export const luofuToy = (lf) => {
  const said = new Set();
  return { tool: LUOFU_TOOL, names: LUOFU_NAMES, is: isLuofuCall, cut: cutLuofu, run: (calls, step) => runLuofuCalls(calls, lf, said, (step && step.at) || Date.now()) };
};
