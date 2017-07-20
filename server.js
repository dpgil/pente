var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

var users = [];
var unpairedConnections = []; // socket ids of players not yet assigned to a game
var socketIdToUsername = {};
var lastGameId = 0; // most recent game id assigned
var socketIdToGameId = {}; // maps player socket ids to game

app.set('port', process.env.PORT || 5000);
server.listen(app.get('port'), function() {
	console.log('Server is running on port ' + app.get('port'));
});

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket) {
	unpairedConnections.push(socket);
	console.log('Connected: %s sockets connected', unpairedConnections.length);

	socket.join('lobby');

	socket.on('add user', function(username) {
		socketIdToUsername[socket.id] = username;
		users.push(username);
		io.to('lobby').emit('update users', {msg: users});
		//console.log(users);
		//console.log(socket)
		console.log(socket.id);
		tryPairUser();
	});

	socket.on('disconnect', function(data) {
		if (contains(unpairedConnections, socket)) {
			// Player is in the lobby
			users.splice(users.indexOf(socketIdToUsername[socket.id]), 1);
			unpairedConnections.splice(unpairedConnections.indexOf(socket), 1);
			io.to('lobby').emit('update users', {msg: users});
		} else {
			// Player is in a game
			// TODO notify their opponent the player left
			var gameId = socketIdToGameId[socket.id];
			var message = socketIdToUsername[socket.id] + ' left the game.';
			io.to(gameId).emit('opponent left', {msg: message});
		}

		console.log('Socket disconnected');
	});

	function contains(array, item) {
		return array.indexOf(item) >= 0;
	}

	function getGameId() {
		lastGameId = lastGameId + 1;
		return lastGameId;
	}

	// Matches two players in a game
	function matchPlayers(player1, player2) {
		// Removes them both from out unpaired list
		unpairedConnections.splice(unpairedConnections.indexOf(player1), 1);
		users.splice(users.indexOf(socketIdToUsername[player1.id]), 1);
		unpairedConnections.splice(unpairedConnections.indexOf(player2), 1);
		users.splice(users.indexOf(socketIdToUsername[player2.id]), 1);

		// Leave the lobby room
		player1.leave('lobby');
		player2.leave('lobby');

		// Assigns a game id
		var gameId = getGameId();

		// Adds them to our game to player map
		socketIdToGameId[player1.id] = gameId;
		socketIdToGameId[player2.id] = gameId;

		// Join the game room
		player1.join(gameId);
		player2.join(gameId);

		// Tells each player we found a match and their opponents username
		player1.emit('found match', {msg: socketIdToUsername[player2.id]});
		player2.emit('found match', {msg: socketIdToUsername[player1.id]});

		console.log('Paired players '+socketIdToUsername[player1.id]+' and '+socketIdToUsername[player2.id]);

	}

	// Tries to find a game match for the user that just connected
	function tryPairUser() {
		for (i = 0; i < unpairedConnections.length; i++) {
			// Found a player that is not itself
			if (unpairedConnections[i].id !== socket.id) {
				matchPlayers(socket, unpairedConnections[i]);
				return true;
			}
		}

		return false;
	}
});