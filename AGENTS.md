# AGENTS.md

本文件为 AI 编程助手和维护者提供 `@company/app-notes-sdk` 项目级别的上下文。

## 项目目的

`@company/app-notes-sdk` 是一个面向 AI 编程工作流的本地优先视觉标注工具包。

它不是面向线上用户反馈的产品，而是开发阶段专用的标注层——PM/UI/QA/FE 可在运行中的本地应用上直接标记问题，持久化到项目目录，并给 AI 编程工具提供足够结构化的上下文来找到并修复对应的 UI 或逻辑问题。

核心价值：

- 将视觉反馈转化为持久化、AI 可读的项目上下文。
- 保留页面路径、DOM 锚点、备注内容、角色、标签、图片和健康状态。
- 项目再次启动时恢复标注，便于开发者定位、修复和归档问题。

## 仓库结构

```text
app-notes-sdk/
  docs/
    产品需求文档.md
    技术设计文档.md
    项目状态.md
  packages/
    client/
      src/
        components/
        services/
        styles/
        utils/
      index.ts
    server/
      src/
        index.ts
        routes.ts
        storage.ts
        types.ts
  scripts/
    pack-release.mjs
  package.json
  pnpm-workspace.yaml
  rollup.config.js
  tsconfig.base.json
```

重要的生成文件或运行时数据：

- `.app_notes/`：server 写入的本地标注数据。
- `.app_notes/assets/`：上传或截图的图片资源。
- `packages/client/dist/`：client 打包产物。
- `packages/server/dist/`：server 打包产物。

## 包说明

### `@company/app-notes-client`

浏览器端 SDK。基于 Web Components 和 Shadow DOM 实现，跨框架适用于 React、Vue、Angular 和原生 JavaScript 项目。

主要文件：

- `packages/client/src/components/app-notes-root.ts`：根协调器，store 同步、事件连线、气泡渲染、定位行为。
- `packages/client/src/components/floating-ball.ts`：可拖拽悬浮工具栏。
- `packages/client/src/components/selection-overlay.ts`：元素选区模式。
- `packages/client/src/components/note-form.ts`：新增备注表单，标签、角色选择、图片上传、截图附加。
- `packages/client/src/components/note-bubble.ts`：页面上备注标记气泡。
- `packages/client/src/components/notes-panel.ts`：备注列表、详情、归档、定位。
- `packages/client/src/services/api.ts`：server 和内存两种数据客户端。
- `packages/client/src/services/store.ts`：客户端备注状态管理。
- `packages/client/src/utils/dom-anchor.ts`：锚点解析与查找。
- `packages/client/src/utils/dom-settle.ts`：SPA 导航后 DOM 稳定策略。
- `packages/client/src/utils/page-path.ts`：页面路径归一化与 SPA 路由监听。
- `packages/client/src/utils/format.ts`：跨组件共享工具函数（clamp、escapeHtml、escapeAttr、tagClass）。
- `packages/client/src/utils/xpath.ts`：XPath 回退工具。

### `@company/app-notes-server`

本地持久化服务。接收浏览器 SDK 的 HTTP 请求，将 JSON 和图片文件写入宿主项目目录。

主要文件：

- `packages/server/src/index.ts`：CLI 入口。
- `packages/server/src/routes.ts`：HTTP API 路由。
- `packages/server/src/storage.ts`：JSON 和资源文件 I/O。
- `packages/server/src/types.ts`：从 client 重导出的服务端类型。

## 常用命令

构建全部包：

```bash
pnpm build:all
```

仅构建 client：

```bash
pnpm build
```

client 构建的 watch 模式：

```bash
pnpm dev:client
```

开发模式运行本地 server：

```bash
pnpm dev:server
```

运行已构建的 server：

```bash
pnpm start:server
```

打包 release tarball：

```bash
pnpm pack:release
```

在通过 `file:` 依赖引用此包的 Vite 宿主项目中测试，重新构建后需清除 Vite 缓存：

```bash
rm -rf node_modules/.vite
pnpm dev -- --force
```

## 开发规则

### 环境边界

此 SDK 仅用于开发环境。

不要添加任何假设它应在生产环境运行的行为。宿主项目应条件加载 SDK：

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

### 跨框架约束

client UI 必须保持框架无关：

- 使用 Custom Elements 和 Shadow DOM。
- 不要在 `packages/client` 中引入 React/Vue 运行时依赖。
- 使用 DOM 事件进行组件协调。
- 样式限定在 Web Components 内部，除非有意设计为页面级 overlay。

