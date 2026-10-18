// 同页（TangfanOVO/tongye，见 vendor/tongye/KFS.md）搬进开封府：照原样拿 vendor/tongye/app.html，打下面这几处补丁，
// 再把开封府那一层（src/tongye/bridge.js，打成一段）塞进 <head> 最前面，加上这一页自己的安全规矩，交给 build.mjs 写成 assets/tongye-<指纹>.html。
// 每一处补丁都要在原文里找到、而且只找到说好的那么多处；作者更新了、对不上了，这里直接停下来（不会悄悄打歪）。
import { createHash } from "node:crypto";

// [找的原文, 换成, 应该有几处, 为什么]
export const PATCHES = [
  // 同页用 localStorage 存的东西：换成开封府那一层（加密了跟着云端走，见 bridge.js）
  ["localStorage", "__kfsLS", 61, "存在这台设备上的那几样改存开封府的存档"],
  // 唯一一处 eval（读另一段脚本里的几个变量）：换成写死的那几个名字，这一页的安全规矩里就不用放开 eval
  [
    "const G=n=>{try{return (0,eval)(n)}catch(e){return undefined}};",
    "const G=n=>{try{return ({CHATLOG:()=>CHATLOG,WX:()=>WX,FOODLOG:()=>FOODLOG,WORD:()=>WORD,SHOTS:()=>SHOTS,EVT:()=>EVT,decoOn:()=>decoOn,curStyle:()=>curStyle,curLayout:()=>curLayout,NOTES:()=>NOTES})[n]()}catch(e){return undefined}};",
    1,
    "不用 eval",
  ],
  // 名字：幡和枫换成卿卿和光义（设置里还能改）
  ['her:"幡",me:"枫"', 'her:"卿卿",me:"光义"', 1, "署名"],
  ['han:{n:"幡的章",edit:1,who:"her",def:"幡"', 'han:{n:"卿卿的章",edit:1,who:"her",def:"卿卿"', 1, "她的名字章"],
  ['feng:{n:"枫的章",edit:1,who:"me",def:"枫"', 'feng:{n:"光义的章",edit:1,who:"me",def:"光义"', 1, "他的名字章"],
  ['(CFG.me||"枫"):(CFG.her||"幡")', '(CFG.me||"光义"):(CFG.her||"卿卿")', 1, "署名"],
  ['LIB.stamp.items.han.def=CFG.her||"幡";LIB.stamp.items.feng.def=CFG.me||"枫"', 'LIB.stamp.items.han.def=CFG.her||"卿卿";LIB.stamp.items.feng.def=CFG.me||"光义"', 1, "署名"],
  ['stampCells(CFG.me||"枫")', 'stampCells(CFG.me||"光义")', 1, "批章"],
  ['(CFG.me||"枫")+"批过"', '(CFG.me||"光义")+"批过"', 1, "批章"],
  ['$("#cfgHer").value.trim()||"幡";CFG.me=$("#cfgMe").value.trim()||"枫"', '$("#cfgHer").value.trim()||"卿卿";CFG.me=$("#cfgMe").value.trim()||"光义"', 1, "署名"],
  ['NM("me"):"枫"),nmHer=()=>(typeof NM==="function"?NM("her"):"幡")', 'NM("me"):"光义"),nmHer=()=>(typeof NM==="function"?NM("her"):"卿卿")', 1, "署名"],
  ['return w==="her"?"幡":"枫"', 'return w==="her"?"卿卿":"光义"', 1, "署名"],
  ['id="shWho">幡 &amp; 枫<', 'id="shWho">卿卿 &amp; 光义<', 1, "署名"],
  ['id="meStick">让枫贴一张<', 'id="meStick">让光义贴一张<', 1, "署名"],
  ['<b id="toChatB">交给枫</b>', '<b id="toChatB">交给光义</b>', 1, "署名（这一颗先藏着，见 bridge.js）"],
  ['function nm(w){try{return NM(w)}catch(e){return w==="me"?"枫":"幡"}}', 'function nm(w){try{return NM(w)}catch(e){return w==="me"?"光义":"卿卿"}}', 1, "署名（删掉这一页那一段）"],
  // 删掉这一页、找回来以后同页重新载入一遍（回本子首页）：框里重新载入就丢了开门带进来的东西；开封府这边本子首页就是闲笔集，换成关上回闲笔集
  ["setTimeout(function(){location.reload()},900)", "setTimeout(function(){window.__kfsReload?__kfsReload():location.reload()},900)", 2, "删掉、找回以后回闲笔集"],
  // 找回之前，那一天现在那一页值不值得先挪进废纸篓：同页的注释说“只盖了章的空白页直接盖掉”，可只要有那一天的 day 就算值得。
  // 开封府点开哪一天都先起一页空的（同同页的“自己拼”），删了再点开去找回，废纸篓里就多一页空的。照它注释的意思：空的那一页不算（见 bridge.js 的 __kfsWorth）
  [
    'function worth(s){if(s.docs["day/"+s.day]||s.local.__day)return true;',
    'function worth(s){if(window.__kfsWorth?__kfsWorth(s.docs["day/"+s.day]||s.local.__day):(s.docs["day/"+s.day]||s.local.__day))return true;',
    1,
    "空的那一页找回的时候直接盖掉",
  ],
  // 刘海、底下那一条：iPhone 上框里的 env(safe-area-inset-*) 都是 0，换成外面那一层量好写进来的（见 TongyeFrame.jsx）
  ["env(safe-area-inset-top,0px)", "var(--safe-t,0px)", 10, "顶上让开刘海"],
  ["env(safe-area-inset-bottom,0px)", "var(--safe-b,0px)", 6, "底下让开横条"],
  ["env(safe-area-inset-left,0px)", "var(--safe-l,0px)", 3, "横着拿让开两边"],
  ["env(safe-area-inset-right,0px)", "var(--safe-r,0px)", 3, "横着拿让开两边"],
  // “今天”：照开封府给的（翻一年以前的页的时候，今天挪到那一天，见 dates.js）
  ["const __bzT=new Date(),", "const __bzT=(window.__kfsToday?window.__kfsToday():new Date()),", 1, "今天"],
  [' const t=new Date();$("#shDate")', ' const t=(window.__kfsToday?window.__kfsToday():new Date());$("#shDate")', 1, "今天"],
  ["function today(){const t=new Date(),", "function today(){const t=(window.__kfsToday?window.__kfsToday():new Date()),", 1, "今天"],
  ["const diff=Math.round((new Date()-new Date(Y,m-1,d))/864e5)", "const diff=Math.round(((window.__kfsToday?window.__kfsToday():new Date())-new Date(Y,m-1,d))/864e5)", 1, "今天"],
  ["now=new Date(),y=now.getFullYear()", "now=(window.__kfsToday?window.__kfsToday():new Date()),y=now.getFullYear()", 1, "今天"],
  // 空本子里还留着作者演示用的五天天气（阿德莱德那几天）：清掉，天气贴纸栏里只有她自己的
  [
    'const WX={"9.25":{at:"阿德莱德",code:3,hi:23.5,lo:14.7,mm:0,wind:13,sun:"19:14"},"9.26":{at:"袋鼠岛",code:61,hi:14.6,lo:12.3,mm:9,wind:26.3,sun:"19:20"},\n "9.27":{at:"阿德莱德",code:3,hi:20.9,lo:11.5,mm:0,wind:15.5,sun:"19:15"},"9.28":{at:"阿德莱德",code:3,hi:26.5,lo:9.9,mm:0,wind:20,sun:"19:16"},"9.29":{at:"粉湖",code:3,hi:32.3,lo:18.1,mm:0,wind:29.6,sun:"19:17"}};',
    "const WX={};",
    1,
    "演示的天气清掉",
  ],
  // 演示的天气清掉以后，同页几处默认“选中的那一天总有天气”（原来默认 9.26）：没有的时候别出错，天气贴纸那一栏说一句怎么填
  ['let wxDay="9.26";', 'let wxDay="";const WX_NONE={at:"",code:1,hi:0,lo:0,mm:0,wind:0,sun:"—",src:""};', 1, "没有天气的时候"],
  ["make:()=>STK[k](WX[wxDay],wxDay)", "make:()=>STK[k](WX[wxDay]||WX_NONE,wxDay)", 1, "没有天气的时候"],
  [':WX[wxDay];const day=isNew?"":wxDay;', ':(WX[wxDay]||WX_NONE);const day=isNew?"":wxDay;', 1, "没有天气的时候"],
  [
    'const d=WX[wxDay];$("#wxsrc").textContent=cat==="wx"?',
    'const d=WX[wxDay]||WX_NONE;$("#wxsrc").textContent=cat==="wx"&&!WX[wxDay]?"还没有这一天的天气：设置里填“天气在哪儿”，或者点「＋ 加一天」手填":cat==="wx"?',
    1,
    "没有天气的时候",
  ],
  ["Object.entries(LIB[cat].items).filter(([k,it])=>!it.hide)", 'Object.entries(LIB[cat].items).filter(([k,it])=>!it.hide&&(cat!=="wx"||WX[wxDay]))', 1, "没有天气就不摆天气贴纸"],
  // “光义刚更新了这一页”：只在他排的页更新的时候说（开封府替她取了天气、写进她自己拼的那一页，不算他）
  ['toast2(nmMe()+"刚更新了这一页")', 'R.by!=="her"&&toast2(nmMe()+"刚更新了这一页")', 1, "不冒充他"],
  // 刚打开那一下同页按它自带的 9.26 摆过一遍：从“没在哪一天”开始，打开哪一天（9.26 也算）都真的换过去
  ['let CURDAY="9.26";', 'let CURDAY="";', 1, "从哪一天都不是开始"],
  // 换到要看的那一天以后，才许存页上的东西（之前的是 9.26 的样子，见 bridge.js）
  [
    '$$("#page .stk.deco").forEach(x=>x.remove());decorate()}play($("#page"))}catch(e){console.warn(e)}},80);\n return true};',
    '$$("#page .stk.deco").forEach(x=>x.remove());decorate()}play($("#page"))}catch(e){console.warn(e)}},80);\n window.__kfsOpened&&window.__kfsOpened(k);\n return true};',
    1,
    "换了天才许存",
  ],
  // 每一天的页（day/<日子>）头一回收齐了，记一笔：开封府要打开某一天，等它收齐了再开
  [
    'db.collection("day").onSnapshot(q=>{q.docs.forEach(d=>ingestDay(d.data()));',
    'db.collection("day").onSnapshot(q=>{q.docs.forEach(d=>ingestDay(d.data()));window.__kfsDaysIn=1;',
    1,
    "收齐了",
  ],
  // 开封府要打开某一天：本子的那一段里摆一个口子（同“自己拼”那一颗：这一天还没有页就先起一页空的，再进编辑器）
  [
    "\nhome();\n})();",
    '\nwindow.__kfsShell={open:function(k,mode){day=k;var n=0;(function t(){if(!DONE[k]&&!window.__kfsDaysIn&&++n<40){setTimeout(t,150);return}' +
      'if(!DONE[k]){try{ingestDay({day:k,status:"done",by:"her",title:"",ts:Date.now()})}catch(_){}}' +
      'try{openEditor(document.body,mode||"view")}catch(e){console.warn(e)}})()},home:function(){try{home()}catch(e){}}};\nhome();\n})();',
    1,
    "开封府打开某一天",
  ],
];

