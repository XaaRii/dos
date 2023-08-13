const debug = true;
var log = console.log;
console.log = function () {
	var first_parameter = arguments[0];
	var other_parameters = Array.prototype.slice.call(arguments, 1);
	function formatConsoleDate(date) {
		var hour = date.getHours();
		var minutes = date.getMinutes();
		var seconds = date.getSeconds();
		var milliseconds = date.getMilliseconds();
		return '[' +
			((hour < 10) ? '0' + hour : hour) +
			':' +
			((minutes < 10) ? '0' + minutes : minutes) +
			':' +
			((seconds < 10) ? '0' + seconds : seconds) +
			'.' +
			('00' + milliseconds).slice(-3) +
			'] ';
	}
	log.apply(console, [formatConsoleDate(new Date()) + first_parameter].concat(other_parameters));
};

const socket = io();

const lobbyInfo = document.getElementById('lobby-info');
const currentLobby = document.getElementById('current-lobby');
const userList = document.getElementById('user-list');
const leaveLobbyButton = document.getElementById('leave-lobby');
const startGameButton = document.getElementById('start-game');
const createLobbyForm = document.getElementById('create-lobby-form');
const usernameInput = document.getElementById('username');
const lobbyNameInput = document.getElementById('lobby-name');
const lobbyObject = document.getElementById('lobbyObject');
const gameObject = document.getElementById('gameObject');
const playerNameplates = document.getElementById('playerNameplates');
const playerHand = document.getElementById("playerHand");
const ownNameplate = document.getElementById('ownNameplate');

var username = "", isInLobby = false, myTurn = false, myOffset = -1;
const [totalXs, totalYs, width, height] = [15, 5, 1500, 750];
const [cardSpriteWidth, cardSpriteHeight] = [width / totalXs, height / totalYs];
var [skinCards, skinBack, emptyStock] = ["./assets/dev-cards.png", "./assets/dev-back.png", "./assets/empty-stock.png"];

createLobbyForm.addEventListener('submit', (e) => {
	e.preventDefault();
	if (isInLobby) {
		Swal.fire({
			title: 'You are already in a lobby',
			icon: 'error',
			text: 'you can\'t join another :/',
			timer: 3000,
			timerProgressBar: true,
			confirmButtonText: 'Alright'
		});
		return;
	}
	username = usernameInput.value;
	const lobbyName = lobbyNameInput.value;
	socket.emit('serverCreateLobby', lobbyName, username);
	lobbyNameInput.value = '';
});

leaveLobbyButton.addEventListener('click', () => {
	socket.emit('serverLeaveLobby');
});

startGameButton.addEventListener('click', () => {
	socket.emit('serverGameStart');
});

socket.on('clientLobbyList', (lobbies) => {
	if (debug) console.log("clientLobbyList", lobbies);
	const lobbyList = document.getElementById('lobby-list');
	lobbyList.innerHTML = '';
	if (lobbies.length < 1) return lobbyList.textContent = "No public lobbies... create one!";
	for (const lobby of lobbies) {
		const element = document.createElement('div');
		element.textContent = lobby.players.length + "/" + lobby.maxPlayers + " | " + lobby.name;
		if (lobby.players.length >= lobby.maxPlayers) element.className = "full";
		if (lobby.started === true) {
			element.className = "ongoing";
			element.style.opacity = 0.5;
		}
		else element.className = "";
		// element.id = lobby._id;
		lobbyList.appendChild(element);
		element.addEventListener('click', () => {
			if (element.className === "full" || element.className === "ongoing") return;
			if (isInLobby) {
				Swal.fire({
					title: 'You are already in a lobby',
					icon: 'error',
					text: 'you can\'t join another :/',
					timer: 3000,
					timerProgressBar: true,
					confirmButtonText: 'Alright'
				});
				return;
			}
			username = usernameInput.value
			if (!username) return Swal.fire({
				title: 'You must pick an username first.',
				confirmButtonText: 'Alright'
			});
			socket.emit('serverJoinLobby', lobby._id, username);
			isInLobby = true;
		});
	}
});

socket.on('clientEdit', (thing, value) => {
	if (debug) console.log('clientEdit', thing, value);
	switch (thing) {
		case "isInLobby":
			isInLobby = value;
			return;
		// case "usernameLock":
		// 	return usernameLock = value;
	}
})

socket.on('clientLeaveLobby', () => {
	if (debug) console.log("clientLeaveLobby");
	currentLobby.textContent = '';
	userList.innerHTML = '';
	lobbyInfo.classList.add("hidden");
	leaveLobbyButton.disabled = true;
	usernameInput.disabled = false; // temp
});

socket.on('clientPopup', async (object) => {
	if (debug) console.log("clientPopup", object);
	Swal.fire(object);
});


socket.on('clientJoinedLobby', () => {
	if (debug) console.log("clientJoinedLobby");
	lobbyInfo.classList.remove("hidden");
	leaveLobbyButton.disabled = false;
	usernameInput.disabled = true; // temp
	lobbyObject.classList.remove("hidden");
	gameObject.classList.add("hidden");
});


