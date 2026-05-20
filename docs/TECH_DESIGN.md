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
          dom-settle.ts
          env.ts
          format.ts
          page-path.ts
          xpath.ts
        types.ts
      index.ts
      package.json
      tsconfig.json
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
  mode: 'server',           // 'memory' | 'server'
  serverUrl: 'http://localhost:3927',
  pagePath: window.location.pathname,
  enabled: true,
  onNavigateToPage: (pagePath) => router.push(pagePath),
});
```

`mode` 为 `'memory'` 时使用内存存储（无需启动 server），`'server'` 时通过 HTTP API 持久化到 `.app_notes/`。

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

### 4.5 框架适配包 (M2 规划)

Web Components 是跨框架基线，但实际接入 React/Vue 时仍会有事件、类型和生命周期摩擦。

M2 计划提供轻量适配包：

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

### 5.1 NoteAnchor (实际实现)

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

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
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

## 6. SPA 路由同步

`page-path.ts` 通过劫持 `history.pushState` / `replaceState` 实现对 SPA 路由变化的监听，无需宿主手动调用 `updatePagePath()`。

```ts
// 自动安装路由监听
installPagePathSync();

// 监听自定义事件
window.addEventListener(LOCATION_CHANGE_EVENT, () => {
  // 路由变化后重新加载当前页备注
});
```

页面路径归一化：去掉尾部斜杠、query string 稳定排序，确保同一页面的不同 URL 变体被识别为同一页。

## 7. DOM 稳定策略

`dom-settle.ts` 解决 SPA 导航后 DOM 尚未渲染完成导致的锚点定位失败问题。

```ts
scheduleAfterDomSettle(callback, { timeoutMs: 5000 });
```

实现方式：`requestAnimationFrame` + 多层 `setTimeout` 级联，在连续两帧无 DOM 变化后触发回调，最长等待时间可配置。

## 8. 共享工具函数

`format.ts` 集中管理跨组件复用的工具函数：

| 函数 | 用途 |
|------|------|
| `clamp(value, min, max)` | 数值范围限制 |
| `escapeHtml(value)` | HTML 转义 |
| `escapeAttr(value)` | 属性值转义 |
| `tagClass(tag, prefix)` | 标签到 CSS 类名映射，`prefix` 参数区分 `'tag-question'` / `'question'` |

## 9. Server 设计

### 9.1 技术选型

- Node.js
- TypeScript
- Express
- Multer
- `fs/promises`
- JSON 文件存储

### 9.2 CLI

```bash
app-notes-server --port 3927 --root /path/to/project
```

参数：

- `--port` / `-p`：监听端口，默认 `3927`。
- `--root` / `-r`：备注写入项目根目录，默认当前工作目录。

### 9.3 数据目录

```text
.app_notes/
  ComponentA.notes.json
  xpath_xxxxx.notes.json
  assets/
    image-xxx.png
```

## 10. 数据模型

### 10.1 Schema Version

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

### 10.2 NoteComment

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

### 10.3 NotesFile

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

### 10.4 文件示例

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

## 11. API 设计

### 11.1 Health

```http
GET /api/health
```

### 11.2 获取备注列表

```http
GET /api/notes?pagePath=/dashboard
```

- 传 `pagePath`：返回指定页面备注。
- 不传 `pagePath`：返回全部备注。

### 11.3 获取单个锚点文件

```http
GET /api/notes/:noteId
```

### 11.4 新增备注

```http
POST /api/notes
```

```json
{
  "anchor": {},
  "comment": {}
}
```

### 11.5 归档/重新打开

```http
PATCH /api/notes/:noteId/comments/:commentId
```

```json
{
  "status": "archived"
}
```

### 11.6 上传图片

```http
POST /api/upload
```

表单字段：`file`

### 11.7 访问图片

```http
GET /api/assets/:filename
```

## 12. 写入与冲突防御

新增备注时：

1. 根据 `anchor.noteId` 生成安全文件名。
2. 若文件存在，读取 JSON 并追加到 `comments`。
3. 若文件不存在，创建新文件。
4. 写入时使用队列串行化，避免并发覆盖。
5. JSON 使用 `JSON.stringify(data, null, 2)` 保持可读。

不支持历史评论编辑，仅支持追加和状态切换。

## 13. 性能边界与缓存

### 13.1 Client 性能

风险：

- 单页面 30+ 备注气泡同时渲染会影响布局和滚动性能。
- 每次滚动都重新查询 DOM 会造成额外开销。
- 大量 ResizeObserver 或 MutationObserver 可能导致频繁重算。

建议：

- 默认只渲染当前视口附近或当前页面 open 状态备注。
- 对滚动和 resize 使用 `requestAnimationFrame` 节流。
- 对低置信或失效锚点不渲染气泡。
- 面板列表和页面气泡分离，列表可以显示全部，页面只显示当前页可定位备注。

### 13.2 Server 性能

风险：

- `.app_notes/` 下上百个文件时，每次读取全部 JSON 成本增加。
- 多次列表刷新会重复读盘。

建议：

- Server 维护简单内存缓存。
- 缓存 key 为 notes 文件名。
- 缓存内容包含 file mtime 和 parsed JSON。
- 读取列表时优先使用缓存，mtime 变化后再重新 parse。
- 写入后更新对应缓存项。

### 13.3 性能目标

MVP 可接受目标：

- 100 个 notes 文件内，列表接口响应应保持在 200ms 以内。
- 当前页面 30 条 open 备注内，滚动和 resize 不出现明显卡顿。

## 14. AI 扩展设计

### 14.1 Export API

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

### 14.2 MCP Server

候选工具：

- `list_annotations`
- `get_annotation_context`
- `mark_annotation_resolved`
- `list_invalid_anchors`

## 15. M1 开发顺序 (已完成)

M1 已按以下顺序完成实现：

1. `selection-overlay` — 选区高亮、hover 目标识别、点击生成 anchor、排除 SDK 自身元素
2. `note-form` — 文本输入、标签/角色选择、图片上传/拖拽/粘贴、表单校验、回调式提交流程
3. `store + api` 抽象层 — 内存模式与 Server 模式双实现，通过 `NotesDataSource` 接口切换
4. `note-bubble` — 彩色 pin 气泡、展开/折叠详情卡片、多评论分组、滚动/resize 重定位、低置信锚点不渲染
5. `notes-panel` — 备注列表/详情、分类/tag 筛选、健康度展示、归档/重开、定位元素
6. `floating-ball` — 悬浮入口、拖拽、localStorage 位置持久化
7. `server` — Express 服务、JSON 追加写入、图片上传+MIME 校验、静态资源访问
8. Client ↔ Server 联调 — HTTP API 对接、`.app_notes/` 读写验证、刷新恢复验证
9. SPA 路由同步 — `history` API 劫持 + `popstate`/`hashchange` + 自定义事件
10. DOM settle 策略 — RAF + setTimeout 级联，导航后延迟锚点重解析

M2 规划内容：
- 多框架接入验证 (React/Vue/原生 JS)
- React/Vue wrapper 适配包
- 锚点健康度报告
- 跨页跳转定位
- 重新绑定元素
