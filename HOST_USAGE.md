# App Notes 宿主项目使用说明

本文档给接入方使用。把 `release/` 目录和本文档放到宿主项目根目录后，按下面步骤接入。

## 1. 安装

在宿主项目根目录执行：

```bash
pnpm add ./release/company-app-notes-client-0.1.0.tgz
pnpm add -D ./release/company-app-notes-server-0.1.0.tgz
```

## 2. 添加启动脚本

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

备注数据会写入宿主项目：

```text
.app_notes/
```

## 3. 接入前端

在宿主项目入口文件中添加，例如 `src/main.tsx`：

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

## 4. 使用

1. 启动备注服务：

```bash
pnpm notes
```

2. 启动宿主项目：

```bash
rm -rf node_modules/.vite
pnpm dev -- --force
```

3. 打开页面右下角工具栏，点击新增标注。

## 5. 给 AI 工具读取

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

## 6. 注意事项

- 只在开发环境接入，不要在生产环境启用。
- `pnpm notes` 和宿主项目开发服务需要同时运行。
- 如果 `3927` 被占用，可以改 `notes` 脚本和 `serverUrl` 为同一个新端口。
- 备注文件和图片默认保存在宿主项目 `.app_notes/`。
