// github: https://github.com/NesCafe62/screeps-pathfinding

import Utils from './pathing.utils'
import { Logger } from '/log'

const log = new Logger('[Pathfinding]')

const MATRIX_LAYER_TERRAIN = 0;
const MATRIX_LAYER_STRUCTURES = 1;
const MATRIX_LAYER_TUNNELS = 2;
const MATRIX_LAYER_ROADS = 4;
const MATRIX_LAYER_OFF_ROADS = 8;
const MATRIX_LAYER_SWAMP_ROADS = MATRIX_LAYER_ROADS | MATRIX_LAYER_OFF_ROADS;
const MATRIX_LAYER_CONTAINERS = 16;
const MATRIX_LAYER_PREFER_CONTAINERS = 32;

const MATRIX_CACHE_TIME = 50;

const TARGET_LINE_COLOR = '#5ec8ff';

const TERRAIN_COST = {
	0: 2,
	[TERRAIN_MASK_SWAMP]: 10,
	[TERRAIN_MASK_WALL]: 255,
	[TERRAIN_MASK_WALL | TERRAIN_MASK_SWAMP]: 255,
};

const ROOM_PATTERN_HIGHWAY = /^[WE][0-9]?0[NS][0-9]?0$/;

export const IN_RANGE = 1
export const IN_ROOM = 2

class TerrainMatrix {

	constructor(terrain) {
		this.data = terrain.getRawBuffer();
	}

	getCost(x, y) {
		const value = this.data[y * 50 + x];
		return TERRAIN_COST[value];
	}

	get(x, y) {
		return this.data[y * 50 + x];
	}

}

const TerrainCache = {

	cache: new Map(),
	lru: new Map(),
	limit: 20,

	get(roomName) {
		let terrain = this.cache.get(roomName);
		if (!terrain) {
			// if (this.cache.size > 20) {
			// 	this.cache.clear();
			// }
			while (this.cache.size > this.limit) {
				let oldest = ''
				let minTime = Game.time
				for (const [room, time] of this.lru.entries()) {
					if (time < minTime) {
						oldest = room
						minTime = time
					}
				}
				log.info(`Removing ${oldest} from terrain cache`)
				this.lru.delete(oldest)
				this.cache.delete(oldest)
			}
			terrain = new TerrainMatrix(new Room.Terrain(roomName));
			this.cache.set(roomName, terrain);
		}
		this.lru.set(roomName, Game.time)
		return terrain;
	},
};

class PathingManager {

	constructor(options = {}) {
		this.onRoomEnter = options.onRoomEnter;
		this.getCreepWorkingTarget = options.getCreepWorkingTarget;
		this.getCreepInstance = options.getCreepInstance || ((creep) => creep);
		this.getCreepEntity = options.getCreepEntity || ((instance) => instance);
		this.avoidRooms = options.avoidRooms || [];
		this.matrixCache = new Map();
		this.roomMoves = new Map();
		this.lastMoveTime = Game.time;
	}

	clearMatrixCache() {
		this.matrixCache.clear();
	}

	clearMatrixCacheRoom(roomName) {
		this.matrixCache.delete(roomName);
	}


