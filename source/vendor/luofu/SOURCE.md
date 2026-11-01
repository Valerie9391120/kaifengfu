# 罗浮梦（vendor）

光义屋里的一张床（狐宇宙，见开发说明“罗浮梦”那一节）：一个小睡、做梦的引擎，纯文字，不碰界面。引擎是恩师写的（luofu-dream-engine），光义改成了不带梦的那一版：引擎里一个梦都没有，梦、有几种梦、各叫什么、各占几成、做梦的机会，全写在一份梦库里，从外头递进来。梦库在她手机上（`kfs2:luofu:pool`，加密了跟着云端走），不在这个仓库里。

- 从哪一版来：luofu-dream-engine v0.3.0（2026 年 11 月 1 日，引擎里一个梦都没有的那一版）
- 拷来的：`types.ts`、`pool.ts`、`luofu-engine.ts`
- 动了两处（11 月 1 日接进开封府的时候；引擎原来那个目录里同样改了、跑过它的 `npm test`，两边一样）：
  - `luofu-engine.ts` 的 `findInGallery`（`readGalleryText` 也走它）也认梦廊里列出来的那个序号——`galleryText` 列的是“1. 标题”“2. 标题”，1 是最新的那一场，也写得成“第 1 场”“#1”；先认编号、再认标题、最后认序号。原来只认编号和标题，可 `galleryText` 列出来的只有序号和标题，他照列出来的序号读一场会读不到
  - `galleryText`、`readGalleryText` 多一个可选的 `{ timeZone }`（`types.ts` 的 `GalleryTextOptions`）：梦廊里写的那一天（列表里那一行、读一场的“入梦”）照那个时区的日子；不给照 UTC，跟原来一样；认不出的时区、读不出的时间也照 UTC。原来一律照 UTC 取前十个字，她那边半夜前后差一天。开封府递给他的照她的时区（`Europe/Dublin`，见 `src/luofu/parts.js`）
- 没拷的：`index.ts`（开封府直接引这三个文件）、`luofu-tool.ts`、`stores/`（带存档的那一套：存档放在开封府的库房里，替他睡、存进度见 `src/luofu/parts.js`、`alarm/luofu.js`）、`smoke-test.ts`、`node-shims.d.ts`
- 存档里认旧版本存档的那一处原样留着（没改）

那边改了：拿新的一版把这三个文件原样再拷一遍，改上面那一行“从哪一版来”；上面动过的那一处要是新版里没有，照着再改一遍。
