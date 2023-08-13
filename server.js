const debug = true;
require('console-stamp')(console);
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
var lobbySystem = require('./lobbySystem');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

/// REPL
const repl = require('repl');
const r = repl.start({ prompt: '', useColors: true });
r.context.debug = debug; r.context.server = server; r.context.io = io;
r.context.lobbySystem = lobbySystem;
r.context.sock = [];
///

const port = 3000, totalXs = 15;
const validStartCards = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56];
const validCardSet = [...validStartCards, 12, 13, 14, 27, 28, 29, 42, 43, 44, 57, 58, 59, 60, 60, 61, 61];
var sockLobby = [];
var gameLobby = [];
// lobbySystem.lobbyList = []
if (debug) r.context.sockLobby = sockLobby; /// REPL
if (debug) r.context.gameLobby = gameLobby; /// REPL

io.on('connection', (socket) => {
	if (debug) console.log('A user connected at ' + socket.handshake.address + " | " + socket.id);
	if (debug) r.context.sock[socket.id] = socket; /// REPL
	socket.emit('clientLobbyList', lobbySystem.getLobbyList());

	socket.on('serverGameStart', async () => {
		if (debug) console.log("serverGameStart");
		const lobbyCached = await sockLobby[socket.id];
		if (!lobbyCached) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}

		try {
			let lobbyList = lobbySystem.getLobbyList();
			let realLobby = await lobbyList.find(l => l._id === lobbyCached._id);
			if (!realLobby) return console.error("realLobby wasn't found on game start request");
			if (realLobby.started) return socket.emit('clientPopup', {
				title: 'Game is already running.',
				icon: 'info',
				confirmButtonText: 'OK'
			});
			if (socket.id !== realLobby.players[0].sid) return socket.emit('clientPopup', {
				title: 'You are not a lobby owner',
				icon: 'error',
				text: 'so stop acting like one',
				confirmButtonText: 'OK'
			});

			await lobbySystem.startGame(lobbyCached._id);
			const startingCardCount = realLobby.modifiers.startingCardCount;
			const playerIDs = shuffle(realLobby.players); // [{ username: "a", sid: "b"}]
			const players = playerIDs.map(e => ({ // [{ username: "a", cardCount: 0}]
				username: e.username,
				cardCount: startingCardCount,
				nameplate: "dev"
			}))
			let drawPileCards = shuffle([...validCardSet, ...validCardSet]);
			const dropPileLast = validStartCards[Math.floor(Math.random() * validStartCards.length)]
			const hands = players.map(() => {
				let hand = drawPileCards.splice(0, startingCardCount);
				if (hand.length < startingCardCount) {
					drawPileCards = shuffle([...validCardSet, ...validCardSet]);
					hand = drawPileCards.splice(0, startingCardCount);
				}
				return hand;
			})
			gameLobby[lobbyCached._id] = {
				id: lobbyCached._id,
				modifiers: realLobby.modifiers,
				drawPile: drawPileCards,
				dropPileLast: dropPileLast,
				playerIDs: playerIDs,
				players: players,
				currentPlayerIndex: 0,
				hands: hands
			};
			console.log("gameLobby[lobbyCached._id]:", gameLobby[lobbyCached._id]);
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			io.to(lobbyCached._id).emit('clientUpdateLobby', { started: true });
			for (let i = 0; i < playerIDs.length; i++) {
				io.to(playerIDs[i].sid).emit('clientGameUpdate', {
					// (info)
					drawPileCount: drawPileCards.length,
					dropPileLast: dropPileLast,
					players: players,
					currentPlayerIndex: 0,
					animation: 1 // animation index (skip animation, reverse, swap cards etc)
				}, hands[i]);
			}
		} catch (err) {
			console.error(err);
		}

	})
	socket.on('serverGameUpdate', async (action, sec) => {
		if (debug) console.log("serverGameUpdate", action, sec);
		const lobbyCached = await sockLobby[socket.id];
		if (!lobbyCached) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}
		try {
			const currentGame = await gameLobby[lobbyCached._id];
			if (!currentGame) {
				socket.emit('clientUpdateLobby', { started: false });
				return socket.emit('clientPopup', {
					title: 'This game is already over.',
					icon: 'error',
					confirmButtonText: 'OK'
				});
			}
			const cpi = currentGame.currentPlayerIndex;

			// if not your turn, return
			if (socket.id !== currentGame.playerIDs[cpi].sid) return;

			switch (action) {
				case "playCard": // sec = cardIndex in hand
					const chosenCard = currentGame.hands[cpi][sec];
					const last = currentGame.dropPileLast;
					let [chosenX, chosenY] = [chosenCard % totalXs, Math.floor(chosenCard / totalXs)];
					let [lastX, lastY] = [last % totalXs, Math.floor(last / totalXs)];
					if (chosenX === lastX || chosenY === lastY || chosenCard > 59) {
						currentGame.dropPileLast = chosenCard;
						currentGame.hands[cpi].splice(sec, 1);
						currentGame.players[cpi].cardCount = currentGame.hands[cpi].length;
						advanceTurn(currentGame);
					}
					break;

				case "draw": // sec = none
					let drawnCard = currentGame.drawPile.shift();
					currentGame.hands[cpi].push(drawnCard);
					currentGame.players[cpi].cardCount = currentGame.hands[cpi].length;
					advanceTurn(currentGame);
					break;

				default:
					console.log("Unknown action played:", action, sec)
					break;
			}
		} catch (err) {
			console.error(err);
		}
	});

	function advanceTurn(currentGame, action) {
		if (debug) console.log("advanceTurn", currentGame, action);
		if (action !== 99) {
			// update client hand
			io.to(currentGame.playerIDs[currentGame.currentPlayerIndex].sid).emit('clientGameUpdate', undefined, currentGame.hands[currentGame.currentPlayerIndex]);
			
			// next player
			currentGame.currentPlayerIndex + 1 >= currentGame.players.length ? currentGame.currentPlayerIndex = 0 : currentGame.currentPlayerIndex++;
		}

		// broadcast game info
		io.to(currentGame.id).emit('clientGameUpdate', {
			drawPileCount: currentGame.drawPile.length,
			dropPileLast: currentGame.dropPileLast,
			players: currentGame.players,
			currentPlayerIndex: currentGame.currentPlayerIndex,
			animation: action ?? 0
		});
	}

	socket.on('serverRefreshLobby', async () => {
		if (debug) console.log("serverRefreshLobby");
		if (debug) console.log(lobbySystem.getLobbyList());
		socket.emit('clientLobbyList', lobbySystem.getLobbyList());
	});

	socket.on('serverCreateLobby', async (lobbyName, username) => {
		if (debug) console.log("createLobby", lobbyName, username);
		if (sockLobby[socket.id]) {
			socket.emit('clientPopup', {
				title: 'You are already in a lobby',
				icon: 'error',
				text: 'you can\'t join another :/',
				timer: 3000,
				timerProgressBar: true,
				confirmButtonText: 'Alright'
			});
			socket.emit('clientEdit', 'isInLobby', true);
			return;
		}
		try {
			const newLobby = await lobbySystem.createLobby(lobbyName, username, 4);
			joinLobby(newLobby._id, username);
		} catch (err) {
			console.error('Error creating lobby:', err);
		}
	});

	socket.on('serverJoinLobby', async (lobbyId, username) => {
		if (debug) console.log("serverJoinLobby");
		joinLobby(lobbyId, username);
	});
	async function joinLobby(lobbyId, username) {
		if (debug) console.log("server joinLobby function");
		socket.username = username.length > 0 ? username : socket.id; // to be changed
		if (sockLobby[socket.id]) {
			socket.emit('clientPopup', {
				title: 'You are already in a lobby',
				icon: 'error',
				text: 'you can\'t join another :/',
				timer: 3000,
				timerProgressBar: true,
				confirmButtonText: 'Alright'
			});
			socket.emit('clientEdit', 'isInLobby', true);
			return;
		}
		try {
			const result = await lobbySystem.addUser(lobbyId, username, socket.id);
			sockLobby[socket.id] = result;
			if (debug) console.log("sockLobby[socket.id]", result);
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			socket.join(lobbyId);
			io.to(lobbyId).emit('clientUpdateLobby', result);
			socket.emit('clientJoinedLobby');
		} catch (err) {
			if (debug) console.log("joinLobbyError:", err);
			switch (err) {
				case "errorLobbyNotFound":
					return socket.emit('clientPopup', {
						title: 'Something\'s wrong...',
						icon: 'error',
						text: 'this lobby doesn\'t seem to exist anymore, sorry',
						confirmButtonText: 'OK'
					});
				case "errorLobbyFull":
					return socket.emit('clientPopup', {
						title: 'This lobby is full already.',
						icon: 'info',
						confirmButtonText: 'OK',
						timer: 3000,
						timerProgressBar: true
					});
				case "errorUsernameExists":
					socket.emit('clientEdit', 'isInLobby', false);
					return socket.emit('clientPopup', {
						title: 'Doopleganger?',
						icon: 'question',
						text: 'someone with the same username is already in the lobby...',
						confirmButtonText: 'OK'
					});
				default:
					return socket.emit('clientPopup', {
						title: 'Something unexpected happened.',
						icon: 'error',
						text: 'Report this to website administrator',
						confirmButtonText: 'OK'
					});
			}
		}
	}

	socket.on('serverLeaveLobby', async (who) => {
		if (debug) console.log("serverLeaveLobby", who);
		const lobbyCached = await sockLobby[socket.id];
		if (!lobbyCached) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}
		const uname = who === undefined ? socket.username : who;
		try {
			if (who !== undefined) {
				let lobbyList = lobbySystem.getLobbyList();
				let realLobby = await lobbyList.find(l => l._id === lobbyCached._id);
				if (!realLobby) return console.error("realLobby wasn't found on player kick");
				if (socket.id !== realLobby.players[0].sid) {
					return socket.emit('clientPopup', {
						title: 'You are not a lobby owner',
						icon: 'error',
						text: 'so stop acting like one',
						confirmButtonText: 'OK'
					});
				}
				let player = await realLobby.players.find(p => p.username === uname);
				if (player) {
					const result = await lobbySystem.removeUser(lobbyCached._id, uname, player.sid);
					io.emit('clientLobbyList', lobbySystem.getLobbyList());
					await io.sockets.sockets.get(player.sid).leave(lobbyCached._id);
					await io.to(player.sid).emit('clientLeaveLobby');
					await io.to(player.sid).emit('clientEdit', 'isInLobby', false);
					io.to(player.sid).emit('clientPopup', {
						title: 'You were kicked from the lobby',
						icon: 'info',
						confirmButtonText: 'OK'
					});
					io.to(lobbyCached._id).emit('clientUpdateLobby', result);
					delete sockLobby[player.sid];
				}
				return;
			}
			const result = await lobbySystem.removeUser(lobbyCached._id, uname, socket.id);
			// if (debug) console.log("getLobbyList()", lobbySystem.getLobbyList());
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			await socket.leave(lobbyCached._id);
			await socket.emit('clientLeaveLobby');
			await socket.emit('clientEdit', 'isInLobby', false);
			io.to(lobbyCached._id).emit('clientUpdateLobby', result);
			delete sockLobby[socket.id];
			return;
		} catch (err) {
			console.error(err);
		}
	});

	socket.on('disconnect', async () => {
		if (debug) console.log('A user disconnected at ' + socket.handshake.address + " | " + socket.id);
		if (sockLobby[socket.id]) {
			const lobby = await sockLobby[socket.id];
			const result = await lobbySystem.removeUser(lobby._id, socket.username, socket.id);
			const game = await gameLobby[lobby._id];
			if (debug) console.log(lobbySystem.getLobbyList());
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			await io.to(lobby._id).emit('clientUpdateLobby', result);
			delete sockLobby[socket.id];
			if (!game) return;
			const index = await game.playerIDs.findIndex(n => n.sid === socket.id);
			if (index < 0) return;
			await gameLobby[lobby._id].playerIDs.splice(index, 1);
			await gameLobby[lobby._id].players.splice(index, 1);
			await gameLobby[lobby._id].hands.splice(index, 1);
			advanceTurn(gameLobby[lobby._id], 99);
			if (debug) console.log("disconnect gameLobby[lobby._id]:", gameLobby[lobby._id]);

		}
	});
});

app.use(express.static('public'));

server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});

function shuffle(array) {
	let newArray = [...array];
	for (let i = newArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
	}
	return newArray;
}