	moveTo(creep, target, defaultOptions = {}) {
		const targetPos = target.pos || target;

		if (!targetPos) {
			return ERR_INVALID_ARGS;
		}

		const instance = this.getCreepInstance(creep);

		if (instance.spawning) {
			Utils.logError(new Error(`Pathfinder: can't move creep that is spawning '${creep.name}'`));
			return ERR_INVALID_ARGS;
		}

		/* if (!instance.body.some(
			part => part.type === MOVE && part.hits > 0
		)) {
			return ERR_NO_BODYPART;
		} */

		const memory = creep.memory;
		const {pos: creepPos, room, fatigue} = instance;
		const creepRoomName = room.name;

		const data = memory._m;
		let [prevTargetPos, lastPos, path] = data
			? this.deserializeMove(data)
			: [undefined, undefined, ''];

		const {range = 1, priority = 0, allowIncomplete = true} = defaultOptions;
		let options = defaultOptions;

		if (!fatigue) {
			let newPath = false;
			let blocked = false;
			let avoidLocalHostiles = false;

			if (!prevTargetPos || !Utils.isPosEqual(targetPos, prevTargetPos)) {
				newPath = true;
			} else {
				const nextPos = Utils.offsetPosCoords(lastPos, +path[0]);
				if (Utils.isCoordsEqual(creepPos, nextPos)) {
					path = path.substr(1);
					if (path.length === 0) {
						newPath = true;
					}
				} else {
					newPath = true;
					if (Utils.isCoordsEqual(creepPos, lastPos)) {
						if (this.hasObstacleHostileCreep(room, nextPos.x, nextPos.y)) {
							avoidLocalHostiles = true;
						} else {
							blocked = true;
						}
					} else if (Utils.isPosExit(creepPos)) {
						if (options.onRoomEnter) {
							options.onRoomEnter(creep, creepRoomName);
						}
						if (this.onRoomEnter) {
							this.onRoomEnter(creep, creepRoomName);
						}
						blocked = true;
					}
				}
			}

			let pathEnd, pathIncomplete;
			if (newPath) {
				if (
					!blocked &&
					this.getCreepWorkingTarget &&
					creepRoomName === targetPos.roomName &&
					creepPos.getRangeTo(targetPos) === range + 1
				) {
					// for the edge case when target has mora than one sections of tiles in range not connected to each other
					// prevents creep pushing each other when more positions near target exist if they path around
					// this condition fires when creep was pushed out of range by other creep
					// (thought it can fire on normal case when just target is exactly at range + 1 distance)
					const prevCostCallback = options.costCallback;
					let costCallback;
					if (prevCostCallback) {
						costCallback = (roomName, matrix) => {
							prevCostCallback(roomName, matrix);
							if (roomName === creepRoomName) {
								this.addWorkingCreepsToMatrix(matrix, room, priority);
							}
						};
					} else {
						costCallback = (roomName, matrix) => {
							if (roomName === creepRoomName) {
								this.addWorkingCreepsToMatrix(matrix, room, priority);
							}
						};
					}
					options = {...options, costCallback};
				}

				if (avoidLocalHostiles) {
					const prevCostCallback = options.costCallback;
					let costCallback;
					if (prevCostCallback) {
						costCallback = (roomName, matrix) => {
							prevCostCallback(roomName, matrix);
							if (roomName === creepRoomName) {
								this.addHostilesToMatrix(matrix, creepPos, room, 2);
							}
						};
					} else {
						costCallback = (roomName, matrix) => {
							if (roomName === creepRoomName) {
								this.addHostilesToMatrix(matrix, creepPos, room, 2);
							}
						};
					}
					options = {...options, costCallback};
				}

				const res = this.findPath(creepPos, targetPos, options);
				pathIncomplete = res.incomplete;
				[path, pathEnd] = this.serializePath(creepPos, res.path);
			}

			memory._m = this.serializeMove(targetPos, creepPos, path);

			if (path.length === 0 || (pathIncomplete && (!allowIncomplete || path.length <= 1))) {
				return ERR_NO_PATH;
			}
			const direction = +path[0];
			const move = {
				creep,
				creepPos,
				direction,
				priority,
				pushed: false,
				blocked,
				pos: undefined,
				pathEnd,
				offRoad: undefined,
			};
			if (this.lastMoveTime !== Game.time) {
				this.lastMoveTime = Game.time;
				this.cleanup();
			}
			this.insertMove(creepRoomName, move);
			creep._moveTime = Game.time;
			creep._offRoadTime = 0;
		}

		if (options.visualizePathStyle) {
			if (fatigue) {
				path = path.substr(1);
			}
			this.visualizePath(creepPos, path, targetPos, range, options.visualizePathStyle);
		}

		return OK;
	}

	moveOffRoad(creep, options = {}) {
		const instance = this.getCreepInstance(creep);
		
		if (instance.spawning) {
			Utils.logError(new Error(`Pathfinder: can't move creep that is spawning '${creep.name}'`));
			return ERR_INVALID_ARGS;
		}

		if (instance.fatigue) {
			return false;
		}
		/* if (!instance.body.some(
			part => part.type === MOVE && part.hits > 0
		)) {
			return false;
		} */

		creep._offRoadTime = Game.time;

		const creepPos = instance.pos;
		const creepRoomName = instance.room.name;
		const {priority = -1000, moveOffContainer = true, moveOffExit = true} = options;

		const matrixOptions = {
			ignoreContainers: !moveOffContainer,
			containerCost: 1,
			plainCost: 2
		};
		const matrixKey = (
			MATRIX_LAYER_STRUCTURES |
			MATRIX_LAYER_TUNNELS |
			MATRIX_LAYER_ROADS |
			(moveOffContainer ? MATRIX_LAYER_PREFER_CONTAINERS : 0)
		);
		const matrix = this.getCostMatrix(creepRoomName, matrixOptions, matrixKey);
		if (matrix.get(creepPos.x, creepPos.y) !== 1) { // not on road
			return false;
		}

		if (this.lastMoveTime !== Game.time) {
			this.lastMoveTime = Game.time;
			this.cleanup();
		}

		const move = {
			creep,
			creepPos,
			direction: 0,
			priority,
			pushed: false,
			blocked: false,
			pos: undefined,
			pathEnd: undefined,
			offRoad: [matrix, moveOffExit],
		};
		this.insertMove(creepRoomName, move);
		creep._moveTime = Game.time;
		return true;
	}

