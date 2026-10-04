import { useState, useEffect, useRef } from "react";
import { generateVapidKeys, secretsBlock, explainOutcome, describePush, describeMail } from "../notify.js";
import { checkPush, enablePush, disablePush, renewPush, sendTestPush, lastOutcome } from "../push.js";
import { timeAgo } from "../days.js";
import { T, glass, chip, chipPrimary, field } from "../ui/style.js";
import { Icon } from "../ui/Icon.jsx";

// 账户面板里的“通知”一栏：开启、发一条测试通知；他回话的时候她不在开封府，也敲她。
// 她在 Supabase 要做的几样（登记簿、小后端、钥匙；回话还要信箱和新的那份小后端）哪样还没好，这里一样一样列出来
const PUSH_CARD = { ...glass(0.5, 16), borderRadius: 16, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, color: T.ink };
const PUSH_DENIED = "系统里把开封府的通知关着。到手机的 设置 → 通知 → 开封府 里打开“允许通知”，再回来点开启。";

function PushStep({ done, title, children }) {
  return (
    <div className="kfs-push-step flex" data-done={done ? "yes" : "no"} style={{ gap: 9, padding: "5px 0" }}>
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: 18, height: 18, marginTop: 2, borderRadius: "50%", color: "#fff", background: done ? T.daiGrad : "transparent", border: done ? "none" : "1.5px solid rgba(var(--k-soft),0.4)" }}
      >
        {done && <Icon name="check" size={11} sw={2.6} />}
      </span>
      <span className="min-w-0" style={{ fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>
        {title}
        <span style={{ color: T.inkSoft }}>{children}</span>
      </span>
    </div>
  );
}

