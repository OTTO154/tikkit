require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");

/* ========= CONFIG ========= */
const PREFIX = "!";
const GUILD_ID = "ضع_ايدي_السيرفر";
const TICKET_CATEGORY_ID = "1455718248493482007";
const CLOSED_CATEGORY_ID = "1455700238840102984";
const STAFF_ROLE_ID = "1448055249762910299";
const SEND_ROLE_ID = "1466965678023246049";

/* ========= CLIENT ========= */
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
client.once("ready", () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

/* ========= MESSAGE COMMANDS ========= */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  /* ===== !send ===== */
  if (command === "send") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      ) &&
      !message.member.roles.cache.has(STAFF_ROLE_ID)
    ) {
      return message.reply("❌ هذا الأمر للإدارة فقط");
    }

    const text = args.join(" ");
    if (!text) return message.reply("❌ اكتب الرسالة");

    const role = message.guild.roles.cache.get(SEND_ROLE_ID);
    if (!role) return message.reply("❌ الرتبة غير موجودة");

    let sent = 0;
    for (const member of role.members.values()) {
      if (member.user.bot) continue;
      try {
        await member.send(text);
        sent++;
      } catch {}
    }

    message.reply(`✅ تم الإرسال إلى ${sent} عضو`);
  }

  /* ===== !ticket ===== */
  if (command === "ticket") {
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

    const embed = new EmbedBuilder()
      .setColor("#7b2cbf")
      .setTitle("🎉 تذكرة فعّالة")
      .setDescription("✍️ اكتب تفاصيل المشكلة")
      .setFooter({ text: "Ticket System" });

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
      content: `<@&${STAFF_ROLE_ID}> | <@${message.author.id}>`,
      embeds: [embed],
      components: [row],
    });
  }
});

/* ========= BUTTONS ========= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const channel = interaction.channel;

  /* 🔔 تنبيه */
  if (interaction.customId === "notify") {
    const ownerId = channel.topic;
    const user = await client.users.fetch(ownerId);
    await user.send("🔔 تم الرد على تذكرتك، يرجى مراجعتها.");
    return interaction.reply({ content: "✅ تم إرسال التنبيه", ephemeral: true });
  }

  /* 🔒 إغلاق */
  if (interaction.customId === "close") {
    await channel.setParent(CLOSED_CATEGORY_ID);
    return interaction.reply({ content: "🔒 تم إغلاق التكت", ephemeral: true });
  }

  /* ♻️ استرجاع */
  if (interaction.customId === "restore") {
    await channel.setParent(TICKET_CATEGORY_ID);
    return interaction.reply({ content: "♻️ تم استرجاع التكت", ephemeral: true });
  }
});

client.login(process.env.TOKEN);