	deserializeMove(data) {
		const [x, y, roomName, lastPosX, lastPosY, path] = data;
		return [{x, y, roomName}, {x: lastPosX, y: lastPosY}, path];
	}

	serializeMove(targetPos, creepPos, path) {
		return [targetPos.x, targetPos.y, targetPos.roomName, creepPos.x, creepPos.y, path];
	}

	visualizePath(startPos, path, targetPos, range, style) {
		const points = new Array(path.length);
		let pos = startPos;
		for (let i = 0; i < path.length; i++) {
			pos = Utils.offsetPosCoords(pos, +path[i]);
			points[i] = pos;
		}
		const visual = new RoomVisual(startPos.roomName);
		if (points.length > 0) {
			visual.poly(points, style);
		}
		if (startPos.roomName === targetPos.roomName) {
			const posRange = Utils.getRange(pos, targetPos);
			if (posRange > 0 && posRange <= range) {
				visual.poly([pos, targetPos], {...style, stroke: TARGET_LINE_COLOR});
			}
		}
	}


	// moves
	insertMove(roomName, move) {
		const moves = this.getMoves(roomName);
		if (move.creep._moveTime === Game.time) {
			this.removeMove(moves, move.creep.name);
		}
		const priority = move.priority;
		let i = moves.length;
		while (i > 0 && moves[i - 1].priority < priority) {
			i--;
		}
		moves.splice(i, 0, move);
	}

	removeMove(moves, creepName) {
		for (let i = 0; i < moves.length; i++) {
			if (moves[i].creep.name === creepName) {
				moves.splice(i, 1);
				break;
			}
		}
	}

	getMoves(roomName) {
		let moves = this.roomMoves.get(roomName);
		if (!moves) {
			this.roomMoves.set(roomName, moves = []);
		}
		return moves;
	}

	hasMove(pos, moves, priority) {
		return moves.some(
			move => {
				if (move.priority < priority) {
					return false;
				}
				const movePos = move.pos || (
					move.pos = Utils.offsetPosCoords(move.creepPos, move.direction)
				);
				return Utils.isCoordsEqual(pos, movePos);
			}
		);
	}

	// same as hasMove but ignore incomplete offRoad moves
	hasMoveWithOffRoad(pos, moves, priority) {
		return moves.some(
			move => {
				if (move.priority < priority || move.creep._offRoadTime === Game.time) {
					return false;
				}
				const movePos = move.pos || (
					move.pos = Utils.offsetPosCoords(move.creepPos, move.direction)
				);
				return Utils.isCoordsEqual(pos, movePos);
			}
		);
	}


	// run moves
	runMoves() {
		if (this.lastMoveTime !== Game.time) {
			this.lastMoveTime = Game.time;
			this.cleanup();
			return;
		}
		try {
			for (let moves of this.roomMoves.values()) {
				this.moveCreeps(moves);
			}
		} catch (error) {
			Utils.logError(error);
		}
		// this.cleanup();
	}

	runMovesRoom(roomName) {
		if (this.lastMoveTime !== Game.time) {
			this.lastMoveTime = Game.time;
			this.cleanup();
			return;
		}
		const moves = this.roomMoves.get(roomName);
		if (!moves) {
			return;
		}
		try {
			this.moveCreeps(moves);
		} catch (error) {
			Utils.logError(error);
		}
	}

	cleanup() {
		this.roomMoves.clear();
		if (this.matrixCache.size > 200) {
			this.clearMatrixCache();
		}
	}

	getCreepTargetInfo(creep, roomName) {
		if (!this.getCreepWorkingTarget) {
			return;
		}
		const targetInfo = this.getCreepWorkingTarget(creep);
		if (targetInfo && targetInfo.pos.roomName === roomName) {
			return targetInfo;
		}
	}

	isCreepCanMove(creep) {
		if (creep.hits === creep.hitsMax) {
			return true;
		}
		if (creep._canMove === undefined) {
			creep._canMove = Utils.hasActiveBodyparts(creep, MOVE);
		}
		return creep._canMove;
	}

