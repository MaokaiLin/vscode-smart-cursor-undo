import * as vscode from 'vscode';
import * as smartCursorUndo from './smartCursorUndo';


export function activate(context: vscode.ExtensionContext) {

	const undo = vscode.commands.registerCommand('extension.smartCursorUndo.cursorUndo', smartCursorUndo.cursorUndo);
	context.subscriptions.push(undo);

	const redo = vscode.commands.registerCommand('extension.smartCursorUndo.cursorRedo', smartCursorUndo.cursorRedo);
	context.subscriptions.push(redo);

	const editorListener = vscode.window.onDidChangeActiveTextEditor(smartCursorUndo.initiateUndoHistory);
	context.subscriptions.push(editorListener);

	const selectionListener = vscode.window.onDidChangeTextEditorSelection(smartCursorUndo.handleSelectionChange);
	context.subscriptions.push(selectionListener);
}


export function deactivate() {}
