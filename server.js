const debug = true;
require('console-stamp')(console);
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
var lobbySystem = require('./lobbySystem');
if (debug) lobbySystem.setDebug(true) & console.log("Debug mode enabled.");

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
	if (debug) console.log("A user connected at " + socket.handshake.address + " | " + socket.id);
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
			if (socket.id !== realLobby.players[0].sid) {
				socket.emit('clientEdit', 'isLobbyOwner', false);
				return socket.emit('clientPopup', {
					title: 'You are not a lobby owner',
					icon: 'error',
					text: 'so stop acting like one',
					confirmButtonText: 'OK'
				});
			}
			if (realLobby.started) return socket.emit('clientPopup', {
				title: 'Game is already running.',
				icon: 'info',
				confirmButtonText: 'OK'
			});

			await lobbySystem.startGame(lobbyCached._id);
			gameStart(lobbyCached, realLobby);
		} catch (err) {
			console.error(err);
		}

	})

	socket.on('serverGameRestart', async () => {
		if (debug) console.log("serverGameRestart");
		const lobbyCached = await sockLobby[socket.id];
		if (!lobbyCached) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}

		try {
			let lobbyList = lobbySystem.getLobbyList();
			let realLobby = await lobbyList.find(l => l._id === lobbyCached._id);
			if (!realLobby) return console.error("realLobby wasn't found on game start request");
			if (socket.id !== realLobby.players[0].sid) {
				socket.emit('clientEdit', 'isLobbyOwner', false);
				return socket.emit('clientPopup', {
					title: 'You are not a lobby owner',
					icon: 'error',
					text: 'so stop acting like one',
					confirmButtonText: 'OK'
				});
			}
			if (!realLobby.started) {
				socket.emit('clientEdit', 'gameStarted', false);
					return socket.emit('clientPopup', {
					title: 'There is currently no game running.',
					icon: 'info',
					confirmButtonText: 'OK'
				});
			}

			gameStart(lobbyCached, realLobby);
			return io.to(lobbyCached._id).emit('clientPopup', 'close');
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
				// is the player lobby owner?
				let lobbyList = lobbySystem.getLobbyList();
				let realLobby = await lobbyList.find(l => l._id === lobbyCached._id);
				if (!realLobby) return console.error("realLobby wasn't found on game update request");
				if (!realLobby.started) socket.emit('clientEdit', "gameStarted", false);
				else if (socket.id === realLobby.players[0].sid) {
					await lobbySystem.stopGame(lobbyCached._id);
					io.emit('clientLobbyList', lobbySystem.getLobbyList());
					io.to(lobbyCached._id).emit('clientEdit', 'gameStarted', false);
					io.to(lobbyCached._id).emit('clientPopup', 'close');
				}
				socket.emit('clientPopup', {
					title: 'That game is already over.',
					icon: 'error',
					confirmButtonText: 'OK'
				});
				return;
			}
			const cpi = currentGame.currentPlayerIndex;
			// can you play?
			if (socket.id !== currentGame.playerIDs[cpi].sid) return;
			if (currentGame.pendingAction === 1 && action !== 'colorPicker') return;
			if (currentGame.pendingAction === 2) return;

			const last = currentGame.dropPileLast;
			switch (action) {
				case "playCard": // sec = cardIndex in hand
					currentGame.pendingAction = 2;
					const chosenCard = currentGame.hands[cpi][sec];
					let [chosenX, chosenY] = [chosenCard % totalXs, Math.floor(chosenCard / totalXs)];
					let [lastX, lastY] = [last % totalXs, Math.floor(last / totalXs)];
					if (chosenX !== lastX && chosenY !== lastY && chosenCard <= 59) return currentGame.pendingAction = 0;
					currentGame.dropPileLast = chosenCard;
					currentGame.hands[cpi].splice(sec, 1);
					currentGame.players[cpi].cardCount = currentGame.hands[cpi].length;
					switch (chosenX) {
						case 0: playSpecialCard("black", currentGame); break;
						case 1: playSpecialCard("blackfour", currentGame); break;
						case 12: playSpecialCard("block", currentGame); break;
						case 13: playSpecialCard("reverse", currentGame); break;
						case 14: playSpecialCard("plustwo", currentGame); break;
						default: advanceTurn(currentGame); break;
					}
					break;

				case "draw": // sec = none
					currentGame.pendingAction = 2;
					await drawCards(currentGame, 1, 3);
					break;
				case "colorPicker": // sec = 0,1,2,3 (red, yellow, green, blue)
					console.log("colorpicker");
					if (last < 60) return;
					if (isNaN(sec) || sec < 0 || 3 < sec) return;
					console.log("colorpicker");
					const isFour = last === 61 ? 1 : 0;
					const picked = sec * totalXs + isFour;
					currentGame.dropPileLast = picked;
					socket.emit("clientEdit", "colorPicker", false);
					advanceTurn(currentGame, 21 + sec);
					if (!isFour) return;
					currentGame.pendingAction = 2;
					await drawCards(currentGame, 4);
					break;

				default:
					console.log("Unknown action played:", action, sec)
					break;
			}
		} catch (err) {
			console.error(err);
		}
	});

	function gameStart(lobbyCached, realLobby) {
		const startingCardCount = realLobby.modifiers.startingCardCount;
		const playerIDs = shuffle(realLobby.players); // [{ username: 'a', sid: 'b'}]
		const players = playerIDs.map(e => ({ // [{ username: 'a', cardCount: 0}]
			username: e.username,
			cardCount: startingCardCount,
			nameplate: 'dev'
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
			startedAt: new Date().getTime(),
			pendingAction: 0,
			direction: true,
			drawPile: drawPileCards,
			dropPileLast: dropPileLast,
			playerIDs: playerIDs,
			players: players,
			currentPlayerIndex: 0,
			hands: hands,
			lockin: [],
			spectators: [],
		};
		console.log("gameLobby[lobbyCached._id]:", gameLobby[lobbyCached._id]);
		io.emit('clientLobbyList', lobbySystem.getLobbyList());
		io.to(lobbyCached._id).emit('clientEdit', 'gameStarted', true);
		for (let i = 0; i < playerIDs.length; i++) {
			io.to(playerIDs[i].sid).emit('clientGameUpdate', {
				// (info)
				drawPileCount: drawPileCards.length,
				dropPileLast: dropPileLast,
				players: players,
				currentPlayerIndex: 0,
				direction: true,
				animation: 1 // animation index (skip animation, reverse, swap cards etc)
			}, hands[i]);
		}
	}
	async function playSpecialCard(type, currentGame) {
		if (debug) console.log("playSpecialCard", type);
		switch (type) {
			case "black":
				colorPicker(currentGame, false);
				break;

			case "blackfour":
				colorPicker(currentGame, true);
				break;

			case "block":
				nextPlayer(currentGame);
				advanceTurn(currentGame, 11);
				break;

			case "reverse":
				if (currentGame.direction) currentGame.direction = false;
				else currentGame.direction = true;
				if (currentGame.players.length === 2) {
					broadcastUpdate(currentGame, 12);
					handUpdate(currentGame);
					currentGame.pendingAction = 0;
				} else advanceTurn(currentGame, 12);
				break;

			case "plustwo":
				nextPlayer(currentGame);
				await drawCards(currentGame, 2, 13);
				break;

			default:
				console.log("Unknown special card type played:", type)
				break;
		}
	}

	function colorPicker(currentGame) {
		if (debug) console.log("colorPicker", currentGame);
		broadcastUpdate(currentGame, 20);
		handUpdate(currentGame);
		socket.emit("clientEdit", "colorPicker", true);
		currentGame.pendingAction = 1;
	}

	function advanceTurn(currentGame, action) {
		if (debug) console.log("advanceTurn", currentGame, action);
		nextPlayer(currentGame);
		broadcastUpdate(currentGame, action);
		currentGame.pendingAction = 0;
	}

	function broadcastUpdate(currentGame, action) {
		io.to(currentGame.id).emit('clientGameUpdate', {
			drawPileCount: currentGame.drawPile.length,
			dropPileLast: currentGame.dropPileLast,
			players: currentGame.players,
			lockin: currentGame.lockin,
			currentPlayerIndex: currentGame.currentPlayerIndex,
			direction: currentGame.direction,
			animation: action ?? 0
		});
	}

	async function drawCards(currentGame, times, animation) {
		const cpi = await currentGame.currentPlayerIndex;
		for (let i = 0; i < times; i++) {
			if (debug) console.log("drawCards", i);
			const drawnCard = await currentGame.drawPile.shift();
			await currentGame.hands[cpi].push(drawnCard);
			currentGame.players[cpi].cardCount = await currentGame.hands[cpi].length;
			if (i + 1 < times) {
				handUpdate(currentGame);
				broadcastUpdate(currentGame, 3);
				await new Promise(resolve => setTimeout(resolve, 500));
			} else advanceTurn(currentGame, animation);
		}
	}

	function nextPlayer(currentGame) {
		handUpdate(currentGame);
		// if end
		if (currentGame.hands[currentGame.currentPlayerIndex].length < 1) {
			if (currentGame.players.length < 3 || !currentGame.modifiers.fullGame) return endscreen(currentGame, currentGame.currentPlayerIndex);
			fullGameLockin(currentGame, currentGame.currentPlayerIndex);
		}

		if (currentGame.direction) currentGame.currentPlayerIndex + 1 >= currentGame.players.length ? currentGame.currentPlayerIndex = 0 : currentGame.currentPlayerIndex++;
		else currentGame.currentPlayerIndex - 1 < 0 ? currentGame.currentPlayerIndex = currentGame.players.length - 1 : currentGame.currentPlayerIndex--;
		if (debug) console.log("nextPlayer", currentGame.currentPlayerIndex);
	}

	function handUpdate(currentGame) {
		io.to(currentGame.playerIDs[currentGame.currentPlayerIndex].sid).emit('clientGameUpdate', undefined, currentGame.hands[currentGame.currentPlayerIndex]);
		if (debug) console.log("handUpdate", currentGame.currentPlayerIndex);
	}

	async function endscreen(currentGame, who) {
		broadcastUpdate(currentGame, 97);
		const scrb = [...currentGame.lockin, currentGame.players[who]];
		await removeFromPlaying(currentGame, who);
		if (currentGame.players.length > 1) {
			await handsPointsCount(currentGame.hands);
			currentGame.players = await currentGame.players.map((player, index) => {
				return {
					...player, // username, cardCount
					handPoints: currentGame.hands[index]
				};
			});
			await currentGame.players.sort((a, b) => a.handPoints - b.handPoints);
		}
		scrb.push(...currentGame.players);
		io.to(currentGame.id).emit("clientEdit", "endscreen", {
			gameTime: msIntoTime(new Date().getTime() - currentGame.startedAt),
			scoreboard: scrb
		});
		gameLobby[currentGame.id] = undefined;
	}

	async function handsPointsCount(hands) {
		for (let i = 0; i < hands.length; i++) {
			let points = 0;
			await hands[i].map(card => {
				card = card % 15;

				if (card < 2) return points += 50;
				if (card > 11) return points += 20;
				return points += card - 2;
			});
			hands[i] = points;
		}
	}

	function fullGameLockin(currentGame, who) {
		new Promise(async resolve => {
			await currentGame.lockin.push(currentGame.players[who]);
			broadcastUpdate(game, 95);
			await removeFromPlaying(currentGame, who);
			return resolve;
		});
	}

	async function removeFromPlaying(currentGame, who) {
		await currentGame.playerIDs.splice(who, 1);
		await currentGame.players.splice(who, 1);
		await currentGame.hands.splice(who, 1);
	}

	socket.on('serverGameStop', async () => {
		if (debug) console.log("serverGameStop");
		const lobbyCached = await sockLobby[socket.id];
		if (!lobbyCached) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}
		try {
			let lobbyList = lobbySystem.getLobbyList();
			let realLobby = await lobbyList.find(l => l._id === lobbyCached._id);
			if (!realLobby) return console.error("realLobby wasn't found on game stop request");
			if (socket.id !== realLobby.players[0].sid) {
				socket.emit('clientEdit', 'isLobbyOwner', false);
				return socket.emit('clientPopup', {
					toast: true,
					title: 'You are not a lobby owner',
					icon: 'error',
					text: 'so stop acting like one',
					confirmButtonText: 'OK'
				});
			}
			if (realLobby.started) await lobbySystem.stopGame(lobbyCached._id);
			else socket.emit('clientPopup', {
					title: 'There is currently no game running.',
					icon: 'info',
					confirmButtonText: 'OK'
				});
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			io.to(lobbyCached._id).emit('clientEdit', 'gameStarted', false);
			io.to(lobbyCached._id).emit('clientPopup', 'close');
			gameLobby[lobbyCached._id] = undefined;
		} catch (err) {
			console.error(err);
		}
	});

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
			} else {
				const result = await lobbySystem.removeUser(lobbyCached._id, uname, socket.id);
				// if (debug) console.log("getLobbyList()", lobbySystem.getLobbyList());
				io.emit('clientLobbyList', lobbySystem.getLobbyList());
				await socket.leave(lobbyCached._id);
				await socket.emit('clientLeaveLobby');
				await socket.emit('clientEdit', 'isInLobby', false);
				io.to(lobbyCached._id).emit('clientUpdateLobby', result);
				delete sockLobby[socket.id];
			}
			const game = await gameLobby[lobbyCached._id];
			if (!game) return;
			const index = await game.playerIDs.findIndex(p => p.username === uname);
			if (index < 0) return;
			await removeFromPlaying(game, index);
			broadcastUpdate(game, 99);
			if (game.dropPileLast < 60) return;
			const isFour = game.dropPileLast === 61 ? 1 : 0;
			game.dropPileLast = Math.floor(Math.random() * 3) * totalXs + isFour;
			broadcastUpdate(game, 21 + game.dropPileLast / totalXs - isFour);
		} catch (err) {
			return console.error(err);
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
			if (!game && lobby.started) {
				if (socket.id !== lobby.players[0].sid) return;
				await lobbySystem.stopGame(lobby._id);
				io.emit('clientLobbyList', lobbySystem.getLobbyList());
				io.to(lobby._id).emit('clientEdit', 'gameStarted', false);
				return;
			}
			if (!game) return;
			const index = await game.playerIDs.findIndex(n => n.sid === socket.id);
			if (index < 0) return;
			await removeFromPlaying(game, index);
			broadcastUpdate(game, 99);
			if (game.dropPileLast < 60) return;
			const isFour = game.dropPileLast === 61 ? 1 : 0;
			game.dropPileLast = Math.floor(Math.random() * 3) * totalXs + isFour;
			broadcastUpdate(game, 21 + game.dropPileLast / totalXs - isFour);
		}
	});
});

process.on('unhandledRejection', (reason) => {
	console.log('unhandledRejection', reason);
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

function msIntoTime(ms) {
	var totalSeconds = Math.floor(ms / 1000);
	var minutes = Math.floor(totalSeconds / 60);
	var seconds = totalSeconds % 60;

	// Pad the minutes and seconds with leading zeros, if required
	minutes = (minutes < 10) ? '0' + minutes : minutes;
	seconds = (seconds < 10) ? '0' + seconds : seconds;
	return minutes + ':' + seconds;
}