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
// 🔧 عدّل هنا فقط (سيرفرك الجديد)
// =======================

// رتبة الإدارة/الدعم (نفسها عندك)
const SUPPORT_ROLE_ID = "1448055249762910299";

// كاتقوري التكتات المفتوحة
const TICKETS_CATEGORY_ID = "1455273132146294970";

// كاتقوري اللوق/المقفولة
const LOG_CATEGORY_ID = "1455700238840102984";

// روم التنبيه عند فتح التكت
const TICKET_LOG_CHANNEL_ID = "1455703131500314788";

// رتب التنبيه حسب نوع التكت (نوعين فقط)
const TYPE_PING_ROLE = {
  support: "1455718248493482007",        // تنبيه تكت الدعم
  event: "1455718248493482007",          // تنبيه تكت الفعالية
};

// الأوامر النصية
const PREFIX = "!";

// صورة لوحة التكت (تقدر تغيرها من الشات بـ !setimg)
const DEFAULT_PANEL_IMAGE =
  "https://cdn.discordapp.com/attachments/959615303170555964/1455276224459837674/ffgrfg.gif";

// =======================
// ✅ إعدادات قابلة للتغيير من الشات (config.json)
// =======================
const CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULT_CONFIG = {
  panelImageUrl: DEFAULT_PANEL_IMAGE,
  panelText: [
    "## 👇 اختر نوع التذكرة",
    "",
    "🛠️ **Support Ticket** — للمساعدة والاستفسارات",
    "🎉 **Event Ticket** — تسجيل/مشاركة بالفعالية",
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
    label: "Support Ticket",
    emoji: "🛠️",
    prefix: "support",
    title: "🛠️ تذكرة دعم",
    desc: "اكتب مشكلتك أو استفسارك بالتفصيل وسيتم مساعدتك.",
  },
  event: {
    label: "Event Ticket",
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
    member.roles.cache.has(SUPPORT_ROLE_ID) ||
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageChannels)
  );
}

// =======================
// تنبيه فتح التكت
// =======================
async function sendOpenLog({ guild, user, channel, type }) {
  try {
    const logCh = await guild.channels.fetch(TICKET_LOG_CHANNEL_ID).catch(() => null);
    if (!logCh) return;

    const pingRole = TYPE_PING_ROLE[type] ? `<@&${TYPE_PING_ROLE[type]}>` : "";
    const t = TICKET_TYPES[type];

    const embed = new EmbedBuilder()
      .setTitle("📩 New Ticket Created")
      .setDescription(`**النوع:** ${t.emoji} ${t.label}\n**العضو:** ${user}\n**الروم:** ${channel}`)
      .setColor(0x9b59ff);

    await logCh.send({ content: pingRole, embeds: [embed] });
  } catch {}
}

// =======================
// إنشاء تكت
// =======================
async function createTicket(guild, user, type) {
  const t = TICKET_TYPES[type];
  const safeUser = sanitizeUsername(user.username) || user.id;

  // يمنع تكت ثاني لنفس الشخص (اختياري)
  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name.startsWith("ticket-") &&
      c.topic &&
      c.topic.includes(`owner=${user.id}`)
  );
  if (existing) return { existing };

  const name = `ticket-${t.prefix}-${safeUser}`.slice(0, 100);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID,
    topic: `owner=${user.id};type=${type}`,
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
        id: SUPPORT_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ],
  });

  const embed = new EmbedBuilder()
    .setTitle(t.title)
    .setDescription(`أهلًا ${user} ✨\n${t.desc}`)
    .setColor(0x9b59ff);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 إغلاق").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("delete_ticket").setLabel("🗑️ حذف").setStyle(ButtonStyle.Danger)
  );

await channel.send({
  content: `${user}`,
  embeds: [embed],
  components: [row],
});

  await sendOpenLog({ guild, user, channel, type });
  return { channel };
}

