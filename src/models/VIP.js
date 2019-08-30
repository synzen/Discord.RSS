const mongoose = require('mongoose')

const schema = mongoose.Schema({
  id: {
    type: String,
    unique: true
  },
  invalid: Boolean,
  name: String,
  fname: String,
  servers: {
    type: [String],
    default: []
  },
  permanent: Boolean,
  pledged: Number,
  totalPledged: Number,
  maxFeeds: Number,
  maxServers: Number,
  allowWebhooks: Boolean,
  allowCookies: Boolean,
  expireAt: {
    type: Date
  },
  gracedUntil: {
    type: Date
  },
  override: Boolean,
  comment: String,
  regularRefreshRate: Boolean
})

exports.schema = schema
exports.model = () => mongoose.model('vips', schema)
