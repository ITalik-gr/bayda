require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Отримання токену та ID з .env
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// Зберігання стану користувачів
const userStates = {};

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  userStates[chatId] = { stage: 'start' };

  bot.sendMessage(
    chatId,
    'Привіт! Щоб опублікувати пост:\n1. Надішліть фото, відео, GIF або текст.\n2. Вкажіть, чи потрібен опис.\n3. Напишіть свій нікнейм.\nПісля цього ми надішлемо ваш пост адміну.'
  );
});

// Обробка повідомлень
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (!userStates[chatId] || msg.text === '/start') return;

  const userState = userStates[chatId];

  // Етап: отримання медіа
  if (userState.stage === 'start') {
    if (msg.photo || msg.video || msg.text || msg.animation) {
      userState.stage = 'ask_caption_needed';
      userState.submission = {
        type: msg.photo
          ? 'photo'
          : msg.video
          ? 'video'
          : msg.animation
          ? 'animation'
          : 'text',
        fileId: msg.photo
          ? msg.photo[msg.photo.length - 1].file_id
          : msg.video
          ? msg.video.file_id
          : msg.animation
          ? msg.animation.file_id
          : null,
        content: msg.text || null,
      };

      bot.sendMessage(chatId, 'Чи потрібен опис до вашого поста?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Так', callback_data: `caption_yes_${chatId}` }],
            [{ text: 'Ні', callback_data: `caption_no_${chatId}` }],
          ],
        },
      });
    } else {
      bot.sendMessage(chatId, 'Будь ласка, надішліть фото, відео, GIF або текст.');
    }
  }
  // Етап: отримання опису
  else if (userState.stage === 'waiting_for_caption') {
    userState.submission.caption = msg.text;
    userState.stage = 'waiting_for_username';
    bot.sendMessage(chatId, 'Добре, а тепер як вас підписати?');
  }
  // Етап: отримання нікнейму
  else if (userState.stage === 'waiting_for_username') {
    const username = msg.text.startsWith('@') ? msg.text : `@${msg.text}`;
    userState.submission.username = username;

    const submission = userState.submission;
    const caption = submission.caption
      ? `${submission.caption}\n\nby ${username}`
      : `by ${username}`;

    // Надсилання адміну
    if (submission.type === 'photo') {
      bot.sendPhoto(ADMIN_CHAT_ID, submission.fileId, {
        caption: `Пост від ${username}:\n${submission.caption || 'Без опису'}\n\nПрийняти чи відхилити?`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Прийняти', callback_data: `accept_${chatId}` },
              { text: 'Відхилити', callback_data: `reject_${chatId}` },
            ],
          ],
        },
      });
    } else if (submission.type === 'video') {
      bot.sendVideo(ADMIN_CHAT_ID, submission.fileId, {
        caption: `Пост від ${username}:\n${submission.caption || 'Без опису'}\n\nПрийняти чи відхилити?`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Прийняти', callback_data: `accept_${chatId}` },
              { text: 'Відхилити', callback_data: `reject_${chatId}` },
            ],
          ],
        },
      });
    } else if (submission.type === 'animation') {
      bot.sendAnimation(ADMIN_CHAT_ID, submission.fileId, {
        caption: `GIF від ${username}:\n${submission.caption || 'Без опису'}\n\nПрийняти чи відхилити?`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Прийняти', callback_data: `accept_${chatId}` },
              { text: 'Відхилити', callback_data: `reject_${chatId}` },
            ],
          ],
        },
      });
    } else {
      bot.sendMessage(
        ADMIN_CHAT_ID,
        `Текстовий пост від ${username}: ${submission.content}.\n\nПрийняти чи відхилити?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Прийняти', callback_data: `accept_${chatId}` },
                { text: 'Відхилити', callback_data: `reject_${chatId}` },
              ],
            ],
          },
        }
      );
    }

    // Дякуємо користувачу
    bot.sendMessage(chatId, 'Дякуємо! Ваш пост обробляється.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Надіслати ще', callback_data: `new_post_${chatId}` }]],
      },
    });

    userState.stage = 'done';
  }
});

// Обробка кнопок
bot.on('callback_query', (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;

  if (data.startsWith('caption_yes')) {
    userStates[chatId].stage = 'waiting_for_caption';
    bot.sendMessage(chatId, 'Напишіть ваш опис.');
  } else if (data.startsWith('caption_no')) {
    userStates[chatId].stage = 'waiting_for_username';
    userStates[chatId].submission.caption = null;
    bot.sendMessage(chatId, 'Добре, тепер напишіть свій нікнейм (можна без @).');
  } else if (data.startsWith('accept')) {
    const userId = data.split('_')[1];
    const submission = userStates[userId]?.submission;
    if (!submission) return;

    const caption = submission.caption
      ? `${submission.caption}\n\nby ${submission.username}`
      : `by ${submission.username}`;

    if (submission.type === 'photo') {
      bot.sendPhoto(CHANNEL_ID, submission.fileId, { caption });
    } else if (submission.type === 'video') {
      bot.sendVideo(CHANNEL_ID, submission.fileId, { caption });
    } else if (submission.type === 'animation') {
      bot.sendAnimation(CHANNEL_ID, submission.fileId, { caption });
    } else {
      bot.sendMessage(CHANNEL_ID, `${submission.content}\nby ${submission.username}`);
    }

    bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    );

    bot.answerCallbackQuery(query.id, { text: 'Пост опубліковано!' });
    bot.sendMessage(userId, 'Ваш пост було прийнято!');
  } else if (data.startsWith('reject')) {
    const userId = data.split('_')[1];
    bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    );

    bot.answerCallbackQuery(query.id, { text: 'Пост відхилено.' });
    bot.sendMessage(userId, 'Ваш пост було відхилено.');
  } else if (data.startsWith('new_post')) {
    userStates[chatId] = { stage: 'start' };
    bot.sendMessage(chatId, 'Будь ласка, надішліть фото, відео, GIF або текст для нового поста.');
  }
});