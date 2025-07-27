const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const fs = require("fs");
const config = require("./config.json");
const uploadToGitHub = require("./upload-to-github");

let ticketCount = 0;
const ratedTickets = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

const openLogChannelId = "1298951776157962280";
const closeLogChannelId = "1298951750241357834";
const ratingLogChannelId = "1398463626997665954";

client.once("ready", () => {
  console.log(`${client.user.tag} ✅ جاهز للعمل`);
});

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === "ticket") {
    const embed = new EmbedBuilder()
      .setTitle("🎟️ Ticket System")
      .setDescription("Welcome to the ticket system, here you can open a ticket and get help from the staff team.")
      .setColor("#3498db")
      .setImage("https://d.top4top.io/p_34931kohk1.gif")
      .setThumbnail("https://d.top4top.io/p_34931kohk1.gif");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("some_info").setLabel("📌 Some Information").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("open_ticket_menu").setLabel("🎫 Open Ticket").setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && interaction.customId === "open_ticket_menu") {
    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("select_ticket_type")
        .setPlaceholder("Please select a type to open a ticket.")
        .addOptions([
          { label: "Support Ticket", value: "support", description: "Open a ticket for support." },
          { label: "Report Ticket", value: "report", description: "Open a ticket for report." },
          { label: "Division Ticket", value: "division", description: "Open a ticket for division support." },
          { label: "Girl Ticket", value: "girl", description: "Open a support ticket for girls only." },
          { label: "Administrator Ticket", value: "admin", description: "Open a ticket to speak to an administrator." }
        ])
    );

    await interaction.reply({ components: [selectMenu], ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "select_ticket_type") {
    const type = interaction.values[0];
    const roleMap = {
      support: "1398417455831060601",
      report: "1398417455831060601",
      division: "1398429262528118844",
      girl: "1398429349262393435",
      admin: "1398430461344223384"
    };

    const roleId = roleMap[type];
    const allowedMultipleRoleId = "1398432988244475954";

    if (!interaction.member.roles.cache.has(allowedMultipleRoleId)) {
      const existingChannel = interaction.guild.channels.cache.find(c => c.topic === interaction.user.id);
      if (existingChannel) {
        return interaction.reply({ content: "⚠️ You already have an open ticket.", ephemeral: true });
      }
    }

    try {
      ticketCount++;
      const ticketChannel = await interaction.guild.channels.create({
        name: `${type}-ticket-${ticketCount}`,
        type: ChannelType.GuildText,
        topic: interaction.user.id,
        parent: config.categoryId,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          },
          {
            id: roleId,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          }
        ]
      });

      const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket Opened")
        .setDescription("Please explain your issue in detail. Our team will assist you shortly.")
        .setColor("#3498db");

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Close Ticket").setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `<@${interaction.user.id}> <@&${roleId}>`,
        embeds: [embed],
        components: [closeButton]
      });

      await interaction.reply({ content: `✅ Your ticket has been created: ${ticketChannel}`, ephemeral: true });

      const logEmbed = new EmbedBuilder()
        .setTitle("📥 تم فتح التذكرة")
        .addFields(
          { name: "👤 تم الإنشاء بواسطة", value: `<@${interaction.user.id}>`, inline: true },
          { name: "📎 التذكرة", value: `${ticketChannel}`, inline: true },
          { name: "⏰ الوقت", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
        )
        .setColor("Green")
        .setFooter({ text: "𝘽𝙊𝙏 𝘽𝙔 𝙏𝙊𝙐𝙉𝙄 𝘿𝙴𝙑 🛠️" });

      const logChannel = await client.channels.fetch(openLogChannelId);
      await logChannel.send({ embeds: [logEmbed] });

    } catch (error) {
      console.error("❌ Error creating ticket:", error);
      await interaction.reply({ content: "❌ Failed to create ticket. Please try again later.", ephemeral: true });
    }
  }

  if (interaction.isButton() && interaction.customId === "some_info") {
    await interaction.reply({ content: "📌 This is a quick guide or some important information.", ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === "close_ticket") {
    const channel = interaction.channel;
    const userId = channel.topic;
    const member = interaction.member;

    const overwrites = channel.permissionOverwrites.cache;
    const staffRoleOverwrite = overwrites.find(p => p.type === 0 && p.id !== interaction.guild.id && p.id !== userId);

    if (!staffRoleOverwrite || !member.roles.cache.has(staffRoleOverwrite.id)) {
      return interaction.reply({ content: "❌ فقط الطاقم المسؤول على هذا النوع من التذاكر يمكنه غلقها.", ephemeral: true });
    }

    const user = await client.users.fetch(userId);
    const jumpURL = `https://discord.com/channels/${channel.guild.id}/${channel.id}`;

    await interaction.reply({ content: "🔒 Ticket will be closed in 5 seconds..." });

    const logEmbed = new EmbedBuilder()
      .setTitle("📤 تم غلق التذكرة")
      .addFields(
        { name: "👤 تم الغلق بواسطة", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📎 التذكرة", value: `${channel.name}`, inline: true },
        { name: "⏰ الوقت", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
      )
      .setColor("Red")
      .setFooter({ text: "𝘽𝙊𝙏 𝘽𝙔 𝙏𝙊𝙐𝙉𝙄 𝘿𝙴𝙑 🛠️" });

    const logChannel = await client.channels.fetch(closeLogChannelId);
    await logChannel.send({ embeds: [logEmbed] });
    
    const transcript = await createTranscript(channel, {
      limit: -1,
      returnType: 'buffer', // ✅ مهم: نستعمل buffer وليس AttachmentBuilder
      fileName: `${channel.name}.html`
    });

    const folderPath = './ticket-touni';

    // ✅ تأكد من وجود المجلد
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const filePath = `${folderPath}/${channel.name}.html`;

    // ✅ حفظ الملف في Replit
    fs.writeFileSync(filePath, transcript);

    // ✅ رفع الملف إلى GitHub Pages
    uploadToGitHub(`ticket-touni/${channel.name}.html`, transcript.toString());


 const ratingRow = new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map(n =>
        new ButtonBuilder()
          .setCustomId(`star_${n}_${channel.id}`)
          .setLabel("⭐".repeat(n))
          .setStyle(ButtonStyle.Secondary)
      )
    );

    const viewTranscriptButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("📄 زيارة نسخة التذكرة")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://youcefkharchi2.github.io/bot-ticket-by-touni-test/ticket-touni/${channel.name}.html`)
    );

    const dmEmbed = new EmbedBuilder()
      .setTitle("📩 شكراً لاستخدام نظام التذاكر")
      .setDescription("يرجى تقييم الخدمة التي تلقيتها في هذه التذكرة.")
      .setColor("DarkButNotBlack")
      .addFields(
        { name: "📎 العودة إلى التذكرة", value: `[اضغط هنا لعرض التذكرة المغلقة](${jumpURL})` },
        { name: "⭐ تقييم", value: "اضغط على النجمة المناسبة لتقييمك." }
      )
      .setFooter({ text: "𝘽𝙊𝙏 𝘽𝙔 𝙏𝙊𝙐𝙉𝙄 𝘿𝙴𝙑 🛠️" });

    user.send({ embeds: [dmEmbed], components: [ratingRow, viewTranscriptButton] }).catch(() => {});

    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 5000);
  }

  if (interaction.isButton() && interaction.customId.startsWith("star_")) {
    const parts = interaction.customId.split("_");
    const rating = parts[1];
    const channelId = parts[2];

    const userRatings = ratedTickets.get(interaction.user.id) || new Set();
    if (userRatings.has(channelId)) {
      return interaction.reply({ content: "⚠️ لقد قمت بتقييم هذه التذكرة من قبل.", ephemeral: true });
    }

    const logChannel = await client.channels.fetch(ratingLogChannelId);

    const ratingEmbed = new EmbedBuilder()
      .setTitle("⭐ تقييم جديد")
      .addFields(
        { name: "👤 المستخدم", value: `<@${interaction.user.id}>`, inline: true },
        { name: "⭐ التقييم", value: `${rating} / 5`, inline: true },
        { name: "⏰ الوقت", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
      )
      .setColor("Gold");

    await logChannel.send({ embeds: [ratingEmbed] });

    userRatings.add(channelId);
    ratedTickets.set(interaction.user.id, userRatings);

    await interaction.reply({ content: `✅ تم تسجيل تقييمك (${rating} ⭐). شكراً!`, ephemeral: true });
  }
});

client.login(config.token); // ✅ هذا هو الصح
