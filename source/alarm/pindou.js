// =====================================================
// 光义屋里桌上的拼豆板（狐宇宙，见 src/fox.js、开发说明“拼豆作”那一节）。卿卿 2026 年 10 月 25 日 22:53 说的：
// “塞进开封府，甚至可以往狐宇宙里也塞一个给你玩”。23:00 她点的：他在屋里拼的，她在拼豆作「他的」那一栏看得见
// （拼到一半的、挂起来的都看得见，只能看不能动）；平常聊天里的他只能回屋看一眼，拼只在屋里醒着的时候（同园子、妆台）。
//
// 规矩、字都在 src/pindou/parts.js（手机那头回屋看一眼用的是同一份）；这里只管：存档怎么读写、替他办、屋里那一行小字。
// 存档：kfs2:pindou 一行（加密了跟着云端走），只有闹钟写（同园子 kfs2:garden）。同一个闹钟里一样一样排着来，先后两回不会互相盖掉。
// 屋里那一行小字（同园子、妆台：只留一行）：一回醒着里一样的只留一行（他一步一步拼，不然屋里一排“在拼豆板上拼了一会儿”）
// =====================================================
import { PINDOU_TOOL, isPindouCall, PD_HIS, PD_NOTE, readHis, packHis, hisApply, pindouBrief } from "../src/pindou/parts.js";

export { PD_HIS, isPindouCall, pindouBrief, PINDOU_TOOL };
export const PINDOU_NAMES = new Set([PINDOU_TOOL.name]);

// 一块板子（now 测试里换成定的钟）。load 读眼下的样子；apply 替他办一样（动了板子才写存档）
export function pindouOf(store, { now = () => Date.now() } = {}) {
  let queue = Promise.resolve();
  return {
    load: async () => readHis(await store.get(PD_HIS)),
    apply(input) {
      const run = queue.then(async () => {
        const r = hisApply(readHis(await store.get(PD_HIS)), input, now());
        if (r.changed) await store.set(PD_HIS, packHis(r.his));
        return r;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

// 替他办他调的那几样（还没结果的）：结果给他看（板子眼下的样子），另记一行小字（摆在狐宇宙里）。said：这一回醒着已经留过的小字
export async function runPindouCalls(calls, pd, said = new Set()) {
  const out = [];
  for (const c of calls || []) {
    if (!isPindouCall(c) || typeof c.out === "string") {
      out.push(c);
      continue;
    }
    const input = c.input && typeof c.input === "object" ? c.input : {};
    let r;
    try {
      r = await pd.apply(input);
    } catch (e) {
      if (e && (e.code === "badlogin" || e.code === "secret")) throw e; // 凭据坏了往外抛（同园子、妆台）
      r = { out: "拼豆板这会儿碰不了（存档出了岔子），下回再拼。", err: true, note: PD_NOTE.fail };
    }
    let note = r.note || "";
    if (note && said.has(note)) note = "";
    if (note) said.add(note);
    out.push({ ...c, input, out: r.out, err: !!r.err, note });
  }
  return out;
}

// 回话写到长度上限被截断、没停在调工具上：他调的那一样多半没写完整（一行一行的豆子写到一半），不替他办
export const cutPindou = (c) => ({ ...c, out: "（这一步没写完，没拼成。）", err: true, note: PD_NOTE.fail });

// 交给 askCore 的那一样（他屋里能玩的，见 wake.js 的 toys）：一回醒着一份（小字照这一份去重）
export const pindouToy = (pd) => {
  const said = new Set();
  return { tool: PINDOU_TOOL, names: PINDOU_NAMES, is: isPindouCall, cut: cutPindou, run: (calls) => runPindouCalls(calls, pd, said) };
};
