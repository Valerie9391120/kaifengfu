# 江湖棋局（vendor）

卿卿和恩师做的双人武侠桌游，原仓库 `veden001/jianghu-rp-mcp`。文本、玩法是她写的，引擎是恩师写的；仓库写着保留所有权利，是她自己的东西，放进开封府是她定的。

**这个目录是 `tools/make_jianghu.mjs` 生成的，别手改。** 她那边改了：拿新的仓库重跑那个脚本。

- 从哪一版来：7e25c03e54ef9a53d31e15d0adb5a842f1541bfa（2026-10-08 20:51:49 +0100）
  docs: note mandatory White Wolf Old Fort beat
- 引擎自己写的版本号（GAME_VERSION）：0.3.0-dev
- 章节：zhongyuan、saibei、jiangnan
- 主持规矩：从 `src/index.ts` 取的 HOST_RULES

## 原样拷来的

- `engine/game.ts`：只换了头上一行，`node:crypto` 换成 `./rng.js`
- `engine/types.ts`
- `content/`、`chapters/` 里的 JSON

## 开封府写的

- `engine/rng.ts`：随机数用手机自带的（`crypto.getRandomValues`、`crypto.randomUUID`，没有 randomUUID 的老手机拿 getRandomValues 拼）。开封府调引擎时骰子、编号都自己给，这只是后备
- `engine/content.ts`：章节、身份、道具打进包里，不读文件
- `engine/store.ts`：存档放在“眼下这一局”那一格里（`putState`、`takeState`），不写文件
- `host_rules.js`：主持规矩
