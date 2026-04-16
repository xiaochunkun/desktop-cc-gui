## Why

当前代码里，Codex rewind 的主语义仍是“前端裁剪”而不是“事实截断”：

- 前端在 rewind 后会保存并复用 `codexRewindHiddenItemIds`，靠隐藏 `item id` 裁掉尾部展示。
- history loader / resume 路径会继续加载真实历史，再套一层 hidden 过滤。
- Codex 后端 `fork_thread` 仅透传 `thread/fork`，没有在本地会话文件做物理截断提交。

这与 Claude 当前回溯路径不一致：Claude 是“按目标 message 前截断写新 session 文件 + 删除旧 session 文件”的真实剪切语义。  
本提案目标是把 Codex 对齐到这一语义。

## 目标与边界

### 目标

- Codex rewind 成功后，目标锚点之后的会话事实在**运行时会话**与**磁盘会话文件**都不可再读取。
- rewind 成功语义收敛为：`success == hard truncation committed`。
- 回退后 reopen / replay / send 统一基于截断后事实，不再依赖 UI 隐藏层保证正确性。
- 在“回退是否真实生效”这一点上与 Claude 保持一致。

### 边界

- 仅改 Codex rewind 执行语义，不扩展其它线程生命周期功能。
- 不改 rewind UI 入口与视觉交互。
- 不引入“软删除可恢复”或历史归档新能力。

## 非目标

- 不处理 rewind 之外的线程排序、筛选、搜索。
- 不新增产品层功能，仅修正回退语义。
- 不改动 Claude 的既有回溯实现，仅让 Codex 对齐。

## What Changes

### 1) 新增 Codex 硬回溯提交链路（后端）

- 在现有 `thread/fork(messageId)` 之上增加 Codex rewind 专用提交路径（命令名待实现阶段确定）。
- 提交路径必须在返回成功前完成以下动作：
  - 目标会话 fork 成功并拿到新 thread/session 标识。
  - 新会话在磁盘侧完成锚点后数据截断提交。
  - 旧会话完成 archive/delete 清理，避免旧尾部继续作为可读事实源。
- 锚点规则：`messageId` 主键优先；无法稳定匹配时按确定性 user-turn index 降级；两者都失败则返回可恢复错误。

### 2) 前端从“hidden-map 正确性”迁移到“后端提交正确性”

- rewind 调用改为消费后端硬回溯提交结果，不再以 `codexRewindHiddenItemIds` 作为正确性机制。
- `hidden ids` 相关读写与过滤逻辑退场（可短暂保留兼容读，但不再参与正确性判定）。
- 前端仍可保留最小 UI 过渡行为，但成功态必须绑定后端硬截断提交成功。

### 3) 生命周期链路统一读取截断后真值

- resume/reopen/replay/send 均不得恢复锚点后数据。
- 历史 fallback 不得绕过截断边界重新并回尾部事实。

## 技术方案

### 方案 A：继续 UI hidden 裁剪

- 优点：改动小。
- 缺点：事实层未截断；重启、fallback、后续发送容易复现尾部。

### 方案 B：事实层硬截断（采用）

- 做法：把成功判定下沉到后端硬提交；前端只渲染提交后事实。
- 优点：语义可验证、重启可验证、可与 Claude 对齐。
- 成本：需要补齐后端截断逻辑与回归测试矩阵。

取舍：采用方案 B。该问题属于会话真值问题，必须在数据层解决。

## Capabilities

### New Capabilities

- `codex-rewind-hard-truncation`：Codex rewind 的真实截断语义（内存+磁盘）与回退后一致性约束。

## Impact

- Frontend
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/utils/threadStorage.ts`
  - `src/services/tauri.ts`
- Backend
  - `src-tauri/src/codex/mod.rs`
  - `src-tauri/src/shared/codex_core.rs`
  - `src-tauri/src/local_usage.rs`（及相关 Codex 会话文件处理模块）
- Tests
  - Codex rewind 后立即 resume：无锚点后数据
  - Codex rewind 后重启 reopen：无锚点后数据
  - Codex rewind 后首次 send：不携带尾部上下文
  - Claude/Codex 语义对照回归：真实回退一致

## 验收标准

- 对任意 Codex 会话执行 rewind 成功后，目标锚点之后事实在运行时与磁盘会话文件均不可读取。
- rewind 返回 success 之前，硬截断提交必须已完成；不得出现“UI 成功但事实未截断”。
- 应用重启后 reopen 同一会话，不得出现被回退尾部。
- 回退后首次 send 必须只基于截断后上下文。
- Claude 既有行为保持不变；Codex 在“回退是否真实生效”语义上与 Claude 一致。
