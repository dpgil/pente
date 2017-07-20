var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

var unpairedConnections = []; // socket objects of players not yet assigned to a game
var socketIdToUsername = {}; // maps socket ids to player username
var socketIdToGameId = {}; // maps player socket ids to game
var lastGameId = 0; // most recent game id assigned

app.set('port', process.env.PORT || 5000);
server.listen(app.get('port'), function() {
	console.log('Server is running on port ' + app.get('port'));
});

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket) {
	console.log('Socket connected');

	// Called when the user submits a username and intends to join the lobby
	socket.on('join lobby', function(username) {
		socketIdToUsername[socket.id] = username;

		// Couldn't find a match, join the lobby and wait
		if (!tryPairUser()) {
			unpairedConnections.push(socket);
		}
	});

	// Called when a player disconnects. Either removes them from
	// available matches or notifies their opponent they forfeited
	socket.on('disconnect', function(data) {
		if (contains(unpairedConnections, socket)) {
			// Player was in the lobby, no longer available to pair
			unpairedConnections.splice(unpairedConnections.indexOf(socket), 1);
		} else {
			// Player was in a game
			// TODO notify their opponent the player left
			var gameId = socketIdToGameId[socket.id];
			var message = socketIdToUsername[socket.id] + ' left the game.';
			io.to(gameId).emit('opponent left', {msg: message});
		}

		console.log('Socket disconnected');
	});

	// Array contains helper function
	function contains(array, item) {
		return array.indexOf(item) >= 0;
	}

	// Assigns a new game id
	function getGameId() {
		lastGameId = lastGameId + 1;
		return lastGameId;
	}

	// Matches current player with opponent who was waiting in the lobby
	function matchPlayer(opponent) {
		// Removes opponent from unpaired list
		unpairedConnections.splice(unpairedConnections.indexOf(opponent), 1);

		// Assigns a game id
		var gameId = getGameId();

		// Adds them to our player map
		socketIdToGameId[socket.id] = gameId;
		socketIdToGameId[opponent.id] = gameId;

		// Join the game room
		socket.join(gameId);
		opponent.join(gameId);

		// Tells each player we found a match and their opponent's username
		socket.emit('found match', {msg: socketIdToUsername[opponent.id]});
		opponent.emit('found match', {msg: socketIdToUsername[socket.id]});
	}

	// Tries to find a game match for the user that just connected
	function tryPairUser() {
		// If someone is waiting for a match, we have an opponent
		if (unpairedConnections.length > 0) {
			matchPlayer(unpairedConnections[0]);
			return true;
		} else {
			return false;
		}
	}
});