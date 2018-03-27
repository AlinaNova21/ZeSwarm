export default class ErrTest {
  constructor (context) {
    this.context = context
  }

  run () {
    throw new Error('Test Error')
  }
}
