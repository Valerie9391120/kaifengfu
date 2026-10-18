# 测试网页：同 python3 -m http.server，只多一样跟 GitHub Pages 一样的：每个回应都带 Access-Control-Allow-Origin: *。
# 同页关在隔开的框里（sandbox，来路是 null），它从开封府自己这儿取字（assets/tyfonts-*/）要这一句才取得到；
# GitHub Pages 给公开的网站都带着（开封府的仓库是公开的），线上不用另外做什么。
# 用法：python3 tests/serve.py 端口 [目录]（目录不写就是当前目录）
import functools, http.server, sys


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".woff2": "font/woff2"}

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
root = sys.argv[2] if len(sys.argv) > 2 else "."
print(f"测试网页：http://127.0.0.1:{port}/ ← {root}", flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=root)).serve_forever()
