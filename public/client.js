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
var isInLobby = false;

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
	const username = usernameInput.value;
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
		else element.className = "";
		// element.id = lobby._id;
		lobbyList.appendChild(element);
		element.addEventListener('click', () => {
			// if (element.className === "full") return;
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
			const username = usernameInput.value
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
				/*
				const makeLeaderButton = document.createElement('button');
				makeLeaderButton.className = 'player-control';
				makeLeaderButton.textContent = 'Make Leader';
				makeLeaderButton.addEventListener('click', () => {
					// logic // useless atm
				});
				playerElement.appendChild(makeLeaderButton);
				*/
			}
			userList.appendChild(playerElement);
		}
		socket.id === lobby.players[0].sid ?
			startGameButton.classList.remove("hidden") :
			startGameButton.classList.add("hidden");
	}
	if (lobby.started !== undefined) {
		switch (lobby.started) {
			case true:
				// hide shit, disable buttons
				break;

			case false:
				// show shit, enable buttons
				break;
		}
	}
});


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
});


const addC = document.getElementById('addC'); // temp
const remC = document.getElementById('remC'); // temp
const hand = [];
addC.addEventListener('click', async () => {
	hand.push(Math.floor(Math.random() * 55));
	renderHand(hand);
});
remC.addEventListener('click', async () => {
	if (hand.length < 1) return;
	await hand.pop();
	renderHand(hand);
});

function renderHand(cards) {
	const playerHand = document.getElementById("playerHand");
	playerHand.innerHTML = '';

	// left 2,5%+ offset   /* right 87.5%- offset */  limit
	const mysteriousNumber = Math.min(5, 90 / cards.length);  //  (baseOffset(95) - wanted result) / cards
	let offsetAmount = 95 - cards.length * mysteriousNumber;
	let cardOffset = "0%";
		
	const [ totalXs, totalYs, width, height ] = [ 10, 6, 1000, 900 ]
	const cardSpriteWidth = width / totalXs;
	const cardSpriteHeight = height / totalYs;
	const spritePath = "./assets/dev-cards.png";
	
	for (let i = 0; i < cards.length; i++) {
		cardOffset = `calc(${offsetAmount / 2}% + ${i * mysteriousNumber}%)`;
		let card = document.createElement('div');
		card.className = 'card';

		card.style.backgroundImage = `url(${spritePath})`;
		card.style.backgroundSize = `${width}px ${height}px`;
		card.style.backgroundRepeat = 'no-repeat';
		let [ cardX, cardY] = [ cards[i] % totalXs, Math.ceil(cards[i] / totalXs)-1 ];
		card.style.backgroundPosition = `-${cardX * cardSpriteWidth}px -${cardY * cardSpriteHeight}px`;

		card.style.left = cardOffset;
		card.style.zIndex = i;
		card.addEventListener('click', function() {
			console.log(`You selected card: ${cards[i]}`);
		});
		playerHand.appendChild(card);
	}
}


/*
function renderHand(cards) {
  const spritesheet = new Image();
	spritesheet.src = "./assets/default/deck.svg";
    
	spritesheet.onload = function() {
		const sheetWidth = this.naturalWidth;
		const sheetHeight = this.naturalHeight;

		const cardWidth = sheetWidth / 14;
		const cardHeight = sheetHeight / 8;
	    
		document.documentElement.style.setProperty('--card-count', cards.length);
		document.documentElement.style.setProperty('--card-width', `${cardWidth}px`);
		document.documentElement.style.setProperty('--max-margin-right', `10px`);

		const cardList = document.querySelector('#cardList');
			cardList.innerHTML = '';
		for (let card of cards) {
			const [row, col] = card.split('_').map(Number);

			let listItem = document.createElement('li');
			listItem.classList.add('card');
			// listItem.style.marginRight = '10px';     // creates space between cards

			let cardSprite = document.createElement('div');

			// Compute the background position
			const bgPosX = -col * cardWidth;
			const bgPosY = -row * cardHeight;

			cardSprite.style.backgroundImage = `url('${spritesheet.src}')`;
			cardSprite.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
			cardSprite.style.width = `${cardWidth}px`;
			cardSprite.style.height = `${cardHeight}px`;
					// cardSprite.style.transform = "scale(0.25)";

			// Add the click event
			cardSprite.addEventListener('click', function() {
				console.log(`You selected card: ${card}`);
			});

			listItem.appendChild(cardSprite);
			cardList.appendChild(listItem);
		}
	}
}
*/