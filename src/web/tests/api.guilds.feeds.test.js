/* eslint-env node, jest */
process.env.NODE_ENV = 'test'
process.env.DRSS_EXPERIMENTAL_FEATURES = 'true'

const httpMocks = require('node-mocks-http')
const dbOpsGuilds = require('../../util/db/guilds.js')
const RedisChannel = require('../../structs/db/Redis/Channel.js')
const RedisGuild = require('../../structs/db/Redis/Guild.js')
const guildFeedsRoute = require('../routes/api/guilds.feeds.js')
const serverLimit = require('../../util/serverLimit.js')
const initialize = require('../../rss/initialize.js')
const Article = require('../../structs/Article.js')
const FeedFetcher = require('../../util/FeedFetcher.js')
const FeedParserError = require('../../structs/errors/FeedParserError.js')
const RequestError = require('../../structs/errors/RequestError.js')
const dbOpsFailedLinks = require('../../util/db/failedLinks.js')

jest.mock('../../util/db/guilds.js')
jest.mock('../../structs/db/Redis/Channel.js')
jest.mock('../../structs/db/Redis/Guild.js')
jest.mock('../../util/serverLimit.js')
jest.mock('../../rss/initialize.js')
jest.mock('../../structs/Article.js')
jest.mock('../../util/FeedFetcher.js')
jest.mock('../../util/db/failedLinks.js')

RedisChannel.utils = {
  isChannelOfGuild: jest.fn(() => Promise.resolve())
}

RedisGuild.utils = {
  getValue: jest.fn(() => Promise.resolve())
}

