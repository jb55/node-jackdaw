
all: index.js

index.js: index.coffee
	coffee -c index.coffee
