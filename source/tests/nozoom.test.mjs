// 整页不许捏的第三道（src/nozoom.js）：拦 Safari 报的双指手势。只验监听挂得对不对，不碰浏览器。
// 另两道（网页开头那行 viewport、每个元素的 touch-action）和真浏览器里的那一遍在 tests/e2e_gesture.py。
import { initNoZoom } from "../src/nozoom.js";

let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log("ok:", m); } else { failN++; console.log("FAIL:", m); } };

const handlers = {};
const doc = {
  addEventListener: (type, fn, opts) => { handlers[type] = { fn, opts }; },
  removeEventListener: (type, fn) => { if (handlers[type] && handlers[type].fn === fn) delete handlers[type]; },
};
const off = initNoZoom(doc);
ok(Object.keys(handlers).sort().join() === "gesturechange,gestureend,gesturestart", "只接 Safari 报双指的那三件事；touchmove 不接");
ok(Object.values(handlers).every((h) => h.opts && h.opts.passive === false), "挂的是“会拦”的监听（不然拦不住）");
let stopped = 0;
handlers.gesturestart.fn({ cancelable: true, preventDefault: () => { stopped++; } });
handlers.gesturechange.fn({ preventDefault: () => { stopped++; } });
ok(stopped === 2, "两根手指一落、一动：拦掉");
handlers.gesturestart.fn({ cancelable: false, preventDefault: () => { stopped++; } });
ok(stopped === 2, "浏览器说这一下拦不了的（聊天记录正滚着的时候落下第二根手指）：不硬拦，硬拦只会在控制台里报错");
off();
ok(Object.keys(handlers).length === 0, "退得干净");
ok(typeof initNoZoom(null) === "function" && typeof initNoZoom({}) === "function", "没有页面的地方（测试、打包）叫它也不出错");

console.log(`\n通过 ${pass}  失败 ${failN}`);
process.exit(failN ? 1 : 0);
