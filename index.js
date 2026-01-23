require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

// =======================
// 🔧 إعدادات السيرفر
// =======================
const STAFF_ROLE_ID = "1448055249762910299";            // رتبة الإدارة/الدعم (صلاحية التحكم)
const TICKETS_CATEGORY_ID = "1455273132146294970";      // كاتقوري التكتات المفتوحة
const LOG_CATEGORY_ID = "1455700238840102984";          // كاتقوري التكتات المقفولة/اللوق
const TICKET_LOG_CHANNEL_ID = "1455703131500314788";    // روم التنبيه عند فتح التكت

// ✅ رول تنبيه واحد فقط (للدعم + الفعاليات)
const PING_ROLE_ID = "1455718248493482007";

const PREFIX = "!";
const DEFAULT_PANEL_IMAGE =
  "https://media.discordapp.net/attachments/959615303170555964/1455276224459837674/ffgrfg.gif";

// =======================
// ✅ إعدادات قابلة للتغيير من الشات (config.json)
// =======================
const CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULT_CONFIG = {
  panelImageUrl: DEFAULT_PANEL_IMAGE,
  panelText: [
    "## 🎟️ نظام التذاكر",
    "",
    "👇 **اختر نوع التذكرة من القائمة**",
    "",
    "🛠️ **فتح تذكرة الدعم** — للمساعدة والاستفسارات",
    "🎉 **تذكرة مشاركة لفعالية** — تسجيل/مشاركة بالفعالية",
  ].join("\n"),
};

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

let config = loadConfig();

// =======================
// نوعين تكت فقط
// =======================
const TICKET_TYPES = {
  support: {
    label: "فتح تذكرة الدعم",
    emoji: "🛠️",
    prefix: "support",
    title: "🛠️ تذكرة دعم",
    desc: "اكتب مشكلتك أو استفسارك بالتفصيل وسيتم مساعدتك.",
  },
  event: {
    label: "تذكرة مشاركة لفعالية",
    emoji: "🎉",
    prefix: "event",
    title: "🎉 تذكرة فعالية",
    desc: "اكتب معلومات المشاركة/التسجيل الخاصة بالفعالية وسيتم الرد عليك.",
  },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once("ready", () => console.log(`✅ Bot logged in as ${client.user.tag}`));

// =======================
// Helpers
// =======================
function sanitizeUsername(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

async function isStaff(member) {
  return (
    member.roles.cache.has(STAFF_ROLE_ID) ||
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageChannels)
  );
}

function parseTopic(channel) {
  const topic = channel?.topic || "";
  const ownerMatch = topic.match(/owner=(\d+)/);
  const typeMatch = topic.match(/type=([a-z]+)/);
  const statusMatch = topic.match(/status=(open|closed)/);

  return {
    ownerId: ownerMatch ? ownerMatch[1] : null,
    type: typeMatch ? typeMatch[1] : null,
    status: statusMatch ? statusMatch[1] : "open",
  };
}

async function setTopicStatus(channel, status) {
  const { ownerId, type } = parseTopic(channel);
  if (!ownerId || !type) return;
  const newTopic = `owner=${ownerId};type=${type};status=${status}`;
  await channel.setTopic(newTopic).catch(() => {});
}

// =======================
// تنبيه فتح التكت (في روم التنبيه)
// =======================
async function sendOpenLog({ guild, user, channel, type }) {
  try {
    const logCh = await guild.channels.fetch(TICKET_LOG_CHANNEL_ID).catch(() => null);
    if (!logCh) return;

    const t = TICKET_TYPES[type] || { label: "تذكرة", emoji: "🎫" };

    const embed = new EmbedBuilder()
      .setTitle("📩 تم فتح تذكرة جديدة")
      .setDescription(`**النوع:** ${t.emoji} ${t.label}\n**العضو:** ${user}\n**الروم:** ${channel}`)
      .setColor(0x9b59ff);

    // ✅ منشن رول واحد فقط
    const ping = PING_ROLE_ID ? `<@&${PING_ROLE_ID}>` : "";

    await logCh.send({ content: ping, embeds: [embed] });
  } catch {}
}

// =======================
// Buttons
// =======================
function openControlsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("notify_owner").setLabel("🔔 تنبيه").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 إغلاق").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("delete_ticket").setLabel("🗑️ حذف").setStyle(ButtonStyle.Danger)
  );
}

function closedControlsRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("restore_ticket").setLabel("♻️ استرجاع").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("delete_ticket").setLabel("🗑️ حذف").setStyle(ButtonStyle.Danger)
  );
}