export function PushPanel({ email, onCopy, back, mailStatus, onReplyReady }) {
  const [st, setSt] = useState(null); // 现在是什么情形（push.js 的 checkPush）
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null); // 刚做的那一步怎么样：{ ok, say }
  const [secrets, setSecrets] = useState(""); // 刚生成的那三行
  const [detail, setDetail] = useState(false);
  const [waitFrom, setWaitFrom] = useState(null); // 等着后台那一条发出去：点的时候登记簿里记的是哪一回
  const alive = useRef(true);
  const lastCheck = useRef(0);

  // 看一遍现在什么情形。看得慢的那一趟可能比后发的那一趟晚回来，只认最后发出去的那一趟
  const refresh = async () => {
    const mine = ++lastCheck.current;
    try {
      const s = await checkPush();
      if (alive.current && mine === lastCheck.current) setSt(s);
      // 回话那两样都好了：告诉聊天那边新路是通的（她在 Supabase 贴完回来看一眼面板，接着发话就走新路，不用重开）
      if (s.replyReady && onReplyReady) onReplyReady();
      return s;
    } catch (e) {
      return null;
    }
  };
  useEffect(() => {
    alive.current = true;
    refresh();
    // 去 Supabase 贴完东西、锁完屏回来：自己再看一遍
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // “十秒后再发”：小后端先回话、过后才发，发得怎么样它记在登记簿里。隔两秒去看一眼，看到新的一回就停
  useEffect(() => {
    if (waitFrom === null) return;
    let tries = 0;
    let stopped = false; // 已经看到结果、或者面板关了：还在路上的那一趟回来也不算数
    const t = setInterval(async () => {
      tries++;
      let out = null;
      try {
        out = await lastOutcome();
      } catch (e) {}
      if (stopped || !alive.current) return;
      if (out && out.off) {
        setWaitFrom(null); // 等的工夫她把通知关了：不等了
      } else if (out && out.gone) {
        setWaitFrom(null);
        renew();
      } else if (out && out.at && out.at !== waitFrom) {
        setNote(explainOutcome(out));
        setWaitFrom(null);
        refresh();
      } else if (tries >= 22) {
        setNote({ ok: false, say: "等了一阵，没看到这一条发出去的记录。横幅到了就不用管；没到的话再发一次。" });
        setWaitFrom(null);
        refresh();
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [waitFrom]);

  // 推送服务说这台设备的门牌号作废了：小后端已经把它从登记簿里划掉，这里退掉旧的、重新订一个
  const renew = async () => {
    try {
      const renewed = await renewPush(st ? st.serverKey : "");
      if (alive.current && renewed) setNote({ ok: false, say: "这台设备的通知地址作废了，已经换了一个新的。再发一次试试。" });
    } catch (e) {
      if (alive.current) setNote({ ok: false, say: explainOutcome({ status: 410, note: "", host: "" }).say });
    }
    await refresh();
  };

  const act = async (name, work) => {
    if (busy) return;
    setBusy(name);
    setNote(null);
    try {
      await work();
    } catch (e) {
      if (alive.current) setNote({ ok: false, say: "没成：" + ((e && e.message) || e) });
    }
    if (alive.current) setBusy("");
  };
  // 开启：enablePush 里的头一件事就是问系统要许可，必须紧跟着手指点的这一下，前面不能先等别的
  const enable = () =>
    act("enable", async () => {
      const r = await enablePush(st.serverKey);
      if (!r.ok) setNote({ ok: false, say: r.why === "denied" ? PUSH_DENIED : "没点“允许”，通知没开。想开就再点一次。" });
      await refresh();
    });
  const disable = () =>
    act("off", async () => {
      setWaitFrom(null); // 正等着“十秒后再发”的结果：不等了
      await disablePush();
      await refresh();
    });
  const test = (delay) =>
    act(delay ? "later" : "test", async () => {
      // 等几秒再发的那种，靠“登记簿里的时间变了”认出这一条发出去了，所以发之前现去看一眼上一回是什么时候
      // （面板上记的可能是旧的：拿旧的去比，会把上一条当成这一条）
      let before = 0;
      if (delay) {
        const prev = await lastOutcome();
        before = (prev && prev.at) || 0;
      }
      const r = await sendTestPush(delay);
      if (r.queued) {
        setNote({ ok: true, say: `${r.delay} 秒后发出。现在把屏幕锁上，等横幅。` });
        setWaitFrom(before);
        return;
      }
      const one = (r.results || [])[0];
      if (!one) throw new Error("小后端没说发得怎么样");
      if (one.removed) return await renew();
      setNote(explainOutcome({ status: one.status, note: one.reason, host: one.host }));
      await refresh();
    });
  const makeKeys = () =>
    act("keys", async () => {
      setSecrets(secretsBlock(await generateVapidKeys(window.crypto.subtle), email));
    });

  if (!st) {
    return (
      <div className="kfs-push" data-state="checking" style={{ ...PUSH_CARD, color: T.inkSoft }}>
        正在看通知这条路通不通……
      </div>
    );
  }
  if (!st.support.ok) {
    return (
      <div className="kfs-push" data-state="unsupported" style={PUSH_CARD}>
        {st.support.say}
      </div>
    );
  }

  const setup = st.setup;
  const denied = st.permission === "denied";
  // away：这台设备开过通知，这会儿却连不上后端。是网络的事，别摆出“还差几步”让她以为后端没了
  const state = st.away ? "away" : !st.ready ? "setup" : st.on ? "on" : denied ? "denied" : "off";
  const shown = note || (state === "on" && st.last ? { ...explainOutcome(st.last), when: st.last.at } : null);
  const small = { fontSize: 12, color: T.inkSoft, lineHeight: 1.6 };

  return (
    <div className="kfs-push" data-state={state}>
      {state === "setup" && (
        <div style={PUSH_CARD}>
          <div style={{ marginBottom: 4 }}>通知还差几步，都在 Supabase 里做：</div>
          <PushStep done={setup.table === "ok"} title="登记簿">
            {setup.table === "ok" ? "：建好了" : setup.table === "missing" ? "：还没建。把通知那段 SQL（push.sql）在 SQL Editor 里跑一遍" : "：读不到"}
          </PushStep>
          <PushStep done={setup.fn === "ok"} title="小后端">
            {setup.fn === "ok"
              ? "：接上了"
              : setup.fn === "unreachable"
              ? "：连不上。Edge Functions 里要有一个叫 push 的函数；有了还这样，多半是网络，过一会儿再看"
              : setup.fn === "auth"
              ? "：登录过期了，重新登录一下"
              : setup.fn === "wrong"
              ? "：函数建了，里面的代码却不是开封府的那份。打开 push 函数的 Code，把里面的字全删掉，换成我给的那份，再点 Deploy"
              : "：不肯答"}
          </PushStep>
          <PushStep done={setup.keys === "ok"} title="钥匙">
            {setup.keys === "ok"
              ? "：放好了"
              : setup.keys === "missing"
              ? "：还没放。点下面生成一份"
              : setup.keys === "bad"
              ? "：放的不对"
              : "：小后端接上了才看得到"}
          </PushStep>
          {setup.say && setup.keys !== "missing" && setup.fn !== "wrong" && (
            <div className="kfs-push-say" style={{ ...small, marginTop: 4 }}>
              它说：{setup.say}
            </div>
          )}
        </div>
      )}
      {state === "away" && <div style={PUSH_CARD}>这台设备开着通知，可这会儿连不上后端，多半是网络。过一会儿再看。</div>}
      {state === "denied" && <div style={PUSH_CARD}>{PUSH_DENIED}</div>}
      {state === "off" && (
        <div style={PUSH_CARD}>
          现在关着。打开以后，{st.replyReady ? "他回话的时候你不在开封府，这台设备会收到横幅，上面写着他说的话。" : "这台设备能收到开封府的系统通知。"}
        </div>
      )}
      {state === "on" && (
        <div style={PUSH_CARD}>
          这台设备开着通知。
          {st.replyReady && (
            <div className="kfs-push-reply" data-ready="yes" style={small}>
              {setup.bubbles === "ok" ? "他回话的时候你不在开封府，会敲你：他说几句就敲几条，横幅上写着他说的话。发完话就可以切走、锁屏。" : "他回话的时候你不在开封府，会敲你，横幅上写着他说的话。发完话就可以切走、锁屏。"}
            </div>
          )}
          {/* 小后端里还是早一些的那份代码：照旧能用，只是他说几句都并成一条敲。想要一句一条，换成新的那份 */}
          {st.replyReady && setup.bubbles !== "ok" && (
            <div className="kfs-push-bubbles" style={small}>
              小后端还是上一版的：他说几句都并成一条敲。想要一句一条，打开 push 函数的 Code，把里面的字全删掉，换成新的那份，再点 Deploy。
            </div>
          )}
        </div>
      )}
      {/* 测试通知通了，他的回话还敲不了她：还差哪一样，在 Supabase 里补上 */}
      {(state === "on" || state === "off") && !st.replyReady && (
        <div className="kfs-push-reply" data-ready="no" style={{ ...PUSH_CARD, marginTop: 10 }}>
          <div style={{ marginBottom: 4 }}>他的回话还敲不了你，还差：</div>
          <PushStep done={setup.mail === "ok"} title="信箱">
            {setup.mail === "ok" ? "：建好了" : setup.mail === "missing" ? "：还没建。把信箱那段 SQL（mailbox.sql）在 SQL Editor 里跑一遍" : "：读不到，过一会儿再看"}
          </PushStep>
          <PushStep done={setup.relay === "ok"} title="小后端">
            {setup.relay === "ok" ? "：是新的" : "：还是旧的那份。打开 push 函数的 Code，把里面的字全删掉，换成新的那份，再点 Deploy"}
          </PushStep>
          <div style={{ ...small, marginTop: 4 }}>差着的时候聊天照常，只是你切走以后他的回话到不了。</div>
        </div>
      )}

      {secrets && state === "setup" && (
        <div className="kfs-push-secrets" style={{ marginTop: 10 }}>
          {/* 不用输入框摆：字小的输入框在 iPhone 上一点就把整页放大。就是一段选得中的字 */}
          <pre
            aria-label="贴进密钥柜的三行"
            style={{ ...field, margin: 0, fontSize: 11.5, lineHeight: 1.5, fontFamily: "ui-monospace,Menlo,monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", userSelect: "text", WebkitUserSelect: "text" }}
          >
            {secrets}
          </pre>
          <p style={{ ...small, marginTop: 6 }}>
            三行一起复制，到 Supabase 的 Edge Functions → Secrets，在 Name 那一格里粘贴（会自己分成三条），点 Save，再回来。第三行是苹果要的联系邮箱，填的是你的登录邮箱，想换别的就改这一行。钥匙只用生成这一回；这三行别发给别人。
          </p>
        </div>
      )}

      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
        {state === "setup" && setup.keys !== "ok" && !secrets && (
          <button onClick={makeKeys} disabled={!!busy} className="kfs-tap" style={{ ...chip, opacity: busy ? 0.5 : 1 }}>
            {busy === "keys" ? "正在生成…" : "生成一份钥匙"}
          </button>
        )}
        {state === "setup" && secrets && (
          <button onClick={() => onCopy(secrets)} className="kfs-tap" style={chipPrimary}>
            复制这三行
          </button>
        )}
        {(state === "setup" || state === "denied" || state === "away" || (state === "off" && !st.replyReady)) && (
          <button onClick={() => act("check", refresh)} disabled={!!busy} className="kfs-tap" style={{ ...chip, opacity: busy ? 0.5 : 1 }}>
            {busy === "check" ? "正在看…" : "再看一次"}
          </button>
        )}
        {state === "off" && (
          <button onClick={enable} disabled={!!busy} className="kfs-tap" style={{ ...chipPrimary, opacity: busy ? 0.6 : 1 }}>
            {busy === "enable" ? "正在开启…" : "开启通知"}
          </button>
        )}
        {state === "on" && (
          <>
            <button onClick={() => test(0)} disabled={!!busy || waitFrom !== null} className="kfs-tap" style={{ ...chip, opacity: busy || waitFrom !== null ? 0.5 : 1 }}>
              {busy === "test" ? "正在发…" : "发一条测试通知"}
            </button>
            <button onClick={() => test(10)} disabled={!!busy || waitFrom !== null} className="kfs-tap" style={{ ...chip, opacity: busy || waitFrom !== null ? 0.5 : 1 }}>
              {waitFrom !== null ? "等它发出去…" : "十秒后再发"}
            </button>
            <button onClick={disable} disabled={!!busy} className="kfs-tap" style={{ ...chip, color: T.inkSoft, opacity: busy ? 0.5 : 1 }}>
              {busy === "off" ? "正在关…" : "关掉"}
            </button>
            {!st.replyReady && (
              <button onClick={() => act("check", refresh)} disabled={!!busy} className="kfs-tap" style={{ ...chip, opacity: busy ? 0.5 : 1 }}>
                {busy === "check" ? "正在看…" : "再看一次"}
              </button>
            )}
          </>
        )}
      </div>
      {state === "on" && <p style={{ ...small, marginTop: 8 }}>“十秒后再发”是留给锁屏的：点完就把屏幕锁上，看横幅到不到。</p>}

      {/* 她是点着测试通知回到开封府的（这次打开以来）：横幅到了、点了回得来，两头都验着了 */}
      {back > 0 && state === "on" && (
        <div className="kfs-push-back" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 8, color: T.ink }}>
          你是点着测试通知回来的（{timeAgo(back)}）：横幅到了，点了也回得来，这条路全通了。
        </div>
      )}
      {shown && (
        <div className="kfs-push-note" data-ok={shown.ok ? "yes" : "no"} style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 8, color: shown.ok ? T.ink : "#A8473D" }}>
          {shown.when ? `上一回（${timeAgo(shown.when)}）：` : ""}
          {shown.say}
        </div>
      )}

      <button onClick={() => setDetail(!detail)} className="kfs-push-more" style={{ ...small, marginTop: 8, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {detail ? "收起细节" : "看细节"}
      </button>
      {detail && (
        <div className="kfs-push-detail" style={{ ...small, marginTop: 6, userSelect: "text", WebkitUserSelect: "text" }}>
          {describePush(st)
            .concat(mailStatus ? [describeMail(mailStatus())].filter(Boolean) : [])
            .map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          <div>哪一步卡住了，把这几行截图给我。</div>
        </div>
      )}
    </div>
  );
}
