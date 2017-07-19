var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

connections = [];

app.set('port', process.env.PORT || 5000);
server.listen(app.get('port'), function() {
	console.log('Server is running on port ' + app.get('port'));
});

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');
});