// =======================
// إنشاء تكت (يسمح بأكثر من تكت لنفس الشخص ✅)
// =======================
async function createTicket(guild, user, type) {
  const t = TICKET_TYPES[type];
  const safeUser = sanitizeUsername(user.username) || user.id;

  const unique = Date.now().toString().slice(-6);
  const name = `ticket-${t.prefix}-${safeUser}-${unique}`.slice(0, 100);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID,
    topic: `owner=${user.id};type=${type};status=open`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages,
        ],
      },
    ],
  });

  const embed = new EmbedBuilder()
    .setTitle(t.title)
    .setDescription(`أهلًا ${user} ✨\n${t.desc}`)
    .setColor(0x9b59ff);

  await channel.send({
    content: `${user}`, // بدون منشن الإدارة
    embeds: [embed],
    components: [openControlsRow()],
  });

  await sendOpenLog({ guild, user, channel, type });
  return { channel };
}

// =======================
// إرسال لوحة التكت
// =======================
async function sendPanel(channel) {
  const imageEmbed = new EmbedBuilder().setColor(0x9b59ff).setImage(config.panelImageUrl);
  const textEmbed = new EmbedBuilder().setColor(0x9b59ff).setDescription(config.panelText);

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("اختر نوع التذكرة...")
    .addOptions(
      { label: "فتح تذكرة الدعم", value: "support", emoji: "🛠️" },
      { label: "تذكرة مشاركة لفعالية", value: "event", emoji: "🎉" }
    );

  const row = new ActionRowBuilder().addComponents(select);

  await channel.send({ embeds: [imageEmbed] });
  await channel.send({ embeds: [textEmbed], components: [row] });
}

