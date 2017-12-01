import {
  INT_STAGE,
  INT_TYPE,
  INT_FUNC
} from './InterruptHandler'

const segCnt = Symbol('segCnt')
const SEGMENTS = {
  [segCnt]: 0
}

function addSegment (segment) {
  console.log(`AddSegment ${segment} ${SEGMENTS[segCnt]}`)
  SEGMENTS[segment] = SEGMENTS[SEGMENTS[segCnt]++]
}

addSegment('CONFIG')
addSegment('KERNEL')
addSegment('INTERRUPT')

const PROC_RUNNING = 1
const PROC_KILLED = 2
const PROC_CRASHED = 3

const PINFO = {
  ID: 'i',
  PID: 'p',
  NAME: 'n',
  STATUS: 's',
  STARTED: 'S',
  WAIT: 'w',
  ENDED: 'e',
  PROCESS: 'P',
  ERROR: 'E'
}

export default {
  INT_FUNC,
  INT_STAGE,
  INT_TYPE,
  PROC_RUNNING,
  PROC_KILLED,
  PROC_CRASHED,
  PINFO,
  SEGMENTS,
  addSegment
}
