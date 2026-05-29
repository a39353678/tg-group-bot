/**
 * 抽奖功能模块（D1 数据库存储，Worker 重启不丢失）
 */

import {
  sendWithKeyboard, deleteMessage, editMessageText, editMessageReplyMarkup,
  answerCallbackQuery,
} from './telegram';

/**
 * 获取指定群的活跃抽奖
 */
export async function getLottery(db, chatId) {
  const row = await db.prepare("SELECT * FROM lottery_sessions WHERE chat_id = ?").bind(chatId).first();
  if (!row) return null;
  return {
    chatId: row.chat_id,
    prize: row.prize,
    messageId: row.message_id,
    winnerCount: row.winner_count,
    endTime: row.end_time,
    participants: JSON.parse(row.participants_json || '{}'),
    status: row.status || 'active',
    winners: JSON.parse(row.winners_json || '[]'),
    drawnAt: row.drawn_at,
  };
}

/**
 * 获取所有抽奖（管理面板用，含已完成的）
 */
export async function getActiveLotteries(db) {
  const result = await db.prepare("SELECT * FROM lottery_sessions ORDER BY created_at DESC").all();
  return (result.results || []).map(row => ({
    chatId: row.chat_id,
    prize: row.prize,
    participants: Object.keys(JSON.parse(row.participants_json || '{}')).length,
    winnerCount: row.winner_count,
    endTime: row.end_time,
    remaining: Math.max(0, Math.round((row.end_time - Date.now()) / 1000)),
    status: row.status || 'active',
    winners: JSON.parse(row.winners_json || '[]'),
    drawnAt: row.drawn_at,
  }));
}

/**
 * 保存抽奖到 D1
 */
async function saveLottery(db, chatId, prize, messageId, winnerCount, endTime) {
  await db.prepare(
    "INSERT INTO lottery_sessions (chat_id, prize, message_id, winner_count, end_time, participants_json) VALUES (?1, ?2, ?3, ?4, ?5, '{}') ON CONFLICT(chat_id) DO UPDATE SET prize=?2, message_id=?3, winner_count=?4, end_time=?5, participants_json='{}'"
  ).bind(chatId, prize, messageId, winnerCount, endTime).run();
}

/**
 * 更新参与者
 */
async function updateParticipants(db, chatId, participants) {
  await db.prepare("UPDATE lottery_sessions SET participants_json = ? WHERE chat_id = ?")
    .bind(JSON.stringify(participants), chatId).run();
}

/**
 * 删除抽奖记录
 */
async function deleteLottery(db, chatId) {
  await db.prepare("DELETE FROM lottery_sessions WHERE chat_id = ?").bind(chatId).run();
}

/**
 * 创建新抽奖
 */
