
/**
 * @author Matthias Lohr <matthias@lohr.me>
 */

/**********************************************************************************************************************/
// brain

var GAME_STATUS_LOADING = 1; // loading/initializing and connecting to peer server
var GAME_STATUS_INITIALIZED = 2; // waiting for remote connection
var GAME_STATUS_RUNNING = 3; // active game
var GAME_STATUS_FINISHED = 4;

function posIndex2String(pos) {
	return String.fromCharCode(97+pos.posX)+(pos.posY+1);
}

function posString2Index(pos) {
	return {
		posX: parseInt(pos.charCodeAt(0)-97),
		posY: parseInt(pos.charAt(1))-1
	};
}

var PeerChessGame = Class.create({
	initialize: function(options, callbacks) {
		this.callbacks = callbacks;
		this.gameStatus = GAME_STATUS_LOADING;
		this.peer = new Peer(options.peer);
		this.connection = null;
		this.myColor = null;
		this.turn = 'white';
		this.history = new Array();
		var that = this;
		this.peer.on('open', function(peerId) {
			that.gameStatus = GAME_STATUS_INITIALIZED;
			that.executeCallback('onInitialized', {'peerId': peerId});
		});
		this.peer.on('close', function() {

		});
		this.peer.on('error', function (error) {

		});
		this.peer.on('connection', function(connection) {
			connection.on('open', function() {
				if (that.gameStatus == GAME_STATUS_INITIALIZED) {
					that.peer.disconnect();
					that.gameStatus = GAME_STATUS_RUNNING;
					that.connection = connection;
					that.initGameBoard('black');
					that.executeCallback('onConnected');
					that.executeCallback('onNotice', {message: 'You challenged the other player, so you\'re playing with <strong>black</strong>!'});
					that.connection.on('data', function(data) {
						that.parseIncomingData(data);
					});
				}
			});
		});
	},

	connectToPeer: function(peerId) {
		if (this.gameStatus !== GAME_STATUS_INITIALIZED) return false;
		var connection = this.peer.connect(peerId);
		var that = this;
		connection.on('open', function() {
			if (that.gameStatus == GAME_STATUS_INITIALIZED) {
				that.peer.disconnect();
				that.gameStatus = GAME_STATUS_RUNNING;
				that.connection = connection;
				that.initGameBoard('white');
				that.executeCallback('onConnected');
				that.executeCallback('onNotice', {message: 'You has been challenged, so you\'re playing with <strong>white</strong>!'});
				that.executeCallback('onNotice', {message: 'Come on, make your first move!'});
				that.connection.on('data', function(data) {
					that.parseIncomingData(data);
				});
			}
		});
	},

	executeCallback: function(callbackName, options) {
		if (this.callbacks[callbackName] === undefined) return undefined;
		return this.callbacks[callbackName].call(this, options);
	},

	fieldIsCoveredByColor: function(color, pos, field) {
		for (var x = 0; x <= 7; x++) for (var y = 0; y <= 7; y++) {
			if (field[x][y] === undefined) continue;
			if (field[x][y].getColor() != color) continue;
			if (field[x][y].validateMove({posX: x, posY: y}, pos, field)) return true;
		}
		return false;
	},

	figureAdd: function(color, type, position) {
		this.field[position.posX][position.posY] = new type(color);
		this.executeCallback('onFigureAdd', {figure: this.field[position.posX][position.posY], position: position});
		return true;
	},

	getEnemyColor: function() {
		return (this.myColor == 'white'?'black':'white');
	},

	getFigureAt: function(x, y) {
		return this.field[x][y];
	},

	getFieldCopy: function() {
		var copy = new Array(8);
		for (var x = 0; x <= 7; x++) {
			copy[x] = new Array(8);
			for (var y = 0; y <= 7; y++) {
				copy[x][y] = this.field[x][y];
			}
		}
		return copy;
	},

	getGameStatus: function() {
		return this.gameStatus;
	},

	getMyColor: function() {
		return this.myColor;
	},

	getTurnColor: function() {
		return this.turn;
	},

	historyAppend: function(moveCode) {
		this.history.push(moveCode);
		this.executeCallback('onHistoryAppend', {code: moveCode, history: this.history});
	},

	historyGetLastMove: function() {
		return this.history[this.history.length-1];
	},

	initGameBoard: function(myColor) {
		this.myColor = myColor;
		this.executeCallback('onTurnChange', {onTurn: 'white'});
		this.field = new Array(8);
		for (i = 0; i <= 7; i++) this.field[i] = new Array(8);
		this.figureAdd('white', RookFigure,   {posX: 0, posY: 0});
		this.figureAdd('white', KnightFigure, {posX: 1, posY: 0});
		this.figureAdd('white', BishopFigure, {posX: 2, posY: 0});
		this.figureAdd('white', QueenFigure,  {posX: 3, posY: 0});
		this.figureAdd('white', KingFigure,   {posX: 4, posY: 0});
		this.figureAdd('white', BishopFigure, {posX: 5, posY: 0});
		this.figureAdd('white', KnightFigure, {posX: 6, posY: 0});
		this.figureAdd('white', RookFigure,   {posX: 7, posY: 0});
		this.figureAdd('black', RookFigure,   {posX: 0, posY: 7});
		this.figureAdd('black', KnightFigure, {posX: 1, posY: 7});
		this.figureAdd('black', BishopFigure, {posX: 2, posY: 7});
		this.figureAdd('black', QueenFigure,  {posX: 3, posY: 7});
		this.figureAdd('black', KingFigure,   {posX: 4, posY: 7});
		this.figureAdd('black', BishopFigure, {posX: 5, posY: 7});
		this.figureAdd('black', KnightFigure, {posX: 6, posY: 7});
		this.figureAdd('black', RookFigure,   {posX: 7, posY: 7});
		for (x = 0; x <= 7; x++) {
			this.figureAdd('white', PawnFigure,   {posX: x, posY: 1});
			this.figureAdd('black', PawnFigure,   {posX: x, posY: 6});
		}
	},

	isEnPassantMove: function(src, dst) {
		if (!(this.field[src.posX][src.posY] instanceof PawnFigure)) return false;
		if (this.field[dst.posX][dst.posY] !== undefined) return false;
		if (!(this.field[dst.posX][src.posY] instanceof PawnFigure)) return false;
		if (this.field[src.posX][src.posY].getColor() == this.field[dst.posX][src.posY].getColor()) return false;
		var lastMove = this.historyGetLastMove().substr(0,5);
		if (this.field[src.posX][src.posY].getColor() == 'white') {
			if (src.posY == 4 && dst.posY == 5 && Math.abs(src.posX-dst.posX) == 1 && lastMove == posIndex2String({posX: dst.posX, posY: 6})+'-'+posIndex2String({posX: dst.posX, posY: 4})) return true;
		}
		else {
			if (src.posY == 3 && dst.posY == 2 && Math.abs(src.posX-dst.posX) == 1 && lastMove == posIndex2String({posX: dst.posX, posY: 1})+'-'+posIndex2String({posX: dst.posX, posY: 3})) return true;
		}
		return false;
	},

	isCastlingMove: function(src, dst) {
		var row = (this.field[src.posX][src.posY].getColor() == 'white'? 0:7);
		if ((src.posY == dst.posY && src.posY == row
			&& src.posX == 4
			&& dst.posX == 6
			&& this.field[5][row] == undefined
			&& this.field[6][row] == undefined
			&& this.field[7][row] instanceof RookFigure
			&& this.field[7][row].getColor() == this.field[src.posX][src.posY].getColor()
			&& !this.fieldIsCoveredByColor(this.getEnemyColor(), {posX: 5, posY: row}, this.field)
			) || (src.posY == dst.posY && src.posY == row
			&& src.posX == 4
			&& dst.posX == 2
			&& this.field[3][row] == undefined
			&& this.field[2][row] == undefined
			&& this.field[1][row] == undefined
			&& this.field[0][row] instanceof RookFigure
			&& this.field[0][row].getColor() == this.field[src.posX][src.posY].getColor()
			&& !this.fieldIsCoveredByColor(this.getEnemyColor(), {posX: 3, posY: row}, this.field)
			)) {
			// currently in check?
			if (this.playerIsInCheck(this.getMyColor(), this.field)) return false;
			// history
			var historyLength = this.history.length;
			var kingPosStr = posIndex2String(src);
			var rookPosStr = posIndex2String({posX: (dst.posX == 2 ? 0 : 7), posY: row});
			for (var i = (this.getMyColor()=='white'?0:1); i < historyLength; i = i+2) {
				if (this.history[i] == 'O-O-O') return false;
				if (this.history[i] == 'O-O') return false;
				if (this.history[i].substr(0, 2) == kingPosStr) return false;
				if (this.history[i].substr(0, 2) == rookPosStr) return false;
				if (this.history[i].substr(3, 2) == rookPosStr) return false;
			}
			// all ok, return true
			return true;
		}
		else {
			return false;
		}
	},

	move: function(src, dst) {
		if (src.posX == dst.posX && src.posY == dst.posY) return false;
		if (src.posX < 0 || src.posX > 7 || src.posY < 0 || src.posY > 7 || dst.posX < 0 || dst.posX > 7 || dst.posY < 0 || dst.posY > 7) return false;
		var figure = this.getFigureAt(src.posX, src.posY);
		if (figure === undefined) return false;
		var dstFigure = this.getFigureAt(dst.posX, dst.posY);
		if (dstFigure !== undefined && dstFigure.getColor() == figure.getColor()) return false;
		var fieldTestCopy = this.getFieldCopy();
		if (this.isEnPassantMove(src, dst)) {
			figure.executeMove(src, dst, fieldTestCopy);
			if (this.playerIsInCheck(this.getMyColor(), fieldTestCopy)) {
				this.executeCallback('onNotice', {message: 'You can\'t move into check!'});
				return false;
			}
			this.switchTurn();
			figure.executeMove(src, dst, this.field);
			var code = posIndex2String(src)+'x'+posIndex2String(dst);
			this.field[dst.posX][src.posY] = undefined;
			this.executeCallback('onFigureRemove', {position: {posX: dst.posX, posY: src.posY }});
			this.executeCallback('onFigureMove', {src: src, dst: dst});
			this.executeCallback('onNotice', {message: 'You moved your <strong>pawn</strong> from <strong>'+posIndex2String(src)+'</strong> to <strong>'+posIndex2String(dst)+'</strong> and killed your enemy en passant.'});
			if (this.playerIsInCheck(this.getEnemyColor(), this.field)) code += '+';
			this.sendMove(code);
			this.historyAppend(code);
		}
		else if (this.isCastlingMove(src, dst)) {
			// determine castling direction
			var row = (this.getMyColor() == 'white'? 0:7);
			if (dst.posX == 2) { // O-O-O
				var code = 'O-O-O';
				var rookSrcX = 0;
				var rookDstX = 3;
			}
			else { // O-O
				var code = 'O-O';
				var rookSrcX = 7;
				var rookDstX = 5;
			}
			figure.executeMove(src, dst, fieldTestCopy);
			fieldTestCopy[rookSrcX][row].executeMove({posX: rookSrcX, posY: row}, {posX: rookDstX, posY: row}, fieldTestCopy);
			if (this.playerIsInCheck(this.getMyColor(), fieldTestCopy)) {
				this.executeCallback('onNotice', {message: 'You can\'t move into check!'});
				return false;
			}
			this.switchTurn();
			figure.executeMove(src, dst, this.field);
			this.field[rookSrcX][row].executeMove({posX: rookSrcX, posY: row}, {posX: rookDstX, posY: row}, this.field);
			this.executeCallback('onFigureMove', {src: src, dst: dst}); // move king
			this.executeCallback('onFigureMove', {src: {posX: rookSrcX, posY: row}, dst: {posX: rookDstX, posY: row}}); // move rook
			this.executeCallback('onNotice', {message: 'You\'re castling!'});
			if (this.playerIsInCheck(this.getEnemyColor(), this.field)) code += '+';
			this.sendMove(code);
			this.historyAppend(code);
		}
		else if (figure.validateMove(src, dst, this.field)) {
			figure.executeMove(src, dst, fieldTestCopy);
			if (this.playerIsInCheck(this.getMyColor(), fieldTestCopy)) {
				this.executeCallback('onNotice', {message: 'You can\'t move into check!'});
				return false;
			}
			this.switchTurn();
			var code = figure.executeMove(src, dst, this.field);
			if (dstFigure !== undefined) this.executeCallback('onFigureRemove', {position: dst});
			this.executeCallback('onFigureMove', {src: src, dst: dst});
			this.executeCallback('onNotice', {message: 'You moved your <strong>'+figure.getType()+'</strong> from <strong>'+posIndex2String(src)+'</strong> to <strong>'+posIndex2String(dst)+'</strong>.'});
			if (this.playerIsInCheck(this.getEnemyColor(), this.field)) code += '+';
			this.sendMove(code);
			this.historyAppend(code);
		}
	},

	onTurn: function() {
	  return (this.getMyColor() == this.getTurnColor());
	},

	parseIncomingData: function(data) {
		// parse string
		var index = data.indexOf(' ');
		if (index <= 0) return false;
		var dataType = data.substr(0, index);
		var dataContent = data.substr(index+1);
		switch (dataType) {
			case "MOVE":
				if (dataContent == 'O-O-O' || dataContent == 'O-O-O+') {
					// TODO check for remote foobar
					var row = (this.getEnemyColor() == 'white'?0:7);
					this.field[4][row].executeMove({posX: 4, posY: row}, {posX: 2, posY: row}, this.field);
					this.executeCallback('onFigureMove', {src: {posX: 4, posY: row}, dst: {posX: 2, posY: row}});
					this.executeCallback('onFigureMove', {src: {posX: 0, posY: row}, dst: {posX: 3, posY: row}});
					this.executeCallback('onNotice', {message: 'Your opponent is castling!'});
					this.switchTurn();
				}
				else if (dataContent == 'O-O' || dataContent == 'O-O+') {
					// TODO check for remote foobar
					var row = (this.getEnemyColor() == 'white'?0:7);
					this.field[4][row].executeMove({posX: 4, posY: row}, {posX: 6, posY: row}, this.field);
					this.executeCallback('onFigureMove', {src: {posX: 4, posY: row}, dst: {posX: 6, posY: row}});
					this.executeCallback('onFigureMove', {src: {posX: 7, posY: row}, dst: {posX: 5, posY: row}});
					this.executeCallback('onNotice', {message: 'Your opponent is castling!'});
					this.switchTurn();
				}
				else {
					var src = posString2Index(dataContent.substr(0,2));
					var dst = posString2Index(dataContent.substr(3,2));
					var figure = this.getFigureAt(src.posX, src.posY);
					// if (figure === undefined) return false; // TODO check for remote foobar
					if (this.isEnPassantMove(src, dst)) {
						figure.executeMove(src, dst, this.field);
						var code = posIndex2String(src)+'x'+posIndex2String(dst);
						this.field[dst.posX][src.posY] = undefined;
						this.executeCallback('onFigureRemove', {position: {posX: dst.posX, posY: src.posY }});
						this.executeCallback('onFigureMove', {src: src, dst: dst});
						this.executeCallback('onNotice', {message: 'Your opponent moved the <strong>pawn</strong> from <strong>'+posIndex2String(src)+'</strong> to <strong>'+posIndex2String(dst)+'</strong> and killed your figure en passant.'});
						this.switchTurn();
					}
					else {
						var dstFigure = this.getFigureAt(dst.posX, dst.posY);
						// if (dstFigure !== undefined && dstFigure.getColor() == figure.getColor()) return false; // TODO check for remote foobar
						if (figure.validateMove(src, dst, this.field)) {
							var code = figure.executeMove(src, dst, this.field);
							if (dstFigure !== undefined) this.executeCallback('onFigureRemove', {position: dst});
							this.executeCallback('onFigureMove', {src: src, dst: dst});
							this.executeCallback('onNotice', {message: 'Your opponent moved the <strong>'+figure.getType()+'</strong> from <strong>'+posIndex2String(src)+'</strong> to <strong>'+posIndex2String(dst)+'</strong>. Now it\'s your turn.'});
							this.switchTurn();
						}
						else {
							// TODO check for remote foobar
						}
					}
				}
				this.historyAppend(dataContent);
				break;
			case "PRIVMSG":
				this.executeCallback('onChatMessage', {'message': dataContent});
				break;
		}
	},

	playerIsInCheck: function(color, field) {
		var kingPos = null;
		// find the king position
		parentLoop: for (var x = 0; x <= 7; x++) for (var y = 0; y <= 7; y++) if (field[x][y] instanceof KingFigure && field[x][y].getColor() == color) {
			kingPos = {posX: x, posY: y};
			break parentLoop;
		}
		return this.fieldIsCoveredByColor((color == 'white'? 'black':'white'), kingPos, field);
	},

	sendChatMessage: function(text) {
		return this.sendData('PRIVMSG', text);
	},

	sendData: function(type, data) {
		return this.connection.send(type+' '+data);
	},

	sendMove: function(code) {
		return this.sendData('MOVE', code);
	},

	switchTurn: function() {
		if (this.turn == 'white') {
			this.turn = 'black';
		}
		else {
			this.turn = 'white';
		}
		this.executeCallback('onTurnChange', {onTurn: this.turn})
	}
});

