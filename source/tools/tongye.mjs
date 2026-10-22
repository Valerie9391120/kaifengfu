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
  // “光义刚更新了这一页”：只在他真的排好了一回的时候说（同页收 day 的时候每一天都再收一遍：别的哪一天变了、开封府替她取了天气、
  // 他正排着、没排成放回原样，都不算他更新了这一页；见 bridge.js 的 __kfsHisNew）
  ['toast2(nmMe()+"刚更新了这一页")', '(window.__kfsHisNew?__kfsHisNew(R):R.by!=="her")&&toast2(nmMe()+"刚更新了这一页")', 1, "不冒充他"],
  // 交给光义：寄给他的照片同页只认网上的地址（框里的 blob: 不要）。开封府这边照片都在框里是 blob:，换成开封府认得的编号再寄（见 bridge.js 的 __kfsAskRef）
  [
    "photos:ph.map(x=>PH[x]||x).filter(x=>!/^(data|blob):/.test(String(x)))",
    "photos:ph.map(x=>PH[x]||x).map(x=>window.__kfsAskRef?__kfsAskRef(x):x).filter(x=>!/^(data|blob):/.test(String(x)))",
    1,
    "交给光义的照片",
  ],
  // 他没排成、那一天原来又没有页（开封府记一个 status 是 failed 的 day，什么都没有）：同 making 一样，不当一页
  [
    'if(R.status==="making"&&!(R.photos||[]).length&&!(R.text||{}).p1)return;',
    'if((R.status==="making"||R.status==="failed")&&!(R.photos||[]).length&&!(R.text||{}).p1)return;',
    1,
    "没排成不起页",
  ],
  // “在排”那一栏：没排成的那一步画成没排成（不画成打勾、不一直转），也不冒“打开这一页”
  ['<div class="r ${s2.ok===false?"run":"ok"}">', '<div class="r ${s2.fail?"fail":s2.ok===false?"run":"ok"}">', 1, "没排成的那一步"],
  ['if(r&&r.status==="done"&&!log.dataset.done){', 'if(r&&r.status==="done"&&!(r.steps||[]).some(x=>x&&x.fail)&&!log.dataset.done){', 1, "没排成不冒打开这一页"],
  // 刚打开那一下同页按它自带的 9.26 摆过一遍：从“没在哪一天”开始，打开哪一天（9.26 也算）都真的换过去
  ['let CURDAY="9.26";', 'let CURDAY="";', 1, "从哪一天都不是开始"],
  // 换到要看的那一天（PAGE_DAY 换过来那一下）以后，才许存页上的东西（之前的是 9.26 的样子，见 bridge.js）
  ["\n PAGE_DAY=k;qDay=k;", "\n PAGE_DAY=k;window.__kfsOpened&&window.__kfsOpened(k);qDay=k;", 1, "换了天才许存"],
  // 同页自己存那一页（savePage）之前问一声开封府那一层：那一天的页取回来了、她真的动过手、照片库齐了，才存（见 bridge.js 的 __kfsSaveOk）
  ["function savePage(){if(restoring)return;", "function savePage(){if(restoring)return;if(window.__kfsSaveOk&&!window.__kfsSaveOk())return;", 1, "取回来之前、没动过手不存"],
  // 那一天的页从存档里取回来了（有没有都算回来了）
  [
    "pageRef.get().then(sn=>{if(PAGE_DAY!==k||!sn.exists)return;",
    "pageRef.get().then(sn=>{window.__kfsPageIn&&window.__kfsPageIn(k);if(PAGE_DAY!==k||!sn.exists)return;",
    1,
    "那一页取回来了",
  ],
  // 她的照片库（mine）头一回收齐了：开封府等它齐了再打开那一天（不齐的时候她放的照片摆不出来）
  ["mineCol.onSnapshot(q=>{const remote=", "mineCol.onSnapshot(q=>{window.__kfsMineIn=1;const remote=", 1, "照片库收齐了"],
  // 关上之前把那一页马上存了（见 bridge.js 的 closeNow）
  ["let pDirty=false;function flushPage(){", "let pDirty=false;window.__kfsFlush=()=>flushPage();function flushPage(){", 1, "关之前存"],
  // 留了批注：同页是送回它家里的聊天，开封府这边没送，光义翻日记看得到（不说“送回家了”）
  ['if(msg)msg.textContent="存好了，也送回家了，"+NM("me")+"那边看得到"', 'if(msg)msg.textContent="存好了，"+NM("me")+"翻日记的时候看得到"', 1, "不说送回家了"],
  // 字体：同页从 Google Fonts 现取；开封府这一页的安全规矩只连自己。同一批字开封府自己带着
  // （tools/tyfonts.mjs；卿卿 10 月 18 日定的“放到开封府自己这儿”，样子跟原版一模一样）：
  // 连 Google 的那一行拿掉；<head> 里取字的那一行换成开封府自己的那几张（makeTongye 填进来，还在原来那个地方）；
  // 换风格的时候（loadFonts）照同页写的那一种问开封府那一层要（bridge.js 的 __kfsFonts），前面那几句（取过的不再取）照旧
  ['<link rel="preconnect" href="https://fonts.googleapis.com">\n', "", 1, "不连 Google"],
  [
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;600&family=IBM+Plex+Mono:wght@400;500&family=Long+Cang&display=swap">\n',
    "<!--kfs:fonts-->\n",
    1,
    "字从开封府自己这儿取",
  ],
  [
    '\n const l=document.createElement("link");l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?"+st.fonts.map(f=>"family="+f).join("&")+(preview?"&text="+encodeURIComponent("0123456789.这一天的标题"):"")+"&display=swap";document.head.appendChild(l)}',
    "\n window.__kfsFonts&&__kfsFonts(st.fonts,preview)}",
    1,
    "字从开封府自己这儿取",
  ],
  // 每一天的页（day/<日子>）头一回收齐了，记一笔：开封府要打开某一天，等它收齐了再开
  [
    'db.collection("day").onSnapshot(q=>{q.docs.forEach(d=>ingestDay(d.data()));',
    'db.collection("day").onSnapshot(q=>{q.docs.forEach(d=>ingestDay(d.data()));window.__kfsDaysIn=1;',
    1,
    "收齐了",
  ],
  // 她自己起的标题（第二步，她 10 月 18 日看了样子说“可以”：点纸上的题签起标题，见 bridge.js）：存在那一天的 day 里（herTitle），
  // 题签、本子首页那一列照她起的摆；清空了用回原来的（他起过就用他的，没起过写日子）
  ["const P={t:R.title||k,", "const P={t:R.herTitle||R.title||k,", 1, "她自己起的标题"],
  // 本子首页“光义做好了 …”那一条、「交给光义」那一屏排好了的那一张，标题也照她起的
  ['${E2(r.title||"")}', '${E2(r.herTitle||r.title||"")}', 2, "她自己起的标题"],
  // 收到那一天的 day：先告诉开封府那一层（记下那一天的钟点，“光义刚更新了这一页”只在他新排好的那一回说；她开着的起标题那一条跟着收到的这一份）
  ["function ingestDay(R){if(!R||!R.day)return;", "function ingestDay(R){if(!R||!R.day)return;window.__kfsIngest&&__kfsIngest(R);", 1, "收到那一天"],
  // 打的字挑颜色（同上：点她打的那一段字，那一条里多一颗“色”，见 bridge.js）：颜色记在那一张贴纸上（--kc），
  // 存那一页、存一代的时候一起记下，摆回来（打开、换回哪一代、撤回、找回）的时候一起摆回来
  [
    "if(x.dataset.t)o.t=x.dataset.t;if(x.dataset.st)o.st=+x.dataset.st;",
    'if(x.dataset.t)o.t=x.dataset.t;if(x.dataset.st)o.st=+x.dataset.st;{const kc=x.style.getPropertyValue("--kc").trim();if(kc)o.kc=kc}',
    2,
    "打的字的颜色",
  ],
  ['el.style.setProperty("--s",o.s||1);', 'el.style.setProperty("--s",o.s||1);if(o.kc&&/^#[0-9a-fA-F]{6}$/.test(o.kc))el.style.setProperty("--kc",o.kc);', 2, "打的字的颜色"],
  // 换选了一张（或者不选了）：颜色那一排收回去（见 bridge.js 的 __kfsSel）
  ["function select(s){window.edOff&&edOff(s);", "function select(s){window.edOff&&edOff(s);window.__kfsSel&&__kfsSel(s);", 1, "打的字的颜色"],
  // 回本子再点开同一天（比如交给光义、他排好了点“打开这一页”）：同页只在换了一天的时候才照那一天的 day 重摆、套版式风格，
  // 不在编辑器里的那一会儿那一天变了（他排好了、另一台设备改了），点开看到的还是旧的。开封府这边点开同一天也重摆一回
  [" if(changed)journalSetDay(k,fillDay);", " if(changed)journalSetDay(k,fillDay);else if(window.__kfsLazy&&EDATA[k]){try{fillDay(k);setTimeout(()=>{try{drawUL();drawBars();drawPen();drawPins()}catch(e){}},60)}catch(e){}}", 1, "点开同一天也重摆"],
  [
    ' if(changed&&mode!=="chat")try{applyLayout(lay,{instant:true});applyStyle(sty,{instant:true})}catch(e){}}',
    ' if((changed||window.__kfsLazy)&&mode!=="chat")try{applyLayout(lay,{instant:true});applyStyle(sty,{instant:true})}catch(e){}}',
    1,
    "点开同一天也重摆",
  ],
  // 那一天的那一屏点“自己拼”：同页当场写一页空的 day；开封府这边点开不写，她头一回动手才起（见 bridge.js 的 touch、host.js 的 ensureDay）
  ['try{const db=window.__jdb;db&&db.collection("day").doc(day).set(R)}catch(_){}', 'try{const db=window.__jdb;db&&!window.__kfsLazy&&db.collection("day").doc(day).set(R)}catch(_){}', 1, "自己拼点开不写"],
  // 本子首页“从哪天写到今天，第几天”：照这一本搬进开封府那一天算（她 10 月 18 日定的“就从今天开始”，见 bridge.js 的 __kfsSince）；
  // 同页原来写的是今天往前 120 天那一天（首页那一张格子从那一天排起，格子照旧）
  [
    '$("#shSum").innerHTML=`从 ${START[0]}.${START[1]} 写到今天，第 <b>${n}</b> 天<br>',
    '$("#shSum").innerHTML=`${(window.__kfsSince&&__kfsSince())||`从 ${START[0]}.${START[1]} 写到今天，第 <b>${n}</b> 天`}<br>',
    1,
    "从哪天写起",
  ],
  // 那一天的那一屏上“几张照片、几句聊天”和那几张小图：照她那天在聊天里发的照片、聊的原话数（开封府取来的，见 bridge.js 的 __kfsDayPh）。
  // 同页原来拿那一天的 day 里的：掺过一页的日子摆的成了那一页上的几张、他挑的那几句，小图还摆不出来（照片的地址不在它的 PH 里；她 10 月 18 日 19:18 截图报的）
  [
    "const ph=PHOTOS[day]||[],chat=(G('CHATLOG')&&G('CHATLOG')[day]||[]).length",
    "const ph=(window.__kfsDayPh&&__kfsDayPh(day))||PHOTOS[day]||[],chat=window.__kfsDayN&&__kfsDayN(day)!=null?__kfsDayN(day):(G('CHATLOG')&&G('CHATLOG')[day]||[]).length",
    1,
    "那一天的照片、原话数",
  ],
  ['th.innerHTML=ph.map(k=>`<img alt="" src="${PH[k]}">`).join("")', 'th.innerHTML=ph.map(k=>`<img alt="" src="${PH[k]||k}">`).join("")', 1, "那一天的照片、原话数"],
  // 那一天的那一屏：没有天气的日子同页说“会从照片里读出来”（它的后端读照片里的地点）；开封府的天气是照她填的“天气在哪儿”取的
  ['"这天的地点和天气，会从照片里读出来"', '"这天还没有天气"', 1, "天气从哪儿来"],
  // 开封府要打开某一天：本子的那一段里摆一个口子（同“自己拼”那一颗：这一天还没有页就先在这一页里起一页空的（不存，她动手了才存，见 bridge.js），
  // 那一天取过天气的带上，天气签照它画；再进编辑器）。还没掺过的那一天（mode 是 day）：同本子首页点那一天，打开那一天的那一屏（交给光义、自己拼）
  [
    "\nhome();\n})();",
    '\nwindow.__kfsShell={open:function(k,mode){day=k;var n=0;(function t(){if(!DONE[k]&&!window.__kfsDaysIn&&++n<40){setTimeout(t,150);return}' +
      'if(mode==="day"&&!DONE[k]){try{openDay(k)}catch(e){console.warn(e)}return}' +
      'if(!DONE[k]){var w=null;try{w=(G("WX")||{})[k]}catch(_){}try{ingestDay(Object.assign({day:k,status:"done",by:"her",title:"",ts:Date.now()},w&&w.code!=null?{wx:w,at:w.at||""}:{}))}catch(_){}}' +
      'try{openEditor(document.body,mode==="day"?"view":mode||"view")}catch(e){console.warn(e)}})()},home:function(){try{home()}catch(e){}},' +
      // 那一天的那一屏要的照片、原话（开封府取来的：她那天在聊天里发的照片、聊的原话，见 bridge.js 的 __bzDay）：那一天还没有的才摆上，还是那一天就再摆一回
      // （那一屏滑进来是下一帧才算“on”，不看它）
      'dayIn:function(k,ph,chat){try{if(ph&&ph.length&&!(PHOTOS[k]||[]).length){ph.forEach(function(u){PH[u]=u});PHOTOS[k]=ph}var C=G("CHATLOG");if(C&&chat&&chat.length&&!(C[k]||[]).length)C[k]=chat;' +
      'if(day===k)renderDay()}catch(e){console.warn(e)}}};\nhome();\n})();',
    1,
    "开封府打开某一天",
  ],
  // ---- 引用栏（她 10 月 22 日报“手帐好卡、引用的句子点了没反应”，见 bridge.js 的“引用栏”那一节、开发说明“手帐不卡”那一节） ----
  // 狐宇宙里的（她留的、他在屋里说的）另起一栏「便签」（她 10 月 22 日截图画的），聊天那一栏不再掺：
  // 便签这一本（NOTELOG，同 CHATLOG 的样子：月.日 → [{w,t,p,src:"便签"}]）、选中的几句、栏的名字
  ["const CHATLOG={};", "const CHATLOG={},NOTELOG={};", 1, "便签那一栏"],
  ['const QSEL={"聊天":[],"吃了吗":[],"书摘":[],"健康":[]};', 'const QSEL={"聊天":[],"便签":[],"吃了吗":[],"书摘":[],"健康":[]};', 1, "便签那一栏"],
  ['const qLog=()=>quoteSub==="聊天"?CHATLOG:quoteSub==="书摘"', 'const qLog=()=>quoteSub==="聊天"?CHATLOG:quoteSub==="便签"?NOTELOG:quoteSub==="书摘"', 1, "便签那一栏"],
  ['${["聊天","吃了吗","书摘","健康"].map(k=>', '${["聊天","便签","吃了吗","书摘","健康"].map(k=>', 1, "便签那一栏"],
  ['g==="quote"?(quoteSub==="聊天"?"从聊天记录里挑 · 原话一个字不改"', 'g==="quote"?(quoteSub==="便签"?"从狐宇宙里挑 · 原话一个字不改":quoteSub==="聊天"?"从聊天记录里挑 · 原话一个字不改"', 1, "便签那一栏"],
  // 日历的深浅：聊天照聊天的（__bzHeat），便签照便签的（__bzNoteHeat，见 bridge.js）
  ['...(quoteSub==="聊天"&&window.__bzHeat?Object.keys(__bzHeat):[])', '...Object.keys((quoteSub==="聊天"?window.__bzHeat:quoteSub==="便签"?window.__bzNoteHeat:null)||{})', 1, "便签那一栏的日历"],
  ['const HT=quoteSub==="聊天"&&window.__bzHeat||{};', 'const HT=(quoteSub==="聊天"?window.__bzHeat:quoteSub==="便签"?window.__bzNoteHeat:null)||{};', 1, "便签那一栏的日历"],
  ['颜色越深那天${quoteSub==="聊天"?"说得越多":"吃得越多"}', '颜色越深那天${quoteSub==="聊天"||quoteSub==="便签"?"说得越多":"吃得越多"}', 1, "便签那一栏的日历"],
  // 贴到页上：便签跟聊天一样贴成原话（C: 加原样的几句；每一句带着 src，便签的那几句底下小字写“便签”）；几句都是便签的，头上写“便签”
  [':(quoteSub==="聊天"?"C:"+encodeURIComponent(', ':(quoteSub==="聊天"||quoteSub==="便签"?"C:"+encodeURIComponent(', 1, "便签贴到页上"],
  ['${L.every(x=>x.src==="原话")?"原话":"演示"}', '${L.every(x=>x.src==="便签")?"便签":L.every(x=>x.src==="原话"||x.src==="便签")?"原话":"演示"}', 1, "便签贴到页上"],
  // 换一天（同页的 journalSetDay）：便签那一栏选的也跟别的几栏一样清掉（不然换到别的一天，贴上去的还是上一天的便签）
  ['QSEL["聊天"]=[];QSEL["吃了吗"]=[];QSEL["书摘"]=[];QSEL["健康"]=[];', 'QSEL["聊天"]=[];QSEL["便签"]=[];QSEL["吃了吗"]=[];QSEL["书摘"]=[];QSEL["健康"]=[];', 1, "换一天便签那一栏也清"],
  // 取那一整天（同页的 qFullDay，开封府那一层的 sources）：便签一起取回来（note）；取回来以后那一天选过的清掉，便签那一栏也清。
  // 换不换成整天的聊天，比的是原来那几条（拆成几句的只算一条，他排页挑进来的便签不算），拆过、掺了便签的照样换得进来
  ['["聊天","书摘","健康"].forEach(function(t){QSEL[t]=', '["聊天","便签","书摘","健康"].forEach(function(t){QSEL[t]=', 1, "便签一起取"],
  [
    "if(C.length>=((CHATLOG[k]||[]).length))CHATLOG[k]=C}catch(e){}",
    'var was=(CHATLOG[k]||[]).filter(function(x){return x&&x.src!=="便签"&&!(x.part>1)}).length;if(C.length>=was)CHATLOG[k]=C}catch(e){}' +
      'try{if(Array.isArray(s.note))NOTELOG[k]=s.note.filter(function(x){return x&&x.p}).map(function(x){return {w:x.w,t:x.t||"",p:x.p,src:"便签"}})}catch(e){}',
    1,
    "便签一起取",
  ],
  // 收到那一天的 day（他排好了、别处改了）：同页拿 day 里他挑的那几句当那一天的聊天。那一天整天的话已经取过了（引用栏开过），
  // 就不拿那几句盖掉（不然他排好以后再开引用栏，聊天那一栏只剩他挑的那两三句，整天的话也不会再取）
  [
    'if(C&&R.chat)C[R.day]=R.chat.map(x=>({w:x.w,t:x.t||"",p:x.p,src:x.src||"原话"}));',
    'if(C&&R.chat&&!(window.QF_DONE&&QF_DONE.has(R.day)))C[R.day]=R.chat.map(x=>({w:x.w,t:x.t||"",p:x.p,src:x.src||"原话"}));',
    1,
    "整天的话不被他挑的那几句盖掉",
  ],
  // 引用栏摆出来、点一句：聊天、便签这两栏交给开封府那一层（不飞、一段一段摆、点一句只改那一句，见 bridge.js）；
  // 别的几栏（吃了吗、书摘、健康，开封府没有，藏着）照同页原来的
  ["function quotePickerHTML(){window.qFullDay&&qFullDay(qDay);", 'function quotePickerHTML(){if(window.__kfsQuoteHTML&&(quoteSub==="聊天"||quoteSub==="便签"))return __kfsQuoteHTML();window.qFullDay&&qFullDay(qDay);', 1, "引用栏不卡"],
  ["wireQuote=function(){_wq.apply(this,arguments);", 'wireQuote=function(){if(window.__kfsWireQuote&&(quoteSub==="聊天"||quoteSub==="便签"))return __kfsWireQuote(_wq);_wq.apply(this,arguments);', 1, "引用栏不卡"],
];

