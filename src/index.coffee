
url   = require 'url'
{ _ } = require 'underscore'
uuid  = require('node-uuid').v4
raw   = require 'raw-stacktrace'
os    = require 'os'
request = require 'request'
util  = require './util'
zlib  = require 'zlib'

(->
  st = raw()
  st.on 'trace', (err, callsites) ->
    err.callsites = callsites
)()

ex = module.exports

#
# Events are passed as json packets to sentry servers
#
class Event
  constructor: (opts={}) ->
    @event_id = opts.event_id or uuid().replace /\-/g, ""
    @culprit  = opts.culprit if opts.culprit
    @message  = opts.message if opts.message
    @logger   = opts.logger if opts.logger
    @level       = opts.level if opts.level
    @server_name = opts.serverName or os.hostname()

    [ @timestamp ] = new Date().toISOString().split '.'

  http: (req) ->
    context = {}

    context.body   = req.body if req.body
    context.params = req.params if req.params
    context.session = req.session if req.session

    http =
      url: "#{ req.headers.origin }#{ req.url }"
      method: req.method
      data: context
      query_string: req.query
      cookies: req.cookies
      headers: req.headers
      env: process.env

    @interface "Http", http

  error: (err, cb) ->
    @exception err.name, err.message
    @stacktrace err, cb
    @

  stacktrace: (err, cb) ->
    util.buildStackTrace err, (err, frames) =>
      return cb err if err
      @interface "Stacktrace", frames
      cb null, frames
    @

  exception: (type, value) ->
    @interface "Exception", { type: type, value: value }
    @

  interface: (name, data) ->
    @["sentry.interfaces.#{ name }"] = data
    @


#
# Sends event packets to sentry servers
#
class Client
  constructor: (opts={}) ->
    if typeof opts is 'string'
      if opts is ""
        throw new Error "Invalid DSN"
      opts = util.parseDsn opts

    { uri, secret, projectId } = opts
    @uri       = uri
    @public    = opts["public"]
    @secret    = secret
    @projectId = projectId

    if not @uri or not @public or not @secret or not @projectId
      throw new Error("Invalid configuration")

  send: (event, cb) ->
    event.project = event.project or @projectId
    json = JSON.stringify event
    zlib.deflate json, (err, buff) =>
      return cb err if err
      encoded = buff.toString('base64')
      timestamp = new Date().getTime()
      sig = util.makeSignature timestamp, encoded, @secret
      authHead = util.makeAuthHeader sig, timestamp, @public, @projectId

      headers =
        'X-Sentry-Auth': authHead
        'Content-Type': 'application/octet-stream'
        'Content-Length': encoded.length

      uri = "#{ @uri }api/store/"

      request
        uri: uri
        headers: headers
        method: "POST"
        body: encoded
      , (err, resp, body) ->
        return cb and cb err, resp, body

  captureMessage: (message, cb) -> @send ex.buildMessage(message), cb
  captureError: (err, cb) ->
    ex.buildError err, (error, event) =>
      @send event, cb

ex.buildMessage = (message) ->
  event = new Event message: message
  event.interface "Message", message: message
  event

ex.buildError = (err, cb) ->
  event = new Event

  event.error err, (e, frames) ->
    if frames and frames.length > 0
      event.culprit = util.buildCulprit frames[0]
    else
      event.culprit = "Unknown" unless frames

    event.message = err.message or err
    cb and cb null, event

ex.Client = Client
ex.Event = Event
ex.util = util
