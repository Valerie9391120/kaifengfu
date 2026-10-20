// 打包闹钟：node alarm/build.mjs（在 source/ 里跑）→ alarm/dist/kfs-alarm.mjs，一个文件，拷到她电脑上就能跑（只要装了 Node）。
// KFS_TEST_URL 有的话连假 Supabase（测试用，出来的是 alarm/dist/kfs-alarm-test.mjs）。
// 手机那头的零件（src/ 里的）原样打进来：名帖怎么拼、对话怎么打包、回话怎么拆，两头是同一份代码
import { build } from "esbuild";

const TEST_URL = process.env.KFS_TEST_URL || "";
const define = {};
if (TEST_URL) {
  define.__KFS_SUPABASE_URL__ = JSON.stringify(TEST_URL);
  define.__KFS_SUPABASE_KEY__ = JSON.stringify("sb_publishable_test");
}
const out = TEST_URL ? "alarm/dist/kfs-alarm-test.mjs" : "alarm/dist/kfs-alarm.mjs";
await build({
  entryPoints: ["alarm/main.js"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20"],
  outfile: out,
  define,
  legalComments: "inline",
  logLevel: "warning",
  banner: { js: "// 开封府的闹钟（狐宇宙）。源码在 github.com/Valerie9391120/kaifengfu 的 source/alarm/，这个文件是打包出来的，别手改。" },
});
console.log("闹钟打包好了 → " + out);
