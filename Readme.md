
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
  jd.Event.fromError(e, function(err, event){
    client.send(event, function(serr, resp, body) {
      console.log(serr, resp.statusCode, body);
    });
  });
});
```
