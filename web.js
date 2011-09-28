require.paths.unshift(__dirname + '/lib');

const path = require('path');
const url = require('url');

const _ = require('underscore');
const express = require('express');
const mongo = require('mongoskin');
const redis = require('redis');
const connectRedis = require('connect-redis')(express);
const everyauth = require('everyauth');
const FacebookClient = require('facebook-client').FacebookClient;
var uuid = require('node-uuid');

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
        console.log('Twitter Access Token: ' + accessToken);
        console.log('Twitter Access Token Secret: ' + accessTokenSecret);
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
        return(fbUserMetadata);
    })

var facebook = new FacebookClient();

var app = express.createServer();

app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.session({ secret: process.env.SESSION_SECRET || 'catchen@catchen.me', store: redisConnectSessionStore  }));
app.use(function(request, response, next) {
    var method = request.headers['x-forwarded-proto'] || 'http';
    everyauth.twitter.myHostname(method + '://' + request.headers.host);
    everyauth.facebook.myHostname(method + '://' + request.headers.host);
    next();
});
app.use(everyauth.middleware());
app.use(require('facebook').Facebook());
app.use(app.router);
app.use(express.static(__dirname + '/public'));
app.use(express.errorHandler({ showStack: true, dumpExceptions: true }));

app.set("view engine", "mustache");
app.set("views", path.join(__dirname, 'views'));
app.register(".mustache", require('stache'));

var port = process.env.PORT || 3000;

app.listen(port, function() {
  console.log("Listening on " + port);
});

var io = require('socket.io').listen(app);

app.get('/', function(request, response) {
    response.render('index');
});

app.get('/home', function(request, response) {
    if (request.session.auth && request.session.auth.twitter) {
        var socketId = uuid();
        
        streams.retrieve(request.session.auth.twitter.user.id, function(stream) {
            if (stream) {
                stream.on('data', function (data) {
                    sockets.sent(socketId, 'data', data);
                });
            }
        });
        
        response.render('home', {
            twitter: request.session.auth.twitter,
            facebook: request.session.auth.facebook,
            twitterString: JSON.stringify(request.session.auth.twitter),
            facebookString: request.session.auth.facebook ? JSON.stringify(request.session.auth.facebook) : '',
            socketId: socketId
        });
    } else {
        response.redirect('/');
    }
});

app.get('/disconnect', function(request, response) {
    request.session.destroy();
    response.redirect('/');
});

app.get('/connect/twitter/callback', function(request, response, next) {
    var twitter = db.collection('twitter');
    var facebook = db.collection('facebook');
    var connections = db.collection('connections');
    
    twitter.findOne({ 'user.id': request.session.auth.twitter.user.id }, function(error, user) {
        if (error) { next(error); }
        user = _.extend(user || {}, request.session.auth.twitter)
        twitter.save(user, function(error, user) {
            if (error) { next(error); }
            connections.findOne({ twitter: request.session.auth.twitter.user.id }, function(error, connection) {
                if (error) { next(error); }
                if (connection) {
                    if (connection.facebook) {
                        facebook.findOne({ 'user.id': connection.facebook }, function(error, user) {
                            if (error) { next(error); }
                            if (user) {
                                request.session.auth.facebook = user;
                            }
                            response.redirect('/home');
                        });
                    } else {
                        response.redirect('/home');
                    }
                } else {
                    response.redirect('/home');
                }
            });
        });
    });
});

app.get('/connect/facebook/callback', function(request, response, next) {
    var facebook = db.collection('facebook');
    var connections = db.collection('connections');
    
    facebook.findOne({ 'user.id': request.session.auth.facebook.user.id }, function(error, user) {
        if (error) { next(error); }
        user = _.extend(user || {}, request.session.auth.facebook);
        facebook.save(user, function(error, user) {
            if (error) { next(error); }
            connections.findOne({ twitter: request.session.auth.twitter.user.id }, function(error, connection) {
                if (error) { next(error); }
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

var streams = (function(db) {
    const twitterStreamingClient = require('twitter-streaming-client');
    
    var twitter = db.collection('twitter');
    twitter.findItems({}, function(error, users) {
        if (error) throw error;
        _.each(users, function(user) {
            twitterStreamingClient.connect(user.user.id, user.accessToken, user.accessTokenSecret);
        });
    });
    
    return twitterStreamingClient;
})(db);

var sockets = (function(io) {
    var sockets = {};
    
    io.sockets.on('connection', function(socket) {
        socket.on('auth', function(socketId) {
            console.log('socket connected: ' + socketId)
            sockets[socketId] = socket;
            socket.set('socketId', socketId);
        });
        
        socket.on('disconnect', function() {
            socket.get('socketId', function(error, socketId) {
                console.log('socket disconnected: ' + socketId);
                delete sockets[socketId];
            });
        });
    });
    
    var manager = {
        send: function(socketId, name, data) {
            var socket = sockets[socketId];
            if (socket) {
                socket.emit(name, data);
            }
        }
    }
})(io);