var PeerChessFigure = Class.create({
	initialize: function(color, type) {
		this.color = color;
		this.type = type;
	},

	executeMove: function(src, dst, field) {
		var hit = (field[dst.posX][dst.posY] !== undefined);
		field[dst.posX][dst.posY] = field[src.posX][src.posY];
		field[src.posX][src.posY] = undefined;
		return posIndex2String(src)+(hit?'x':'-')+posIndex2String(dst);
	},

	getColor: function() {
		return this.color;
	},

	getType: function() {
		return this.type;
	},

	validateMove: function(src, dst, field) {
		return false;
	}
});

var KingFigure = Class.create(PeerChessFigure, {
	initialize: function($super, color) {
		$super(color, 'king');
	},

	validateMove: function(src, dst, field) {
		// default move
		if (Math.abs(src.posX-dst.posX) <= 1 && Math.abs(src.posY-dst.posY) <= 1) return true;
		return false;
	}
});

var QueenFigure = Class.create(PeerChessFigure, {
	initialize: function($super, color) {
		$super(color, 'queen');
	},

	validateMove: function(src, dst, field) {
		return ((new RookFigure(this.color)).validateMove(src, dst, field) || (new BishopFigure(this.color)).validateMove(src, dst, field));
	}
});

var RookFigure = Class.create(PeerChessFigure, {
	initialize: function($super, color) {
		$super(color, 'rook');
	},

	validateMove: function(src, dst, field) {
		if (src.posX == dst.posX) {
			if (src.posY > dst.posY) {
				for (i = dst.posY+1; i < src.posY; i++) if (field[src.posX][i] !== undefined) return false;
			}
			else {
				for (i = src.posY+1; i < dst.posY; i++) if (field[src.posX][i] !== undefined) return false;
			}
			return true;
		}
		else if (src.posY == dst.posY) {
			if (src.posX > dst.posX) {
				for (i = dst.posX+1; i < src.posX; i++) if (field[i][src.posY] !== undefined) return false;
			}
			else {
				for (i = src.posX+1; i < dst.posX; i++) if (field[i][src.posY] !== undefined) return false;
			}
			return true;
		}
		return false;
	}
});

