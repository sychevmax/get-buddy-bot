const Telegraf = require('telegraf');
const dotenv = require('dotenv');
const ua = require('universal-analytics');

dotenv.config();

const separator = "";
const settings = {};
const initialize = () => {
    
    settings.admins = process.env.admins.split(",");    
    settings.takeButtonName = process.env.TAKE_BUTTON_NAME || "Беру";
    settings.gaId = process.env.GA_ID;
    settings.sendMessagePeriod = 300000;
    settings.sendMessagePeriodMinutes = settings.sendMessagePeriod / 60000;
    settings.destinationChat = process.env.DESTINATION_CHAT;
}

initialize();

const messages = {
  welcomeMessage: "Привет! Я бот. Помогаю найти партнера для взаимных проработки на дипломном проекте «Практический психолог» Антона Антонова.\n\nЧтобы найти партнера просто отправь сообщение с пожеланиями по времени.\nНапример, «понедельник с 12:00 до 15:00 МСК».\n\nЯ перешлю твое сообщение в чат диплома и найду для тебя партнера. Он свяжется с тобой в личных сообщениях.",
  errorMessage: "Что-то пошло не так. Попробуйте еще раз. Если не получится, напишите в поддержку @@aantonovsupportbot, разберемся.",
  setNickNameMessage: "Чтобы использовать этого бота, установите имя пользователя в телеграм и отправьте запрос заново. Инструкция как это сделать: https://youtu.be/muxNQ4HmTyE",
  notChatMemberMessage: "Вы должны состоять в чате диплома, чтобы использовать этот бот. Ссылка на чат в нулевом модуле с организационной информацией на платформе геткурс https://study.antonantonov.com/",
  respondMessage: "Ваша заявка отправлена в чат диплома. Партнер свяжется с вами в личных сообщениях.",
  tooFastMessage: `Можно отправлять не больше 1 запроса в ${settings.sendMessagePeriodMinutes} минут. Повторите попытку чуть позже`,
};

const bot = new Telegraf(process.env.botToken);

const messagesMap = {};
const requestsTimestamps = {};

const createUaVisitor = (userId) => {
    const visitor = ua(settings.gaId, `${userId}`, { strictCidFormat: false, uid: `${userId}` });
    visitor.set('uid', `${userId}`);
    return visitor;
};

const hasAccess = (userId) => {
    return settings.admins.indexOf(userId) >= 0;
}

const isChatMember = async (ctx) => {
  const info = await ctx.telegram.getChatMember(settings.destinationChat, ctx.message.from.id);
  return Promise.resolve(info.status != "left" && info.status != "kicked");
}

const canSendNextMessage = (username) => {
  const lastMessageTime = requestsTimestamps[username];
  return !lastMessageTime || Date.now()-lastMessageTime >= settings.sendMessagePeriod;
}

const setLastMessageTime = (username) => {
  requestsTimestamps[username] = Date.now();
}

const isMessageFromDestinationChat = (chat) => {
    return chat && chat.id == settings.destinationChat;
}

const testMenu = Telegraf.Extra
    .markdown()
    .markup((m) => m.inlineKeyboard([
        m.callbackButton(settings.takeButtonName, 'take', false)
    ]))

bot.start(async (ctx) => {
  ctx.reply(messages.welcomeMessage);
});

bot.catch(async (err, ctx) => {
    console.log(`Ooops, encountered an error for ${ctx.updateType}`, err)
})

bot.command('settings', async (ctx) => {
    if (isMessageFromDestinationChat(ctx.chat)) {
        return;
    }
    if (!hasAccess(ctx.message.from.username)) {
        return;
    }

    ctx.reply(JSON.stringify(settings));
})

bot.on("message", async (ctx) => {
    if (isMessageFromDestinationChat(ctx.chat)) {
        return;
    }

    if (!settings.destinationChat) {
        ctx.reply(messages.errorMessage)
    }
    const username = ctx.message.from.username;
    if (!username) {
      ctx.reply(messages.setNickNameMessage);
      return;
    }
    const isInChat = await isChatMember(ctx);
    
    if(!isInChat){
      ctx.reply(messages.notChatMemberMessage);
      return;
    }

    if(!canSendNextMessage(username)){
      ctx.reply(messages.tooFastMessage);
      return;
    }

    const user = (`${ctx.message.from.first_name || ""} ${ctx.message.from.last_name || ""} @${ctx.message.from.username}`).replace("_", "\\_");

    ctx.telegram.sendMessage(settings.destinationChat, `Запрос на взаимную проработку от ${user}\n\n${ctx.message.text}`, testMenu);
    ctx.reply(messages.respondMessage);
    setLastMessageTime(ctx.message.from.username);
});

bot.action('take', async (ctx) => {
    const messageId = ctx.callbackQuery.message.message_id;
    const userId = ctx.callbackQuery.from.id;
    const username = ctx.callbackQuery.from.username ? '@' + ctx.callbackQuery.from.username : "";
    const user = `${ctx.callbackQuery.from.first_name || ""} ${ctx.callbackQuery.from.last_name || ""} ${username}`;

    if (messagesMap.hasOwnProperty(messageId)) {
        //createUaVisitor(userId).pageview('/take_fail').event('Bot actions', 'Take Fail', user).send();
        return;
    }

    //createUaVisitor(userId).pageview('/take_success').event('Bot actions', 'Take Success', user).send();
    messagesMap[messageId] = user;

    ctx.editMessageText(`${ctx.callbackQuery.message.text || ctx.callbackQuery.message.caption}\n\nВзял: ${user}\n${separator}`);
});

bot.launch();