describe('/api/guilds/:guildID/feeds', function () {
  const userID = 'georgie'
  const session = {
    identity: {
      id: userID
    }
  }
  const params = {
    guildID: '9887',
    feedID: '34y54yhb'
  }
  describe('middleware checkGuildFeedExists', function () {
    it('returns 404 if there is no guildRss', function () {
      const request = httpMocks.createRequest({ session, params })
      const response = httpMocks.createResponse()
      guildFeedsRoute.middleware.checkGuildFeedExists(request, response)
      expect(response.statusCode).toEqual(404)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(404)
      expect(data.message).toEqual('Unknown Feed')
    })
    it('returns 404 if there is guildRss but no sources', function () {
      const request = httpMocks.createRequest({ session, params, guildRss: {} })
      const response = httpMocks.createResponse()
      guildFeedsRoute.middleware.checkGuildFeedExists(request, response)
      expect(response.statusCode).toEqual(404)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(404)
      expect(data.message).toEqual('Unknown Feed')
    })
    it('returns 404 if feed is not found but other feeds exist', async function () {
      const guildRss = { sources: { id1: {}, id2: {} } }
      const request = httpMocks.createRequest({ session, params, guildRss })
      const response = httpMocks.createResponse()
      guildFeedsRoute.middleware.checkGuildFeedExists(request, response)
      expect(response.statusCode).toEqual(404)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(404)
      expect(data.message).toEqual('Unknown Feed')
    })
    it('calls next() if feed is found', function (done) {
      const guildRss = { sources: { id1: {}, [params.feedID]: {}, id3: {} } }
      const request = httpMocks.createRequest({ session, params, guildRss })
      const response = httpMocks.createResponse()
      guildFeedsRoute.middleware.checkGuildFeedExists(request, response, nextErr => {
        if (nextErr) return done(nextErr)
        done()
      })
      expect(response.statusCode).toEqual(200)
    })
    it('attaches source to req.source if feed is found', function (done) {
      const guildRss = { sources: { id1: {}, [params.feedID]: { foo: 'bar' }, id3: {} } }
      const request = httpMocks.createRequest({ session, params, guildRss })
      const response = httpMocks.createResponse()
      guildFeedsRoute.middleware.checkGuildFeedExists(request, response, nextErr => {
        if (nextErr) return done(nextErr)
        try {
          expect(request.source).toEqual(guildRss.sources[params.feedID])
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
  })
  describe.skip('POST /', function () {
    afterEach(function () {
      // redisOps.channels.isChannelOfGuild.mockReset()
      // redisOps.guilds.getValue.mockReset()
      initialize.addNewFeed.mockReset()
    })
    it('returns 400 if body is missing link', async function () {
      const body = { channel: '123' }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      expect(data.message).toHaveProperty('link')
      expect(data.message.link).toEqual('This field is required')
    })
    it('returns 400 if body is missing channel', async function () {
      const body = { link: '123' }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      expect(data.message).toHaveProperty('channel')
      expect(data.message.channel).toEqual('This field is required')
    })
    it('returns 400 if body is missing both link and channel', async function () {
      const body = { title: '123' }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      expect(data.message).toHaveProperty('link')
      expect(data.message).toHaveProperty('channel')
      expect(data.message.link).toEqual('This field is required')
      expect(data.message.channel).toEqual('This field is required')
    })
    it('returns 400 if body has non-string link', async function () {
      const body = { link: [] }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      expect(data.message).toHaveProperty('link')
      expect(data.message.link).toEqual('Must be a string')
    })
    it('returns 400 if body has non-string channel', async function () {
      const body = { channel: 123 }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      expect(data.message).toHaveProperty('channel')
      expect(data.message.channel).toEqual('Must be a string')
    })
    it('returns 400 if body has non-string link and channel', async function () {
      const body = { channel: 123, link: true }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      expect(data.message).toHaveProperty('channel')
      expect(data.message).toHaveProperty('link')
      expect(data.message.channel).toEqual('Must be a string')
      expect(data.message.link).toEqual('Must be a string')
    })
    it('returns 400 if body has non-string title', async function () {
      const body = { channel: '23', link: '123', title: true }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      expect(data.message).toHaveProperty('title')
      expect(data.message.title).toEqual('Must be a string')
    })
    it('returns 403 if feed limit is reached', async function () {
      const guildRss = { sources: { id1: {}, id2: {} } }
      const body = { link: 'sdf', channel: 'w3t4' }
      const request = httpMocks.createRequest({ session, params, guildRss, body })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 1 })
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(403)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(403)
      expect(data.message.includes('limit reached')).toEqual(true)
    })
    it('returns 403 if feed already exists', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildRss = { sources: { id1: {}, [params.feedID]: { link: body.link, channel: body.channel } } }
      const request = httpMocks.createRequest({ session, params, guildRss, body })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 100 })
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(403)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(403)
      expect(data.message).toEqual('Feed already exists for this channel')
    })
    it('returns 404 if channel is not found', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildRss = { sources: { id1: {} } }
      const request = httpMocks.createRequest({ session, params, guildRss, body })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(null)
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(404)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(404)
      expect(data.message).toEqual('Unknown Channel')
    })
    it('returns 403 if channel is not part of guild', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildID = '124r3e4tr'
      const guildRss = { id: guildID, sources: { id1: {} } }
      const request = httpMocks.createRequest({ session, params, guildRss, body })
      const response = httpMocks.createResponse()
      const channel = { guildID: guildID + '123' }
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(channel)
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(403)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(403)
      expect(data.message).toHaveProperty('channel')
      expect(data.message.channel).toEqual('Not part of guild')
    })
    it('returns 403 if util addNewFeed function throws an error of exists for this channel', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildID = params.guildID
      const guildRss = { id: guildID, sources: { id1: {} } }
      const request = httpMocks.createRequest({ session, params, guildRss, body, guild: {} })
      const response = httpMocks.createResponse()
      const channel = { guildID }
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(channel)
      const error = new Error('exists for this channel')
      initialize.addNewFeed.mockRejectedValueOnce(error)
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(403)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(40003)
      expect(data.message).toEqual(error.message)
    })
    it('returns 500 if util addNewFeed function throws an error of feed connection failed', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildID = params.guildID
      const guildRss = { id: guildID, sources: { id1: {} } }
      const channel = { guildID }
      const request = httpMocks.createRequest({ session, params, guildRss, body, guild: {} })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(channel)
      const error = new RequestError(1, 'Connection failed')
      initialize.addNewFeed.mockRejectedValueOnce(error)
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(500)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(50042)
      expect(data.message).toEqual(error.message)
    })
    it('returns 400 if util addNewFeed function throws an error of invalid feed', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildID = params.guildID
      const guildRss = { id: guildID, sources: { id1: {} } }
      const channel = { guildID }
      const request = httpMocks.createRequest({ session, params, guildRss, body, guild: {} })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(channel)
      const error = new FeedParserError(1, 'invalid feed')
      initialize.addNewFeed.mockRejectedValueOnce(error)
      await guildFeedsRoute.routes.postFeed(request, response, console.log)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(40002)
      expect(data.message).toEqual(error.message)
    })
    it('calls next(err) util addNewFeed function throws an unrecognized error', async function (done) {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildID = params.guildID
      const guildRss = { id: guildID, sources: { id1: {} } }
      const channel = { guildID }      
      const request = httpMocks.createRequest({ session, params, guildRss, body, guild: {} })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(channel)
      const error = new Error('akijfrogishngeou')
      initialize.addNewFeed.mockRejectedValueOnce(error)
      await guildFeedsRoute.routes.postFeed(request, response, nextErr => {
        try {
          expect(nextErr).toEqual(error)
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
    it('returns 201 if util addNewFeed function is successful', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildID = params.guildID
      const guildRss = { id: guildID, sources: { id1: {} } }
      const channel = { guildID }
      const addNewFeedReturn = [ 'resolved url', 'meta title', 'rssname' ]
      const request = httpMocks.createRequest({ session, params, guildRss, body, guild: {} })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(channel)
      initialize.addNewFeed.mockResolvedValueOnce(addNewFeedReturn)
      await guildFeedsRoute.routes.postFeed(request, response)
      expect(response.statusCode).toEqual(201)
    })
    it('returns the correct json if util addNewFeed function is successful', async function () {
      const body = { link: 'sdf', channel: 'w3t4' }
      const guildID = params.guildID
      const guildRss = { id: guildID, sources: { id1: {} } }
      const channel = { guildID }
      const addNewFeedReturn = [ 'resolved url', 'meta title', 'rssname' ]
      const request = httpMocks.createRequest({ session, params, guildRss, body, guild: {} })
      const response = httpMocks.createResponse()
      serverLimit.mockResolvedValueOnce({ max: 100 })
      RedisChannel.fetch.mockResolvedValueOnce(channel)
      initialize.addNewFeed.mockResolvedValueOnce(addNewFeedReturn)
      await guildFeedsRoute.routes.postFeed(request, response)
      const data = JSON.parse(response._getData())
      expect(data).toEqual({ _rssName: addNewFeedReturn[2], title: addNewFeedReturn[1], channel: body.channel, link: addNewFeedReturn[0] })
    })
  })
  describe('GET /:feedID', function () {
    afterEach(function () {
      Article.mockReset()
    })
    it('returns the articles placeholders', async function () {
      const rawArticleList = [{
        _id: '2345',
        title: 'title1',
        description: 'description1'
      }, {
        _id: 'ywhe3r45',
        title: 'ja',
        description: 'description2'
      }]
      for (const article of rawArticleList) {
        Article.mockImplementationOnce(function () {
          this.placeholders = Object.keys(article)
          this.raw = article
          this.id = article._id
          for (const key in article) {
            this[key] = article[key]
          }
        })
      }
      FeedFetcher.fetchFeed.mockResolvedValueOnce({ articleList: rawArticleList })
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response)
      expect(response.statusCode).toEqual(200)
      const data = JSON.parse(response._getData())
      expect(data).toEqual(rawArticleList)
    })
    it('returns the articles placeholders with regex placeholders', async function () {
      const rawArticleList = [{
        _id: 'q235r',
        title: 'title1',
        description: 'description1'
      }, {
        _id: '123',
        description: 'description2'
      }]
      for (let i = 0; i < rawArticleList.length; ++i) {
        const article = rawArticleList[i]
        Article.mockImplementationOnce(function () {
          this.placeholders = Object.keys(article)
          this.id = article._id
          for (const key in article) {
            this[key] = article[key]
          }
          if (i === 0) {
            this.regexPlaceholders = {
              title: {
                custom1: 'value1'
              },
              description: {
                custom2: 'value2'
              }
            }
          }
        })
      }

      const expectedResponse = [{
        ...rawArticleList[0],
        'regex:title:custom1': 'value1',
        'regex:description:custom2': 'value2'
      }, {
        ...rawArticleList[1]
      }]
      dbOpsFailedLinks.get.mockResolvedValueOnce()
      FeedFetcher.fetchFeed.mockResolvedValueOnce({ articleList: rawArticleList })
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response)
      expect(response.statusCode).toEqual(200)
      const data = JSON.parse(response._getData())
      expect(data).toEqual(expectedResponse)
    })
    it('returns the articles placeholders with the additional full description, summary and title', async function () {
      const rawArticleList = [{
        _id: '123',
        title: 'title1',
        description: 'description1'
      }, {
        _id: '432wt',
        description: 'description2'
      }]
      const _fullTitle = 'aiwetk njlwseitg'
      const _fullDescription = 'w35ofm34erfv'
      const _fullSummary = 'we35mf349fuc348'
      const _fullDate = new Date()
      const _fullDateString = JSON.stringify(_fullDate).replace(/"/g, '') // Quotes are added when dates are json-stringified for some reason, so remove them
      for (let article of rawArticleList) {
        Article.mockImplementationOnce(function () {
          this.placeholders = Object.keys(article)
          this.id = article._id
          for (const key in article) {
            this[key] = article[key]
          }
          this._fullTitle = _fullTitle
          this._fullDescription = _fullDescription
          this._fullSummary = _fullSummary
          this._fullDate = _fullDate
        })
      }

      const expectedResponse = [{
        ...rawArticleList[0],
        _fullTitle,
        _fullSummary,
        _fullDescription,
        _fullDate: _fullDateString
      }, {
        ...rawArticleList[1],
        _fullTitle,
        _fullSummary,
        _fullDescription,
        _fullDate: _fullDateString
      }]

      dbOpsFailedLinks.get.mockResolvedValueOnce()
      FeedFetcher.fetchFeed.mockResolvedValueOnce({ articleList: rawArticleList })
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response)
      expect(response.statusCode).toEqual(200)
      const data = JSON.parse(response._getData())
      expect(data).toEqual(expectedResponse)
    })
    it('returns the raw placeholders', async function () {
      const rawArticleList = [{
        title: 'title1',
        description: 'description1'
      }, {
        description: 'description2'
      }]
      for (let article of rawArticleList) {
        Article.mockImplementationOnce(function () {
          this.placeholders = Object.keys(article)
          for (const key in article) {
            this[key] = article[key]
          }
          this.getRawPlaceholders = () => (
            {
              test: 'val1',
              test2: 'val2'
            }
          )
        })
      }

      dbOpsFailedLinks.get.mockResolvedValueOnce()
      FeedFetcher.fetchFeed.mockResolvedValueOnce({ articleList: rawArticleList })
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response)
      expect(response.statusCode).toEqual(200)
      const data = JSON.parse(response._getData())
      for (const article of data) {
        expect(article['raw:test']).toEqual('val1')
        expect(article['raw:test2']).toEqual('val2')
      }
    })
    it('calls next(err) if feed fetch failed with unrecognized error', async function (done) {
      const error = new Error('azsfrwn5fc9 w45t 9834 b')
      dbOpsFailedLinks.get.mockResolvedValueOnce()
      FeedFetcher.fetchFeed.mockRejectedValueOnce(error)
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response, nextErr => {
        try {
          expect(nextErr).toEqual(error)
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
    it('returns empty array if there are no articles', async function () {
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      dbOpsFailedLinks.get.mockResolvedValueOnce()
      FeedFetcher.fetchFeed.mockResolvedValueOnce({ articleList: [] })
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response)
      expect(response.statusCode).toEqual(200)
      expect(JSON.parse(response._getData())).toEqual([])
    })
    it('returns 500 if connection failed', async function () {
      const error = new RequestError(1, 'Connection failed')
      dbOpsFailedLinks.get.mockResolvedValueOnce()
      FeedFetcher.fetchFeed.mockRejectedValueOnce(error)
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response)
      expect(response.statusCode).toEqual(500)
      expect(JSON.parse(response._getData()).message).toEqual(error.message)
    })
    it('returns 400 if invalid feed', async function () {
      const error = new FeedParserError(1, 'Not a valid feed')
      dbOpsFailedLinks.get.mockResolvedValueOnce()
      FeedFetcher.fetchFeed.mockRejectedValueOnce(error)
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response)
      expect(response.statusCode).toEqual(400)
      expect(JSON.parse(response._getData()).message).toEqual(error.message)
    })
    it('returns 400 if feed reached connection failure limit', async function () {
      dbOpsFailedLinks.get.mockResolvedValueOnce({ failed: '1231' })
      const request = httpMocks.createRequest({ session, params, source: {}, guildRss: {} })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.getFeedPlaceholders(request, response, console.log)
      expect(response.statusCode).toEqual(400)
    })
  })
  describe('DELETE /:feedID', function () {
    afterEach(function () {
      dbOpsGuilds.removeFeed.mockReset()
    })
    it('calls guildRss.removeFeed', async function (done) {
      const request = httpMocks.createRequest({ session, params, guildRss: {} })
      const response = httpMocks.createResponse()
      dbOpsGuilds.removeFeed.mockResolvedValueOnce(true)
      await guildFeedsRoute.routes.deleteFeed(request, response, nextErr => {
        if (nextErr) return done(nextErr)
        try {
          expect(dbOpsGuilds.removeFeed).toHaveBeenCalledTimes(1)
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
    it('calls next(err) if RedisGuild.utils.getValue fails', async function (done) {
      const request = httpMocks.createRequest({ session, params, guildRss: {} })
      const response = httpMocks.createResponse()
      const error = new Error('asd hsng ohdt')
      RedisGuild.utils.getValue.mockRejectedValueOnce(error)
      await guildFeedsRoute.routes.deleteFeed(request, response, nextErr => {
        try {
          expect(nextErr).toEqual(error)
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
    it('calls next(err) if guildRss.removeFeed fails', async function (done) {
      const request = httpMocks.createRequest({ session, params, guildRss: {} })
      const response = httpMocks.createResponse()
      const error = new Error('asd hsng ohdt')
      dbOpsGuilds.removeFeed.mockRejectedValueOnce(error)
      await guildFeedsRoute.routes.deleteFeed(request, response, nextErr => {
        try {
          expect(nextErr).toEqual(error)
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
  })

  describe('PATCH /:feedID', function () {
    afterEach(function () {
      RedisChannel.utils.isChannelOfGuild.mockReset()
      dbOpsGuilds.update.mockReset()
    })
    it('returns a 400 on invalid body keys', async function () {
      const body = { invalid1: 'ad', invalid2: null, invalid3: undefined, invalid4: 1, invalid5: [] }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.patchFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      for (const key in body) {
        expect(data.message).toHaveProperty(key)
        expect(data.message[key]).toEqual('Invalid setting')
      }
    })
    it('returns 400 on non-boolean valid but undefined/null keys in body', async function () {
      const body = { title: null, message: null, channel: undefined }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.patchFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      for (const key in body) {
        expect(data.message).toHaveProperty(key)
        expect(data.message[key]).toEqual('Must be defined')
      }
    })
    it('returns 400 on invalid body key types', async function () {
      const body = { title: false, message: [], channel: 123, checkTitles: 'asedgt', checkDates: [], imgPreviews: '123', imgLinksExistence: 1, formatTables: 1, toggleRoleMentions: 123 }
      const request = httpMocks.createRequest({ session, params, body })
      const response = httpMocks.createResponse()
      await guildFeedsRoute.routes.patchFeed(request, response)
      expect(response.statusCode).toEqual(400)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(400)
      for (const key in body) {
        expect(data.message).toHaveProperty(key)
        expect(data.message[key].startsWith('Invalid type')).toEqual(true)
      }
    })
    it('returns 403 if all keys are valid but channel is not part of guild', async function () {
      const body = { title: '123', message: '123', channel: '123', checkTitles: true, checkDates: true, imgPreviews: true, imgLinksExistence: true, formatTables: true, toggleRoleMentions: true }
      const request = httpMocks.createRequest({ session, params, body, source: {} })
      const response = httpMocks.createResponse()
      RedisChannel.utils.isChannelOfGuild.mockResolvedValueOnce(false)
      await guildFeedsRoute.routes.patchFeed(request, response)
      expect(response.statusCode).toEqual(403)
      const data = JSON.parse(response._getData())
      expect(data.code).toEqual(403)
      expect(data.message).toHaveProperty('channel')
      expect(data.message.channel).toEqual('Not part of guild')
    })
    it('adds to the source with non-empty keys', async function (done) {
      const body = { title: '123', channel: '123' }
      const source = { key: 'hoaa', doa: 'adf' }
      const request = httpMocks.createRequest({ session, params, body, source })
      const response = httpMocks.createResponse()
      RedisChannel.utils.isChannelOfGuild.mockResolvedValueOnce(true)
      await guildFeedsRoute.routes.patchFeed(request, response, nextErr => {
        if (nextErr) return done(nextErr)
        try {
          expect(source).toEqual({ ...source, ...body })
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
    it('does not apply key to source if they are equal to default', async function (done) {
      expect(guildFeedsRoute.constants.VALID_SOURCE_DEFAULTS.message).toBeDefined()
      expect(guildFeedsRoute.constants.VALID_SOURCE_DEFAULTS.checkTitles).toBeDefined()
      const body = { title: '123', message: guildFeedsRoute.constants.VALID_SOURCE_DEFAULTS.message, channel: '123', checkTitles: guildFeedsRoute.constants.VALID_SOURCE_DEFAULTS.checkTitles }
      const source = {}
      const expectedSource = {}
      for (const key in body) {
        if (key !== 'message' && key !== 'checkTitles') expectedSource[key] = body[key]
      }
      const request = httpMocks.createRequest({ session, params, body, source })
      const response = httpMocks.createResponse()
      RedisChannel.utils.isChannelOfGuild.mockResolvedValueOnce(true)
      await guildFeedsRoute.routes.patchFeed(request, response, nextErr => {
        if (nextErr) return done(nextErr)
        try {
          expect(source).toEqual(expectedSource)
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
    it('calls guildRss.update', async function (done) {
      const body = { title: '123', message: '123', channel: '123', checkTitles: true, checkDates: true, imgPreviews: true, imgLinksExistence: true, formatTables: true, toggleRoleMentions: true }
      const request = httpMocks.createRequest({ session, params, body, source: {} })
      const response = httpMocks.createResponse()
      RedisChannel.utils.isChannelOfGuild.mockResolvedValueOnce(true)
      await guildFeedsRoute.routes.patchFeed(request, response, nextErr => {
        if (nextErr) return done(nextErr)
        try {
          expect(dbOpsGuilds.update).toHaveBeenCalledTimes(1)
          done()
        } catch (err) {
          done(err)
        }
      })
      expect(response.statusCode).toEqual(200)
    })
  })
  // describe('GET /', function () {
  // afterEach(function () {
  //   redisOps.channels.getChannelsOfGuild.mockReset()
  //   redisOps.channels.getName.mockReset()
  // })
  // it('returns guild channels with their names', async function () {
  //   const request = httpMocks.createRequest({ session, params })
  //   const response = httpMocks.createResponse()
  //   const expectedResponse = [{ id: '1', name: 'name1' }, { id: '2', name: 'name2' }]
  //   redisOps.channels.getChannelsOfGuild.mockResolvedValueOnce([expectedResponse[0].id, expectedResponse[1].id])
  //   redisOps.channels.getName.mockResolvedValueOnce(expectedResponse[0].name)
  //   redisOps.channels.getName.mockResolvedValueOnce(expectedResponse[1].name)
  //   await channelsRoute.routes.getChannels(request, response)
  //   expect(response.statusCode).toEqual(200)
  //   const data = JSON.parse(response._getData())
  //   expect(data).toEqual(expectedResponse)
  // })
  // it('returns empty array if no channels found', async function () {
  //   const request = httpMocks.createRequest({ session, params })
  //   const response = httpMocks.createResponse()
  //   const expectedResponse = []
  //   redisOps.channels.getChannelsOfGuild.mockResolvedValueOnce(expectedResponse)
  //   await channelsRoute.routes.getChannels(request, response)
  //   expect(response.statusCode).toEqual(200)
  //   const data = JSON.parse(response._getData())
  //   expect(data).toEqual(expectedResponse)
  // })
  // })
})
