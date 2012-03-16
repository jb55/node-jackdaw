
url   = require 'url'
{ _ } = require 'underscore'
uuid  = require('node-uuid').v4
raw   = require 'raw-stacktrace'
os    = require 'os'

(->
  trace = raw()
  trace.on 'trace', (err, callsites) ->
    err.callsites = callsites
)()

ex = module.exports

#
# Parses a dsn string:
#
#   https://public:secret@example.com/sentry/1
# 
# ... into a javascript object in the form:
#
#   uri: 'https://example.com/sentry'
#   publicKey: public
#   secretSecret: secret
#   projectId: 1
#
# This function throws exceptions if the parse fails in any way
#
ex.parseDsn = (dsn) ->
  { hostname, pathname, protocol, auth } = url.parse dsn
  [ publicKey, secretKey ] = auth.split ':'
  parsedPath            = pathname.split '/'

  if parsedPath.length is 0
    throw new Error 'Project id missing from dsn'

  projectId = +parsedPath.pop()

  if isNaN projectId
    throw new Error 'Project id is not a number'

  path         = parsedPath.join '/'
  hasProjectId = projectId?

  path      = ""   unless hasProjectId
  projectId = path unless hasProjectId

  uri: "#{ protocol or 'http' }//#{ hostname }/#{ path }"
  publicKey: publicKey
  secretKey: secretKey
  projectId: projectId


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

  @fromError: (err, message, cb) ->
    event = new Event

    unless cb
      cb = message
      message = null

    event.error err, (e, frames) ->
      return cb e if e
      event.culprit = util.buildCulprit frames[0]
      event.message = message or e.message
      cb null, event

  error: (err, cb) ->
    @exception err
    @stacktrace err, cb
    @

  stacktrace: (err, cb) ->
    util.buildStackTrace err, (err, frames) ->
      return cb err if err
      @interface "Stacktrace", frames
      cb null, frames
    @

  exception: (err) ->
    @interface "Exception", util.buildException err
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
      opts = parseDsn opts

    { uri, public, secret, projectId } = opts
    @uri       = uri
    @public    = public
    @secret    = secret
    @projectId = projectId

  @send: (event) ->

ex.Client = Client
ex.Event = Event
