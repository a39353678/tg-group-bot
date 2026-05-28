# 🤖 TG 群管理机器人

基于 **Cloudflare Workers + D1 + AI** 的 Telegram 群组智能管理机器人。

支持 AI 对话、垃圾消息检测、入群算术验证、安静模式、关键词过滤、群管理命令等功能，全部通过 Web 管理面板配置。

---

## ✨ 功能一览

| 功能 | 说明 |
|------|------|
| 🤖 **AI 对话** | 群成员 @机器人 或使用 `/ai` 命令触发 AI 问答，支持 14 种模型切换 |
| 🧮 **入群算术验证** | 新成员需计算加减法才能解除禁言，防止广告机器人 |
| 🚫 **垃圾消息检测** | AI + 关键词双引擎检测广告/垃圾消息，支持自动删除 |
| 🛡️ **不当内容过滤** | 自定义敏感关键词，触发后自动删除 |
| 🔇 **安静模式** | 定时限制全员发言（`setChatPermissions`），Cron 自动恢复 |
| 🔨 **群管理命令** | `/ban`、`/kick`、`/mute`、`/unmute`，仅管理员可用 |
| 👋 **欢迎消息** | 新成员加入时自动发送自定义欢迎词 |
| 🌐 **管理面板** | Web 图形化配置，支持全局/各群独立配置 |
| 🔄 **自动通知删除** | 封禁/踢出等通知消息支持 X 秒后自动删除 |

---

## 🧱 架构

```
用户 → Telegram Bot API → Cloudflare Workers → D1 数据库
                                   ├── Workers AI（对话/检测）
                                   ├── Cron 定时器（安静模式恢复）
                                   └── Web 管理面板
```

### 技术栈

- **运行时**: Cloudflare Workers (ES Module)
- **数据库**: Cloudflare D1 (SQLite)
- **AI**: Cloudflare Workers AI（Qwen3、GLM、Llama 等 14 种模型）
- **定时任务**: Workers Cron Triggers（每 5 分钟）
- **Bot API**: Telegram Bot API (Webhook)

---

## 📋 前置准备

