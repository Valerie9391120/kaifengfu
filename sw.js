// =====================================================
// 开封府的服务工作线程：只管通知，别的一概不碰。
// 不拦网页的任何请求，不存任何缓存：开封府怎么加载、怎么更新，和没有它的时候一模一样。
// 打包时原样放到网站根上（sw.js），它管得着的范围就是整个开封府（两个入口都在里面）。
//
// 通知寄来的是一段 JSON，苹果新一些的系统（iOS 18.4 起）认这种“声明式”的写法：
//   { "web_push": 8030, "notification": { "title", "body", "navigate" } }
// 系统自己显示、点了自己打开 navigate，用不着这里的代码醒着。
// 认不得这种写法的浏览器（老一些的 iOS、电脑上的 Chrome）把同一段 JSON 交到这里，由这里照着显示。
// =====================================================

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function readPayload(data) {
  if (!data) return {};
  try {
    const value = data.json();
    return value && typeof value === "object" ? value : {};
  } catch (e) {
    return {};
  }
}

// 点了通知去哪：只能是开封府自己的网址，别的一律回到门口
function normalizeTarget(value) {
  const scope = new URL(self.registration.scope);
  try {
    const target = new URL(typeof value === "string" && value.trim() ? value.trim() : scope.href, scope.href);
    if (target.origin !== scope.origin || !target.pathname.startsWith(scope.pathname)) return scope.href;
    return target.href;
  } catch (e) {
    return scope.href;
  }
}

function inScope(url) {
  const scope = new URL(self.registration.scope);
  try {
    const u = new URL(url);
    return u.origin === scope.origin && u.pathname.startsWith(scope.pathname);
  } catch (e) {
    return false;
  }
}

function toNotification(payload) {
  const n = payload && payload.web_push === 8030 && payload.notification && typeof payload.notification === "object" ? payload.notification : {};
  const text = (v) => (typeof v === "string" ? v : "");
  const options = {
    body: text(n.body),
    icon: new URL("icons/icon-192.png", self.registration.scope).href,
    data: { target: normalizeTarget(n.navigate) },
  };
  if (text(n.lang)) options.lang = n.lang;
  if (text(n.tag)) options.tag = n.tag;
  if (n.silent === true) options.silent = true;
  // 寄来的东西读不懂也得显示一条：苹果不许悄悄收下不出声，那样会把通知的许可收回去
  return { title: text(n.title) || "开封府", options };
}

self.addEventListener("push", (event) => {
  // 系统已经打算自己显示了（event.notification 是它准备好的那条，Push API 规范里的名字）：让它来，点了以后它自己打开 navigate。
  // 照规范，我们寄的那种声明式通知根本不会交到这里；交到这里又带着这一条的，是早一些的 WebKit，它等这边不显示再自己显示
  if (event.notification) return;
  const { title, options } = toNotification(readPayload(event.data));
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = normalizeTarget(event.notification.data && event.notification.data.target);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (!inScope(client.url)) continue;
        // 开封府开着：告诉它是从哪条通知回来的，再把它叫到前面来（不重新加载）
        try {
          client.postMessage({ type: "kfs-notice", target });
        } catch (e) {}
        try {
          if (typeof client.focus === "function") await client.focus();
        } catch (e) {}
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
