# @company/app-notes-sdk 技术设计文档

## 1. 技术目标

`@company/app-notes-sdk` 由前端 SDK 和本地 CLI Server 两部分组成：

- `@company/app-notes-client`：跨框架 Web Components SDK，负责页面交互、选区、表单、视觉提示和本地服务通信。
- `@company/app-notes-server`：本地 Node.js CLI Server，负责将备注和图片写入项目目录。

技术目标：

- 支持 React、Vue、Angular、原生 JS 等宿主项目。
- 仅在开发环境启用，生产构建可剔除。
- 数据以 JSON 和图片文件形式存储，便于人和 AI 读取。
- 写入逻辑追加式，避免覆盖历史信息。

## 2. 总体架构

```text
Host App
  |
  | initAppNotes()
  v
@company/app-notes-client
  - Web Components UI
  - Selection overlay
  - Anchor resolver
  - API client
  |
  | HTTP localhost:3927/api
  v
@company/app-notes-server
  - Express routes
  - JSON storage
  - asset upload
  |
  v
.app_notes/
  *.notes.json
  assets/
```

## 3. Monorepo 结构

使用 pnpm workspace。

```text
app-notes-sdk/
  packages/
    client/
      src/
        components/
          app-notes-root.ts
          floating-ball.ts
          notes-panel.ts
          note-form.ts
          note-bubble.ts
          selection-overlay.ts
        services/
          api.ts
          store.ts
          types-api.ts
        styles/
          shared.ts
        utils/
          dom-anchor.ts
          xpath.ts
          env.ts
        types.ts
      index.ts
      package.json
      tsconfig.json
    react/
      src/
        index.tsx
      package.json
    vue/
      src/
        index.ts
      package.json
    server/
      src/
        index.ts
        routes.ts
        storage.ts
        types.ts
      package.json
      tsconfig.json
  package.json
  pnpm-workspace.yaml
  rollup.config.js
  tsconfig.base.json
```

## 4. Client 设计

### 4.1 技术选型

- TypeScript
- Web Components
- Custom Elements
- Shadow DOM
- Rollup

### 4.2 主要 Custom Elements

- `app-notes-root`：根组件，负责初始化、事件协调、状态同步。
- `app-notes-floating-ball`：右下角悬浮入口。
- `app-notes-panel`：备注列表和详情面板。
- `app-notes-form`：新增备注表单。
- `app-notes-bubble`：页面备注视觉提示。
- `app-notes-selection-overlay`：选区高亮层。

### 4.3 初始化 API

```ts
initAppNotes({
  serverUrl: 'http://localhost:3927',
  pagePath: window.location.pathname,
  enabled: true,
  onNavigateToPage: (pagePath) => router.push(pagePath),
});
```

### 4.4 开发环境隔离

推荐宿主项目按需动态引入：

```ts
if (import.meta.env.DEV) {
  import('@company/app-notes-client').then(({ initAppNotes }) => {
    initAppNotes({
      serverUrl: 'http://localhost:3927',
      pagePath: window.location.pathname,
    });
  });
}
```

SDK 内部也需要检查 `enabled` 和开发环境，避免误加载。

### 4.5 框架适配包

Web Components 是跨框架基线，但实际接入 React/Vue 时仍会有事件、类型和生命周期摩擦。

建议提供轻量适配包：

- `@company/app-notes-react`
- `@company/app-notes-vue`

React wrapper 目标：

- 封装 `initAppNotes` 生命周期。
- 处理 React 合成事件与 Custom Events 的边界。
- 提供类型友好的 props。

Vue wrapper 目标：

- 封装插件式安装或 composable。
- 适配 Vue Router 的 `onNavigateToPage`。
- 降低业务项目手写初始化代码。

## 5. Anchor 定位设计

### 5.1 NoteAnchor

```ts
interface NoteAnchor {
  noteId: string;
  pagePath: string;
  xpath?: string;
  cssSelector?: string;
  selectors?: string[];
  selectorHint?: string;
  textHint?: string;
  tagName?: string;
}
```

### 5.2 锚点生成优先级

1. 最近的 `data-note-id`。
2. 元素 id。
3. CSS selector。
4. XPath。
5. 文本摘要、tagName、class hint 作为校验辅助。