### 持久化约束

浏览器端 client 禁止直接写本地文件。

所有持久化写入通过本地 server：

- 备注以 JSON 格式存储在 `.app_notes/` 下。
- 图片存储在 `.app_notes/assets/` 下。
- 新评论应以追加方式写入。
- 已有评论不得重写，仅允许状态变更（如归档/重开）。

### 锚点可靠性

锚点可靠性是主要产品风险。

优先使用稳定锚点，优先级如下：

1. `data-note-id`
2. 稳定的元素 `id`
3. 经校验的 CSS 选择器
4. 经校验的 XPath

重要规则：

- 永远不要因为 XPath 有返回值就指向一个可能错误的元素。
- 将动态列表、虚拟列表和深层嵌套的生成 DOM 视为低置信度，除非存在稳定的业务键。
- 保留 `tagName`、文本提示、选择器提示和健康状态，以便 AI 工具可以判断失败原因。
- 如果备注无法被自信地定位，应隐藏或标记它，而不是在误导位置渲染。

### UI 交互规则

当前交互风格紧凑、干净，遵循 macOS/iOS 风格。

保持以下行为不变：

- 悬浮工具栏小巧、垂直、可拖拽，包含三个主要操作：
  - 新增标注
  - 打开备注列表
  - 显示/隐藏全部备注气泡
- 从工具栏触发时，备注面板应在工具栏/列表按钮附近打开。
- 备注气泡不应默认绘制长连接线。
- 点击气泡打开备注详情并定位目标元素。
- hover 气泡或列表项时，应高亮被标注的 DOM 元素，而非气泡本身。
- 备注表单为选中元素右侧的锚定弹出层。
- 备注表单应保持标签直接可选：
  - `[疑问]`
  - `[变更建议]`
  - `[逻辑补充]`
  - `[视觉规范]`
- 图片缩略图应可查看，且不会意外触发文件选择器。
- 图片删除操作应明确。
- 截图附加应尽可能使用可选区域流程。

### 事件协调

大多数组件通信基于 CustomEvent 实现。

常见事件流：

- `start-selection`：工具栏或面板要求 overlay 进入选区模式。
- `element-selected`：overlay 返回选中的 DOM 元素。
- `form-submit`：备注表单提交锚点、内容、标签、角色和图片文件。
- `toggle-panel`：工具栏切换备注面板，可传递锚点矩形用于定位。
- `toolbar-toggle-bubbles`：工具栏切换全部页面气泡。
- `bubble-click`：气泡打开详情并定位目标元素。
- `bubble-hover`：气泡或列表项要求 root 高亮被标注的目标元素。
- `bubble-hover-end`：移除 hover 高亮。
- `locate-element`：面板详情要求 root 定位或导航。
- `archive-note`：面板要求 root/server 归档或重开。

添加新的 UI 行为时，优先扩展现有事件流，而非直接耦合组件。

## 测试检查清单

client 修改后：

1. 运行 `pnpm build:all`。
2. 如果从链接的 Vite 项目测试，清除 `node_modules/.vite` 并以 `--force` 重启 Vite。
3. 验证：
   - 工具栏拖拽仍可用。
   - 新增标注打开选区 overlay。
   - 选中元素后，备注表单在目标旁边打开。
   - 图片上传和截图附加仍可用。
   - 提交后创建气泡。
   - 点击气泡打开详情并定位元素。
   - hover 气泡高亮被标注的元素。
   - hover 列表项高亮被标注的元素。
   - 显示/隐藏全部气泡可用。
   - 面板在工具栏列表按钮旁打开。

server 修改后：

1. 运行 `pnpm build:all`。
2. 以预期的宿主项目根目录启动 server。
3. 验证 `.app_notes/` 的 JSON 输出和 `.app_notes/assets/` 的图片输出。
4. 确认多次创建备注后会追加评论，而非替换文件。

## 项目共享

本地项目共享一般需要：

- `@company/app-notes-client` 包
- `@company/app-notes-server` 包
- 宿主项目集成代码片段
- 如果共享已有标注，需要 `.app_notes/` 目录

npm 风格的包共享，使用 `pnpm pack:release` 生成的 release tarball。

源码级开发，直接共享仓库或 workspace 包路径。

## 文档参考

在进行较大的产品或架构变更前，请阅读：

- `docs/产品需求文档.md`
- `docs/技术设计文档.md`
- `docs/项目状态.md`

修改产品行为、架构、存储格式或公开集成 API 时，请同步更新这些文档。
