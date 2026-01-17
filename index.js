import {
  Client, GatewayIntentBits, Partials,
  ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  SlashCommandBuilder, REST, Routes
} from "discord.js";
import dotenv from "dotenv";
import http from "http";
import fs from "fs";
import path from "path";
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const SUPPORT_CATEGORY_NAME = "Tickets";
const STAFF_ROLE_NAME = "Support";

// Register slash commands globally
const commands = [
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Post the ticket panel in this channel (Admin only)"),
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("⏳ Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands.map(cmd => cmd.toJSON()),
    });
    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error(err);
  }
})();

// Ready
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Slash command handler
client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "setup-tickets") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ Only admins can run this command.", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("🎫 Support Tickets")
        .setDescription("Need help? Click the button below to open a support ticket.")
        .setColor(0x2f3136);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("create_ticket")
          .setLabel("Open Ticket")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: "✅ Ticket panel created!", ephemeral: true });
    }
  }

  // Ticket button system
  if (interaction.isButton()) {
    const guild = interaction.guild;

    // Create Ticket
    if (interaction.customId === "create_ticket") {
      await interaction.deferReply({ flags: 64 });

      const existing = guild.channels.cache.find(
        c => c.name === `ticket-${interaction.user.username.toLowerCase()}`
      );
      if (existing) {
        return interaction.editReply({ content: "⚠️ You already have an open ticket!" });
      }

      let category = guild.channels.cache.find(
        c => c.name === SUPPORT_CATEGORY_NAME && c.type === ChannelType.GuildCategory
      );
      if (!category) {
        category = await guild.channels.create({
          name: SUPPORT_CATEGORY_NAME,
          type: ChannelType.GuildCategory,
        });
      }

      const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ];

      const staffRole = guild.roles.cache.find(r => r.name === STAFF_ROLE_NAME);
      if (staffRole) {
        overwrites.push({
          id: staffRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites,
      });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle("Welcome to Independent Creations")
        .setDescription(
          "Thank you for opening a ticket!\n\n" +
          "Independent Creations specializes in custom iRacing paint designs, made to fit your style and stand out on track.\n\n" +
          "**Pricing:**\n" +
          "• Standard Paint — $5\n" +
          "• Paint w/ Spec Map — $10\n\n" +
          "**Please include the following to get started:**\n" +
          "• Car & series\n" +
          "• Design ideas or references\n" +
          "• Colors, numbers, and sponsors\n" +
          "• Deadline (if any)\n\n" +
          "We'll respond as soon as possible. Thank you for choosing Independent Creations! 🎨"
        )
        .setColor(0x5865F2);

      await ticketChannel.send({
        content: `${interaction.user}`,
        embeds: [welcomeEmbed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("close_ticket")
              .setLabel("Close Ticket")
              .setStyle(ButtonStyle.Danger)
          ),
        ],
      });

      await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}` });
    }

    // Close Ticket
    if (interaction.customId === "close_ticket") {
      if (!interaction.channel.name?.startsWith("ticket-")) {
        return interaction.reply({ content: "❌ This isn't a ticket channel.", ephemeral: true });
      }

      await interaction.reply("🗑️ Saving transcript and closing this ticket...");

      try {
        // Fetch all messages in the channel (oldest -> newest)
        const allMessages = [];
        let lastId;
        while (true) {
          const fetched = await interaction.channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
          if (fetched.size === 0) break;
          allMessages.push(...fetched.values());
          if (fetched.size < 100) break;
          lastId = fetched.last().id;
        }
        allMessages.reverse();

        // Build transcript text
        const header = [
          `Channel: ${interaction.channel.name}`,
          `Channel ID: ${interaction.channel.id}`,
          `Guild: ${interaction.guild?.name} (${interaction.guild?.id})`,
          `Closed by: ${interaction.user.tag} (${interaction.user.id})`,
          `Closed at: ${new Date().toISOString()}`,
          `---`,
          ''
        ].join('\n');

        const body = allMessages.map(m => {
          const time = new Date(m.createdTimestamp).toISOString();
          const content = m.content || '';
          const attachments = m.attachments.size ? ` [Attachments: ${m.attachments.map(a => a.url).join(', ')}]` : '';
          return `[${time}] ${m.author.tag}: ${content}${attachments}`;
        }).join('\n');

        const transcriptText = header + body;

        // Ensure transcripts directory exists
        const transcriptsDir = path.join(process.cwd(), 'transcripts');
        if (!fs.existsSync(transcriptsDir)) fs.mkdirSync(transcriptsDir, { recursive: true });

        // Safe filename
        const safeChannelName = interaction.channel.name.replace(/[^a-z0-9-_]/gi, '_');
        const filename = `transcript_${safeChannelName}_${interaction.channel.id}_${Date.now()}.txt`;
        const filepath = path.join(transcriptsDir, filename);

        fs.writeFileSync(filepath, transcriptText, 'utf8');

        // Attempt to send transcript to a channel named 'ticket-transcripts' if it exists
        const logChannel = interaction.guild?.channels.cache.find(c => c.name === 'ticket-transcripts' && c.type === ChannelType.GuildText);
        if (logChannel) {
          await logChannel.send({
            content: `Transcript for ${interaction.channel.name} (closed by ${interaction.user.tag})`,
            files: [filepath],
          });
        }
      } catch (err) {
        console.error('Failed to save/send transcript:', err);
      }

      // Delete channel after short delay
      setTimeout(() => {
        try { interaction.channel.delete(); } catch (e) { /* ignore */ }
      }, 5000);
    }
  }
});

client.login(process.env.TOKEN);

// HTTP server for Render port binding
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord bot is running!');
}).listen(PORT, () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
});