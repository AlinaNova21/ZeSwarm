const DIRECTION_TO_OFFSET = [
	0, 0,   // CENTER
	0, -1,  // TOP
	1, -1,  // TOP_RIGHT
	1, 0,   // RIGHT
	1, 1,   // BOTTOM_RIGHT
	0, 1,   // BOTTOM
	-1, 1,  // BOTTOM_LEFT
	-1, 0,  // LEFT
	-1, -1, // TOP_LEFT
];

const OFFSET_TO_DIRECTION = [
	TOP_LEFT,		TOP,	TOP_RIGHT,
	LEFT,			0,		RIGHT,
	BOTTOM_LEFT,	BOTTOM,	BOTTOM_RIGHT,
];

const CL_ERROR = '#ff713b';

PathFinder.CostMatrix.prototype.setFast = function(x, y, value) {
	this._bits[x * 50 + y] = value;
};

const Utils = {

	hasActiveBodyparts(creep, partType) {
		const body = creep.body;
		for (let i = body.length - 1; i >= 0; i--) {
			const part = body[i];
			if (part.hits <= 0) {
				break;
			}
			if (part.type === partType) {
				return true;
			}
		}
		return false;
	},

	logError(error) {
		console.log(`<span style="color: ${CL_ERROR}">${error.stack.replace(/\n/g, '<br>')}</span>`);
	},

	getRange(pos1, pos2) {
		return Math.max(Math.abs(pos1.x - pos2.x), Math.abs(pos1.y - pos2.y));
	},

	posToCoords(pos) {
		return {x: pos.x, y: pos.y};
	},

	offsetPosCoords(pos, direction) {
		const x = pos.x + (DIRECTION_TO_OFFSET[direction * 2] || 0);
		const y = pos.y + (DIRECTION_TO_OFFSET[direction * 2 + 1] || 0);
		return {x, y};
	},

	offsetPos(pos, direction) {
		const offsetX = DIRECTION_TO_OFFSET[direction * 2] || 0;
		const offsetY = DIRECTION_TO_OFFSET[direction * 2 + 1] || 0;
		return new RoomPosition(pos.x + offsetX, pos.y + offsetY, pos.roomName);
	},

	isPosEqual(pos1, pos2) {
		return (
			pos1.x === pos2.x &&
			pos1.y === pos2.y &&
			pos1.roomName === pos2.roomName
		);
	},

	getDirection(pos1, pos2) {
		const dx = pos2.x - pos1.x + 1;
		const dy = pos2.y - pos1.y + 1;
		return OFFSET_TO_DIRECTION[dy * 3 + dx] || 0;
	},

	isPosExit(pos) {
		const {x, y} = pos;
		return x <= 0 || y <= 0 || x >= 49 || y >= 49;
	},

	isCoordsEqual(pos1, pos2) {
		return pos1.x === pos2.x && pos1.y === pos2.y;
	},

	lookInRange(pos, room, look, range) {
		const {x, y} = pos;
		const minX = Math.max(x - range, 0);
		const minY = Math.max(y - range, 0);
		const maxX = Math.min(x + range, 49);
		const maxY = Math.min(y + range, 49);
		return room.lookForAtArea(look, minY, minX, maxY, maxX, true);
	},

};

module.exports = Utils;
