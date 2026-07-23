import * as vscode from 'vscode'
import { FlowforgeEditorProvider } from './FlowforgeEditorProvider'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    FlowforgeEditorProvider.register(context),
    FlowforgeEditorProvider.registerLegacy(context),
    vscode.commands.registerCommand('flowforge.openFlowchart', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (target) await vscode.commands.executeCommand('vscode.openWith', target, FlowforgeEditorProvider.viewType)
    }),
    vscode.commands.registerCommand('flowforge.insertFromSelection', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor || editor.selection.isEmpty) {
        void vscode.window.showInformationMessage('Select text to insert as a flowchart node.')
        return
      }
      const label = editor.document.getText(editor.selection).replace(/[\r\n\[\]"]/g, ' ').trim()
      if (!label) return
      const id = `N_${Date.now().toString(36)}`
      const line = `${editor.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'}  ${id}[${label}]`
      const end = editor.document.lineAt(editor.document.lineCount - 1).range.end
      await editor.edit(edit => edit.insert(end, line))
    }),
  )
  openInitialFlowforgeDocument()
}

export function openInitialFlowforgeDocument(): void {
  const document = vscode.workspace.textDocuments.find(candidate =>
    candidate.uri.path.endsWith('.mmd'),
  )
  if (document) void vscode.commands.executeCommand('vscode.openWith', document.uri, FlowforgeEditorProvider.viewType)
}

export function deactivate(): void {}
