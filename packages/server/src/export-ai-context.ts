#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const HEALTH_ORDER = ['invalid', 'rebind_required', 'low', 'medium', 'stable'];

interface ExportOptions {
  projectRoot: string;
}

interface NotesFileData {
  anchor?: Record<string, any>;
  comments?: Array<Record<string, any>>;
  context?: Record<string, any>;
  fix?: Record<string, any>;
}

interface FlattenedNote {
  fileName: string;
  anchor: Record<string, any>;
  context?: Record<string, any>;
  fix?: Record<string, any>;
  comment: Record<string, any>;
}

function parseArgs(argv: string[]): ExportOptions {
  let projectRoot = process.cwd();
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root' || arg === '-r') {
      projectRoot = path.resolve(argv[++i] ?? projectRoot);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
app-notes-export-ai-context

Usage:
  app-notes-export-ai-context [options]

Options:
  -r, --root <path>    project root, default cwd
  -h, --help           show help
`);
      process.exit(0);
    }
  }
  return { projectRoot };
}

function escapeMd(value = ''): string {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function healthLabel(value: unknown): string {
  return {
    stable: 'stable',
    medium: 'medium',
    low: 'low',
    invalid: 'invalid',
    rebind_required: 'rebind_required'
  }[String(value)] ?? 'unknown';
}

function statusRank(comment: Record<string, any>): number {
  return comment.status === 'archived' ? 1 : 0;
}

function noteRank(note: FlattenedNote): number {
  const health = HEALTH_ORDER.indexOf(note.anchor.health ?? 'low');
  return statusRank(note.comment) * 100 + (health < 0 ? 50 : health);
}

async function readNotesFiles(notesDir: string): Promise<Array<{ fileName: string; data: NotesFileData }>> {
  let entries = [];
  try {
    entries = await fs.readdir(notesDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.notes.json'));
  const result = [];
  for (const file of files) {
    const filePath = path.join(notesDir, file.name);
    const raw = await fs.readFile(filePath, 'utf-8');
    result.push({ fileName: file.name, data: JSON.parse(raw) as NotesFileData });
  }
  return result;
}

function flattenNotes(files: Array<{ fileName: string; data: NotesFileData }>): FlattenedNote[] {
  const notes: FlattenedNote[] = [];
  for (const { fileName, data } of files) {
    for (const comment of data.comments ?? []) {
      notes.push({
        fileName,
        anchor: data.anchor ?? {},
        context: data.context,
        fix: data.fix,
        comment
      });
    }
  }
  return notes.sort((a, b) => {
    const rank = noteRank(a) - noteRank(b);
    if (rank !== 0) return rank;
    return new Date(b.comment.createdAt ?? 0).getTime() - new Date(a.comment.createdAt ?? 0).getTime();
  });
}

function renderFixSummary(fix?: Record<string, any>): string {
  if (!fix) return '-';
  const parts = [
    fix.summary,
    Array.isArray(fix.changedFiles) && fix.changedFiles.length ? `${fix.changedFiles.length} files` : undefined,
    typeof fix.verified === 'boolean' ? (fix.verified ? 'verified' : 'unverified') : undefined
  ].filter(Boolean);
  return parts.join('; ') || '-';
}

function renderList(title: string, notes: FlattenedNote[]): string {
  if (notes.length === 0) return `## ${title}\n\n无。\n`;
  return [
    `## ${title}`,
    '',
    '| 优先 | 状态 | 页面 | 角色/标签 | 问题 | 锚点 | 证据 | 修复 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...notes.map((note) => {
      const tags = (note.comment.tags ?? []).join(', ') || '-';
      const health = healthLabel(note.anchor.health);
      const evidence = note.anchor.evidence;
      const evidenceText = [
        evidence?.matchedBy ? `by ${evidence.matchedBy}` : undefined,
        typeof evidence?.matchScore === 'number' ? `score ${evidence.matchScore}` : undefined,
        evidence?.failureReason
      ].filter(Boolean).join('; ') || '-';
      return [
        health === 'invalid' || health === 'rebind_required' ? '高' : health === 'low' ? '中' : '低',
        escapeMd(`${note.comment.status ?? 'open'} / ${health}`),
        escapeMd(note.anchor.pagePath ?? '-'),
        escapeMd(`${note.comment.role ?? '-'} / ${tags}`),
        escapeMd((note.comment.content ?? '(图片备注)').slice(0, 80)),
        escapeMd(note.anchor.noteId ?? '-'),
        escapeMd(evidenceText),
        escapeMd(renderFixSummary(note.fix))
      ].join(' | ');
    }).map((line) => `| ${line} |`)
  ].join('\n') + '\n';
}

