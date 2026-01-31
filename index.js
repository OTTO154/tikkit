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
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");

/* =======================
   🔧 الإعدادات
======================= */
const STAFF_ROLE_ID = "1448055249762910299";
const TICKETS_CATEGORY_ID = "1455273132146294970";
const LOG_CATEGORY_ID = "1455700238840102984";
const TICKET_LOG_CHANNEL_ID = "1455703131500314788";
const PING_ROLE_ID = "1455718248493482007";
const PREFIX = "!";

const DEFAULT_PANEL_IMAGE =
  "https://media.discordapp.net/attachments/959615303170555964/1455276224459837674/ffgrfg.gif";

/* =======================
   📁 Config
======================= */
const CONFIG_PATH = path.join(__dirname, "config.json");
const DEFAULT_CONFIG = {
  panelImageUrl: DEFAULT_PANEL_IMAGE,
  panelText: "## 🎟️ نظام التذاكر\n\nاختر نوع التذكرة من القائمة 👇",
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH));
}
const config = loadConfig();

/* =======================
   🎫 أنواع التكت
======================= */
const TICKET_TYPES = {
  support: {
    label: "تذكرة دعم",
    emoji: "🛠️",
    prefix: "support",
    desc: "اكتب مشكلتك وسيتم الرد عليك",
  },
  event: {
    label: "تذكرة فعالية",
    emoji: "🎉",
    prefix: "event",
    desc: "اكتب تفاصيل المشاركة",
  },
};

/* =======================
   🤖 البوت
======================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // تسجيل أمر السلاش
  const commands = [
    new SlashCommandBuilder()
      .setName("send")
      .setDescription("إرسال رسالة خاصة لكل أعضاء السيرفر")
      .addStringOption((o) =>
        o.setName("message").setDescription("نص الرسالة").setRequired(true)
      ),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: commands,
  });
});

/* =======================
   🧠 Helpers
======================= */
async function isStaff(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.roles.cache.has(STAFF_ROLE_ID)
  );
}

/* =======================
   🎫 إنشاء تكت
======================= */
async function createTicket(guild, user, type) {
  const t = TICKET_TYPES[type];
  const channel = await guild.channels.create({
    name: `ticket-${t.prefix}-${user.username}`,
    type: ChannelType.GuildText,
    parent: TICKETS_CATEGORY_ID,
    topic: `owner=${user.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
      { id: user.id, allow: ["ViewChannel", "SendMessages"] },
      { id: STAFF_ROLE_ID, allow: ["ViewChannel", "SendMessages"] },
    ],
  });

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${t.emoji} ${t.label}`)
        .setDescription(t.desc)
        .setColor(0x9b59ff),
    ],
  });

  return channel;
}

/* =======================
   📌 لوحة التكت
======================= */
async function sendPanel(channel) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("اختر نوع التذكرة")
    .addOptions(
      { label: "دعم", value: "support", emoji: "🛠️" },
      { label: "فعالية", value: "event", emoji: "🎉" }
    );

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setImage(config.panelImageUrl)
        .setColor(0x9b59ff),
      new EmbedBuilder().setDescription(config.panelText).setColor(0x9b59ff),
    ],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

/* =======================
   💬 أوامر عادية
======================= */
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith(PREFIX)) return;
  if (!(await isStaff(msg.member))) return;

  if (msg.content === "!panel") {
    await sendPanel(msg.channel);
    msg.delete().catch(() => {});
  }
});

/* =======================
   🎛️ Interactions
======================= */
client.on("interactionCreate", async (i) => {
  /* Dropdown */
  if (i.isStringSelectMenu() && i.customId === "ticket_select") {
    await createTicket(i.guild, i.user, i.values[0]);
    return i.reply({ content: "✅ تم فتح التذكرة", ephemeral: true });
  }

  /* Slash /send */
  if (i.isChatInputCommand() && i.commandName === "send") {
    if (!(await isStaff(i.member)))
      return i.reply({ content: "❌ للإدارة فقط", ephemeral: true });

    const text = i.options.getString("message");
    await i.reply({ content: "📤 جاري الإرسال...", ephemeral: true });

    const members = await i.guild.members.fetch();
    let sent = 0;

    for (const m of members.values()) {
      if (m.user.bot) continue;
      try {
        await m.send(text);
        sent++;
      } catch {}
    }

    return i.followUp({
      content: `✅ تم الإرسال إلى ${sent} عضو`,
      ephemeral: true,
    });
  }
});

client.login(process.env.TOKEN);
