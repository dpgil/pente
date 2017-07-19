var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

users = [];
connections = [];
connectionToUser = {};

app.set('port', process.env.PORT || 5000);
server.listen(app.get('port'), function() {
	console.log('Server is running on port ' + app.get('port'));
});

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket) {
	connections.push(socket);
	console.log('Connected: %s sockets connected', connections.length);

	socket.on('add user', function(username) {
		connectionToUser[socket] = username;
		users.push(username);
		io.sockets.emit('update users', {msg: users});
	});

	socket.on('disconnect', function(data) {
		users.splice(users.indexOf(socketToUsername[socket]), 1);
		io.sockets.emit('update users', {msg: users});

		connections.splice(connections.indexOf(socket), 1);
		console.log('Disconnected: %s sockets connected', connections.length);
	});
});