function renderDetail(note: FlattenedNote, index: number): string {
  const ai = note.comment.ai ?? {};
  const evidence = note.anchor.evidence ?? {};
  const lines = [
    `### ${index + 1}. ${note.comment.content || '(图片备注)'}`,
    '',
    `- 文件：\`${note.fileName}\``,
    `- 页面：\`${note.anchor.pagePath ?? '-'}\``,
    `- 锚点：\`${note.anchor.noteId ?? '-'}\``,
    `- 健康度：\`${healthLabel(note.anchor.health)}\``,
    `- 匹配证据：\`${evidence.matchedBy ?? 'none'}\` / score \`${typeof evidence.matchScore === 'number' ? evidence.matchScore : '-'}\``,
    evidence.failureReason ? `- 失败原因：${evidence.failureReason}` : undefined,
    note.context?.viewport ? `- 视口：${note.context.viewport.width}x${note.context.viewport.height} @${note.context.viewport.devicePixelRatio}` : undefined,
    note.context?.url ? `- URL：${note.context.url}` : undefined,
    note.comment.images?.length ? `- 图片：${note.comment.images.map((item: string) => `\`${item}\``).join(', ')}` : undefined,
    note.fix?.summary ? `- 修复摘要：${note.fix.summary}` : undefined,
    note.fix?.changedFiles?.length ? `- 改动文件：${note.fix.changedFiles.map((item: string) => `\`${item}\``).join(', ')}` : undefined,
    typeof note.fix?.verified === 'boolean' ? `- 验证状态：${note.fix.verified ? '已验证' : '未验证'}` : undefined,
    note.fix?.verifiedAt ? `- 验证时间：${note.fix.verifiedAt}` : undefined,
    ai.expected ? `- 期望：${ai.expected}` : undefined,
    ai.actual ? `- 实际：${ai.actual}` : undefined,
    ai.stepsToReproduce?.length ? `- 复现步骤：\n${ai.stepsToReproduce.map((step: string, stepIndex: number) => `  ${stepIndex + 1}. ${step}`).join('\n')}` : undefined,
    ai.fixHints?.length ? `- 修复线索：\n${ai.fixHints.map((hint: string) => `  - ${hint}`).join('\n')}` : undefined,
    ''
  ];
  return lines.filter(Boolean).join('\n');
}

async function exportAiContext(options: ExportOptions): Promise<void> {
  const notesDir = path.join(options.projectRoot, '.app_notes');
  const outputPath = path.join(notesDir, 'AI_CONTEXT.md');
  const files = await readNotesFiles(notesDir);
  const notes = flattenNotes(files);
  const open = notes.filter((note) => note.comment.status !== 'archived');
  const risky = open.filter((note) => ['invalid', 'rebind_required', 'low'].includes(note.anchor.health));
  const fixed = notes.filter((note) => note.fix?.summary || note.fix?.changedFiles?.length || typeof note.fix?.verified === 'boolean');
  const healthSummary = notes.reduce<Record<string, number>>((acc, note) => {
    const key = healthLabel(note.anchor.health);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const content = [
    '# App Notes AI Context',
    '',
    `生成时间：${new Date().toISOString()}`,
    `项目：\`${path.basename(options.projectRoot)}\``,
    '',
    '## 总览',
    '',
    `- 备注文件：${files.length}`,
    `- 备注总数：${notes.length}`,
    `- 未归档：${open.length}`,
    `- 需优先处理：${risky.length}`,
    `- 有修复记录：${fixed.length}`,
    `- 健康度：${Object.entries(healthSummary).map(([key, value]) => `${key} ${value}`).join('，') || '无'}`,
    '',
    renderList('优先处理', risky),
    renderList('所有未归档备注', open),
    '## 详情',
    '',
    ...(open.length ? open.map(renderDetail) : ['无未归档备注。'])
  ].join('\n');

  await fs.mkdir(notesDir, { recursive: true });
  await fs.writeFile(outputPath, content, 'utf-8');
  console.log(`[app-notes] wrote ${path.relative(options.projectRoot, outputPath)}`);
}

exportAiContext(parseArgs(process.argv)).catch((error) => {
  console.error('[app-notes] export failed', error);
  process.exitCode = 1;
});