	moveCreeps(moves) {
		for (let i = 0; i < moves.length; i++) {
			const move = moves[i];
			let {creep, creepPos, direction, priority, pushed, blocked, pathEnd, offRoad} = move;
			const instance = this.getCreepInstance(creep);
			if (offRoad) {
				const targetInfo = this.getCreepTargetInfo(creep, instance.room.name);
				const offRoadPos = this.getCreepOffRoadMovePos(instance, offRoad, priority, moves, targetInfo);
				if (!offRoadPos) {
					// no position to move, skip
					// keep this move as incomplete to be ignored by other moveOffRoad creeps
					continue;
				}
				move.pos = offRoadPos;
				direction = move.direction = Utils.getDirection(creepPos, offRoadPos);
				creep._offRoadTime = 0; // mark this move as completed
			}
			if (blocked || pushed || offRoad) {
				const obstacleInstance = this.getObstacleCreep(move.pos || (move.pos = Utils.offsetPosCoords(creepPos, direction)), instance.room);
				if (obstacleInstance) {
					const obstacleCreep = (obstacleInstance.my && this.isCreepCanMove(obstacleInstance))
						? this.getCreepEntity(obstacleInstance)
						: undefined;
					// blocked by creep
					if (!obstacleCreep) {
						// not own creep
						if (!pathEnd && !pushed) {
							pathEnd = this.getPathEnd(creepPos, creep.memory._m.path);
						}
						const movePos = this.getCreepMovePos(instance, priority, moves, pathEnd);
						move.pos = movePos || Utils.posToCoords(creepPos);
						direction = move.direction = movePos ? Utils.getDirection(creepPos, movePos) : 0;
					} else if (
						!obstacleInstance.fatigue &&
						(obstacleCreep._moveTime !== Game.time || obstacleCreep._offRoadTime === Game.time)
					) {
						// assuming moves will always run from higher priority to lower, can skip priority check.
						let preferOffRoad = false;
						if (obstacleCreep._offRoadTime === Game.time) {
							this.removeMove(moves, obstacleInstance.name);
							obstacleCreep._offRoadTime = 0;
							preferOffRoad = true;
						}
						const obstacleCreepPos = obstacleInstance.pos;
						const targetInfo = this.getCreepTargetInfo(obstacleCreep, obstacleInstance.room.name);
						let moveDirection, movePos;
						if (targetInfo || pushed || this.hasMove(creepPos, moves, priority)) {
							// determine blocking creep move direction
							const pushPos = this.getCreepPushPos(obstacleInstance, preferOffRoad, priority, moves, targetInfo);
							movePos = pushPos || move.pos;
							moveDirection = pushPos ? Utils.getDirection(obstacleCreepPos, pushPos) : 0;
						} else {
							// swap positions
							movePos = Utils.posToCoords(creepPos);
							moveDirection = (direction + 3) % 8 + 1;
						}
						const obstacleCreepMove = {
							creep: obstacleCreep,
							creepPos: obstacleCreepPos,
							direction: moveDirection,
							priority,
							pushed: true,
							blocked: false,
							pos: movePos,
							pathEnd: undefined,
							offRoad: undefined,
						};
						moves.splice(i + 1, 0, obstacleCreepMove);
						obstacleCreep._moveTime = Game.time;
					}
				} else if (blocked) {
					// blocked by structure
					this.clearMatrixCacheRoom(creepPos.roomName);
				}
			}
			if (direction > 0) {
				instance.move(direction);
			}
		}
	}

	// returns obstacle creep if it is found
	// called when next position is blocked
	getObstacleCreep(pos, room) {
		const {x, y} = pos;
		const lookCreeps = room.lookForAt(LOOK_CREEPS, x, y);
		let creep = lookCreeps.find(creep => creep.my);
		if (!creep) {
			const lookPowerCreeps = room.lookForAt(LOOK_POWER_CREEPS, x, y);
			creep = lookPowerCreeps.find(creep => creep.my) || lookCreeps[0] || lookPowerCreeps[0];
		}
		return creep;
	}

	// check if blocked by hostile creep
	// called to know if need to enable local avoidance
	hasObstacleHostileCreep(room, x, y) {
		if (x < 0 || y < 0 || x > 49 || y > 49) {
			return false;
		}
		return (
			room.lookForAt(LOOK_CREEPS, x, y).some(creep => !creep.my) ||
			room.lookForAt(LOOK_POWER_CREEPS, x, y).some(creep => !creep.my)
		);
	}

	// check if position is free from hostile creeps or own fatigued creeps
	// called to filter possible move positions for moving blocked creep or pushing obstacle creep
	hasObstacleCreep(room, x, y) {
		return (
			room.lookForAt(LOOK_CREEPS, x, y).find(
				creep => !creep.my || creep.fatigue > 0 || !this.isCreepCanMove(creep)
			) ||
			room.lookForAt(LOOK_POWER_CREEPS, x, y).find(creep => !creep.my)
		);
	}

