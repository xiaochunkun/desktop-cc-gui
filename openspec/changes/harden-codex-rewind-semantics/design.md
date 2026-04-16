## Context

当前问题不是 UI，而是会话真值层：Codex rewind 目前主要通过前端隐藏实现“看起来回退”，但回退尾部仍可能留在内存或磁盘，后续 reopen / replay / send 有机会再次读到。

本变更只做一件事：把 Codex rewind 语义改为真实截断，并在该语义上对齐 Claude Code。

## Goals / Non-Goals

**Goals**

- rewind 成功后，锚点之后数据在内存与磁盘都被截断。
- 成功语义严格等于“截断已提交”。
- reopen / replay / send 统一读取截断后事实，不复现尾部。

**Non-Goals**

- 不做跨源聚合策略重构。
- 不做 UI 交互和文案调整。
- 不引入软删除或回退恢复能力。

## Design Decisions

### Decision 1: 单真值层在事实数据层（采用）

- 方案 A：继续 UI hidden map 作为主机制。
  - 问题：展示层与事实层双真值，容易漏口。
- 方案 B：rewind 直接截断会话事实数据，UI 只展示事实。
  - 结果：语义可验证，与 Claude 对齐。

取舍：采用方案 B。

### Decision 2: 成功返回必须晚于截断提交（采用）

- 方案 A：先回 UI 成功，再异步落盘。
  - 问题：会产生“成功但未真正截断”的竞态。
- 方案 B：截断提交完成后才返回成功。
  - 结果：用户观察到的成功与真实状态一致。

取舍：采用方案 B。

### Decision 3: reopen / replay / send 必须共享同一截断后基线（采用）

- 方案 A：各链路分别做局部兼容。
  - 问题：容易出现链路间不一致。
- 方案 B：统一以截断后事实源为基线，禁止读取锚点后数据。
  - 结果：生命周期语义一致，可回归验证。

取舍：采用方案 B。

## Risks / Trade-offs

- [Risk] 历史会话锚点识别异常导致截断失败  
  → Mitigation：返回可恢复错误，不允许降级为 UI-only 成功。

- [Risk] 旧链路缓存导致短时显示旧尾部  
  → Mitigation：rewind 成功后强制以截断后数据刷新当前线程状态。

- [Trade-off] 为语义正确性牺牲了“保留尾部用于调试”的便利  
  → Mitigation：通过日志保留操作诊断，不保留可被业务链路读取的尾部事实。

## Implementation Outline

1. 后端 rewind 执行链路引入硬截断提交（内存 + 磁盘）。
2. 将 rewind 成功条件收敛为“截断提交成功”。
3. 前端线程状态刷新逻辑改为只消费截断后事实。
4. reopen / replay / send 链路增加边界校验，拒绝锚点后数据。
5. 增加最小回归：即时回退、重启后 reopen、回退后 send。

## Rollback Plan

- 发现严重问题时可临时禁用 Codex rewind 入口。
- 不回滚到 UI-only 语义，以避免再次出现“视觉成功、事实失败”。