### 5.3 定位优先级

1. `[data-note-id="xxx"]`
2. `#id`
3. 稳定 CSS selector
4. CSS selector + 文本/tag 校验
5. XPath + 文本/tag 校验

低置信度锚点不得返回错误元素。

### 5.4 锚点置信度

建议为每个锚点计算健康状态：

- `stable`：基于 `data-note-id` 或稳定 id。
- `medium`：CSS selector 命中，并通过 tag/text 校验。
- `low`：仅有 XPath 或动态结构线索。
- `invalid`：无法找到可信元素。
- `rebind_required`：历史锚点失效，需要人工重新绑定。

AI 导出和面板列表都应包含该状态。

### 5.5 复杂 DOM 边界

需要明确支持和限制：

- Shadow DOM：默认只处理普通 DOM；如需穿透宿主 Shadow Root，需要额外递归策略。
- iframe：默认不跨 iframe 标注；后续可在同源 iframe 内注入子 overlay。
- 虚拟列表：XPath 和 nth-child 极易失效，应强制建议业务元素增加 `data-note-id`。
- 动态列表：列表项应使用业务主键生成 `data-note-id`，例如 `user-row-${id}`。
- 组件重渲染：定位逻辑需要在 DOM 变化后重新校验，不可缓存旧 Element 作为唯一依据。

## 6. Server 设计

### 6.1 技术选型

- Node.js
- TypeScript
- Express
- Multer
- `fs/promises`
- JSON 文件存储

### 6.2 CLI

```bash
app-notes-server --port 3927 --root /path/to/project
```

参数：

- `--port` / `-p`：监听端口，默认 `3927`。
- `--root` / `-r`：备注写入项目根目录，默认当前工作目录。

### 6.3 数据目录

```text
.app_notes/
  ComponentA.notes.json
  xpath_xxxxx.notes.json
  assets/
    image-xxx.png
```

## 7. 数据模型

### 7.1 Schema Version

所有 notes 文件从 v1 起必须包含 schema version，避免未来字段演进时无法兼容老项目。

推荐：

```ts
interface NotesFile {
  schemaVersion: 1;
  anchor: NoteAnchor;
  comments: NoteComment[];
  meta?: {
    createdAt: string;
    updatedAt: string;
  };
}
```

### 7.2 NoteComment

```ts
type NoteTag = '疑问' | '变更建议' | '逻辑补充' | '视觉规范';
type NoteRole = 'PM' | 'UI' | 'FE' | 'BE' | 'QA';
type CommentStatus = 'open' | 'archived';

interface NoteComment {
  id: string;
  content: string;
  images: string[];
  tags: NoteTag[];
  role: NoteRole;
  status: CommentStatus;
  createdAt: string;
  updatedAt?: string;
}
```

### 7.3 NotesFile

```ts
interface NotesFile {
  schemaVersion: 1;
  anchor: NoteAnchor;
  comments: NoteComment[];
  meta?: {
    createdAt: string;
    updatedAt: string;
  };
}
```

### 7.4 文件示例

```json
{
  "schemaVersion": 1,
  "anchor": {
    "noteId": "SubmitButton",
    "pagePath": "/dashboard",
    "xpath": "/html/body/div[1]/button[1]",
    "cssSelector": "[data-note-id=\"SubmitButton\"]",
    "textHint": "提交"
  },
  "comments": [
    {
      "id": "uuid",
      "content": "按钮颜色需要改为品牌主色",
      "images": [".app_notes/assets/xxx.png"],
      "tags": ["视觉规范"],
      "role": "UI",
      "status": "open",
      "createdAt": "2026-05-19T10:00:00.000Z"
    }
  ]
}
```

## 8. API 设计

### 8.1 Health

```http
GET /api/health
```

### 8.2 获取备注列表

```http
GET /api/notes?pagePath=/dashboard
```

- 传 `pagePath`：返回指定页面备注。
- 不传 `pagePath`：返回全部备注。

### 8.3 获取单个锚点文件

```http
GET /api/notes/:noteId
```

### 8.4 新增备注

```http
POST /api/notes
```

```json
{
  "anchor": {},
  "comment": {}
}
```

### 8.5 归档/重新打开

```http
PATCH /api/notes/:noteId/comments/:commentId
```