var KnightFigure = Class.create(PeerChessFigure, {
	initialize: function($super, color) {
		$super(color, 'knight');
	},

	validateMove: function(src, dst, field) {
		// each Knight has only 8 valid movements.
		if ((src.posY+2 == dst.posY || src.posY-2 == dst.posY) && (src.posX+1 == dst.posX || src.posX-1 == dst.posX)) {
			// Move to vertical (left or right)
			return true;
		}
		if ((src.posX+2 == dst.posX || src.posX-2 == dst.posX) && (src.posY+1 == dst.posY || src.posY-1 == dst.posY)) {
			// Move to horizental (up or down)
			return true;
		}
		return false;
	}
});

var BishopFigure = Class.create(PeerChessFigure, {
	initialize: function($super, color) {
		$super(color, 'bishop');
	},

	validateMove: function(src, dst, field) {
		// is movement diagonal?
		if(Math.abs(src.posY-dst.posY) == Math.abs(src.posX-dst.posX)) {
			// Move in which direction?
			if(dst.posY > src.posY) {
				// Move North
				if(dst.posX > src.posX) {
					// Move East
					for(x = src.posX + 1, y = src.posY + 1; x < dst.posX && y < dst.posY; x++, y++) if(field[x][y] !== undefined) return false;
				}
				else {
					// Move West
					for(x = src.posX - 1, y = src.posY + 1; x > dst.posX && y < dst.posY; x--, y++) if(field[x][y] !== undefined) return false;
				}
			}
			else {
				// Move South
				if(dst.posX > src.posX) {
					// Move East
					for(x = src.posX + 1, y = src.posY - 1; x < dst.posX && y > dst.posY; x++, y--) if(field[x][y] !== undefined) return false;
				}
				else {
					// Move West
					for(x = src.posX - 1, y = src.posY - 1; x > dst.posX && y > dst.posY; x--, y--) if(field[x][y] !== undefined) return false;
				}
			}
			return true;
		}

		return false;
	}
});