export async function createLottery(db, token, chatId, userId, prize, durationMin, winnerCount, msgFrom, ctx) {
  const existing = await getLottery(db, chatId);
  if (existing && existing.status === 'active') {
    return { ok: false, message: '当前已有进行中的抽奖，请等待结束后再创建。' };
  }

  // 如果有已完成的旧抽奖，先删除
  if (existing && existing.status === 'completed') {
    await deleteLottery(db, chatId);
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

  // 保存到 D1
  await saveLottery(db, chatId, prize, messageId, winnerCount, endTime);

  // 定时自动开奖
  ctx.waitUntil((async () => {
    await new Promise(resolve => setTimeout(resolve, durationMin * 60 * 1000 + 2000));
    const lottery = await getLottery(db, chatId);
    if (lottery && lottery.status === 'active' && Date.now() >= lottery.endTime) {
      await drawWinner(db, token, chatId, lottery);
    }
  })());

  return { ok: true, message: `抽奖「${prize}」已创建，${durationMin} 分钟后开奖。` };
}

/**
 * 手动开奖
 */
export async function forceDraw(db, token, chatId) {
  const lottery = await getLottery(db, chatId);

  if (!lottery || lottery.status !== 'active') {
    return { ok: false, message: '当前没有进行中的抽奖。' };
  }

  await drawWinner(db, token, chatId, lottery);

  return { ok: true, message: '开奖完成！' };
}

/**
 * 执行开奖逻辑（结果保存到 D1）
 */
async function drawWinner(db, token, chatId, lottery) {
  const { prize, participants, winnerCount, messageId } = lottery;
  const participantList = Object.values(participants);

  if (participantList.length === 0) {
    await db.prepare("UPDATE lottery_sessions SET status = 'completed', winners_json = '[]', drawn_at = ? WHERE chat_id = ?")
      .bind(Math.floor(Date.now() / 1000), chatId).run();
    await editMessageText(token, chatId, messageId,
      `🎰 <b>抽奖结束</b>\n\n` +
      `🎁 奖品: <b>${prize}</b>\n\n` +
      `😔 无人参与，抽奖取消`,
      { reply_markup: JSON.stringify({ inline_keyboard: [] }) }
    );
    return;
  }

  const winners = [];
  const pool = [...participantList];

  while (winners.length < winnerCount && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  // 保存中奖结果到 D1
  await db.prepare("UPDATE lottery_sessions SET status = 'completed', winners_json = ?, drawn_at = ? WHERE chat_id = ?")
    .bind(JSON.stringify(winners), Math.floor(Date.now() / 1000), chatId).run();

  const winnersText = winners.map((w, i) =>
    `${i + 1}. <a href="tg://user?id=${w.userId}">${w.name}</a>`
  ).join('\n');

  const resultText =
    `🎰 <b>抽奖结果</b>\n\n` +
    `🎁 奖品: <b>${prize}</b>\n` +
    `👥 参与人数: <b>${participantList.length}</b> 人\n\n` +
    `🏆 <b>中奖者:</b>\n${winnersText}\n\n` +
    `🎉 恭喜以上中奖者！`;

  await editMessageText(token, chatId, messageId, resultText, {
    reply_markup: JSON.stringify({ inline_keyboard: [] }),
  });
}

/**
 * 删除抽奖结果记录
 */
export async function deleteLotteryResult(db, chatId) {
  await deleteLottery(db, chatId);
}

/**
 * 处理 inline 按钮点击（抽奖参与）
 */
export async function handleLotteryCallback(db, token, callbackQuery) {
  const { data, from, message, id: callbackId } = callbackQuery;
  const chatId = message?.chat?.id;
  const userId = from.id;
  const name = from.first_name || '用户';

  if (!chatId || data !== 'lottery_join') {
    await answerCallbackQuery(token, callbackId, '❓ 未知操作');
    return;
  }

  const lottery = await getLottery(db, chatId);

  if (!lottery) {
    await answerCallbackQuery(token, callbackId, '❌ 抽奖已结束或不存在');
    return;
  }

  // 检查是否已过期
  if (Date.now() >= lottery.endTime) {
    await answerCallbackQuery(token, callbackId, '❌ 抽奖已结束');
    return;
  }

  if (lottery.participants[userId]) {
    await answerCallbackQuery(token, callbackId, '✅ 你已参与，无需重复点击');
    return;
  }

  // 添加参与者并保存到 D1
  lottery.participants[userId] = { userId, name, username: from.username };
  await updateParticipants(db, chatId, lottery.participants);

  const count = Object.keys(lottery.participants).length;

  // 更新按钮显示参与人数
  try {
    await editMessageReplyMarkup(token, chatId, message.message_id,
      JSON.stringify({
        inline_keyboard: [[{ text: `🎲 参与抽奖 (${count}人)`, callback_data: 'lottery_join' }]]
      })
    );
  } catch (e) {
    console.error('[lottery] editMessageReplyMarkup failed:', e.message);
  }

  await answerCallbackQuery(token, callbackId, `✅ 参与成功！当前 ${count} 人参与`);
}
