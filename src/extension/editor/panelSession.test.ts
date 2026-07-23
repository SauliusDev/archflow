import { describe, expect, it } from 'vitest'
import { PanelSessionCoordinator } from './panelSession'

describe('PanelSessionCoordinator', () => {
  it('owns one pending save and replays completed transactions', () => {
    const session = new PanelSessionCoordinator({ sessionId: 'session-1', family: 'flowchart', revision: 3 })

    const begun = session.beginSave({ transactionId: 'tx-1', documentUri: 'file:///diagram.mmd', expectedHostRevision: 3, workingRevision: 4, content: 'saved' })
    expect(begun).toMatchObject({ ok: true, value: { sessionId: 'session-1', transactionId: 'tx-1' } })
    expect(session.beginSave({ transactionId: 'tx-2', documentUri: 'file:///diagram.mmd', expectedHostRevision: 3, workingRevision: 4, content: 'other' })).toMatchObject({ ok: false, code: 'persistence-conflict' })

    session.completeSave('tx-1', { success: true, hostRevision: 4, savedWorkingRevision: 4 })
    expect(session.findProcessed('tx-1')).toMatchObject({ success: true, sessionId: 'session-1', transactionId: 'tx-1', workingRevision: 4 })
    expect(session.beginSave({ transactionId: 'tx-2', documentUri: 'file:///diagram.mmd', expectedHostRevision: 4, workingRevision: 5, content: 'next' })).toMatchObject({ ok: true })
  })

  it('rejects a save after disposal and monotonically observes host revisions', () => {
    const session = new PanelSessionCoordinator({ sessionId: 'session-1', family: 'flowchart', revision: 3 })
    session.observeHostRevision(5)
    session.observeHostRevision(4)
    expect(session.baseRevision).toBe(5)
    session.dispose()

    expect(session.beginSave({ transactionId: 'tx-1', documentUri: 'file:///diagram.mmd', expectedHostRevision: 5, workingRevision: 6, content: 'saved' })).toMatchObject({ ok: false, code: 'invalid-operation' })
  })
})
