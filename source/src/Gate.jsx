// =====================================================
// 开封府的门口
// 没登录 → 登录；这台设备第一次来 → 设暗号或对暗号；
// 之后每次打开直接进门，暗号只在这台设备第一次时报一次。
// =====================================================

import { useEffect, useRef, useState } from "react";
import App from "./App.jsx";
import { supabase, remote } from "./cloud.js";
import { localDb } from "./localdb.js";
import { deriveVault, newSalt, seal, unseal, toB64, fromB64, KDF_ITER, CHECK_TEXT } from "./vault.js";
import { createEngine } from "./engine.js";
import { attachEngine } from "./store.js";

const WALL = "./assets/wall.webp";
const PAPER = "#D0D9C7";
const INK = "#24332F";
const INK_SOFT = "rgba(52,74,68,0.76)";
const DAI_GRAD = "linear-gradient(140deg,#7BA39B 0%,#3E655E 100%)";
const RED = "#A8473D";
const SERIF = "'Songti SC','STSong','Noto Serif SC','Source Han Serif SC',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif";

const card = {
  width: "100%",
  maxWidth: 360,
  padding: "28px 24px 24px",
  borderRadius: 30,
  backgroundColor: "rgba(255,255,255,0.5)",
  backdropFilter: "blur(26px) saturate(160%)",
  WebkitBackdropFilter: "blur(26px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.75)",
  boxShadow: "0 18px 50px rgba(42,62,56,0.16), inset 0 1px 0 rgba(255,255,255,0.8)",
};
const input = {
  width: "100%",
  borderRadius: 16,
  padding: "12px 14px",
  fontSize: 16,
  color: INK,
  backgroundColor: "rgba(255,255,255,0.62)",
  border: "1px solid rgba(255,255,255,0.85)",
  outline: "none",
  marginTop: 6,
};
const label = { display: "block", fontSize: 12.5, color: INK_SOFT, marginTop: 14 };
const primary = {
  width: "100%",
  marginTop: 20,
  padding: "13px 0",
  borderRadius: 999,
  fontSize: 15.5,
  letterSpacing: "0.2em",
  paddingLeft: "0.2em",
  color: "#fff",
  background: DAI_GRAD,
  boxShadow: "0 8px 20px rgba(48,82,74,0.32)",
};
const link = { fontSize: 12.5, color: INK_SOFT, textDecoration: "underline", textUnderlineOffset: 3 };

function Screen({ children }) {
  return (
    <div
      data-kfs-kbfit=""
      className="overflow-hidden flex items-center justify-center"
      style={{ position: "fixed", top: "var(--kfs-kb-top, 0px)", left: 0, width: "100%", height: "var(--kfs-kb-h, var(--kfs-h, 100dvh))", background: PAPER, fontFamily: SANS, color: INK, padding: "0 20px" }}
    >
      <img
        src={WALL}
        alt=""
        className="absolute pointer-events-none"
        style={{ inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 100%" }}
      />
      <div className="relative w-full flex justify-center" style={{ marginTop: "-8vh" }}>
        {children}
      </div>
    </div>
  );
}

function Title({ children, sub }) {
  return (
    <div className="text-center">
      <div style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: "0.3em", paddingLeft: "0.3em", color: INK }}>{children}</div>
      {sub && <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 10, lineHeight: 1.7 }}>{sub}</div>}
    </div>
  );
}

function ErrorLine({ text }) {
  if (!text) return null;
  return <div style={{ fontSize: 13, color: RED, marginTop: 12, lineHeight: 1.6 }}>{text}</div>;
}

function Spinner() {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        border: "3px solid rgba(63,106,98,0.18)",
        borderTopColor: "#3F6A62",
        animation: "kfsGateSpin 0.9s linear infinite",
        margin: "0 auto",
      }}
    />
  );
}