	* getAdjacentPositions(pos) {
		const {x: posX, y: posY} = pos;
		const minY = Math.max(posY - 1, 0);
		const minX = Math.max(posX - 1, 0);
		const maxY = Math.min(posY + 1, 49);
		const maxX = Math.min(posX + 1, 49);

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				if (x !== posX || y !== posY) {
					yield {x, y};
				}
			}
		}
	}

	getCreepMovePos(creep, priority, moves, pathEnd) {
		const {room, pos: creepPos} = creep;

		const terrain = TerrainCache.get(room.name);
		const matrix = this.getCostMatrix(room.name);

		let movePos, minCost;
		for (const pos of this.getAdjacentPositions(creepPos)) {
			let cost = matrix.get(pos.x, pos.y) || terrain.getCost(pos.x, pos.y);
			if (cost === 255 || this.hasMove(pos, moves, priority)) {
				continue;
			}
			if (this.hasObstacleCreep(room, pos.x, pos.y)) {
				cost = 1000;
			} else if (pathEnd) {
				cost += Utils.getRange(pos, pathEnd) * 10;
			}
			if (!movePos || cost < minCost) {
				minCost = cost;
				movePos = pos;
			}
		}
		return movePos;
	}

	getCreepPushPos(creep, preferOffRoad, priority, moves, targetInfo) {
		const {room, pos: creepPos} = creep;

		const terrain = TerrainCache.get(room.name);
		const matrix = this.getCostMatrix(room.name);

		let movePos, minCost;
		for (const pos of this.getAdjacentPositions(creepPos)) {
			let cost = matrix.get(pos.x, pos.y) || terrain.getCost(pos.x, pos.y);
			if (cost === 255 || this.hasMove(pos, moves, priority)) {
				continue;
			}
			if (this.hasObstacleCreep(room, pos.x, pos.y)) {
				cost = 1000;
			} else {
				if (preferOffRoad && cost <= 2) {
					cost = (cost === 1) ? 2 : 1;
				}
				if (targetInfo) {
					const range = Utils.getRange(pos, targetInfo.pos);
					if (range > targetInfo.range) {
						cost += range + 10;
					}
				}
				if (Utils.isPosExit(pos)) {
					cost += 10;
				}
			}
			if (!movePos || cost < minCost) {
				minCost = cost;
				movePos = pos;
			}
		}
		return movePos;
	}

	getCreepOffRoadMovePos(creep, offRoad, priority, moves, targetInfo) {
		const [matrix, moveOffExit] = offRoad;
		const {room, pos: creepPos} = creep;

		const terrain = TerrainCache.get(room.name);

		let movePos, minCost;
		for (const pos of this.getAdjacentPositions(creepPos)) {
			let cost = matrix.get(pos.x, pos.y) || terrain.getCost(pos.x, pos.y);
			if (cost === 255 || cost === 1 || this.hasMoveWithOffRoad(pos, moves, priority)) {
				continue;
			}
			if (this.hasObstacleCreep(room, pos.x, pos.y)) {
				cost = 1000;
			} else {
				if (targetInfo && Utils.getRange(pos, targetInfo.pos) > targetInfo.range) {
					continue;
				}
				if (moveOffExit && Utils.isPosExit(pos)) {
					cost += 10;
				}
			}
			if (!movePos || cost < minCost) {
				minCost = cost;
				movePos = pos;
			}
		}
		return movePos;
	}

	addWorkingCreepsToMatrix(matrix, room, priority) {
		const creeps = [
			...room.find(FIND_MY_CREEPS),
			...room.find(FIND_MY_POWER_CREEPS)
		];

		for (const instance of creeps) {
			const {x, y} = instance.pos;
			if (!this.isCreepCanMove(instance)) {
				matrix.setFast(x, y, 255);
				continue;
			}
			const creep = this.getCreepEntity(instance);
			const targetInfo = this.getCreepWorkingTarget(creep);
			if (!targetInfo) {
				continue;
			}
			if (
				instance.pos.inRangeTo(targetInfo.pos, targetInfo.range) &&
				(targetInfo.priority === undefined || targetInfo.priority >= priority)
			) {
			}
			matrix.setFast(x, y, 60);
		}
	}


	// finding path
	findPath(startPos, targetPos, defaultOptions = {}) {
		/* if (
			defaultOptions.range === 0 &&
			startPos.roomName === targetPos.roomName &&
			Utils.getRange(startPos, targetPos) === 1
		) {
			return [targetPos];
		} */
		const {
			ignoreRoads, offRoads, range = 1,
			costCallback, routeCallback, findRoute = true
		} = defaultOptions;

		let avoidRooms = defaultOptions.avoidRooms || [];
		if (this.avoidRooms) {
			avoidRooms = [...avoidRooms, ...this.avoidRooms];
		}

		const startRoomName = startPos.roomName;
		const targetRoomName = targetPos.roomName;
		let routeRooms;
		if (
			findRoute &&
			startRoomName !== targetRoomName &&
			this.getRoomDistance(startPos, targetPos) >= 3
		) {
			const route = this.findRoute(startRoomName, targetRoomName, {avoidRooms, routeCallback});
			if (route.length > 0) {
				routeRooms = route.map(item => item.room);
			} else {
				console.log(`Pathfinder: Could not find route from ${startRoomName} to ${targetRoomName}. source: ${startPos} target: ${targetPos}`);
			}
		}

		let startRoomMatrix;
		const options = {
			plainCost: (ignoreRoads || offRoads) ? 1 : 2,
			swampCost: (ignoreRoads || offRoads) ? 5 : 10,
			containerCost: 5,
			moveOffExit: true,
			fixPath: true,
			heuristicWeight: offRoads ? 1 : 1.2,
			...defaultOptions,
			roomCallback: roomName => {
				if (routeRooms) {
					if (roomName !== startRoomName && !routeRooms.includes(roomName)) {
						return false;
					}
				} else if (avoidRooms.length > 0 && avoidRooms.includes(roomName)) {
					return false;
				}
				let matrix = this.getCostMatrix(roomName, options);
				if (costCallback) {
					matrix = matrix ? matrix.clone() : new PathFinder.CostMatrix();
					costCallback(roomName, matrix);
				}
				if (roomName === startRoomName) {
					startRoomMatrix = matrix;
				}
				return matrix;
			}
		};
		let searchTargets = {pos: targetPos, range};
		let addTargetPos = false;
		if (range === 0) {
			searchTargets.range = 1;
			addTargetPos = true;
		} else if (targetPos.roomName !== startRoomName || options.moveOffExit) {
			const targets = this.getTargetRangePositions(targetPos, range, options);
			if (targets.length > 0) {
				searchTargets = targets;
			}
		}
		const res = PathFinder.search(startPos, searchTargets, options);
		const path = res.path;
		if (addTargetPos && !res.incomplete) {
			path.push(targetPos);
		}
		if (
			options.fixPath &&
			options.heuristicWeight > 1 &&
			!options.ignoreRoads &&
			!options.offRoads &&
			path.length >= 3
		) {
			const roomName = path[0].roomName;
			if (roomName !== startPos.roomName) {
				startRoomMatrix = options.roomCallback(roomName);
			}
			if (startRoomMatrix) {
				this.fixPath(path, startRoomMatrix, roomName);
			}
		}
		return res;
	}

	findRoute(startPos, targetPos, options = {}) {
		const routeCallback = options.routeCallback || ((roomName) => {
			return roomName.match(ROOM_PATTERN_HIGHWAY) ? 1 : 2.5;
		});
		const avoidRooms = options.avoidRooms || [];
		return Game.map.findRoute(startPos, targetPos, {
			routeCallback: roomName => {
				if (avoidRooms.length > 0 && avoidRooms.includes(roomName)) {
					return Infinity;
				}
				return routeCallback(roomName);
			}
		});
	}

	getRoomDistance(startPos, targetPos) {
		const startPackedRoom = startPos.__packedPos >>> 16;
		const targetPackedRoom = targetPos.__packedPos >>> 16;

		const dx = (targetPackedRoom >>> 8) - (startPackedRoom >>> 8);
		const dy = (targetPackedRoom & 0xff) - (startPackedRoom & 0xff);
		return Math.max(Math.abs(dx), Math.abs(dy));
	}

	getTargetRangePositions(targetPos, range, options) {
		const {moveOffExit, roomCallback} = options;
		const {x, y} = targetPos;
		let minX = x - range;
		let minY = y - range;
		let maxX = x + range;
		let maxY = y + range;

		const min = moveOffExit ? 1 : 0;
		const max = moveOffExit ? 48 : 49;
		let adjustEdge = false;
		if (minX < min) {
			minX = min;
			adjustEdge = true;
		}
		if (maxX > max) {
			maxX = max;
			adjustEdge = true;
		}
		if (minY < min) {
			minY = min;
			adjustEdge = true;
		}
		if (maxY > max) {
			maxY = max;
			adjustEdge = true;
		}
		if (!adjustEdge) {
			return [];
		}

		const targetRoomName = targetPos.roomName;
		const terrain = TerrainCache.get(targetRoomName);
		const matrix = roomCallback(targetRoomName);
		const positions = [];
		for (let x = minX; x <= maxX; x++) {
			positions.push({x: x, y: minY, roomName: targetRoomName});
			positions.push({x: x, y: maxY, roomName: targetRoomName});
		}
		for (let y = minY + 1; y <= maxY - 1; y++) {
			positions.push({x: minX, y: y, roomName: targetRoomName});
			positions.push({x: maxX, y: y, roomName: targetRoomName});
		}
		const targets = [];
		for (const pos of positions) {
			const cost = (matrix && matrix.get(pos.x, pos.y)) || terrain.getCost(pos.x, pos.y);
			if (cost < 255) {
				targets.push({pos, range: 0});
			}
		}
		return targets;
	}

	fixPath(path, matrix, roomName) {
		const terrain = TerrainCache.get(roomName);
		const costs = new Array(path.length);
		for (let i = 0; i < path.length; i++) {
			const pos = path[i];
			if (pos.roomName !== roomName) {
				break;
			}
			let cost = matrix.get(pos.x, pos.y) || terrain.getCost(pos.x, pos.y);
			if (
				i >= 2 && cost === 1 &&
				costs[i - 1] !== 1 &&
				costs[i - 2] === 1
			) {
				const lastPos = path[i - 1];
				const last2Pos = path[i - 2];
				for (const {x, y} of this.getAdjacentPositions(pos)) {
					if (x !== lastPos.x || y !== lastPos.y) {
						const dx = x - last2Pos.x;
						const dy = y - last2Pos.y;
						if (
							dx >= -1 && dx <= 1 &&
							dy >= -1 && dy <= 1
						) {
							const cost2 = matrix.get(x, y) || terrain.getCost(x, y);
							if (cost2 === 1) {
								path[i - 1] = new RoomPosition(x, y, roomName);
								cost = 1;
								break;
							}
						}
					}
				}
			}
			costs[i] = cost;
		}
	}

	serializePath(startPos, path) {
		const len = path.length;
		let roomName = len > 0 ? path[0].roomName : startPos.roomName;
		let lastPos = startPos;
		let serializedPath = '';
		for (const pos of path) {
			if (pos.roomName !== roomName) {
				break;
			}
			serializedPath += Utils.getDirection(lastPos, pos);
			lastPos = pos;
		}
		return [serializedPath, lastPos];
	}

	getPathEnd(startPos, path) {
		let pos = startPos;
		for (let i = 0; i < path.length; i++) {
			pos = Utils.offsetPosCoords(pos, +path[i]);
		}
		return pos;
	}


	// cost matrix
	getCostMatrix(roomName, options = {}, matrixKey = undefined) {
		let key = matrixKey || MATRIX_LAYER_TERRAIN;
		if (!matrixKey) {
			if (!options.ignoreStructures) {
				key += MATRIX_LAYER_STRUCTURES;
			}
			if (!options.ignoreTunnels) {
				key += MATRIX_LAYER_TUNNELS;
			}
			if (!options.ignoreContainers) {
				if (options.containerCost < options.plainCost) {
					key += MATRIX_LAYER_PREFER_CONTAINERS;
				} else {
					key += MATRIX_LAYER_CONTAINERS;
				}
			}
			if (options.offRoads) {
				key += MATRIX_LAYER_OFF_ROADS;
			} else {
				if (!options.ignoreRoads) {
					key += MATRIX_LAYER_ROADS;
				} else if (options.swampCost > options.plainCost) {
					key += MATRIX_LAYER_SWAMP_ROADS;
				}
			}
		}
		if (key === MATRIX_LAYER_TERRAIN) {
			return;
		}
		let [cache, time] = this.matrixCache.get(roomName) || [];
		if (!cache || Game.time >= time + MATRIX_CACHE_TIME) {
			this.matrixCache.set(roomName, [cache = {}, Game.time]);
		}
		if (!cache[key]) {
			const room = Game.rooms[roomName];
			if (room) {
				cache[key] = this.makeStructuresMatrix(room, options)
			}
		}
		return cache[key];
	}


	addHostilesToMatrix(matrix, pos, room, range) {
		Utils.lookInRange(pos, room, LOOK_CREEPS, range).forEach( item => {
			const creep = item.creep;
			if (!creep.my) {
				const {x, y} = creep.pos;
				matrix.setFast(x, y, 255);
			}
		});
		pos.findInRange(FIND_HOSTILE_POWER_CREEPS, range).forEach( creep => {
			const {x, y} = creep.pos;
			matrix.setFast(x, y, 255);
		});
	}

	makeStructuresMatrix(room, options) {
		const {
			offRoads, ignoreRoads, ignoreContainers, ignoreTunnels, ignoreStructures,
			swampCost, plainCost
		} = options;

		const matrix = new PathFinder.CostMatrix();
		const roadCost = offRoads ? 2 : 1;
		const swampRoads = swampCost > plainCost;
		const containerCost = options.containerCost <= 1 ? 1 : 5;

		if (
			!ignoreStructures ||
			!ignoreRoads ||
			!ignoreTunnels ||
			!ignoreContainers ||
			swampRoads
		) {
			const terrain = TerrainCache.get(room.name);
			room.find(FIND_STRUCTURES).forEach( structure => {
				const {x, y} = structure.pos;
				if (structure.structureType === STRUCTURE_ROAD) {
					const cell = terrain.get(x, y);
					if (!ignoreTunnels && (cell & TERRAIN_MASK_WALL)) {
						matrix.setFast(x, y, 1);
					} else if (
						(
							!ignoreRoads ||
							(swampRoads && (cell & TERRAIN_MASK_SWAMP))
						) && matrix.get(x, y) === 0
					) {
						matrix.setFast(x, y, roadCost);
					}
				} else if (structure.structureType === STRUCTURE_CONTAINER) {
					if (!ignoreContainers) {
						matrix.setFast(x, y, containerCost);
					}
				} else if (
					!ignoreStructures && (
						structure.structureType !== STRUCTURE_RAMPART ||
						(!structure.my && !structure.isPublic)
					)
				) {
					matrix.setFast(x, y, 255);
				}
			});
			if (!ignoreStructures) {
				room.find(FIND_MY_CONSTRUCTION_SITES).forEach( construction => {
					if (![STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_RAMPART].includes(construction.structureType)) {
						const {x, y} = construction.pos;
						matrix.setFast(x, y, 255);
					}
				});
			}
		}

		return matrix;
	}

}


