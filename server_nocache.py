# -*- coding: utf-8 -*-
"""本地静态服务：在 vr-oi-simulator 目录提供游戏页面，全部响应禁用缓存。
解决"改完 JS 后浏览器仍加载旧文件"的问题（python http.server 默认无
Cache-Control，Chrome 会启发式缓存旧 JS）。"""
import functools
import http.server
import os

ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静默日志


server = http.server.HTTPServer(
    ('127.0.0.1', 8123),
    functools.partial(NoCacheHandler, directory=ROOT)
)
print('nocache server on http://127.0.0.1:8123', flush=True)
server.serve_forever()