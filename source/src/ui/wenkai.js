/* global __KFS_WENKAI_CSS__ */
// 开封府这头那一份霞鹜文楷（KFS WenKai，build.mjs 拼的：狐宇宙那一页截好的那些字 + 切好的那一份）。用到的时候挂上，挂一回就留着。
// 谁在用：狐宇宙盖在案上那一层的梦库、梦廊（DeskPage.jsx）；闲笔集月历的年月、格子里的日子（DiaryPage.jsx）。
const WENKAI_CSS = typeof __KFS_WENKAI_CSS__ !== "undefined" ? __KFS_WENKAI_CSS__ : "";
export function hangWenkai() {
  try {
    if (!WENKAI_CSS || document.querySelector("link[data-kfs-wenkai]")) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = WENKAI_CSS;
    l.setAttribute("data-kfs-wenkai", "");
    document.head.appendChild(l);
  } catch (e) {}
}
