/**
 * TG群管理机器人 - Cloudflare Workers 入口
 * 接收 Telegram Webhook 并分发消息处理
 */

import { handleUpdate } from './handlers';
import { handleAdmin } from './admin';
import { getGroupList, getGroupConfig, saveGroupConfig } from './config.js';
import { setChatPermissions, PERMISSIONS_RESTORE_ALL } from './telegram';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 管理面板（密码保护）
    if (url.pathname.startsWith('/admin')) {
      return handleAdmin(request, env);
    }

    // 设置 Webhook
    if (url.pathname === '/set-webhook' && request.method === 'GET') {
      return await setupWebhook(request, env);
    }

    // Telegram Webhook 回调
    if (url.pathname === '/' && request.method === 'POST') {
      try {
        const update = await request.json();
        ctx.waitUntil(handleUpdate(update, env, ctx));
        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error('处理更新出错:', err);
        return new Response('Error', { status: 500 });
      }
    }

    // 健康检查
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', time: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Cron 定时任务 - 每5分钟检查一次各群安静模式是否到期
   */
  async scheduled(event, env, ctx) {
    const { BOT_TOKEN: token, BOT_DB: db } = env;
    const groups = await getGroupList(db);

    for (const group of groups) {
      ctx.waitUntil(checkAndRestoreQuietMode(token, db, group.id));
    }
  },
};

/**
 * 设置 Telegram Webhook
 * 访问 https://你的worker域名/set-webhook 来设置
 */
async function setupWebhook(request, env) {
  const url = new URL(request.url);
  const webhookUrl = url.searchParams.get('url') || `${url.protocol}//${url.hostname}`;

  const webhookUrlFull = webhookUrl.endsWith('/') ? webhookUrl : webhookUrl + '/';

  // 先删除旧 webhook，确保 allowed_updates 更新生效
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: false }),
  });

  // 重新设置 webhook
  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrlFull,
      allowed_updates: ['message', 'chat_member', 'my_chat_member', 'callback_query'],
    }),
  });

  const result = await response.json();

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 检查并恢复已到期的安静模式
 * 每5分钟由 Cron 触发执行
 */
async function checkAndRestoreQuietMode(token, db, chatId) {
  try {
    const config = await getGroupConfig(db, chatId);
    if (!config.quiet_hours_enabled) return;

    // 北京时间 (UTC+8)
    const now = new Date();
    const beijingNow = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
    const endParts = (config.quiet_hours_end || "08:00").split(":").map(Number);
    const endMin = endParts[0] * 60 + (endParts[1] || 0);
    const startParts = (config.quiet_hours_start || "22:00").split(":").map(Number);
    const startMin = startParts[0] * 60 + (startParts[1] || 0);

    // 判断当前是否不在安静时段内（已过期）
    let isPastEnd;
    if (startMin <= endMin) {
      isPastEnd = beijingNow >= endMin;
    } else {
      // 跨天: 22:00~08:00
      isPastEnd = beijingNow >= endMin && beijingNow < startMin;
    }

    if (isPastEnd) {
      await setChatPermissions(token, chatId, PERMISSIONS_RESTORE_ALL);
      await saveGroupConfig(db, chatId, { quiet_hours_enabled: false });
      console.log(`[Cron] 安静模式到期恢复：群 ${chatId}`);
    }
  } catch (e) {
    console.error(`检查群 ${chatId} 安静模式失败:`, e);
  }
}