1. **Cloudflare 账号** — [注册](https://dash.cloudflare.com/sign-up)
2. **Telegram Bot Token** — 在 [@BotFather](https://t.me/BotFather) 创建机器人获取
3. **Node.js + npm** — 本地环境（部署用）
4. **WSL (Windows)** 或 **Linux/macOS** 终端

---

## 🚀 部署步骤

### 1. 克隆项目

```bash
git clone https://github.com/你的用户名/tg-group-bot.git
cd tg-group-bot
```

### 2. 安装依赖

本项目为纯 Workers 项目，不需要 npm install。但本地需要安装 `wrangler`：

```bash
npm install -g wrangler
```

### 3. 配置 wrangler.toml

编辑 `wrangler.toml`，将 `database_id` 改为你创建后的 ID：

```toml
name = "tg-group-bot"
main = "src/index.js"
compatibility_date = "2026-05-28"

[triggers]
crons = ["*/5 * * * *"]

[ai]
binding = "AI"

[[d1_databases]]
binding = "BOT_DB"
database_name = "tg-group-bot-db"
database_id = "你的数据库ID"      # ← 替换为实际 ID

[vars]
BOT_NAME = "TG群管理机器人"
```

### 4. 登录 Cloudflare 并创建 D1 数据库

```bash
# 登录 Cloudflare（会打开浏览器认证）
npx wrangler login

# 创建 D1 数据库
npx wrangler d1 create tg-group-bot-db
```

创建成功后，会输出数据库 ID，将其填入 `wrangler.toml` 的 `database_id`。

### 5. 初始化数据库表结构

```bash
npx wrangler d1 execute tg-group-bot-db --file=migrations/0001_init.sql --remote
```

### 6. 配置 Telegram Bot Token

使用 wrangler 的 secret 功能安全注入 Token（不会出现在代码中）：

```bash
npx wrangler secret put BOT_TOKEN
# 按提示输入你的 Bot Token
```

> 或者通过 Cloudflare Dashboard → Worker → 设置 → 变量 → 添加环境变量。

### 7. 部署 Worker

```bash
npx wrangler deploy
```

部署成功后，会输出类似以下内容：

```
Uploaded tg-group-bot (6.29 sec)
Deployed tg-group-bot triggers (2.80 sec)
  https://tg-group-bot.xxx.workers.dev
  schedule: */5 * * * *
```

### 8. 设置 Webhook

浏览器访问以下地址，将 Telegram 更新推送绑定到 Worker：

```
https://tg-group-bot.xxx.workers.dev/set-webhook
```

返回 `{"ok": true, "result": true, "description": "Webhook was set"}` 即为成功。

### 9. 将机器人设为群管理员

在 Telegram 中：
1. 将机器人加入你的群组
2. 在群设置中将机器人设为 **管理员**
3. 至少给予「删除消息」「封禁用户」「禁言用户」权限

### 10. 访问管理面板

浏览器打开：

```
https://tg-group-bot.xxx.workers.dev/admin
```

首次访问会提示**设置管理员密码**，设置后即可进入配置界面。

---

## ⚙️ 管理面板使用

管理面板包含以下配置模块：

### 🤖 AI 对话
- 开关 AI 自动回复
- 选择 AI 模型（14 种可选）
- 选择垃圾检测模型

### 👋 欢迎消息
- 开关欢迎消息
- 自定义欢迎词内容（支持 `{name}`、`{group}` 变量）

### 🧮 入群算术验证
- 开关验证码
- 设置数字位数（1~4 位）
- 设置超时时间（分钟）

### 🚫 垃圾消息检测
- 开关垃圾检测
- 开关自动删除
- 管理自定义垃圾关键词

### 🛡️ 不当内容过滤
- 开关内容过滤
- 管理自定义敏感关键词

### 🔇 安静模式
- 开关安静模式
- 设置开始/结束时间（北京时间 UTC+8，支持跨天）
- 选择限制方式：禁止所有消息 / 仅禁止媒体

### 🔨 群管理命令
- 开关管理命令
- 通知自动删除秒数（0=不删除）

---

## 🎮 群内命令

| 命令 | 说明 | 权限 |
|------|------|------|
| `/help` | 查看帮助菜单 | 所有人 |
| `/ai <问题>` | 向 AI 提问 | 所有人 |
| `/ask <问题>` | 同上 | 所有人 |
| `@机器人 <问题>` | 同上 | 所有人 |
| `/ping` | 检查机器人状态 | 所有人 |
| `/about` | 关于机器人 | 所有人 |
| `/start` | 开始使用 | 所有人 |
| `/ban` (回复消息) | 封禁用户 | 管理员 |
| `/kick` (回复消息) | 踢出用户 | 管理员 |
| `/mute <分钟>` (回复消息) | 禁言用户 | 管理员 |
| `/unmute` (回复消息) | 解除禁言 | 管理员 |
| `/安静模式` 或 `/quiet` | 开启/关闭安静模式 | 管理员 |

> **提示**: 命令支持 `@机器人 /命令` 格式，例如 `@StoneTSbot /安静模式`

---

## 🗄️ 数据库结构

```sql
-- 全局配置（单行 JSON）
global_config (id, config_json, updated_at)

-- 各群独立配置（只存与全局不同的配置项）
group_config (chat_id, config_json, updated_at)

-- 群组列表
groups (chat_id, title, added_at)

-- 管理员密码
admin_password (id, password)
```

---

## 🔄 安静模式工作原理

```
                    ┌─ 手动命令 ──→ setChatPermissions() 限制全员发言
                    │                 ↓
用户开启安静模式 ───┤             Cron 每5分钟检查到期
                    │                 ↓
                    └─ 定时设置 ──→ 到结束时间 → setChatPermissions() 恢复
                                    ↓
                              双重保险：每次有新消息也检查是否该恢复
```

---

## 🤖 可用 AI 模型

| 模型 Key | 模型全名 | 特点 |
|----------|----------|------|
| `qwen3-30b` | Qwen3 30B (A3B-FP8) | ⭐ 中文最强，默认推荐 |
| `glm-4.7-flash` | GLM 4.7 Flash | 中文，极快 |
| `kimi-k2.6` | Kimi K2.6 | 中文 |
| `deepseek-r1-32b` | DeepSeek R1 Distill 32B | 推理能力强 |
| `qwq-32b` | QwQ 32B | 推理 |
| `qwen2.5-coder-32b` | Qwen2.5 Coder 32B | 代码 |
| `llama-4-scout` | Llama 4 Scout 17B | 通用 |
| `llama-3.3-70b` | Llama 3.3 70B | 能力强 |
| `llama-3.1-8b` | Llama 3.1 8B | 通用 |
| `llama-3.2-3b` | Llama 3.2 3B | 极快 |
| `llama-3.2-1b` | Llama 3.2 1B | 最快 |
| `mistral-small-3.1` | Mistral Small 3.1 24B | 通用 |
| `gemma-4-26b` | Gemma 4 26B | 通用 |
| `gpt-oss-20b` | GPT-OSS 20B | 通用 |

---

## 📂 项目结构

```
tg-group-bot/
├── src/
│   ├── index.js          # 入口：路由、Webhook、Cron 定时器
│   ├── handlers.js       # 消息处理：命令、AI对话、验证码、安静模式等
│   ├── config.js         # D1 数据库配置管理
│   ├── ai.js             # Workers AI 集成：对话、垃圾检测、内容过滤
│   ├── admin.js          # Web 管理面板（内嵌 HTML+JS）
│   ├── captcha.js        # 算术验证码生成与验证
│   └── telegram.js       # Telegram Bot API 封装
├── migrations/
│   └── 0001_init.sql     # D1 数据库初始化脚本
├── wrangler.toml         # Workers 配置
├── package.json
└── README.md
```

---

## ⚠️ 免费额度

| 资源 | 免费额度 | 本机器人消耗估算 |
|------|----------|-----------------|
| Workers 请求 | 10 万次/天 | 取决于群活跃度 |
| Workers CPU 时间 | 10ms/请求 | AI 请求可能超时，建议选小模型 |
| D1 读取 | 5 亿行/月 | 几百~几千行 |
| D1 写入 | 1 亿行/月 | 几十~几百行 |
| Workers AI | 有额度限制 | 详细见 [Cloudflare AI 价格页](https://developers.cloudflare.com/workers-ai/pricing/) |
| Cron 定时器 | 包含在 Workers 内 | 288 次/天（每 5 分钟一次） |

---

## 🔧 本地开发

```bash
# 本地运行（预览）
npx wrangler dev

# 查看日志
npx wrangler tail

# 更新 D1 数据（本地）
npx wrangler d1 execute tg-group-bot-db --file=migrations/0001_init.sql

# 更新 D1 数据（远程）
npx wrangler d1 execute tg-group-bot-db --file=migrations/0001_init.sql --remote

# 重新部署
npx wrangler deploy
```

---

## 📜 License

MIT
