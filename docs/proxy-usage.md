## 如何使用代理

代理支持 `http`, `https`, `socks4`, `socks5` 协议。代理地址格式如下：

```
http://127.0.0.1:1080
socks5://127.0.0.1:1080
http://username:password@127.0.0.1:1080
socks5://username:password@127.0.0.1:1080
```

#### 配置步骤

1. 在 .env 中添加以下配置：

```bash
NUXT_PUBLIC_MODEL_PROXY_ENABLED=true
NUXT_MODEL_PROXY_URL=socks5://127.0.0.1:1080
```

2. 在 Chat-Ollama 的 Settings 页面中找到需要启用代理的第三方 API 模型，把勾选框勾选上即可（注意：你必须要配置 __Endpoint__ 才会生效）

3. 重启 Chat-Ollama 服务（如果使用的是 docker 重启容器）