// ============================
// PathingManager configuration
// can customize for your own needs


// default visualize path style:
const DEFAULT_PATH_STYLE = {stroke: '#fff', lineStyle: 'dashed', opacity: 0.5};

// default range:
const DEFAULT_RANGE = 1;

export const Pathing = new PathingManager({

	// list of rooms to avoid globally:
	/* avoidRooms: [], */

	// this event will be called every time creep enters new room:
	/* onRoomEnter(creep, roomName) {
		console.log(`Creep ${creep.name} entered room ${roomName}`);
	}, */

	// manager will use this function to make creeps stay in range of their target
	getCreepWorkingTarget(creep) {
		const target = creep.memory._t;
		if (!target) {
			return;
		}
		const [x, y, roomName] = target.pos;
		return {
			pos: new RoomPosition(x, y, roomName),
			range: target.range,
			priority: target.priority,
		};
	},

	// get creep GameObject from creep wrapper object
	/* getCreepInstance(creep) {
		return creep;
	}, */

	// get creep wrapper object from creep GameObject
	/* getCreepEntity(instance) {
		return instance;
	}, */

});
// module.exports = Pathing;

if (!Creep.prototype.originalMoveTo) {
	Creep.prototype.originalMoveTo = Creep.prototype.moveTo;
	Creep.prototype.moveTo = function(target, defaultOptions = {}) {
		const options = {

			range: DEFAULT_RANGE,

			visualizePathStyle: DEFAULT_PATH_STYLE,
			ignoreCreeps: true,

			// uncomment this line to enable moveOffRoad behavior:
			// moveOffRoad: true,

			...defaultOptions,
			// convenient way of providing role specific movement options (remove previous line to use):
			// ...CreepRoles[this.memory.role].getMoveOptions(defaultOptions)
		};

		// >> this part is optional. can remove it if you have own implementation of "getCreepWorkingTarget"
		const targetPos = target.pos || target;
		this.memory._t = {
			pos: [targetPos.x, targetPos.y, targetPos.roomName],
			range: options.range,
			priority: options.priority
		};
		// <<

		if (
			this.pos.inRangeTo(target, options.range) &&
			(options.moveOffExit === false || !Utils.isPosExit(this.pos))
		) {
			if (options.moveOffRoad) {
				Pathing.moveOffRoad(this, {...options, priority: -1000});
			}
			return IN_RANGE;
		}
		return Pathing.moveTo(this, target, options);
	};
}
if (!PowerCreep.prototype.originalMoveTo) {
	PowerCreep.prototype.originalMoveTo = PowerCreep.prototype.moveTo;
	PowerCreep.prototype.moveTo = Creep.prototype.moveTo;
}


Creep.prototype.moveOffRoad = function(target = undefined, defaultOptions = {}) {
	const options = {
		range: DEFAULT_RANGE,
		...defaultOptions,
	};
	if (target) {
		const targetPos = target.pos || target;
		this.memory._t = {
			pos: [targetPos.x, targetPos.y, targetPos.roomName],
			range: options.range,
			priority: options.priority
		};
	}
	return Pathing.moveOffRoad(this, options);
};


Creep.prototype.moveToRoom = function(roomName, options = {}) {
	if (this.room.name === roomName && !Utils.isPosExit(this.pos)) {
		return IN_ROOM;
	}
	return this.moveTo(new RoomPosition(25, 25, roomName), {...options, range: 23});
};
PowerCreep.prototype.moveToRoom = Creep.prototype.moveToRoom;


Creep.prototype.clearWorkingTarget = function() {
	this.memory._t = undefined;
};
PowerCreep.prototype.clearWorkingTarget = Creep.prototype.clearWorkingTarget;


// comment this line to disable registering PathingManager globally
// global.Pathing = Pathing
