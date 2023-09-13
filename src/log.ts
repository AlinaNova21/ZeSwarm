// Use for HTML styling (Colors loosely match screeps_console)
export enum LogLevel {
  SILLY = -1,
  DEBUG,
  INFO,
  ALERT,
  WARN,
  ERROR,
  FATAL
}

const styles = {
  default: 'color: white; background-color: black',
  [LogLevel.SILLY]: 'color: blue',
  [LogLevel.DEBUG]: 'color: #008FAF',
  [LogLevel.INFO]: 'color: green',
  [LogLevel.ALERT]: 'color: #00BFAF',
  [LogLevel.WARN]: 'color: orange',
  [LogLevel.ERROR]: 'color: red',
  [LogLevel.FATAL]: 'color: yellow; background-color: red'
}

let y = 0
let tick = 0

type DeferedLogFunction = () => string

export class Logger {
  public level: LogLevel = LogLevel.INFO
  public prefix: string
  
  constructor (prefix = '') {
    this.prefix = prefix ? prefix + ' ' : ''
    this.level = LogLevel.INFO
  }

  withPrefix (prefix: string) {
    return new Logger(prefix)
  }

  log(level: LogLevel, message: string | DeferedLogFunction) {
    if (level >= this.level) {
      if (typeof message === 'function') {
        message = message()
      }
      const style = styles[level] || styles.default
      console.log(`<log severity="${level}" style="${style}">[${level}] ${this.prefix}${message}</log>`)
      // this.vlog(level, `[${level}] ${this.prefix} ${message}`)
    }
  }

  vlog (level: LogLevel, message: string) {
    if (tick !== Game.time) y = 0.2
    tick = Game.time
    const style = styles[level] || styles.default
    const color = style.match(/color: ([a-z]*)/)[1]
    const vis = new RoomVisual()
    try {
      vis.text(message, 0, y, { align: 'left', color })
    } catch (e) {}
    y += 0.8
  }

  debug (message: string | DeferedLogFunction) {
    this.log(LogLevel.DEBUG, message)
  }

  info(message: string | DeferedLogFunction) {
    this.log(LogLevel.INFO, message)
  }

  warn(message: string | DeferedLogFunction) {
    this.log(LogLevel.WARN, message)
  }

  alert(message: string | DeferedLogFunction) {
    this.log(LogLevel.ALERT, message)
  }

  error(message: string | DeferedLogFunction | Error) {
    if (message instanceof Error) {
      // message = ErrorMapper.map(message)
      message = message.stack
    }
    this.log(LogLevel.ERROR, message)
  }

  fatal(message: string | DeferedLogFunction | Error) {
    if (message instanceof Error) {
      // message = ErrorMapper.map(message)
      message = message.stack
    }
    this.log(LogLevel.FATAL, message)
  }
}

export default new Logger()
