-- D1 数据库初始化脚本
-- TG群管理机器人 配置存储

CREATE TABLE IF NOT EXISTS global_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS group_config (
  chat_id INTEGER PRIMARY KEY,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS groups (
  chat_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS admin_password (
  id INTEGER PRIMARY KEY DEFAULT 1,
  password TEXT NOT NULL DEFAULT ''
);

-- 初始化全局配置和密码占位行
INSERT OR IGNORE INTO global_config (id, config_json) VALUES (1, '{}');
INSERT OR IGNORE INTO admin_password (id, password) VALUES (1, '');
