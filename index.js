import {
  Client, GatewayIntentBits, Partials,
  ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  SlashCommandBuilder, REST, Routes
} from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

const SUPPORT_CATEGORY_NAME = "Tickets";   // Ticket category
const STAFF_ROLE_NAME = "Support";         // Staff role name

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
      const existing = guild.channels.cache.find(
        c => c.name === `ticket-${interaction.user.username.toLowerCase()}`
      );
      if (existing) {
        return interaction.reply({ content: "⚠️ You already have an open ticket!", ephemeral: true });
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

      await ticketChannel.send({
        content: `Hello ${interaction.user}, a support team member will be with you shortly!`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("close_ticket")
              .setLabel("Close Ticket")
              .setStyle(ButtonStyle.Danger)
          ),
        ],
      });

      await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
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
