/**
 * 抽奖功能模块
 * 管理抽奖会话、创建抽奖、开奖逻辑
 */

import {
  sendWithKeyboard, deleteMessage, editMessageText, editMessageReplyMarkup,
  answerCallbackQuery, sendMessage,
} from './telegram';

// 抽奖会话存储（内存 Map，短期数据无需持久化）
const lotterySessions = new Map();

/**
 * 获取所有活跃抽奖
 */
export function getActiveLotteries() {
  const result = [];
  for (const [key, lottery] of lotterySessions) {
    if (!lottery.timerFired) {
      result.push({
        key,
        chatId: lottery.chatId,
        prize: lottery.prize,
        participants: lottery.participants.size,
        winnerCount: lottery.winnerCount,
        endTime: lottery.endTime,
        remaining: Math.max(0, Math.round((lottery.endTime - Date.now()) / 1000)),
      });
    }
  }
  return result;
}

/**
 * 创建新抽奖
 * @returns {{ ok: boolean, message?: string }}
 */
export async function createLottery(token, chatId, userId, prize, durationMin, winnerCount, msgFrom, ctx) {
  const key = `lottery:${chatId}`;

  if (lotterySessions.has(key)) {
    return { ok: false, message: '当前已有进行中的抽奖，请等待结束后再创建。' };
  }

  if (durationMin > 1440) durationMin = 1440;
  if (winnerCount > 50) winnerCount = 50;

  const endTime = Date.now() + durationMin * 60 * 1000;

  const result = await sendWithKeyboard(token, chatId,
    `🎰 <b>抽奖活动</b>\n\n` +
    `🎁 奖品: <b>${prize}</b>\n` +
    `👥 中奖人数: <b>${winnerCount}</b> 人\n` +
    `⏱️ 结束时间: <b>${durationMin} 分钟</b>后\n\n` +
    `👇 点击下方按钮参与抽奖`,
    [[{ text: '🎲 参与抽奖 (0人)', callback_data: 'lottery_join' }]]
  );

  if (!result?.ok) {
    return { ok: false, message: '抽奖创建失败，请检查机器人权限。' };
  }

  const messageId = result.result.message_id;

  lotterySessions.set(key, {
    chatId,
    prize,
    participants: new Map(),
    messageId,
    endTime,
    winnerCount,
    timerFired: false,
    msgFrom,
  });

  // 定时自动开奖
  ctx.waitUntil((async () => {
    await new Promise(resolve => setTimeout(resolve, durationMin * 60 * 1000 + 2000));
    const lottery = lotterySessions.get(key);
    if (lottery && !lottery.timerFired) {
      lottery.timerFired = true;
      await drawWinner(token, chatId, messageId, lottery);
      lotterySessions.delete(key);
    }
  })());

  return { ok: true, message: `抽奖「${prize}」已创建，${durationMin} 分钟后开奖。` };
}

/**
 * 手动开奖
 * @returns {{ ok: boolean, message: string }}
 */
export async function forceDraw(token, chatId) {
  const key = `lottery:${chatId}`;
  const lottery = lotterySessions.get(key);

  if (!lottery || lottery.timerFired) {
    return { ok: false, message: '当前没有进行中的抽奖。' };
  }

  lottery.timerFired = true;
  await drawWinner(token, chatId, lottery.messageId, lottery);
  lotterySessions.delete(key);

  return { ok: true, message: '开奖完成！' };
}

/**
 * 执行开奖逻辑
 */
async function drawWinner(token, chatId, messageId, lottery) {
  const { prize, participants, winnerCount } = lottery;

  if (participants.size === 0) {
    await editMessageText(token, chatId, messageId,
      `🎰 <b>抽奖结束</b>\n\n` +
      `🎁 奖品: <b>${prize}</b>\n\n` +
      `😔 无人参与，抽奖取消`,
      { reply_markup: JSON.stringify({ inline_keyboard: [] }) }
    );
    return;
  }

  const allParticipants = Array.from(participants.values());
  const winners = [];
  const pool = [...allParticipants];

  while (winners.length < winnerCount && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  const winnersText = winners.map((w, i) =>
    `${i + 1}. <a href="tg://user?id=${w.userId}">${w.name}</a>`
  ).join('\n');

  const resultText =
    `🎰 <b>抽奖结果</b>\n\n` +
    `🎁 奖品: <b>${prize}</b>\n` +
    `👥 参与人数: <b>${participants.size}</b> 人\n\n` +
    `🏆 <b>中奖者:</b>\n${winnersText}\n\n` +
    `🎉 恭喜以上中奖者！`;

  await editMessageText(token, chatId, messageId, resultText, {
    reply_markup: JSON.stringify({ inline_keyboard: [] }),
  });
}

/**
 * 处理 inline 按钮点击（抽奖参与）
 */
export async function handleLotteryCallback(token, callbackQuery) {
  const { data, from, message, id: callbackId } = callbackQuery;
  const chatId = message?.chat?.id;
  const userId = from.id;
  const name = from.first_name || '用户';

  if (!chatId || data !== 'lottery_join') return;

  await answerCallbackQuery(token, callbackId);

  const key = `lottery:${chatId}`;
  const lottery = lotterySessions.get(key);

  if (!lottery) {
    await answerCallbackQuery(token, callbackId, '❌ 抽奖已结束');
    return;
  }

  if (lottery.participants.has(userId)) {
    await answerCallbackQuery(token, callbackId, '✅ 你已经参与了，无需重复点击');
    return;
  }

  lottery.participants.set(userId, {
    userId,
    name,
    username: from.username,
  });

  const count = lottery.participants.size;
  try {
    await editMessageReplyMarkup(token, chatId, message.message_id,
      JSON.stringify({
        inline_keyboard: [[{ text: `🎲 参与抽奖 (${count}人)`, callback_data: 'lottery_join' }]]
      })
    );
  } catch (e) { /* Telegram 限流忽略 */ }

  await answerCallbackQuery(token, callbackId, `✅ 参与成功！当前 ${count} 人参与`);
}

/**
 * 清理所有过期抽奖（用于管理员面板重置等场景）
 */
export function clearAllLotteries() {
  lotterySessions.clear();
}
