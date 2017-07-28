var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

var unpairedConnections = []; 	// socket objects of players not yet assigned to a game
var gameIdToGameState = {}; 	// maps game id to the state of the game
var socketIdToData = {};		// maps player socket ids to game data (current game id, opponent, username)
var lastGameId = 0; 			// most recent game id assigned
var size = 19;					// board size

var StateEnum = Object.freeze({EMPTY: 0, BLACK: 1, WHITE: -1});

app.set('port', process.env.PORT || 5000);
server.listen(app.get('port'), function() {
	console.log('Server is running on port ' + app.get('port'));
});

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket) {
	console.log('Socket connected');

	// Called when the user submits a username and intends to join the lobby
	socket.on('join lobby', function(username) {
		socketIdToData[socket.id] = {username: username};

		// Couldn't find a match, join the lobby and wait
		if (!tryPairUser()) {
			unpairedConnections.push(socket);
		}
	});

	// Called when one of the players sends a message
	socket.on('send message', function(data) {
		var opponent = socketIdToData[socket.id].opponent;
		opponent.emit('new message', data);
	})

	// Called when a player disconnects. Either removes them from
	// available matches or notifies their opponent they forfeited
	socket.on('disconnect', function(data) {
		if (contains(unpairedConnections, socket)) {
			// Player was in the lobby, no longer available to pair
			unpairedConnections.splice(unpairedConnections.indexOf(socket), 1);
		} else if (socket.id in socketIdToData) {
			// Player was in a game, notify their opponent
			var gameId = socketIdToData[socket.id].gameId;
			io.to(gameId).emit('opponent left');
		}

		console.log('Socket disconnected');
	});

	// Receives a game move from a player
	// 1. Updates the game state
	// 2. Notifies players of move 
	socket.on('place piece', function(data) {
		// get player game id
		var gameId = socketIdToData[socket.id].gameId;

		// update the game state
		setState(gameId, data.x, data.y, data.color);

		// notify the players ot the state change
		io.to(gameId).emit('piece placed', data);

		// checks if the player won by placing this piece down
		if (playerWon(gameId, data.x, data.y, data.color)) {
			gameOver();
		}
		// if there are pieces to remove
		else {
			var trapped = checkTrappedPieces(gameId, data.x, data.y, data.color);

			if (trapped) {
				// remove them locally
				setState(gameId, trapped.x1, trapped.y1, StateEnum.EMPTY);
				setState(gameId, trapped.x2, trapped.y2, StateEnum.EMPTY);

				// increment trapped count
				var count = incrementTrappedCount(gameId, data.color);

				// notify players to remove pieces
				io.to(gameId).emit('trapped pieces', 
					{
						x1: trapped.x1, 
						y1: trapped.y1, 
						x2: trapped.x2, 
						y2: trapped.y2, 
						color: trapped.color, 
						count: count
					}
				);

				// game is over if 5 pairs are trapped
				if (count == 5) {
					gameOver();
				}
			}
		}
	});

	// Notifies the players that the game is over
	// and the current socket won
	function gameOver() {
		socket.emit('game over', {won: true});

		// notify loser
		var opponent = socketIdToData[socket.id].opponent;
		opponent.emit('game over', {won: false});

		// TODO remove players from the game room
	}

	// Increments the count of the number of pairs color
	// has trapped, and returns the new count
	function incrementTrappedCount(gameId, color) {
		var gameState = gameIdToGameState[gameId];

		if (color == StateEnum.BLACK) {
			gameState.bTrapped = gameState.bTrapped + 1;
			return gameState.bTrapped;
		} else {
			gameState.wTrapped = gameState.wTrapped + 1;
			return gameState.wTrapped;
		}
	}

	// Checks if there are pieces that were just trapped as the result
	// of the placement of the piece at (x,y)
	function checkTrappedPieces(gameId, x, y, color) {
		var gameState = gameIdToGameState[gameId];

		var opponentColor = -1 * color;

		// north
		if (y-3 >= 0) {
			if (gameState[x][y-1] == opponentColor
				&& gameState[x][y-2] == opponentColor
				&& gameState[x][y-3] == color) {
				return {
					x1: x,
					y1: y-1,
					x2: x,
					y2: y-2,
					color: opponentColor
				};
			}
		}

		// north east
		if (y-3 >= 0 && x+3 < size) {
			if (gameState[x+1][y-1] == opponentColor
				&& gameState[x+2][y-2] == opponentColor
				&& gameState[x+3][y-3] == color) {
				return {
					x1: x+1,
					y1: y-1,
					x2: x+2,
					y2: y-2,
					color: opponentColor
				};
			}
		}

		// east
		if (x+3 < size) {
			if (gameState[x+1][y] == opponentColor
				&& gameState[x+2][y] == opponentColor
				&& gameState[x+3][y] == color) {
				return {
					x1: x+1,
					y1: y,
					x2: x+2,
					y2: y,
					color: opponentColor
				};
			}
		}

		// south east
		if (y+3 < size && x+3 < size) {
			if (gameState[x+1][y+1] == opponentColor
				&& gameState[x+2][y+2] == opponentColor
				&& gameState[x+3][y+3] == color) {
				return {
					x1: x+1,
					y1: y+1,
					x2: x+2,
					y2: y+2,
					color: opponentColor
				};
			}
		}

		// south
		if (y+3 < size) {
			if (gameState[x][y+1] == opponentColor
				&& gameState[x][y+2] == opponentColor
				&& gameState[x][y+3] == color) {
				return {
					x1: x,
					y1: y+1,
					x2: x,
					y2: y+2,
					color: opponentColor
				};
			}
		}

		// south west
		if (y+3 < size && x-3 >= 0) {
			if (gameState[x-1][y+1] == opponentColor
				&& gameState[x-2][y+2] == opponentColor
				&& gameState[x-3][y+3] == color) {
				return {
					x1: x-1,
					y1: y+1,
					x2: x-2,
					y2: y+2,
					color: opponentColor
				};
			}
		}

		// west
		if (x-3 >= 0) {
			if (gameState[x-1][y] == opponentColor
				&& gameState[x-2][y] == opponentColor
				&& gameState[x-3][y] == color) {
				return {
					x1: x-1,
					y1: y,
					x2: x-2,
					y2: y,
					color: opponentColor
				};
			}
		}

		// north west
		if (y-3 >= 0 && x-3 >= 0) {
			if (gameState[x-1][y-1] == opponentColor
				&& gameState[x-2][y-2] == opponentColor
				&& gameState[x-3][y-3] == color) {
				return {
					x1: x-1,
					y1: y-1,
					x2: x-2,
					y2: y-2,
					color: opponentColor
				};
			}
		}

		// no trapped pieces
		return undefined;
	}


	// Returns true if the player using color has won
	// by placing a piece at the (x, y) position in the
	// game corresponding to gameId, false otherwise
	function playerWon(gameId, x, y, color) {
		var gameState = gameIdToGameState[gameId];

		// Only need to check the space with a radius of 4
		for (let i = x-4; i <= x+4; i++) {
			for (let j = y-4; j <= y+4; j++) {			
				if (winningTrail(gameState, i, j, color)) {
					return true;
				}
			}
		}

		return false;
	}

	// Returns true if the current piece is the leftmost
	// piece in a trail of 5 of the same color
	// Only need to check down, right, diag up right, diag down right
	// If there is a trail of 5 and the current piece is not the left-most one,
	// we will eventually find the left most piece
	function winningTrail(board, x, y, color) {
		// Check for bounds
		if (x < 0 || y < 0 || x >= size || y >= size) {
			return false;
		}

		return checkDownTrail(board, x, y, color)
			|| checkRightTrail(board, x, y, color)
			|| checkUpRightTrail(board, x, y, color)
			|| checkDownRightTrail(board, x, y, color);
	}

	// Returns true if (x,y) is the start of a trail
	// of 5 same colored pieces downwards
	function checkDownTrail(board, x, y, color) {
		// bounds check
		if (y+4 >= size) {
			return false;
		}

		for (let i = 0; i <= 4; i++) {
			if (board[x][y+i] != color) {
				return false;
			}
		}

		return true;
	}

	// Returns true if (x,y) is the start of a trail of
	// 5 same colored pieces to the right
	function checkRightTrail(board, x, y, color) {
		// bounds check
		if (x+4 >= size) {
			return false;
		}

		for (let i = 0; i <= 4; i++) {
			if (board[x+i][y] != color) {
				return false;
			}
		}

		return true;
	}

	// Returns true if (x,y) is the start of a trail of 
	// 5 same colored pieces diag up right
	function checkUpRightTrail(board, x, y, color) {
		// bounds check
		if (x+4 >= size || y-4 < 0) {
			return false;
		}

		for (let i = 0; i <= 4; i++) {
			if (board[x+i][y-i] != color) {
				return false;
			}
		}

		return true;
	}

	// Returns true if (x,y) is the start of a trail of
	// 5 same colored pieces diag down right
	function checkDownRightTrail(board, x, y, color) {
		// bounds check
		if (x+4 >= size || y+4 >= size) {
			return false;
		}

		for (let i = 0; i <= 4; i++) {
			if (board[x+i][y+i] != color) {
				return false;
			}
		}

		return true;
	}

	// Sets the (x, y) position to color in the game state
	// corresponding to gameId
	function setState(gameId, x, y, color) {
		gameIdToGameState[gameId][x][y] = color;
	}

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

		// Adds the players to our player map
		socketIdToData[socket.id].gameId = gameId;
		socketIdToData[opponent.id].gameId = gameId;

		socketIdToData[socket.id].opponent = opponent;
		socketIdToData[opponent.id].opponent = socket;

		// Initializes the game state (local copy of board)
		var gameState = createGameState();
		gameIdToGameState[gameId] = gameState;

		// Adds players to the game room
		socket.join(gameId);
		opponent.join(gameId);

		// Tells each player we found a match and their opponent's username
		socket.emit('found match', {msg: socketIdToData[opponent.id].username, start: true});
		opponent.emit('found match', {msg: socketIdToData[socket.id].username, start: false});
	}

	// Creates a 2D array storing piece positions
	function createGameState() {
		var arr = new Array(size);

		for (i = 0; i < size; i++) {
			arr[i] = new Array(size);
			for (j = 0; j < size; j++) {
				arr[i][j] = StateEnum.EMPTY;
			}
		}

		arr.bTrapped = 0;
		arr.wTrapped = 0;

		return arr;
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