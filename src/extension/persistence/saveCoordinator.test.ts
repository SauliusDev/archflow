import { describe, expect, it, vi } from 'vitest'
import { PanelSessionCoordinator } from '../editor/panelSession'
import { SaveCoordinator, type SaveHostPort } from './saveCoordinator'

function fixture(overrides: Partial<SaveHostPort> = {}) {
  let content = 'initial'
  let revision = 7
  const port: SaveHostPort = {
    documentUri: 'file:///diagram.mmd',
    readDocument: () => ({ content, revision }),
    applyContent: vi.fn(async (next: string) => { content = next; revision++; return true }),
    saveDocument: vi.fn(async () => true),
    postSaveResult: vi.fn(),
    ...overrides,
  }
  return { port, setDocument(next: string, nextRevision: number) { content = next; revision = nextRevision } }
}

describe('SaveCoordinator', () => {
  it('persists a save once and replays its result for a duplicate transaction', async () => {
    const { port } = fixture()
    const session = new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 7 })
    const coordinator = new SaveCoordinator()
    const request = { transactionId: 'tx', documentUri: port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'saved' }

    await coordinator.save(session, port, request)
    await coordinator.save(session, port, request)

    expect(port.applyContent).toHaveBeenCalledTimes(1)
    expect(port.postSaveResult).toHaveBeenCalledTimes(2)
    expect(port.postSaveResult).toHaveBeenLastCalledWith(expect.objectContaining({ success: true, transactionId: 'tx', hostRevision: 8 }))
  })

  it('waits for an in-flight duplicate transaction without completing the original pending save', async () => {
    let release!: () => void
    const { port, setDocument } = fixture({
      applyContent: vi.fn(async (next: string) => {
        await new Promise<void>(resolve => { release = resolve })
        setDocument(next, 8)
        return true
      }),
    })
    const session = new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 7 })
    const completeSave = vi.spyOn(session, 'completeSave')
    const coordinator = new SaveCoordinator()
    const request = { transactionId: 'tx', documentUri: port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'saved' }

    const original = coordinator.save(session, port, request)
    const duplicate = coordinator.save(session, port, request)
    await Promise.resolve()

    expect(session.findProcessed('tx')).toBeUndefined()
    expect(completeSave).not.toHaveBeenCalled()
    expect(port.postSaveResult).not.toHaveBeenCalled()

    release()
    await Promise.all([original, duplicate])

    expect(port.applyContent).toHaveBeenCalledTimes(1)
    expect(port.postSaveResult).toHaveBeenCalledTimes(2)
    expect(completeSave).toHaveBeenCalledTimes(1)
    expect(port.postSaveResult).toHaveBeenCalledWith(expect.objectContaining({ success: true, transactionId: 'tx' }))
  })

  it('rejects stale revisions and competing document saves without applying content', async () => {
    let release!: (value: boolean) => void
    const first = fixture({ applyContent: vi.fn(() => new Promise<boolean>(resolve => { release = resolve })) })
    const second = fixture()
    const coordinator = new SaveCoordinator()
    const owner = new PanelSessionCoordinator({ sessionId: 'owner', family: 'flowchart', revision: 7 })
    const peer = new PanelSessionCoordinator({ sessionId: 'peer', family: 'flowchart', revision: 7 })

    const pending = coordinator.save(owner, first.port, { transactionId: 'owner', documentUri: first.port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'owner' })
    await coordinator.save(peer, second.port, { transactionId: 'peer', documentUri: second.port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'peer' })
    await coordinator.save(peer, second.port, { transactionId: 'stale', documentUri: second.port.documentUri, expectedHostRevision: 6, workingRevision: 8, content: 'stale' })
    release(true)
    await pending

    expect(second.port.applyContent).not.toHaveBeenCalled()
    expect(second.port.postSaveResult).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'peer', conflict: true }))
    expect(second.port.postSaveResult).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'stale', conflict: true, hostRevision: 7 }))
  })

  it('reports apply and save failures, avoids delayed posts after disposal, and identifies local changes', async () => {
    const applyFailure = fixture({ applyContent: vi.fn(async () => false) })
    const saveFailure = fixture({ saveDocument: vi.fn(async () => false) })
    const local = fixture()
    const coordinator = new SaveCoordinator()
    const a = new PanelSessionCoordinator({ sessionId: 'a', family: 'flowchart', revision: 7 })
    const b = new PanelSessionCoordinator({ sessionId: 'b', family: 'flowchart', revision: 7 })
    await coordinator.save(a, applyFailure.port, { transactionId: 'apply', documentUri: applyFailure.port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'candidate' })
    await coordinator.save(b, saveFailure.port, { transactionId: 'save', documentUri: 'file:///second.mmd', expectedHostRevision: 7, workingRevision: 8, content: 'candidate' })
    await coordinator.save(new PanelSessionCoordinator({ sessionId: 'local', family: 'flowchart', revision: 7 }), local.port, { transactionId: 'local', documentUri: 'file:///local.mmd', expectedHostRevision: 7, workingRevision: 8, content: 'candidate' })

    expect(applyFailure.port.postSaveResult).toHaveBeenCalledWith(expect.objectContaining({ success: false, conflict: false }))
    expect(saveFailure.port.postSaveResult).toHaveBeenCalledWith(expect.objectContaining({ success: false, conflict: true }))
    expect(coordinator.findOrigin({ documentUri: 'file:///local.mmd', content: 'candidate', revision: 8 })).toMatchObject({ transactionId: 'local' })
  })

  it('does not identify a later same-content edit as the original local save', async () => {
    const { port } = fixture()
    const session = new PanelSessionCoordinator({ sessionId: 'local', family: 'flowchart', revision: 7 })
    const coordinator = new SaveCoordinator()
    await coordinator.save(session, port, { transactionId: 'local', documentUri: port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'candidate' })

    expect(coordinator.findOrigin({ documentUri: port.documentUri, content: 'candidate', revision: 8 })).toMatchObject({ transactionId: 'local' })
    expect(coordinator.findOrigin({ documentUri: port.documentUri, content: 'candidate', revision: 9 })).toBeUndefined()
  })

  it('keeps a new session document lock when a disposed session save finishes', async () => {
    let releaseOld!: (value: boolean) => void
    let releaseNew!: (value: boolean) => void
    const old = fixture({ applyContent: vi.fn(() => new Promise<boolean>(resolve => { releaseOld = resolve })) })
    const next = fixture({ applyContent: vi.fn(() => new Promise<boolean>(resolve => { releaseNew = resolve })) })
    const contender = fixture()
    const coordinator = new SaveCoordinator()
    const oldSession = new PanelSessionCoordinator({ sessionId: 'old', family: 'flowchart', revision: 7 })
    const newSession = new PanelSessionCoordinator({ sessionId: 'new', family: 'flowchart', revision: 7 })
    const contenderSession = new PanelSessionCoordinator({ sessionId: 'contender', family: 'flowchart', revision: 7 })

    const oldSave = coordinator.save(oldSession, old.port, { transactionId: 'old', documentUri: old.port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'old' })
    coordinator.disposeSession(oldSession)
    oldSession.dispose()

    const newSave = coordinator.save(newSession, next.port, { transactionId: 'new', documentUri: next.port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'new' })
    releaseOld(true)
    await oldSave

    await coordinator.save(contenderSession, contender.port, { transactionId: 'contender', documentUri: contender.port.documentUri, expectedHostRevision: 7, workingRevision: 8, content: 'contender' })
    expect(contender.port.applyContent).not.toHaveBeenCalled()
    expect(contender.port.postSaveResult).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'contender', conflict: true }))

    releaseNew(true)
    await newSave
  })
})
