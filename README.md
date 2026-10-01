# 开封府

一个只属于两个人的小屋。

网页：https://valerie9391120.github.io/kaifengfu/

## 这里放了什么

- 根目录：打包好的网页，GitHub Pages 直接发布。
- `source/`：源码。`src/` 是网页，`supabase/` 是库房的建表代码和传话的小后端，`tests/` 是测试。

## 安全

- 代码里没有任何私人内容。人设、记忆、聊天、日记、照片，全部在手机上先用暗号加密，云端只存乱码。
- Anthropic 的 key 存在 Supabase 的密钥柜里，网页和手机上都没有。
- 库房每一行都绑着账号，只有登录后的本人能读写；注册通道关着。

## 重新打包

```
cd source
npm install react@18 react-dom@18 @supabase/supabase-js@2 esbuild@0.25 tailwindcss@3
node build.mjs
```

打包结果在 `source/dist/`，复制到仓库根目录即可。