// 一段脚本的指纹（写进这一页的安全规矩：只有这几段跑得了）
const sha = (s) => "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'";

// 同页的版式、风格各叫什么、什么样（它自己写在 LAYOUTS、STYLES 里的一句 tag）：叫他排一页的时候列给他挑（host.js 的 tyArrangeAsk）。
// 回 { layouts: [[id, 名字, 一句话]], styles: [...] }；认不全就停下来
export function tyKit(src) {
  const pick = (re) => [...src.matchAll(re)].map((m) => [m[1], m[2], m[3]]);
  const layouts = pick(/\{"id": "([a-z0-9]+)", "name": "([^"]+)", "en": "[^"]*", "tag": "([^"]*)"/g);
  const styles = pick(/\{"id": "([a-z0-9]+)", "name": "([^"]+)", "en": "[^"]*", "src": "[^"]*", "tag": "([^"]*)"/g);
  const nL = (src.match(/"areas": \[/g) || []).length;
  const nS = (src.match(/"fonts": \[/g) || []).length;
  if (!layouts.length || layouts.length !== nL) throw new Error(`同页的版式认不全：认出 ${layouts.length} 种，写着 areas 的有 ${nL} 处`);
  if (!styles.length || styles.length !== nS) throw new Error(`同页的风格认不全：认出 ${styles.length} 种，写着 fonts 的有 ${nS} 处`);
  return { layouts, styles };
}

// fonts：tools/tyfonts.mjs 打好的字（baseHrefs：<head> 里那几张样式表，相对这一页）；不给就不放（单测里）
export function makeTongye(src, bridgeJs, fonts = null) {
  // 换行一律照 \n（浏览器读进来的脚本就是这样的，脚本的指纹照这样算才对得上）
  let html = src.replace(/\r\n?/g, "\n");
  for (const [from, to, n, why] of PATCHES) {
    const got = html.split(from).length - 1;
    if (got !== n) throw new Error(`同页的补丁对不上（${why}）：“${from.slice(0, 60)}”找到 ${got} 处，应该是 ${n} 处`);
    html = html.split(from).join(to);
  }
  const hrefs = (fonts && fonts.baseHrefs) || [];
  if (!hrefs.every((h) => /^\.\/tyfonts-[0-9a-f]{10}\/[a-z0-9-]+\.css$/.test(h))) throw new Error("同页 <head> 里的字只能是开封府自己的那几张");
  html = html.replace("<!--kfs:fonts-->\n", hrefs.map((h) => `<link rel="stylesheet" href="${h}">\n`).join(""));
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
    // 字：开封府自己带着的那一批（tools/tyfonts.mjs，同在 assets/ 里）；存长图的时候 html-to-image 把字取一遍、变成 data: 画进去
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  html = html.replace(CHARSET, `${CHARSET}\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">\n${bridgeTag}`);
  return { html, scripts: scripts.length };
}
