# Scripts Index

- `gates/`：required verification，只放可低噪声 hard fail 的脚本。
- `audit/`：报告型脚本，不进 required gate。
- `smoke/`：真实环境 / 高保真链路验证，不进 required gate。
- `test-support/`：脚本测试和 smoke 的支撑程序，不直接作为门禁入口。
- `lib/`：脚本共享小工具。

相关文档：`docs/internal/verification-standards.md`、`docs/development/local-development.md`。
