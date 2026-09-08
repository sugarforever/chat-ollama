---
title: 把 ChatOllama Agent CLI 做成真正可安装的 npm 包
date: 2026-09-08
---

前两个阶段完成以后，`ChatOllama Agent CLI` 已经能在 monorepo 里启动，也能通过 Runtime 的事件显示流式回答。但“仓库里能运行”和“用户能安装”之间还有一段不短的距离。这次我会梳理怎样把 Runtime 与 CLI 交付成两个 npm 包，同时只让用户安装一个 CLI。期望对大家有所帮助。

## 源码可以运行还不够

开发阶段的命令使用 `tsx` 直接执行 TypeScript，CLI 对 Runtime 的依赖则写成 `workspace:*`。这两种写法在 pnpm workspace 里很方便，因为包管理器知道源码和相邻 package 在哪里。

用户的机器没有这些上下文。npm 安装完成以后，入口必须指向已经生成的 JavaScript；类型声明也要随包发布；`workspace:*` 更不能原样出现在公开 manifest 里。否则安装动作即使成功，执行时仍可能去寻找仓库源码。

所以这次没有增加新的 Agent 能力。工作集中在一条更基础的边界上：离开仓库以后，现有能力还能不能独立运行。

## 用 tsc 生成交付物

Runtime 和 CLI 分别增加了构建配置，只编译各自的 `src/` 到 `dist/`。Runtime 的 JavaScript 和类型入口都指向 `dist/index`；CLI 的 `chatollama-agent` bin 指向 `dist/main.js`。

CLI 入口源码第一行是标准 shebang：

```text
#!/usr/bin/env node
```

TypeScript 编译会保留这行内容。npm 安装 package 时再为 bin 建立可执行链接，因此最终用户不需要 `tsx`，也不需要知道仓库采用了 pnpm workspace。

这里继续使用 `tsc`，没有加入 bundler。Runtime 本来就是一个独立 package，CLI 也只通过它的公共接口工作。把依赖打进一个文件不会让当前交付更可靠，反而会增加另一套构建与调试规则。

## 发布名称由权限决定

原计划优先使用 `@chatollama` scope。发布前实际执行了 `npm whoami` 和 scope access 查询：当前账号是 `verysmallwoods`，而 Registry 返回 `@chatollama` scope 不存在，无法证明这个账号拥有发布权限。

package 查询的 404 只能说明公开 Registry 没有可见的同名包，不能证明一个账号有权创建 scope。因此本次按 Issue 里预先确定的 fallback 命名：

- Runtime：`chatollama-agent-runtime`
- CLI package 与 executable：`chatollama-agent`

CLI 的开发依赖仍可使用 workspace protocol。`pnpm pack` 会把它转换为与当前 Runtime 版本一致的普通依赖，测试则直接检查转换后的 tarball manifest。判断依据不是源码里的预期，而是用户最终拿到的文件。

## 测试真正安装的 tarball

发布测试会为两个 package 执行真实的 `pnpm pack`，检查 tarball 只包含 `dist/`、README、LICENSE 与 manifest。`src/`、examples、测试、凭据文件和仓库配置都不能进入包内。

随后脚本创建一个新的临时 npm 项目，先安装 Runtime tarball，再安装 CLI tarball。Runtime tarball 文件会在执行前删除，避免测试进程误把原始文件当成运行依赖。最后分别运行本地 bin 和：

```bash
npx --no-install chatollama-agent
```

两次运行都通过标准输入收到 `/exit`，并以状态码 0 结束。安装后的 JavaScript 还会检查是否存在源码路径或 `tsx` loader。这个临时目录与 monorepo 没有 workspace 链接，能更接近用户的安装环境。

测试成功时临时目录会被清理；失败时保留路径，方便直接查看 tarball、manifest 和安装结果。

## 从 tag 触发发布

发布 workflow 只响应 `agent-v*` tag，与 Nuxt 应用自己的版本节奏分开。它会重新安装锁定依赖，依次执行测试、类型检查、构建和 tarball 安装测试，再确认 tag、Runtime 与 CLI 三处版本完全一致。

Runtime 发布成功以后，workflow 才会发布 CLI。第一次发布可以在本地命令行完成，不需要把长期 token 放进 GitHub。两个 package 出现在 npmjs 以后，再分别绑定这个 workflow，后续版本便通过 OIDC trusted publishing 发布并生成 provenance。

workflow 在处理 tag 时会先查询公开 Registry。两个版本都不存在时进入发布；两个版本都存在时跳过重复 publish，直接安装公开 CLI 做 smoke test；只发布了其中一个 package 则立即失败。这样本地发布的 `0.1.0` 仍能用 `agent-v0.1.0` 记录 release marker，而不会尝试重复发布同一个 npm 版本。这个 tag 只会在 PR 合并并得到明确确认后创建。

用户最终只需要：

```bash
npm install --global chatollama-agent
chatollama-agent
```

Ollama 与 OpenAI 的环境变量、启动命令和本地安装方式都放在 CLI README。仓库内的开发命令仍然保留，但不再出现在用户安装路径的前面。
