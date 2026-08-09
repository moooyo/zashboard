/** A newest-first buffer used while a live view is paused. */
export class PausedBuffer<Value> {
  private values: Value[] = []

  push(value: Value) {
    this.values.unshift(value)
  }

  get count() {
    return this.values.length
  }

  drain() {
    const values = this.values
    this.values = []
    return values
  }

  clear() {
    this.values = []
  }
}
