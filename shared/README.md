# Viby Shared

`shared/` 是 Viby 的跨模块合同层。

它只放协议、schema、读模型、纯函数和稳定导出，不承载 UI、Hub durable mutation 或 CLI runtime 细节。

## 它负责什么

- session / team / runtime 的共享类型与 schema
- 跨模块恢复、handoff、summary、driver 合同
- 稳定导出给 `web / hub / cli / desktop`

## 不负责什么

- 不维护第二套业务 owner
- 不写 Web 交互逻辑
- 不写 Hub durable mutation
- 不写 CLI provider runtime 细节

## 继续阅读

- 仓库入口：`README.md`
- 系统架构：`../docs/architecture/system-overview.md`
- shared 边界：`../docs/development/shared-contracts.md`
