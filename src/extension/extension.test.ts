import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { openInitialFlowforgeDocument } from './extension'

describe('openInitialFlowforgeDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(vscode.workspace as unknown as { textDocuments: vscode.TextDocument[] }).textDocuments = []
  })

  it('opens an already-open MMD document with the Flowforge editor', async () => {
    const document = { uri: vscode.Uri.file('/tmp/demo.mmd'), languageId: 'plaintext' } as vscode.TextDocument
    ;(vscode.workspace as unknown as { textDocuments: vscode.TextDocument[] }).textDocuments = [document]

    openInitialFlowforgeDocument()
    await Promise.resolve()

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.openWith', document.uri, 'flowforge.editor')
  })

  it('leaves files outside the MMD scope alone', () => {
    ;(vscode.workspace as unknown as { textDocuments: vscode.TextDocument[] }).textDocuments = [
      { uri: vscode.Uri.file('/tmp/readme.md'), languageId: 'markdown' } as vscode.TextDocument,
    ]

    openInitialFlowforgeDocument()

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled()
  })
})