```json
{
  "status": "archived"
}
```

### 8.6 上传图片

```http
POST /api/upload
```

表单字段：`file`

### 8.7 访问图片

```http
GET /api/assets/:filename
```

## 9. 写入与冲突防御

新增备注时：

1. 根据 `anchor.noteId` 生成安全文件名。
2. 若文件存在，读取 JSON 并追加到 `comments`。
3. 若文件不存在，创建新文件。
4. 写入时使用队列串行化，避免并发覆盖。
5. JSON 使用 `JSON.stringify(data, null, 2)` 保持可读。

不支持历史评论编辑，仅支持追加和状态切换。

## 10. 性能边界与缓存

### 10.1 Client 性能

风险：

- 单页面 30+ 备注气泡同时渲染会影响布局和滚动性能。
- 每次滚动都重新查询 DOM 会造成额外开销。
- 大量 ResizeObserver 或 MutationObserver 可能导致频繁重算。

建议：

- 默认只渲染当前视口附近或当前页面 open 状态备注。
- 对滚动和 resize 使用 `requestAnimationFrame` 节流。
- 对低置信或失效锚点不渲染气泡。
- 面板列表和页面气泡分离，列表可以显示全部，页面只显示当前页可定位备注。

### 10.2 Server 性能

风险：

- `.app_notes/` 下上百个文件时，每次读取全部 JSON 成本增加。
- 多次列表刷新会重复读盘。

建议：

- Server 维护简单内存缓存。
- 缓存 key 为 notes 文件名。
- 缓存内容包含 file mtime 和 parsed JSON。
- 读取列表时优先使用缓存，mtime 变化后再重新 parse。
- 写入后更新对应缓存项。

### 10.3 性能目标

MVP 可接受目标：

- 100 个 notes 文件内，列表接口响应应保持在 200ms 以内。
- 当前页面 30 条 open 备注内，滚动和 resize 不出现明显卡顿。

## 11. AI 扩展设计

### 11.1 Export API

后续提供：

```http
GET /api/export
```

导出内容：

- open 状态备注。
- 页面路径。
- 元素锚点。
- DOM 片段。
- 文本提示。
- 图片附件。
- 视口信息。
- 用户修复意图。

### 11.2 MCP Server

候选工具：

- `list_annotations`
- `get_annotation_context`
- `mark_annotation_resolved`
- `list_invalid_anchors`

## 12. M1 开发顺序建议

M1 的核心目标是先验证最难、风险最高的页面选区与元素锚点能力，再逐步补齐交互闭环和本地持久化。

推荐顺序：

1. `selection-overlay`
   - 选区高亮。
   - hover 目标识别。
   - 点击元素生成初始 anchor。
   - 排除 SDK 自身元素。

2. `note-form`
   - 文本输入。
   - 标签和角色选择。
   - 图片上传、拖拽、粘贴。
   - 表单校验。

3. `store + api` 抽象层
   - 先实现内存模式，减少早期对 server 的依赖。
   - 统一 `addComment`、`listNotes`、`archiveComment` 等接口。
   - 后续切换到 server 模式时不改 UI 组件。

4. `note-bubble`
   - 当前页备注气泡渲染。
   - 基于 anchor 定位元素。
   - 滚动、resize、缩放后的重定位。
   - 低置信锚点不渲染。

5. `notes-panel`
   - 备注列表。
   - 备注详情。
   - 归档/重新打开。
   - 定位元素。

6. `floating-ball`
   - 悬浮入口。
   - 拖拽。
   - 快捷键 `Ctrl+Shift+N`。

7. `server`
   - Express 服务。
   - JSON 文件追加写入。
   - 图片上传。
   - 静态图片访问。

8. Client 切换 server 模式联调
   - 将内存 API 切换为 HTTP API。
   - 验证 `.app_notes/` 写入。
   - 验证刷新页面后备注恢复。

9. 多框架接入验证
   - Vite + React。
   - Vite + Vue。
   - 原生 HTML/JS。

这个顺序的原则：

- 先验证最大技术风险：复杂页面中的选区和锚点。
- UI 组件先跑内存闭环，避免被服务端阻塞。
- 服务端后置，但 API 抽象前置。
- 最后做跨框架验证，确保 Web Components 接入模型成立。
