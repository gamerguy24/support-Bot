import {
  Client, GatewayIntentBits, Partials,
  ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  SlashCommandBuilder, REST, Routes
} from "discord.js";
import dotenv from "dotenv";
import http from "http";
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
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
      if (!interaction.channel.name.startsWith("ticket-")) {
        return interaction.reply({ content: "❌ This isn't a ticket channel.", ephemeral: true });
      }

      await interaction.reply("🗑️ Closing this ticket in 5 seconds...");
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

client.login(process.env.TOKEN);

// HTTP server for Render port binding
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord bot is running!');
}).listen(PORT, () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
});

// Keep-alive system to prevent Render from sleeping
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  // Wait 5 minutes before starting keep-alive pings
  setTimeout(() => {
    setInterval(() => {
      try {
        http.get(RENDER_URL, (res) => {
          if (res.statusCode === 200) {
            console.log(`✅ Keep-alive ping successful`);
          }
        }).on('error', (err) => {
          console.error('Keep-alive error:', err.message);
        });
      } catch (error) {
        console.error('Keep-alive failed:', error.message);
      }
    }, 14 * 60 * 1000); // Ping every 14 minutes
    console.log('🔄 Keep-alive system started');
  }, 5 * 60 * 1000); // Start after 5 minutes
  console.log('⏳ Keep-alive will start in 5 minutes');
} else {
  console.log('ℹ️ Keep-alive disabled (no RENDER_EXTERNAL_URL found)');
}