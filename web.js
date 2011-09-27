const path = require('path');
const url = require('url');

const _ = require('underscore');
const express = require('express');
const mongo = require('mongoskin');
const redis = require('redis');
const connectRedis = require('connect-redis')(express);
const everyauth = require('everyauth');
const FacebookClient = require('facebook-client').FacebookClient;

var db = mongo.db(process.env.MONGOLAB_URI);

var redisConnectSessionStore = (function() {
    var store;
    var redisURL = url.parse(process.env.REDISTOGO_URL);
    store = new connectRedis({
        port: redisURL.port,
        host: redisURL.hostname,
        pass: redisURL.auth.split(":")[1]
    });
    return store;
})();

everyauth.twitter
    .consumerKey(process.env.TWITTER_CONSUMER_KEY)
    .consumerSecret(process.env.TWITTER_CONSUMER_SECRET)
    //.apiHost(process.env.APIGEE_TWITTER_API_ENDPOINT)
    .entryPath('/connect/twitter')
    .redirectPath('/connect/twitter/callback')
    .findOrCreateUser(function (session, accessToken, accessTokenSecret, twitterUserMetadata) {
        console.log('Twitter connected for @' + twitterUserMetadata.screen_name);
        /*
        var twitter = db.collection('twitter');
        twitter.findOne({ id: twitterUserMetadata.id }, function(error, user) {
            if (!user) {
                user = twitterUserMetadata;
            } else {
                user = _.extend(user, twitterUserMetadata)
            }
            user.accessToken = accessToken;
            user.accessTokenSecret = accessTokenSecret;
            twitter.save(user);
        });
        */
        return(twitterUserMetadata);
    })

everyauth.facebook
    .appId(process.env.FACEBOOK_APP_ID)
    .appSecret(process.env.FACEBOOK_SECRET)
    //.apiHost(process.env.APIGEE_FACEBOOK_API_ENDPOINT)
    .scope('email,publish_actions'/* + ',user_likes,user_photos,user_photo_video_tags'*/)
    .entryPath('/connect/facebook')
    .redirectPath('/connect/facebook/callback')
    .findOrCreateUser(function(session, accessToken, accessTokenExtra, fbUserMetadata) {
        console.log('Facebook connected for /' + fbUserMetadata.username);
        /*
        var facebook = db.collection('facebook');
        facebook.findOne({ id: fbUserMetadata.id }, function(error, user) {
            if (!user) {
                user = fbUserMetadata;
            } else {
                user = _.extend(user, fbUserMetadata);
            }
            user.accessToken = accessToken;
            user.accessTokenExtra = accessTokenExtra;
            facebook.save(user);
        });
        */
        return(fbUserMetadata);
    })

var facebook = new FacebookClient();

var app = express.createServer(
    express.logger(),
    express.static(__dirname + '/public'),
    express.cookieParser(),
    express.bodyParser(),
    express.session({ secret: process.env.SESSION_SECRET || 'catchen@catchen.me', store: redisConnectSessionStore  }),
    function(request, response, next) {
        var method = request.headers['x-forwarded-proto'] || 'http';
        everyauth.twitter.myHostname(method + '://' + request.headers.host);
        everyauth.facebook.myHostname(method + '://' + request.headers.host);
        next();
    },
    everyauth.middleware(),
    require('facebook').Facebook(),
    express.errorHandler({ showStack: true, dumpExceptions: true })
);

app.set("view engine", "mustache");
app.set("views", path.join(__dirname, 'views'));
app.register(".mustache", require('stache'));

var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});

app.get('/', function(request, response) {
    response.render('index');
});

app.get('/home', function(request, response) {
    if (request.session.auth && request.session.auth.twitter) {
        response.render('home', {
            auth: request.session.auth,
            twitter: JSON.stringify(request.session.auth.twitter),
            facebook: request.session.auth.facebook ? JSON.stringify(request.session.auth.facebook) : ''
        });
    } else {
        response.redirect('/');
    }
});

app.get('/connect/twitter/callback', function(request, response, next) {
    var twitter = db.collection('twitter');
    var facebook = db.connection('facebook');
    var connections = db.collection('connections');
    
    twitter.findOne({ id: request.session.auth.twitter.user.id }, function(error, user) {
        if (error) { throw error; }
        if (!user) {
            user = request.session.auth.twitter;
        } else {
            user = _.extend(user, request.session.auth.twitter)
        }
        twitter.save(user, function(error, user) {
            if (error) { throw error; }
            connections.findOne({ twitter: request.session.auth.twitter.user.id }, function(error, connection) {
                if (error) { throw error; }
                if (connection) {
                    if (connection.facebook) {
                        facebook.findOne({ user: { id: connection.facebook }}, function(error, user) {
                            if (error) { throw error; }
                            if (user) {
                                request.session.auth.facebook = user;
                            }
                            response.redirect('/home');
                        });
                    } else {
                        response.redirect('/home');
                    }
                }
            });
        });
    });
});

app.get('/connect/facebook/callback', function(request, response, next) {
    var facebook = db.collection('facebook');
    var connections = db.collection('connections');
    
    facebook.findOne({ id: request.session.auth.facebook.user.id }, function(error, user) {
        if (error) { throw error; }
        if (!user) {
            user = request.session.auth.facebook;
        } else {
            user = _.extend(user, request.session.auth.facebook);
        }
        facebook.save(user, function(error, user) {
            if (error) { throw error; }
            connections.findOne({ twitter: request.session.auth.twitter.user.id }, function(error, connection) {
                if (error) { throw error; }
                if (!connection) {
                    connection = { twitter: request.session.auth.twitter.user.id };
                }
                connection.facebook = request.session.auth.facebook.user.id;
                connections.save(connection);
                response.redirect('/home');
            });
        });
    });
});
