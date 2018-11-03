const DiscordRSS = require('./index.js')
const config = require('./config.json')

const drss = new DiscordRSS.Client({ readFileSchedules: true, setPresence: true })
let token = process.env.DISCORD_TOKEN || config.bot.token

try {
  const override = require('./settings/configOverride.json')
  token = override.bot && override.bot.token ? override.bot.token : token
} catch (err) {}

config.database.uri = process.env.MONGODB_URI || config.database.uri

drss.login(token)
