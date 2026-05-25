# @company/app-notes-sdk 备注说明

## 项目基础信息

`@company/app-notes-sdk` 是一个本地优先的前端页面备注工具包，用于开发阶段在运行中的页面上添加视觉标注，并把备注数据保存到项目目录中，方便后续定位、修复和交给 AI 编程工具读取。

项目包含两个包：

- `@company/app-notes-client`：浏览器端 SDK，提供悬浮工具栏、元素选区、备注表单、页面气泡和备注面板。
- `@company/app-notes-server`：本地 Node.js 服务，负责接收备注和图片，并写入宿主项目的 `.app_notes/` 目录。

备注数据默认写入：

```text
.app_notes/
  *.notes.json
  assets/
```

注意：该工具只用于开发环境，不建议在生产环境加载。

## 本仓库开发启动

安装依赖：

```bash
pnpm install
```

构建全部包：

```bash
pnpm build:all
```

仅构建 client：

```bash
pnpm build
```

client watch 模式：

```bash
pnpm dev:client
```

开发模式启动本地 server：

```bash
pnpm dev:server
```

运行已构建的 server：

```bash
pnpm start:server
```

导出 AI 可读备注上下文：

```bash
pnpm export:ai-context
```

## 打包发布

生成 release tarball：

```bash
pnpm pack:release
```

打包产物会输出到 `release/` 目录，用于交付给其他项目通过本地包方式安装。

打包前建议先执行：

```bash
pnpm build:all
```

## 给别人如何使用

### 1. 安装包

如果通过 release tarball 交付，默认在宿主项目根目录执行安装命令：

```bash
pnpm add ./release/company-app-notes-client-0.1.0.tgz
pnpm add -D ./release/company-app-notes-server-0.1.0.tgz
```

如果在本地源码联调，也可以通过 `file:` 方式依赖本仓库中的包。

### 2. 添加宿主项目脚本

在宿主项目 `package.json` 中添加：

```json
{
  "scripts": {
    "notes": "app-notes-server --root . --port 3927",
    "notes:export": "app-notes-export-ai-context --root ."
  }
}
```

启动备注服务：

```bash
pnpm notes
```

备注数据会写入宿主项目 `.app_notes/`。

### 3. 在宿主项目中接入 client

推荐只在开发环境动态加载：

```ts
if (import.meta.env.DEV) {
  import('@company/app-notes-client').then(({ initAppNotes }) => {
    initAppNotes({
      serverUrl: 'http://localhost:3927',
      pagePath: window.location.pathname + window.location.search + window.location.hash
    });
  });
}
```

如果宿主项目是 SPA，并且需要支持从备注列表跳转到其他页面，可以传入 `onNavigateToPage`：

```ts
if (import.meta.env.DEV) {
  import('@company/app-notes-client').then(({ initAppNotes }) => {
    initAppNotes({
      serverUrl: 'http://localhost:3927',
      pagePath: window.location.pathname + window.location.search + window.location.hash,
      onNavigateToPage: (pagePath) => {
        // 这里调用宿主项目自己的路由跳转方法。
      }
    });
  });
}
```

### 4. 开始添加备注

1. 打开宿主项目页面。
2. 确认 `app-notes-server` 已启动。
3. 使用页面右下角悬浮工具栏新增标注。
4. 点击页面元素后填写备注、标签、角色和图片。
5. 提交后，备注会写入宿主项目 `.app_notes/`。

### 5. 导出给 AI 工具读取

页面标注后，备注数据会保存在宿主项目：

```text
.app_notes/*.notes.json
.app_notes/assets/
```

导出 AI 可读汇总文档：

```bash
pnpm notes:export
```

导出后 AI 工具读取：

```text
.app_notes/AI_CONTEXT.md
```

`AI_CONTEXT.md` 用于让 Cursor、Codex、Claude Code 等 AI 编程工具理解页面问题，并根据备注内容修复宿主项目代码。

### 6. 重新构建后的 Vite 缓存处理

如果宿主项目通过 `file:` 依赖本仓库包，并且使用 Vite，SDK 重新构建后建议清理缓存再启动：

```bash
rm -rf node_modules/.vite
pnpm dev -- --force
```

## 交付给他人时建议包含

- client release tarball。
- server release tarball。
- 宿主项目接入代码片段。
- 如果需要共享已有备注，一并提供宿主项目中的 `.app_notes/` 目录。
