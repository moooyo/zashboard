export type RevisionWriteReply<Response> =
  | { status: 'saved'; revision: string; response: Response }
  | { status: 'conflict'; serverRevision?: string }
  | { status: 'error'; message: string }

export type RevisionWriteOutcome<Value, Response> =
  | {
      status: 'saved'
      revision: string
      response: Response
      attempted: Value
      baseRevision: string
    }
  | {
      status: 'conflict'
      attempted: Value
      baseRevision: string
      serverRevision?: string
    }
  | { status: 'error'; attempted: Value; baseRevision: string; message: string }

type Queue = {
  revision: string
  acceptedRevisions: Set<string>
  tail: Promise<void>
  pending: number
  conflicted: boolean
}

/**
 * Serializes whole-document writes for one session while preserving optimistic
 * concurrency across a burst of local edits.
 *
 * Every edit captures the revision visible when it was queued. Revisions
 * returned by an earlier write in the same queue are accepted as that queue's
 * lineage, so a rapid second edit uses the first write's new revision instead
 * of conflicting with itself. A real 409 fences the queue until the caller
 * explicitly clears it; later local values are returned as conflict outcomes
 * and are never silently discarded.
 */
export class SerialRevisionWriter<Value, Response> {
  private readonly queues = new Map<string, Queue>()

  enqueue(input: {
    sessionKey: string
    baseRevision: string
    value: Value
    isCurrent: () => boolean
    write: (revision: string, value: Value) => Promise<RevisionWriteReply<Response>>
  }): Promise<RevisionWriteOutcome<Value, Response>> {
    let queue = this.queues.get(input.sessionKey)
    if (!queue) {
      queue = {
        revision: input.baseRevision,
        acceptedRevisions: new Set([input.baseRevision]),
        tail: Promise.resolve(),
        pending: 0,
        conflicted: false,
      }
      this.queues.set(input.sessionKey, queue)
    }

    const selected = queue
    selected.pending += 1
    const execute = async (): Promise<RevisionWriteOutcome<Value, Response>> => {
      if (!input.isCurrent()) {
        return {
          status: 'error',
          attempted: input.value,
          baseRevision: input.baseRevision,
          message: 'backend changed',
        }
      }

      if (selected.conflicted || !selected.acceptedRevisions.has(input.baseRevision)) {
        selected.conflicted = true
        return {
          status: 'conflict',
          attempted: input.value,
          baseRevision: input.baseRevision,
        }
      }

      const reply = await input.write(selected.revision, input.value)
      if (reply.status === 'saved') {
        selected.revision = reply.revision
        selected.acceptedRevisions.add(reply.revision)
        return {
          ...reply,
          attempted: input.value,
          baseRevision: input.baseRevision,
        }
      }
      if (reply.status === 'conflict') selected.conflicted = true
      return { ...reply, attempted: input.value, baseRevision: input.baseRevision }
    }

    const result = selected.tail.then(execute, execute)
    selected.tail = result.then(
      () => undefined,
      () => undefined,
    )
    const settle = () => {
      selected.pending -= 1
      if (
        selected.pending === 0 &&
        !selected.conflicted &&
        this.queues.get(input.sessionKey) === selected
      ) {
        this.queues.delete(input.sessionKey)
      }
    }
    void result.then(settle, settle)
    return result
  }

  clear(sessionKey?: string) {
    if (sessionKey) this.queues.delete(sessionKey)
    else this.queues.clear()
  }
}
