const Joi = require('@hapi/joi')
const decodeValidator = require('./validation/decode.js')
const timezoneValidator = require('./validation/timezone.js')
const localeValidator = require('./validation/locale.js')

const logSchema = Joi.object({
  level: Joi.string().strict().valid('silent', 'trace', 'debug', 'info', 'owner', 'warn', 'error', 'fatal').default('info'),
  destination: Joi.string().allow('').default(''),
  linkErrs: Joi.bool().strict().default(true),
  unfiltered: Joi.bool().strict().default(true),
  failedFeeds: Joi.bool().strict().default(true),
  rateLimitHits: Joi.bool().strict().default(true)
})

const botSchema = Joi.object({
  token: Joi.string().strict().default(''),
  locale: localeValidator.config().locale(),
  enableCommands: Joi.bool().strict().default(true),
  prefix: Joi.string().strict().default('rss.'),
  status: Joi.string().valid('online', 'dnd', 'invisible', 'idle').default('online'),
  activityType: Joi.string().valid('', 'PLAYING', 'STREAMING', 'LISTENING', 'WATCHING').default(''),
  activityName: Joi.string().strict().allow('').default(''),
  streamActivityURL: Joi.string().strict().allow('').default(''),
  ownerIDs: Joi.array().items(Joi.string().strict()).default([]),
  menuColor: Joi.number().strict().greater(0).default(5285609),
  deleteMenus: Joi.bool().strict().default(true),
  runSchedulesOnStart: Joi.bool().strict().default(true),
  exitOnSocketIssues: Joi.bool().strict().default(true),
  exitOnDatabaseDisconnect: Joi.bool().strict().default(false),
  exitOnExcessRateLimits: Joi.bool().strict().default(true),
  userAgent: Joi.string().strict().default('MonitoRSS (+https://github.com/synzen/MonitoRSS)'),
  feedRequestTimeoutMs: Joi.number().strict().default(15000)
})

const databaseSchema = Joi.object({
  uri: Joi.string().strict().default('mongodb://localhost:27017/rss'),
  redis: Joi.string().strict().allow('').default(''),
  connection: Joi.object().default({}),
  articlesExpire: Joi.number().strict().greater(-1).default(14),
  deliveryRecordsExpire: Joi.number().strict().greater(-1).default(2)
})

const feedsSchema = Joi.object({
  refreshRateMinutes: Joi.number().strict().greater(0).default(10),
  articleDequeueRate: Joi.number().strict().greater(0).default(1),
  articleRateLimit: Joi.number().strict().greater(-1).default(0),
  articleDailyChannelLimit: Joi.number().strict().greater(-1).default(0),
  timezone: timezoneValidator.config().timezone(),
  dateFormat: Joi.string().strict().default('ddd, D MMMM YYYY, h:mm A z'),
  dateLanguage: Joi.string().strict().default('en'),
  dateLanguageList: Joi.array().items(Joi.string().strict()).min(1).default(['en']),
  dateFallback: Joi.bool().strict().default(false),
  timeFallback: Joi.bool().strict().default(false),
  max: Joi.number().strict().greater(-2).default(0),
  hoursUntilFail: Joi.number().strict().default(0),
  notifyFail: Joi.bool().strict().default(true),
  sendFirstCycle: Joi.bool().strict().default(true),
  cycleMaxAge: Joi.number().strict().default(1),
  defaultText: Joi.string().default(':newspaper:  |  **{title}**\n\n{link}\n\n{subscribers}'),
  imgPreviews: Joi.bool().strict().default(true),
  imgLinksExistence: Joi.bool().strict().default(true),
  checkDates: Joi.bool().strict().default(true),
  formatTables: Joi.bool().strict().default(false),
  directSubscribers: Joi.bool().strict().default(false),
  decode: decodeValidator.config().encoding()
})

const advancedSchema = Joi.object({
  shards: Joi.number().greater(-1).strict().default(0),
  batchSize: Joi.number().greater(0).strict().default(400),
  parallelBatches: Joi.number().greater(0).strict().default(1),
  parallelRuns: Joi.number().greater(0).strict().default(1)
})

const pledgeApiSchema = Joi.object({
  enabled: Joi.bool().strict().default(false),
  url: Joi.string().allow('').default(''),
  accessToken: Joi.string().strict().allow('').default('').when('url', {
    is: Joi.string().strict().min(1),
    then: Joi.string().strict().required(),
    otherwise: Joi.string().strict().allow('')
  })
})

const discordHttpGateway = Joi.object({
  enabled: Joi.bool().strict().default(false),
  redisUri: Joi.string().strict().allow('').default('').when('enabled', {
    is: Joi.bool().valid(true).required(),
    then: Joi.string().strict().required().disallow(''),
    otherwise: Joi.string().strict().allow('').default('')
  })
})

const apisSchema = Joi.object({
  pledge: pledgeApiSchema.default(pledgeApiSchema.validate({}).value),
  discordHttpGateway: discordHttpGateway.default(discordHttpGateway.validate({}).value)
})

const schema = Joi.object({
  apis: apisSchema.default(apisSchema.validate({}).value),
  dev: Joi.number().strict().greater(-1),
  _vip: Joi.bool().strict(),
  _vipRestricted: Joi.bool().strict().default(false),
  _vipRefreshRateMinutes: Joi.number().strict(),
  log: logSchema.default(logSchema.validate({}).value),
  bot: botSchema.default(botSchema.validate({}).value),
  database: databaseSchema.default(databaseSchema.validate({}).value),
  feeds: feedsSchema.default(feedsSchema.validate({}).value),
  advanced: advancedSchema.default(advancedSchema.validate({}).value),
  webURL: Joi.string().strict().allow('').allow('').default(''),
  discordSupportURL: Joi.string().uri().strict().allow(''),
  disableFeedCycles: Joi.bool().strict().default(false)
})

module.exports = {
  schemas: {
    apis: apisSchema,
    log: logSchema,
    bot: botSchema,
    database: databaseSchema,
    feeds: feedsSchema,
    advanced: advancedSchema,
    config: schema
  },
  defaults: schema.validate({}).value,
  validate: config => {
    const results = schema.validate(config, {
      abortEarly: false
    })
    if (results.error) {
      const str = results.error.details
        .map(d => d.message)
        .join('\n')

      throw new TypeError(`Bot config validation failed\n\n${str}\n`)
    }
  }
}
