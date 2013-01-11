
# node-jackdaw

A sentry client for node

# Example

```js
var jd     = require('jackdaw')
  , dsn    = process.env.SENTRY_DSN
  , client = new jd.Client(dsn)

//
// Log all uncaught exceptions to sentry
//
process.on('uncaughtException', function(e){
  client.captureError(e, function(err, resp, body){});
});
```