socket.on('clientUpdateLobby', (lobby) => {
	if (debug) console.log("clientUpdateLobby", lobby);
	if (lobby.name !== undefined) currentLobby.textContent = `Current Lobby: ${lobby.name}`;
	if (lobby.players !== undefined) {
		userList.innerHTML = '';
		for (let i = 0; i < lobby.players.length; i++) {
			const player = lobby.players[i];
			const playerElement = document.createElement('div');
			const playerText = document.createElement('span');
			playerText.className = 'player-name';
			if (!i) {
				startGameButton.disabled = false;
				startGameButton.classList.remove("hidden");
				playerText.textContent = "👑 ";
			}
			playerText.textContent += player.username;
			playerElement.appendChild(playerText);

			if (socket.id === lobby.players[0].sid && i) {
				const kickButton = document.createElement('button');
				kickButton.className = 'player-control';
				kickButton.textContent = 'Kick';
				kickButton.addEventListener('click', () => {
					socket.emit('serverLeaveLobby', player.username);
				});
				playerElement.appendChild(kickButton);
			}
			userList.appendChild(playerElement);
		}
		socket.id === lobby.players[0].sid ?
			startGameButton.classList.remove("hidden") :
			startGameButton.classList.add("hidden");
	}
	if (lobby.started !== undefined) {
		switch (lobby.started) {
			case false: // Game ends
				lobbyObject.classList.remove("hidden");
				gameObject.classList.add("hidden");
				myTurn = false;
				myOffset = -1;
				playerNameplates.innerHTML = '';
				// enable buttons, unlock lobby
				break;

			case true: // Game starts
				lobbyObject.classList.add("hidden");
				gameObject.classList.remove("hidden");
				// disable buttons, lock lobby

				// game setup
				drawPile.style.backgroundImage = `url(${skinBack})`;
				break;
		}
	}
});


const drawPile = document.getElementById('drawPile');
drawPile.addEventListener('click', async () => {
	if (!myTurn) return;
	socket.emit("serverGameUpdate", ("draw"));
});

const dropPile = document.getElementById('dropPile');

socket.on('clientGameUpdate', (info, hand) => {
	if (debug) console.log('clientGameUpdate', info, hand);
	//  const info = {
	//  	drawPileCount: 5, // cards left
	//  	dropPileLast: 40, // card index
	//  	currentPlayer: 1, // player index in array
	//  	animation: 40, // animation index (skip animation, reverse, swap cards etc)
	//  	players: [{
	//  		name: "Player1",
	//  		cards: 2,
	// 			nameplate: "dev"
	//  	}]
	//  }
	//  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

	if (info) {
		// drawPile
		drawPile.style.backgroundImage = info.drawPileCount > 0 ? `url(${skinBack})` : `url(${emptyStock})`;

		// dropPile
		dropPile.style.backgroundImage = `url(${skinCards})`;
		dropPile.style.backgroundSize = `${width}px ${height}px`;
		dropPile.style.backgroundRepeat = 'no-repeat';
		let [dpX, dpY] = [info.dropPileLast % totalXs, Math.floor(info.dropPileLast / totalXs)];
		dropPile.style.backgroundPosition = `-${dpX * cardSpriteWidth}px -${dpY * cardSpriteHeight}px`;

		// players
		playerNameplates.innerHTML = '';
		ownNameplate.innerHTML = '';
		const myOffset = info.players.findIndex(i => i.username === username);
		const players = myOffset === -1 ? info.players : info.players.slice(myOffset).concat(info.players.slice(0, myOffset));
		const correctCP = myOffset === -1 ? info.currentPlayerIndex : (info.currentPlayerIndex - myOffset + info.players.length) % info.players.length;
		for (let i = 0; i < players.length; i++) {
			let nameplate = document.createElement('div');
			nameplate.style.backgroundImage = `url("./assets/${players[i].nameplate}-nameplate.png")`;
			let nameplateName = document.createElement('span');
			nameplateName.classList.add('nameplateName');
			nameplateName.textContent = players[i].username;
			nameplate.appendChild(nameplateName);

			let nameplateCardCount = document.createElement('span');
			nameplateCardCount.classList.add('nameplateCardCount');
			nameplateCardCount.textContent = players[i].cardCount;
			nameplate.appendChild(nameplateCardCount);
			
			// currentPlayer highlight
			if (i !== correctCP) nameplate.style.opacity = 0.5;
			// if (i === correctCP) nameplate.classList.add('playing');
			
			if (!correctCP && myOffset > -1) myTurn = true;
			else myTurn = false;

			if (!i && myOffset > -1) ownNameplate.appendChild(nameplate);
			else playerNameplates.appendChild(nameplate);
		}
	}

	// Hand update
	if (hand) renderHand(hand);
})


function renderHand(cards) {
	playerHand.innerHTML = '';

	// left 2,5%+ offset   /* right 87.5%- offset */  limit
	const mysteriousNumber = Math.min(5, 90 / cards.length);  //  (baseOffset(95) - wanted result) / cards
	let offsetAmount = 95 - cards.length * mysteriousNumber;
	let cardOffset = "0%";

	for (let i = 0; i < cards.length; i++) {
		cardOffset = `calc(${offsetAmount / 2}% + ${i * mysteriousNumber}%)`;
		let card = document.createElement('div');
		card.className = 'card';

		card.style.backgroundImage = `url(${skinCards})`;
		card.style.backgroundSize = `${width}px ${height}px`;
		card.style.backgroundRepeat = 'no-repeat';
		let [cardX, cardY] = [cards[i] % totalXs, Math.floor(cards[i] / totalXs)];
		card.style.backgroundPosition = `-${cardX * cardSpriteWidth}px -${cardY * cardSpriteHeight}px`;

		card.style.left = cardOffset;
		card.style.zIndex = i;
		card.addEventListener('click', function () {
			// console.log(`You selected card: ${cards[i]}`);
			if (!myTurn) return;
			socket.emit("serverGameUpdate", "playCard", i);
		});
		playerHand.appendChild(card);
	}
}