// =======================
// أوامر الشات
// =======================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const cmd = message.content.slice(PREFIX.length).trim().split(" ")[0].toLowerCase();

  // !panel (للإدارة فقط) + حذف رسالة العضو/الرد بعد 7 ثواني إن كان عضو
  if (cmd === "panel") {
    const member = await message.guild.members.fetch(message.author.id);

    if (!(await isStaff(member))) {
      const reply = await message.reply("❌ هذا الأمر مخصص للإدارة فقط.");
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 7000);
      return;
    }

    await sendPanel(message.channel);
    message.delete().catch(() => {});
    return;
  }

  // !setimg رابط (للإدارة فقط)
  if (cmd === "setimg") {
    const member = await message.guild.members.fetch(message.author.id);
    if (!(await isStaff(member))) return;

    const url = message.content.split(" ").slice(1).join(" ").trim();
    if (!url || !url.startsWith("http")) {
      const r = await message.reply("اكتب الرابط بعد الأمر: `!setimg رابط`");
      setTimeout(() => {
        r.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 7000);
      return;
    }

    config.panelImageUrl = url;
    saveConfig(config);

    const r = await message.reply("✅ تم تغيير صورة اللوحة.");
    setTimeout(() => {
      r.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 7000);
    return;
  }

  // !settext (للإدارة فقط) — اكتب النص برسالة ثم رد عليها بـ !settext
  if (cmd === "settext") {
    const member = await message.guild.members.fetch(message.author.id);
    if (!(await isStaff(member))) return;

    if (!message.reference?.messageId) {
      const r = await message.reply("❌ اكتب النص برسالة، ثم رد على نفس الرسالة بـ `!settext`");
      setTimeout(() => {
        r.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 7000);
      return;
    }

    const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (!replied || !replied.content?.trim()) {
      const r = await message.reply("❌ ما لقيت نص في الرسالة اللي رديت عليها.");
      setTimeout(() => {
        r.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 7000);
      return;
    }

    config.panelText = replied.content.trim();
    saveConfig(config);

    const r = await message.reply("✅ تم تحديث نص اللوحة.");
    setTimeout(() => {
      r.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 7000);
    return;
  }
});

// =======================
// Interactions (Dropdown + Buttons)
// =======================
client.on("interactionCreate", async (interaction) => {
  // Dropdown فتح تكت
  if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
    const type = interaction.values[0];
    if (!TICKET_TYPES[type]) return interaction.reply({ content: "اختيار غير صحيح.", ephemeral: true });

    try {
      const result = await createTicket(interaction.guild, interaction.user, type);
      if (!result.channel) return interaction.reply({ content: "صار خطأ في فتح التكت.", ephemeral: true });
      return interaction.reply({ content: "✅ تم فتح التذكرة.", ephemeral: true });
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: "❌ فشل إنشاء التكت (تحقق من الكاتقوري/الصلاحيات).", ephemeral: true });
    }
  }

  // الأزرار داخل التكت
  if (!interaction.isButton()) return;

  const channel = interaction.channel;
  const guild = interaction.guild;

  if (!channel || channel.type !== ChannelType.GuildText || !channel.name.startsWith("ticket-")) {
    return interaction.reply({ content: "هذا الزر يعمل داخل التكت فقط.", ephemeral: true });
  }

  const member = await guild.members.fetch(interaction.user.id);
  const staff = await isStaff(member);

  const adminOnlyButtons = ["notify_owner", "close_ticket", "restore_ticket", "delete_ticket"];
  if (adminOnlyButtons.includes(interaction.customId) && !staff) {
    return interaction.reply({ content: "❌ هذا الزر للإدارة/الدعم فقط.", ephemeral: true });
  }

  const { ownerId, type } = parseTopic(channel);

  // زر تنبيه: DM لصاحب التكت
  if (interaction.customId === "notify_owner") {
    if (!ownerId) return interaction.reply({ content: "❌ ما قدرت أحدد صاحب التكت.", ephemeral: true });

    const ownerUser = await client.users.fetch(ownerId).catch(() => null);
    if (!ownerUser) return interaction.reply({ content: "❌ ما قدرت أوصل لصاحب التكت.", ephemeral: true });

    const t = TICKET_TYPES[type] || { label: "تذكرة", emoji: "🎫" };

    const dmText =
      `📩 **تنبيه من الإدارة**\n` +
      `تم الرد على تذكرتك: ${t.emoji} **${t.label}**\n` +
      `ادخل هنا لمتابعة التكت: ${channel.url}`;

    await ownerUser.send({ content: dmText }).catch(() => {});
    return interaction.reply({ content: "✅ تم إرسال تنبيه خاص لصاحب التكت.", ephemeral: true });
  }

  // إغلاق: ينقل للوق + يمنع العضو من الكتابة
  if (interaction.customId === "close_ticket") {
    if (!ownerId) return interaction.reply({ content: "❌ ما قدرت أحدد صاحب التكت.", ephemeral: true });

    await channel.permissionOverwrites
      .edit(ownerId, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
      })
      .catch(() => {});

    await channel.setParent(LOG_CATEGORY_ID).catch(() => {});
    await setTopicStatus(channel, "closed");

    const lastMsg = await channel.messages
      .fetch({ limit: 10 })
      .then((col) => col.find((m) => m.author.id === client.user.id))
      .catch(() => null);

    if (lastMsg) {
      await lastMsg.edit({ components: [closedControlsRow()] }).catch(() => {});
    } else {
      await channel
        .send({ content: "🔒 تم إغلاق التذكرة. (الإدارة تستطيع الاسترجاع)", components: [closedControlsRow()] })
        .catch(() => {});
    }

    return interaction.reply({ content: "🔒 تم إغلاق التذكرة ونقلها للوق.", ephemeral: true });
  }

  // استرجاع: يرجع للكـاتقوري المفتوح + يرجع للعضو الكتابة
  if (interaction.customId === "restore_ticket") {
    if (!ownerId) return interaction.reply({ content: "❌ ما قدرت أحدد صاحب التكت.", ephemeral: true });

    await channel.setParent(TICKETS_CATEGORY_ID).catch(() => {});
    await channel.permissionOverwrites
      .edit(ownerId, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
      })
      .catch(() => {});
    await setTopicStatus(channel, "open");

    const lastMsg = await channel.messages
      .fetch({ limit: 10 })
      .then((col) => col.find((m) => m.author.id === client.user.id))
      .catch(() => null);

    if (lastMsg) {
      await lastMsg.edit({ components: [openControlsRow()] }).catch(() => {});
    } else {
      await channel.send({ content: "♻️ تم استرجاع التذكرة.", components: [openControlsRow()] }).catch(() => {});
    }

    return interaction.reply({ content: "♻️ تم استرجاع التذكرة.", ephemeral: true });
  }

  // حذف: حذف نهائي
  if (interaction.customId === "delete_ticket") {
    await interaction.reply({ content: "🗑️ جاري حذف التذكرة...", ephemeral: true });
    setTimeout(() => channel.delete().catch(() => {}), 1500);
    return;
  }
});

client.login(process.env.TOKEN);