var PawnFigure = Class.create(PeerChessFigure, {
	initialize: function($super, color) {
		$super(color, 'pawn');
	},

	validateMove: function(src, dst, field) {
		if (this.color == 'white') {
			// moves for white pawns
			// simple single step
			if (src.posX == dst.posX && src.posY == dst.posY-1 && field[dst.posX][dst.posY] == undefined) return true;
			// double step at beginning
			if (src.posX == dst.posX && src.posY == 1 && dst.posY == 3 && field[dst.posX][2] == undefined && field[dst.posX][3] == undefined) return true;
			// move diagonal and kill enemy
			if ((src.posX == dst.posX-1 || src.posX == dst.posX+1) && src.posY == dst.posY-1 && field[dst.posX][dst.posY] != undefined && field[dst.posX][dst.posY].getColor() != this.getColor()) return true;
		}
		else {
			// moves for black pawns
			// simple single step
			if (src.posX == dst.posX && src.posY == dst.posY+1 && field[dst.posX][dst.posY] == undefined) return true;
			// double step at beginning
			if (src.posX == dst.posX && src.posY == 6 && dst.posY == 4 && field[dst.posX][5] == undefined && field[dst.posX][4] == undefined) return true;
			// move diagonal and kill enemy
			if ((src.posX == dst.posX-1 || src.posX == dst.posX+1) && src.posY == dst.posY+1 && field[dst.posX][dst.posY] != undefined && field[dst.posX][dst.posY].getColor() != this.getColor()) return true;
		}
		return false;
	}
});

