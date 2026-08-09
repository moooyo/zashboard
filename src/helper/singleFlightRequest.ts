export class SingleFlightRequest<T> {
  private generation = 0
  private current:
    | {
        controller: AbortController
        promise: Promise<void>
      }
    | undefined

  get pending() {
    return this.current !== undefined
  }

  run(
    request: (signal: AbortSignal) => Promise<T>,
    publish: (value: T) => void,
    reject?: (error: unknown) => void,
  ): Promise<void> {
    if (this.current) return this.current.promise

    const generation = this.generation
    const controller = new AbortController()
    const entry = {
      controller,
      promise: Promise.resolve(),
    }
    let response: Promise<T>
    try {
      response = request(controller.signal)
    } catch (error) {
      response = Promise.reject(error)
    }
    entry.promise = response
      .then((value) => {
        if (generation !== this.generation || controller.signal.aborted) return
        publish(value)
      })
      .catch((error) => {
        if (generation !== this.generation || controller.signal.aborted) return
        reject?.(error)
      })
      .finally(() => {
        if (this.current === entry) this.current = undefined
      })
    this.current = entry
    return entry.promise
  }

  cancel() {
    this.generation += 1
    this.current?.controller.abort()
    this.current = undefined
  }
}
