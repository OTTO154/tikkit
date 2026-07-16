require("dotenv").config();
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
// الإعدادات
// =======================
const STAFF_ROLE_ID = "1448055249762910299";
const TICKETS_CATEGORY_ID = "1455273132146294970";
const LOG_CATEGORY_ID = "1455700238840102984";
const PING_ROLE_ID = "1455718248493482007";
const BROADCAST_ROLE_ID = "1466965678023246049";

const PREFIX = "!";

// =======================
// أنواع التكت
// =======================
const TICKET_TYPES = {
  support: {
    label: "فتح تذكرة الدعم",
    emoji: "🛠️",
    title: "🛠️ تذكرة دعم",
    desc: "اكتب مشكلتك وسيتم الرد عليك.",
  },
  event: {
    label: "تذكرة مشاركة لفعالية",
    emoji: "🎉",
    title: "🎉 تذكرة فعالية",
    desc: "اكتب تفاصيل المشاركة.",
  },
};

// =======================
// Client
// =======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =======================
// Helpers
// =======================
function isStaff(member) {
  return (
    member.roles.cache.has(STAFF_ROLE_ID) ||
    member.permissions.has(PermissionsBitField.Flags.Administrator)
  );
}

function parseTopic(channel) {
  const topic = channel.topic || "";
  return {
    ownerId: topic.match(/owner=(\d+)/)?.[1],
    status: topic.match(/status=(open|closed)/)?.[1] || "open",
  };
}

async function setStatus(channel, status) {
  const { ownerId } = parseTopic(channel);
  if (!ownerId) return;
  await channel.setTopic(`owner=${ownerId};status=${status}`).catch(() => {});
}

// =======================
// لوحة التكت
// =======================
async function sendPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x9b59ff)
    .setTitle("🎟️ نظام التذاكر")
    .setDescription("اختر نوع التذكرة 👇");

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("اختر نوع التذكرة")
    .addOptions(
      { label: "فتح تذكرة الدعم", value: "support", emoji: "🛠️" },
      { label: "تذكرة مشاركة لفعالية", value: "event", emoji: "🎉" }
    );

  await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

// =======================
// أزرار
// =======================
function openButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("notify").setLabel("🔔 تنبيه").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("close").setLabel("🔒 إغلاق").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("delete").setLabel("🗑️ حذف").setStyle(ButtonStyle.Danger)
  );
}

function closedButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("restore").setLabel("♻️ استرجاع").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("delete").setLabel("🗑️ حذف").setStyle(ButtonStyle.Danger)
  );
}

// =======================
// إنشاء تكت
// =======================
async function createTicket(guild, user, type) {
  const t = TICKET_TYPES[type];

  const channel = await guild.channels.create({
    name: `ticket-${user.username}`,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID,
    topic: `owner=${user.id};status=open`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
        ],
      },
    ],
  });

  const embed = new EmbedBuilder()
    .setColor(0x9b59ff)
    .setTitle(t.title)
    .setDescription(t.desc);

  await channel.send({
    content: `<@&${PING_ROLE_ID}> ${user}`,
    embeds: [embed],
    components: [openButtons()],
  });
}

// =======================
// أوامر الشات
// =======================
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const cmd = message.content.slice(1).toLowerCase();

  // panel
  if (cmd === "panel") {
    const member = await message.guild.members.fetch(message.author.id);
    if (!isStaff(member)) return;
    await sendPanel(message.channel);
    message.delete().catch(() => {});
  }

  // send (رد على رسالة)
  if (cmd === "send") {
    const member = await message.guild.members.fetch(message.author.id);
    if (!isStaff(member)) return;

    if (!message.reference) return message.reply("❌ رد على رسالة");

    const targetMsg = await message.channel.messages.fetch(message.reference.messageId);
    const text = targetMsg.content;

    const role = message.guild.roles.cache.get(BROADCAST_ROLE_ID);
    if (!role) return;

    let sent = 0;
    for (const m of role.members.values()) {
      await m.send(text).catch(() => {});
      sent++;
    }

    message.reply(`✅ تم الإرسال لـ ${sent} شخص`);
  }
});

// =======================
// Interactions
// =======================
client.on("interactionCreate", async (interaction) => {
  // فتح تكت
  if (interaction.isStringSelectMenu()) {
    await interaction.deferReply({ ephemeral: true });
    await createTicket(interaction.guild, interaction.user, interaction.values[0]);
    return interaction.editReply("✅ تم فتح التذكرة");
  }

  if (!interaction.isButton()) return;
  const channel = interaction.channel;
  const { ownerId } = parseTopic(channel);

  // تنبيه
  if (interaction.customId === "notify") {
    const user = await client.users.fetch(ownerId);
    await user.send(`📩 تم الرد على تذكرتك\n${channel.url}`).catch(() => {});
    return interaction.reply({ content: "✅ تم التنبيه", ephemeral: true });
  }

  // إغلاق
  if (interaction.customId === "close") {
    await channel.setParent(LOG_CATEGORY_ID);
    await setStatus(channel, "closed");
    await channel.send({ components: [closedButtons()] });
    return interaction.reply({ content: "🔒 تم الإغلاق", ephemeral: true });
  }

  // استرجاع
  if (interaction.customId === "restore") {
    await channel.setParent(TICKETS_CATEGORY_ID);
    await setStatus(channel, "open");
    await channel.send({ components: [openButtons()] });
    return interaction.reply({ content: "♻️ تم الاسترجاع", ephemeral: true });
  }

  // حذف
  if (interaction.customId === "delete") {
    await interaction.reply({ content: "🗑️ جاري الحذف", ephemeral: true });
    setTimeout(() => channel.delete().catch(() => {}), 1500);
  }
});

client.login(process.env.TOKEN);
