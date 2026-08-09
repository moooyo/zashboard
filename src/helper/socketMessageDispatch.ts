/** A message callback whose delayed publication can be fenced on socket close. */
export const createSocketMessageDispatch = <Value>(
  publish: (value: Value) => void,
  immediate: boolean,
  wait = 100,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const delayed = (value: Value) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      publish(value)
    }, wait)
  }
  return {
    handler: immediate ? publish : delayed,
    cancel: () => {
      if (timer === undefined) return
      clearTimeout(timer)
      timer = undefined
    },
  }
}