// 一段脚本的指纹（写进这一页的安全规矩：只有这几段跑得了）
const sha = (s) => "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'";

export function makeTongye(src, bridgeJs) {
  let html = src;
  for (const [from, to, n, why] of PATCHES) {
    const got = html.split(from).length - 1;
    if (got !== n) throw new Error(`同页的补丁对不上（${why}）：“${from.slice(0, 60)}”找到 ${got} 处，应该是 ${n} 处`);
    html = html.split(from).join(to);
  }
  const CHARSET = '<meta charset="utf-8">';
  if (html.split(CHARSET).length !== 2) throw new Error("同页的 <meta charset> 不是一处");
  if (html.indexOf(CHARSET) > 200) throw new Error("同页的 <meta charset> 不在最前面");
  if (/<script[^>]*\ssrc=/i.test(html)) throw new Error("同页里出现了从外面取的脚本");
  if (/\son(click|load|error|input|change|pointerdown|submit)\s*=\s*["']/i.test(html)) throw new Error("同页里出现了写在标签上的事件");
  // 开封府那一层放在最前面（紧跟着 charset），比同页自己的脚本都早
  const bridgeTag = `<script>${bridgeJs.replace(/<\/script/gi, "<\\/script")}</script>`;
  const scripts = [...(html.replace(CHARSET, CHARSET + bridgeTag)).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const csp = [
    "default-src 'self'",
    `script-src ${scripts.map(sha).join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // 存长图：html-to-image 要把页上的图、字取一遍（都是这一页自己的）
    "connect-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  html = html.replace(CHARSET, `${CHARSET}\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">\n${bridgeTag}`);
  return { html, scripts: scripts.length };
}
