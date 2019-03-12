import * as vscode from 'vscode';


type SelectionsHistory = {
	previousOfLastSelections: vscode.Selection[],
	previousOfLastDocumentVersion: number,
	lastSelections: vscode.Selection[],
	lastDocumentVersion: number
};

type UndoItem = {
	selections: vscode.Selection[]
};

type DocumentHistory = {
	selectionsHistory: SelectionsHistory,
	undoStack: UndoItem[],
	redoStack: UndoItem[],
	lastSelectionsTimestamp: number,
	// When we undo or redo, the handleSelectionChange() listener will be triggered.
	// But we want to skip this one because it is not triggered by user or other commands.
	// To handle this case, we add the counter to count how many times we need to skip the selection change handling.
	undoRedoCounter: number
};

type AllDocumentsHistory = {
	[documentId: string]: DocumentHistory
};

const MAX_STACK_SIZE = 999;

const FOUR_SECONDS = 4 * 1000; // 4000 milliseconds for timestamp diff.

const documentsHistory: AllDocumentsHistory = {};


export async function cursorUndo() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const documentId = getDocumentId(editor.document);
	let history = documentsHistory[documentId];
	if (!history) {
		console.warn(`Expect to get cursor history of ${documentId}, but got ${history}. Going to initate a new history.`);
		initiateUndoHistory(editor);
		history = documentsHistory[documentId];
	}

	const undoItem = history.undoStack.pop(); // undoItem is undefined if stack is empty.
	if (!undoItem) {
		console.log('Nothing to undo. Skip');
		return;
	}

	pushIntoRedoStack(history, editor.selections);
	editor.selections = undoItem.selections;
	revealActiveCursor(editor);
	history.undoRedoCounter++;
	history.selectionsHistory = getInitialSelectionsHistory(editor);
}


export async function cursorRedo() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const documentId = getDocumentId(editor.document);
	let history = documentsHistory[documentId];
	if (!history) {
		throw Error(`Expect to get cursor history of ${documentId}, but got ${history}.`);
	}

	const redoItem = history.redoStack.pop(); // redoItem is undefined if stack is empty.
	if (!redoItem) {
		console.log('Nothing to redo. Skip');
		return;
	}

	pushIntoUndoStack(history, editor.selections);
	editor.selections = redoItem.selections;
	revealActiveCursor(editor);
	history.undoRedoCounter++;
	history.selectionsHistory = getInitialSelectionsHistory(editor);
}


export function initiateUndoHistory(editor: vscode.TextEditor | undefined) {
	if (!editor) {
		return;
	}
	const documentId = getDocumentId(editor.document);
	if (!documentsHistory[documentId]) {
		documentsHistory[documentId] = getInitialDocumentHistory(editor);
	}
}


export function handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent) {
	const editor = e.textEditor;
	const documentId = getDocumentId(editor.document);
	let history = documentsHistory[documentId];
	if (!history) {
		throw Error(`Expect to get a non-empty history for a document ${documentId}, but got ${history}.`);
	}

	if (history.undoRedoCounter > 0) {
		// Skip when it this is triggered by cursorUndo().
		history.undoRedoCounter--;
		return;
	}

	const {selectionsHistory, lastSelectionsTimestamp} = history;
	const timestamp = new Date().getTime();
	if (
		timestamp - lastSelectionsTimestamp > FOUR_SECONDS ||
		isLastSelectionsChangeSignificant(selectionsHistory, e.selections, editor.document.version)
	) {
		pushIntoUndoStack(history, selectionsHistory.lastSelections);
		if (history.undoStack.length > MAX_STACK_SIZE) {
			history.undoStack.shift();
		}
		history.redoStack = [];
	}
	updateHistoryWithNewSelections(history, e.selections, editor.document.version);
	history.lastSelectionsTimestamp = timestamp;
}


/**
 * We follow the rules below to decide if the change of last selections is significant:
 *
 * First, define
 *     diff1 := diff(lastSelections, previousOfLastSelections)
 *     diff2 := diff(selections, lastSelections)
 *
 * If any of the following is true for any cursor, we consider the change significant:
 *     1. # of cursors changed in diff2;
 *     2. # of cursors changed in diff1;
 *     3. Last selection is non-empty, current selection is empty;
 *     4. Last selection is empty, current selection is non-empty;
 *     5. Both anchor and active positions of the a non-empty selection changed in diff2;
 *     6. Lines moved in diff1 is less than a fifth or more than five times of lines moved in diff2.
 *     7. No document edit in diff1 (same version number), but edit in diff2 (different version number).
 *     8. Document edit in diff1 (different version number), but no edit in diff2 (same version number).
 */