// prototype extension

Element.prototype.fullPositionedOffset = function() {
	var offset = this.positionedOffset();
	var parent = this.getOffsetParent();
	if (parent && parent != this) {
		var tmp = parent.fullPositionedOffset();
		offset[0] += tmp[0];
		offset[1] += tmp[1];
		offset['top'] += tmp['top'];
		offset['left'] += tmp['left'];
	}
	return offset;
}

// interaction stuff
document.observe("dom:loaded", function() {
	// init game
	var game = new PeerChessGame(peerChessConfig, {
		onInitialized: function(data) {
			$('local-id').update(data.peerId);
		},
		onConnected: function() {
			$('connection-dialog').hide();
			$('game').show();
			if (this.getMyColor() == 'black') {
				$('gameboard').addClassName('rotate180');
				var blackFigures = $$('#gameboard .figure');
				for (var i = 0; i < blackFigures.length; i++) {
					blackFigures[i].addClassName('rotate180');
				}
			}
		},
		onChatMessage: function(data) {
			var template = new Element('p',{
				class: 'message-type-opponent'
			});
			template.update('<strong>Opponent: </strong><span></span>');
			template.down('span').update(data.message.escapeHTML());
			$('messages').appendChild(template);
			new Effect.ScrollToBottom($('messages'));
		},
		onNotice: function(data) {
			var template = new Element('p',{
				class: 'message-type-notice'
			});
			template.update('<span></span>');
			template.down('span').update(data.message);
			$('messages').appendChild(template);
			new Effect.ScrollToBottom($('messages'));
		},
		onFigureAdd: function(data) {
			// create element
			var template = new Element('div', {
				class: 'figure',
				'data-color': data.figure.getColor(),
				'data-type': data.figure.getType(),
				'data-position-x': data.position.posX,
				'data-position-y': data.position.posY,
				'style': 'display: none; z-index: 0;',
				title: data.figure.getColor()+' '+data.figure.getType()
			});
			// show figure
			$('fields').appendChild(template);
			new Effect.Appear(template);
		},
		onFigureMove: function(data) {
			var figure = $$('#fields .figure[data-position-x="'+data.src.posX+'"][data-position-y="'+data.src.posY+'"]').first();
			figure.setStyle({
				left: data.src.posX*12.5+'%',
				top: (87.5-data.src.posY*12.5)+'%'
			});
			figure.setAttribute('data-position-x', data.dst.posX);
			figure.setAttribute('data-position-y', data.dst.posY);
			new Effect.Animate(figure, {properties: {
				left: data.dst.posX*12.5+'%',
				top: (87.5-data.dst.posY*12.5)+'%'
			}});
		},
		onFigureRemove: function(data) {
			var figure = $$('#fields .figure[data-position-x="'+data.position.posX+'"][data-position-y="'+data.position.posY+'"]').first();
			var lostFigure = figure.clone();
			lostFigure.removeClassName('rotate180');
			lostFigure.setStyle({top: null, left: null});
			lostFigure.hide();
			new Effect.Fade(figure, {
				afterFinish: function() { figure.remove(); }
			});
			if (lostFigure.readAttribute('data-color') == 'white') {
				$('lost-figures-white').appendChild(lostFigure);
			}
			else {
				$('lost-figures-black').appendChild(lostFigure);
			}
			new Effect.Appear(lostFigure);
		},
		onHistoryAppend: function(data) {
			if (data.history.length % 2 == 1) {
				var rowElement = new Element('tr');
				var indexElement = new Element('td');
				indexElement.update(Math.ceil(data.history.length / 2)+'.');
				rowElement.appendChild(indexElement);
				var firstColElement = new Element('td');
				firstColElement.update(data.code);
				rowElement.appendChild(firstColElement);
				var secondColElement = new Element('td');
				rowElement.appendChild(secondColElement);
				$('history-table').appendChild(rowElement);
				new Effect.ScrollToBottom($('history-table-container'));
			}
			else {
				$$('#history-table tr td').last().update(data.code);
			}
		},
		onTurnChange: function(data) {
			if (data.onTurn == 'white') {
				$('turn-info').removeClassName('black');
				$('turn-info').addClassName('white');
			}
			else {
				$('turn-info').removeClassName('white');
				$('turn-info').addClassName('black');
			}
			if (data.onTurn == this.getMyColor()) {
				$('turn-info').update(data.onTurn+' - that\'s your color!');
			}
			else {
				$('turn-info').update(data.onTurn);
			}
		}
	});

	function resetFigureSelection() {
		var selected = $$('#fields .figure.selected');
		for (i = 0; i < selected.length; i++) {
			selected[i].removeClassName('selected');
		}
	}

	function selectFigureAt(x, y) {
		resetFigureSelection();
		$$('#fields .figure[data-position-x="'+x+'"][data-position-y="'+y+'"]').first().addClassName('selected');
	}

	function getSelectedPosition() {
		var selected = $$('#fields .figure.selected')
		if (selected.length == 0) return null;
		return {posX: parseInt(selected.first().getAttribute('data-position-x')), posY: parseInt(selected.first().getAttribute('data-position-y'))};
	}

	$('remote-id').observe('keyup', function(event) {
		if (event.keyCode == 13) {
			game.connectToPeer($('remote-id').getValue());
		}
	});

	$('chat-write-message').observe('keyup', function(event) {
		if (event.keyCode == 13) {
			var message = $('chat-write-message').getValue().trim();
			if (message.length > 0) {
				game.sendChatMessage(message);
				var template = new Element('p',{
					class: 'message-type-me'
				});
				template.update('<strong>You: </strong><span></span>');
				template.down('span').update(message.escapeHTML());
				$('messages').appendChild(template);
				new Effect.ScrollToBottom($('messages'));
			}
			$('chat-write-message').setValue('');
		}
	});

	$('fields').observe('click', function(event) {
		if (!game.onTurn()) return;
		// calculate relative click position
		var relativeX = event.pageX - this.fullPositionedOffset()[0];
		var relativeY = event.pageY - this.fullPositionedOffset()[1];
		// calculate fields
		var fieldX = Math.floor(8*relativeX/this.getWidth());
		var fieldY = 7-Math.floor(8*relativeY/this.getHeight());
		// if board is inversed, inverse click position
		if (game.getMyColor() == 'black') {
			fieldX = 7-fieldX;
			fieldY = 7-fieldY;
		}
		// select figure
		var figure = game.getFigureAt(fieldX, fieldY);
		// select? move?
		if (figure !== undefined && figure.getColor() == game.getMyColor()) {
			selectFigureAt(fieldX, fieldY);
		}
		else if (getSelectedPosition() !== null) {
			game.move(getSelectedPosition(), {posX: fieldX, posY: fieldY});
			resetFigureSelection();
		}
	});
});
