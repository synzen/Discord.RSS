const fetch = require('node-fetch')
const cloudscraper = require('cloudscraper') // For cloudflare
const config = require('../config.js')

module.exports = async (link, cookies) => {
  const options = {
    timeout: 15000,
    follow: 5,
    headers: {'user-agent': `Mozilla/5.0 ${link.includes('.tumblr.com') ? 'GoogleBot' : ''} (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36`}
  }
  if (cookies) options.cookies = cookies
  let endStatus

  const res = await fetch(link, options)
  endStatus = res.status

  if (res.status === 200) return res.body
  if (res.status === 403 || res.status === 400) {
    delete options.headers
    const res2 = await fetch(link, options)
    endStatus = res2.status
    if (res2.status === 200) return res2.body
  }

  const serverHeaders = res.headers.get('server')
  if (!serverHeaders || !serverHeaders.includes('cloudflare')) throw new Error(`Bad status code (${endStatus})`)

  // Cloudflare is used here
  if (config._vip) throw new Error(`Bad Cloudflare status code (${endStatus})`)

  return new Promise((resolve, reject) => {
    cloudscraper.get(link, (err, res, body) => { // For cloudflare
      if (err || res.statusCode !== 200) return reject(err || new Error(`Bad Cloudflare status code (${res.statusCode})`))
      let Readable = require('stream').Readable
      let feedStream = new Readable()
      feedStream.push(body)
      feedStream.push(null)
      resolve(feedStream)
    })
  })
}