function isLastSelectionsChangeSignificant(
	{previousOfLastSelections, previousOfLastDocumentVersion, lastSelections, lastDocumentVersion}: SelectionsHistory,
	selections: vscode.Selection[],
	documentVersion: number
): boolean {
	// Rule #1
	if (selections.length !== lastSelections.length) {
		return true;
	}

	// Rule #2
	if (lastSelections.length !== previousOfLastSelections.length) {
		return true;
	}

	// Rules #3 and #4
	for (let i = 0; i < selections.length; i++) {
		if (!selections[i].isEmpty && lastSelections[i].isEmpty) {
			return true;
		}
		if (selections[i].isEmpty && !lastSelections[i].isEmpty) {
			return true;
		}
	}

	// Rule #5
	for (let i = 0; i < selections.length; i++) {
		if (
			!selections[i].isEmpty &&
			!selections[i].anchor.isEqual(lastSelections[i].anchor) &&
			!selections[i].active.isEqual(lastSelections[i].active)
		) {
			return true;
		}
	}

	// Rule #6
	for (let i = 0; i < lastSelections.length; i++) {
		const diff1Lines = Math.abs(lastSelections[i].active.line - previousOfLastSelections[i].active.line);
		const diff2Lines = Math.abs(selections[i].active.line - lastSelections[i].active.line);
		if (diff1Lines * 5 < diff2Lines || diff1Lines > diff2Lines * 5) {
			return true;
		}
	}

	// Rule #7
	if ((previousOfLastDocumentVersion === lastDocumentVersion) && (lastDocumentVersion !== documentVersion)) {
		return true;
	}

	// Rule #8
	if ((previousOfLastDocumentVersion !== lastDocumentVersion) && (lastDocumentVersion === documentVersion)) {
		return true;
	}

	// Change not significant
	return false;
}


function updateHistoryWithNewSelections(history: DocumentHistory, selections: vscode.Selection[], version: number) {
	history.selectionsHistory = {
		previousOfLastSelections: history.selectionsHistory.lastSelections.map(sel => sel),
		previousOfLastDocumentVersion: history.selectionsHistory.lastDocumentVersion,
		lastSelections: selections.map(sel => sel),
		lastDocumentVersion: version
	};
}


function pushIntoUndoStack(history: DocumentHistory, selections: vscode.Selection[]) {
	const lastUndoItem = history.undoStack[history.undoStack.length - 1];
	if (!lastUndoItem || !areSelectionsEqual(selections, lastUndoItem.selections)) {
		history.undoStack.push({selections: selections.map(sel => sel)});
	}
}


function pushIntoRedoStack(history: DocumentHistory, selections: vscode.Selection[]) {
	const lastRedoItem = history.redoStack[history.redoStack.length - 1];
	if (!lastRedoItem || !areSelectionsEqual(selections, lastRedoItem.selections)) {
		history.redoStack.push({selections: selections.map(sel => sel)});
	}
}


function areSelectionsEqual(selections1: vscode.Selection[], selections2: vscode.Selection[]) {
	if (selections1.length !== selections2.length) {
		return false;
	}
	for (let i = 0; i < selections1.length; i++) {
		if (!selections1[i].isEqual(selections2[i])) {
			return false;
		}
	}
	return true;
}


function getDocumentId(document: vscode.TextDocument) {
	return document.uri.toString();
}


function getInitialDocumentHistory(editor: vscode.TextEditor) {
	return {
		selectionsHistory: getInitialSelectionsHistory(editor),
		undoStack: [],
		redoStack: [],
		lastSelectionsTimestamp: new Date().getTime(),
		undoRedoCounter: 0
	};
}


function getInitialSelectionsHistory(editor: vscode.TextEditor) {
	return {
		previousOfLastSelections: [],
		previousOfLastDocumentVersion: editor.document.version,
		lastSelections: editor.selections.map(sel => sel),
		lastDocumentVersion: editor.document.version
	};
}


/**
 * Reveal the cursor, following the rules below:
 *   1. If the cursor stop is already visible, do nothing.
 *   2. If the cursor stop is within 15 lines of visible range, simple reveal it.
 *   3. If the cursor stop is outside 15 lines of visible range, reveal it at the center of the screen.
 */
const NEARLY_VISIBLE_LINES = 15;


function revealActiveCursor(editor: vscode.TextEditor) {
	if (editor.visibleRanges.some(range => range.contains(editor.selection.active))) {
		return;
	}

	if (editor.visibleRanges.some(range => isCursorNearlyVisibleInRange(range, editor))) {
		editor.revealRange(getRangeForActiveCursor(editor.selection.active));
		return;
	}

	editor.revealRange(
		getRangeForActiveCursor(editor.selection.active),
		vscode.TextEditorRevealType.InCenter
	);
}


function isCursorNearlyVisibleInRange(visibleRange: vscode.Range, editor: vscode.TextEditor): boolean {
	const nearlyVisibleStart = visibleRange.start.with(Math.max(visibleRange.start.line - NEARLY_VISIBLE_LINES, 0));
	const nearlyVisibleEnd = visibleRange.end.with(visibleRange.end.line + NEARLY_VISIBLE_LINES);
	const nearlyVisibleRange = editor.document.validateRange(
		new vscode.Range(nearlyVisibleStart, nearlyVisibleEnd)
	);
	return nearlyVisibleRange.contains(editor.selection.active);
}


function getRangeForActiveCursor(activePosition: vscode.Position) {
	return new vscode.Range(activePosition, activePosition);
}


function getStackLog(stack: UndoItem[]) {
	const stackTexts = stack.map((item) => {
		if (item.selections.length <= 1) {
			const active = item.selections[0]!.active;
			return `(${active.line}, ${active.character})`;
		}
		const coordinates = item.selections.map(sel =>
			`(${sel.active.line}, ${sel.active.character})`
		);
		return `[${coordinates.join(', ')}]`;
	});
	return stackTexts.join(' => ');
}