export default function Gate() {
  const [phase, setPhase] = useState("boot");
  const [session, setSession] = useState(null);
  const [meta, setMeta] = useState(null);
  const [work, setWork] = useState("");
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [show, setShow] = useState(false);
  const engineRef = useRef(null);
  const selfSignOut = useRef(false);

  useEffect(() => {
    boot();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !selfSignOut.current && engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
        attachEngine(null);
        setErr("登录过期了，重新登录一下。这台设备上的记录还在。");
        setPhase("login");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 进门之后：每隔一会儿、切回来、重新联网时，各同步一次
  useEffect(() => {
    if (phase !== "ready") return;
    const sync = () => {
      if (engineRef.current && document.visibilityState === "visible") engineRef.current.syncNow();
    };
    const t = setInterval(sync, 45000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
    };
  }, [phase]);

  async function boot() {
    setErr("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setPhase("login");
        return;
      }
      await afterLogin(data.session);
    } catch (e) {
      setErr("门口出了点问题：" + ((e && e.message) || e));
      setPhase("login");
    }
  }

  async function afterLogin(sess) {
    setSession(sess);
    const uid = sess.user.id;
    let saved = null;
    try {
      saved = await localDb.getVault();
    } catch (e) {}
    if (saved && saved.uid === uid && saved.aes && saved.mac) {
      await start({ aes: saved.aes, mac: saved.mac }, uid, false);
      return;
    }
    if (saved && saved.uid !== uid) {
      try {
        await localDb.wipe();
      } catch (e) {}
    }
    setWork("正在看看库房里有没有暗号……");
    setPhase("working");
    try {
      const m = await remote.getMeta();
      setMeta(m);
      setPhase(m.m_kdf ? "enterpass" : "setpass");
    } catch (e) {
      setErr("连不上云端：" + ((e && e.message) || e));
      setPhase("error");
    }
  }

  async function start(vault, uid, firstTimeHere) {
    const engine = createEngine({ local: localDb, remote, vault, uid });
    await engine.load();
    attachEngine(engine);
    engineRef.current = engine;
    if (firstTimeHere) {
      setWork("正在把记录取回来……");
      setProgress(0);
      setPhase("working");
      const off = engine.onStatus((s) => setProgress(s.pulled || 0));
      await engine.syncNow();
      off();
    } else {
      engine.syncNow();
    }
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {}
    setPhase("ready");
  }

  async function doLogin(e) {
    e.preventDefault();
    setErr("");
    if (!email.trim() || !password) return;
    setWork("正在核对……");
    setPhase("working");
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data || !data.session) {
      const msg = error && error.message;
      setErr(msg === "Invalid login credentials" ? "邮箱或密码不对" : msg || "没登上，再试一次");
      setPhase("login");
      return;
    }
    setPassword("");
    await afterLogin(data.session);
  }

  async function doSetPass(e) {
    e.preventDefault();
    setErr("");
    if (p1.length < 6) {
      setErr("暗号至少六个字");
      return;
    }
    if (p1 !== p2) {
      setErr("两次写的不一样");
      return;
    }
    setWork("正在锻造钥匙……");
    setPhase("working");
    try {
      const m = await remote.getMeta();
      if (m.m_kdf) {
        setMeta(m);
        setErr("这个账号已经设过暗号了，报原来那句就行");
        setPhase("enterpass");
        return;
      }
      const uid = session.user.id;
      const salt = newSalt();
      const vault = await deriveVault(p1, salt, KDF_ITER);
      await remote.upsert([
        { user_id: uid, key: "m_kdf", value: JSON.stringify({ v: 1, salt: toB64(salt), iter: KDF_ITER }) },
        { user_id: uid, key: "m_check", value: await seal(vault, CHECK_TEXT) },
      ]);
      await localDb.setVault({ uid, aes: vault.aes, mac: vault.mac });
      setP1("");
      setP2("");
      await start(vault, uid, true);
    } catch (e2) {
      setErr("没设成：" + ((e2 && e2.message) || e2));
      setPhase("setpass");
    }
  }

  async function doEnterPass(e) {
    e.preventDefault();
    setErr("");
    if (!p1) return;
    setWork("正在开门……");
    setPhase("working");
    try {
      const kdf = JSON.parse(meta.m_kdf);
      const vault = await deriveVault(p1, fromB64(kdf.salt), kdf.iter || KDF_ITER);
      let right = false;
      try {
        right = (await unseal(vault, meta.m_check)) === CHECK_TEXT;
      } catch (x) {}
      if (!right) {
        setErr("暗号不对");
        setPhase("enterpass");
        return;
      }
      const uid = session.user.id;
      await localDb.setVault({ uid, aes: vault.aes, mac: vault.mac });
      setP1("");
      await start(vault, uid, true);
    } catch (e2) {
      setErr("没打开：" + ((e2 && e2.message) || e2));
      setPhase("enterpass");
    }
  }

  async function signOut() {
    selfSignOut.current = true;
    if (engineRef.current) engineRef.current.stop();
    engineRef.current = null;
    attachEngine(null);
    try {
      await localDb.wipe();
    } catch (e) {}
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    window.location.reload();
  }

  const style = <style>{`@keyframes kfsGateSpin { to { transform: rotate(360deg); } } .kfs-gate-field::placeholder { color: rgba(52,74,68,.42); }`}</style>;

  if (phase === "ready") {
    return <App account={{ email: session && session.user ? session.user.email : "", signOut }} />;
  }

  if (phase === "boot") {
    return <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "var(--kfs-h, 100dvh)", background: PAPER }} />;
  }

  if (phase === "working") {
    return (
      <Screen>
        {style}
        <div style={card}>
          <Spinner />
          <div className="text-center" style={{ fontSize: 14, color: INK_SOFT, marginTop: 16 }}>
            {work}
          </div>
          {progress > 0 && (
            <div className="text-center" style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 6 }}>
              已取回 {progress} 条
            </div>
          )}
        </div>
      </Screen>
    );
  }

  if (phase === "error") {
    return (
      <Screen>
        {style}
        <div style={card}>
          <Title sub="门口出了点问题">开封府</Title>
          <ErrorLine text={err} />
          <button onClick={boot} className="kfs-tap" style={primary}>
            再试一次
          </button>
          <div className="text-center" style={{ marginTop: 16 }}>
            <button onClick={signOut} style={link}>
              退出登录
            </button>
          </div>
        </div>
      </Screen>
    );
  }

  if (phase === "login") {
    return (
      <Screen>
        {style}
        <form onSubmit={doLogin} style={card}>
          <Title sub="进门先报上名来">开封府</Title>
          <label style={label}>
            邮箱
            <input
              className="kfs-gate-field"
              style={input}
              type="email"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label style={label}>
            密码
            <input
              className="kfs-gate-field"
              style={input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorLine text={err} />
          <button type="submit" className="kfs-tap" style={{ ...primary, opacity: email.trim() && password ? 1 : 0.5 }}>
            进府
          </button>
        </form>
      </Screen>
    );
  }

  const who = session && session.user ? session.user.email : "";
  const passField = (value, onChange, placeholder) => (
    <input
      className="kfs-gate-field"
      style={input}
      type={show ? "text" : "password"}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  const footer = (
    <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
      <button type="button" onClick={() => setShow(!show)} style={link}>
        {show ? "藏起来" : "显示暗号"}
      </button>
      <button type="button" onClick={signOut} style={link}>
        不是这个账号
      </button>
    </div>
  );

  if (phase === "setpass") {
    return (
      <Screen>
        {style}
        <form onSubmit={doSetPass} style={card}>
          <Title sub="它是给所有记录上锁的钥匙。云端只存锁好的乱码，暗号只有你知道。忘了的话谁都打不开，包括我。">
            设一句暗号
          </Title>
          {who && <div className="text-center" style={{ fontSize: 12, color: INK_SOFT, marginTop: 8 }}>账号：{who}</div>}
          <label style={label}>
            暗号
            {passField(p1, setP1, "至少六个字，别和登录密码一样")}
          </label>
          <label style={label}>
            再写一遍
            {passField(p2, setP2, "")}
          </label>
          <ErrorLine text={err} />
          <button type="submit" className="kfs-tap" style={{ ...primary, opacity: p1 && p2 ? 1 : 0.5 }}>
            设好了
          </button>
          {footer}
        </form>
      </Screen>
    );
  }

  return (
    <Screen>
      {style}
      <form onSubmit={doEnterPass} style={card}>
        <Title sub="这台设备第一次来，报一下暗号。以后在这台设备上就不用再报了。">对暗号</Title>
        {who && <div className="text-center" style={{ fontSize: 12, color: INK_SOFT, marginTop: 8 }}>账号：{who}</div>}
        <label style={label}>
          暗号
          {passField(p1, setP1, "")}
        </label>
        <ErrorLine text={err} />
        <button type="submit" className="kfs-tap" style={{ ...primary, opacity: p1 ? 1 : 0.5 }}>
          开门
        </button>
        {footer}
      </form>
    </Screen>
  );
}
