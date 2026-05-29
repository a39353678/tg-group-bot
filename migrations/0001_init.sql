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

CREATE TABLE IF NOT EXISTS lottery_sessions (
  chat_id INTEGER NOT NULL PRIMARY KEY,
  prize TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  winner_count INTEGER NOT NULL DEFAULT 1,
  end_time INTEGER NOT NULL,
  participants_json TEXT NOT NULL DEFAULT '{}',
  winners_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  drawn_at INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 初始化全局配置和密码占位行
INSERT OR IGNORE INTO global_config (id, config_json) VALUES (1, '{}');
INSERT OR IGNORE INTO admin_password (id, password) VALUES (1, '');
