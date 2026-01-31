require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
  ChannelType,
} = require("discord.js");

/* ========= IDs ========= */
const GUILD_ID = "ضع_ايدي_السيرفر";
const TICKET_CATEGORY_ID = "1455718248493482007";
const CLOSED_CATEGORY_ID = "1455700238840102984";
const STAFF_ROLE_ID = "1448055249762910299";
const TARGET_ROLE_ID = "1466965678023246049";

/* ========= BOT ========= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

/* ========= READY ========= */
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("send")
      .setDescription("إرسال رسالة خاص لرتبة معيّنة")
      .addStringOption((o) =>
        o.setName("message").setDescription("نص الرسالة").setRequired(true)
      ),
  ];

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: commands,
  });
});

/* ========= SLASH COMMAND ========= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "send") return;

  if (
    !interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    ) &&
    !interaction.member.roles.cache.has(STAFF_ROLE_ID)
  ) {
    return interaction.reply({ content: "❌ للإدارة فقط", ephemeral: true });
  }

  const message = interaction.options.getString("message");
  const role = interaction.guild.roles.cache.get(TARGET_ROLE_ID);
  if (!role)
    return interaction.reply({ content: "❌ الرتبة غير موجودة", ephemeral: true });

  let sent = 0;
  for (const member of role.members.values()) {
    if (member.user.bot) continue;
    try {
      await member.send(message);
      sent++;
    } catch {}
  }

  interaction.reply({
    content: `✅ تم الإرسال إلى ${sent} عضو`,
    ephemeral: true,
  });
});

/* ========= BUTTONS ========= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const channel = interaction.channel;

  /* 🔔 تنبيه */
  if (interaction.customId === "notify") {
    const ownerId = channel.topic;
    const user = await client.users.fetch(ownerId);
    await user.send("🔔 تم الرد على تذكرتك، يرجى التحقق منها.");
    return interaction.reply({ content: "✅ تم التنبيه", ephemeral: true });
  }

  /* 🔒 إغلاق */
  if (interaction.customId === "close") {
    await channel.setParent(CLOSED_CATEGORY_ID);
    await interaction.reply({ content: "🔒 تم إغلاق التكت", ephemeral: true });
  }

  /* ♻️ استرجاع */
  if (interaction.customId === "restore") {
    await channel.setParent(TICKET_CATEGORY_ID);
    await interaction.reply({ content: "♻️ تم استرجاع التكت", ephemeral: true });
  }
});

/* ========= CREATE TICKET ========= */
client.on("messageCreate", async (message) => {
  if (message.content !== "!ticket") return;

  const channel = await message.guild.channels.create({
    name: `ticket-${message.author.username}`,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID,
    topic: message.author.id,
    permissionOverwrites: [
      {
        id: message.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: message.author.id,
        allow: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [PermissionsBitField.Flags.ViewChannel],
      },
    ],
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("notify")
      .setLabel("تنبيه")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("close")
      .setLabel("إغلاق")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("restore")
      .setLabel("استرجاع")
      .setStyle(ButtonStyle.Secondary)
  );

  channel.send({
    content: `🎫 تذكرة جديدة من <@${message.author.id}>`,
    components: [row],
  });
});

client.login(process.env.TOKEN);
