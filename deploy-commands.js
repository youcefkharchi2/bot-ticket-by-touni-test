const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const config = require("./config.json");

const commands = [
  new SlashCommandBuilder().setName("ticket").setDescription("إرسال زر فتح تذكرة")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(config.token);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands("1299021058963275838", config.guildId),
      { body: commands }
    );
    console.log("✅ تم تسجيل الأوامر بنجاح.");
  } catch (error) {
    console.error(error);
  }
})();