// =======================
// إرسال لوحة التكت (صورتين/رسالتين)
// =======================
async function sendPanel(channel) {
  const imageEmbed = new EmbedBuilder()
    .setColor(0x9b59ff)
    .setImage(config.panelImageUrl);

  const textEmbed = new EmbedBuilder()
    .setColor(0x9b59ff)
    .setDescription(config.panelText);

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("اختر نوع التذكرة...")
    .addOptions(
      { label: "Support Ticket Opened", value: "support", emoji: "🛠️" },
      { label: "Event Ticket", value: "event", emoji: "🎉" }
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

  // =======================
  // !panel (للإدارة فقط + حذف رسالة العضو ورد البوت بعد 7 ثواني إذا مو إدارة)
  // =======================
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
    // حذف أمر الإدارة نفسه (تنظيف الشات)
    message.delete().catch(() => {});
    return;
  }

  // =======================
  // !setimg <رابط> (للإدارة فقط) تغيير صورة اللوحة
  // =======================
  if (cmd === "setimg") {
    const member = await message.guild.members.fetch(message.author.id);
    if (!(await isStaff(member))) return;

    const url = message.content.split(" ").slice(1).join(" ").trim();
    if (!url || !url.startsWith("http")) {
      const r = await message.reply("اكتب الرابط بعد الأمر: `!setimg رابط`");
      setTimeout(() => { r.delete().catch(()=>{}); message.delete().catch(()=>{}); }, 7000);
      return;
    }

    config.panelImageUrl = url;
    saveConfig(config);

    const r = await message.reply("✅ تم تغيير صورة اللوحة.");
    setTimeout(() => { r.delete().catch(()=>{}); message.delete().catch(()=>{}); }, 7000);
    return;
  }

  // =======================
  // !settext (للإدارة فقط) أسهل طريقة:
  // اكتب النص برسالة عادية، ثم رد عليها بـ !settext
  // =======================
  if (cmd === "settext") {
    const member = await message.guild.members.fetch(message.author.id);
    if (!(await isStaff(member))) return;

    if (!message.reference?.messageId) {
      const r = await message.reply("❌ اكتب النص برسالة، ثم رد على نفس الرسالة بـ `!settext`");
      setTimeout(() => { r.delete().catch(()=>{}); message.delete().catch(()=>{}); }, 7000);
      return;
    }

    const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (!replied || !replied.content?.trim()) {
      const r = await message.reply("❌ ما لقيت نص في الرسالة اللي رديت عليها.");
      setTimeout(() => { r.delete().catch(()=>{}); message.delete().catch(()=>{}); }, 7000);
      return;
    }

    config.panelText = replied.content.trim();
    saveConfig(config);

    const r = await message.reply("✅ تم تحديث نص اللوحة.");
    setTimeout(() => { r.delete().catch(()=>{}); message.delete().catch(()=>{}); }, 7000);
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

    const result = await createTicket(interaction.guild, interaction.user, type);
    if (result.existing) return interaction.reply({ content: `عندك تكت مفتوح: ${result.existing}`, ephemeral: true });

    return interaction.reply({ content: "✅ تم فتح التذكرة.", ephemeral: true });
  }

  // زر إغلاق (للإدارة/الدعم فقط) + ينقل للوق
  if (interaction.isButton() && interaction.customId === "close_ticket") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!(await isStaff(member))) {
      return interaction.reply({ content: "❌ الإغلاق للإدارة/الدعم فقط.", ephemeral: true });
    }

    await interaction.channel.setParent(LOG_CATEGORY_ID).catch(() => {});
    await interaction.reply({ content: "🔒 تم إغلاق التذكرة ونقلها للوق.", ephemeral: true });
    return;
  }

  // زر حذف (للإدارة/الدعم فقط)
  if (interaction.isButton() && interaction.customId === "delete_ticket") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!(await isStaff(member))) {
      return interaction.reply({ content: "❌ الحذف للإدارة/الدعم فقط.", ephemeral: true });
    }

    await interaction.reply({ content: "🗑️ جاري حذف التذكرة...", ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 1500);
    return;
  }
});

client.login(process.env.TOKEN);
