import * as assert from 'assert';
import * as vscode from 'vscode';


suite("Smart Cursor Undo", function () {
    const TEST_TEXT_ROWS = 100;
    const TEST_TEXT_COLUMNS = 10;

    let testText: string;

    suiteSetup(() => {
        testText = '';
        for (let i = 1; i < TEST_TEXT_ROWS + 1; i++) {
            for (let j = 1; j < TEST_TEXT_COLUMNS + 1; j++) {
                testText += i;
            }
            testText += '\n';
        }
    });

    setup(async () => {
        await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
        await vscode.commands.executeCommand('selectAll');
        await vscode.commands.executeCommand('type', {"text": testText});
        await vscode.commands.executeCommand('cursorTop');
    });

    test("Should correctly go from two cursors back to one cursor (rule #1)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 0, 2);

        await vscode.commands.executeCommand('editor.action.insertCursorBelow');
        assert.equal(editor.selections.length, 2);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 1);
        assertActivePositionEqual(editor, 0, 2);
    });

    test("Should correctly go from one cursor back to three cursors (rule #1)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('editor.action.insertCursorBelow');
        await vscode.commands.executeCommand('editor.action.insertCursorBelow');
        assert.equal(editor.selections.length, 3);

        await vscode.commands.executeCommand('removeSecondaryCursors');
        assert.equal(editor.selections.length, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 3);
    });

    test("Should correctly go back to initial two-cursor state after two-cursor motion (rule #2)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorDown');
        assertActivePositionEqual(editor, 1, 0);

        await vscode.commands.executeCommand('editor.action.insertCursorBelow');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 1, 0);

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 1, 2);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 1, 0);
    });

    test("Should correctly go from non-empty selection back to empty selection (rule #3)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertSelectionEqual(editor, 0, 2, 0, 2);

        await vscode.commands.executeCommand('cursorRightSelect');
        await vscode.commands.executeCommand('cursorRightSelect');
        assertSelectionEqual(editor, 0, 2, 0, 4);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertSelectionEqual(editor, 0, 2, 0, 2);
    });

    test("Should correctly go from empty selection back to non-empty selection (rule #4)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorDown');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 1, 4);

        await vscode.commands.executeCommand('cursorLeftSelect');
        await vscode.commands.executeCommand('cursorLeftSelect');
        assertSelectionEqual(editor, 1, 4, 1, 2);

        await vscode.commands.executeCommand('cancelSelection');
        assertSelectionEqual(editor, 1, 2, 1, 2);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertSelectionEqual(editor, 1, 4, 1, 2);
    });

    test("Should correctly go back to the point where selection goes from empty to non-empty (rule #4)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 0, 2);

        await vscode.commands.executeCommand('cursorRightSelect');
        await vscode.commands.executeCommand('cursorRightSelect');
        await vscode.commands.executeCommand('cursorRightSelect');
        assertSelectionEqual(editor, 0, 2, 0, 5);

        await vscode.commands.executeCommand('cancelSelection');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertSelectionEqual(editor, 0, 7, 0, 7);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertSelectionEqual(editor, 0, 2, 0, 5);
    });

    test("Should correctly go back to the previous selection after selection expansion (rule #5)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorDown');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRightSelect');
        await vscode.commands.executeCommand('cursorRightSelect');
        assertSelectionEqual(editor, 1, 2, 1, 4);

        await vscode.commands.executeCommand('editor.action.smartSelect.expand');
        assertSelectionEqual(editor, 1, 0, 1, 10);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertSelectionEqual(editor, 1, 2, 1, 4);
    });

    test("Should correctly go back to first editing location (rule #6)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 0, 2);

        await vscode.commands.executeCommand('type', {"text": "h"});
        await vscode.commands.executeCommand('type', {"text": "i"});
        await vscode.commands.executeCommand('type', {"text": "!"});
        assertActivePositionEqual(editor, 0, 5);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertActivePositionEqual(editor, 0, 2);
    });

    test("Should correctly go back to last location when editing stopped (rule #7)", async () => {
        const editor = getEditor();

        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 0, 1);

        await vscode.commands.executeCommand('type', {"text": "h"});
        await vscode.commands.executeCommand('type', {"text": "i"});
        assertActivePositionEqual(editor, 0, 3);

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 0, 5);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertActivePositionEqual(editor, 0, 3);
    });

    test("Should correctly undo multiple times", async () => {
        const editor = getEditor();
        await vscode.commands.executeCommand('type', {"text": "0"});

        await vscode.commands.executeCommand('cursorLeft');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 0, 2);

        await vscode.commands.executeCommand('cursorDown');
        await vscode.commands.executeCommand('cursorMove', {"to": "down", "by": "line", "value": 3});
        assertActivePositionEqual(editor, 4, 2);

        await vscode.commands.executeCommand('cursorLeft');
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand("editor.action.insertCursorBelow");
        await vscode.commands.executeCommand("editor.action.insertCursorBelow");
        assert.equal(editor.selections.length, 3);

        await vscode.commands.executeCommand("cursorDown");
        await vscode.commands.executeCommand("cursorDown");
        assertActivePositionEqual(editor, 6, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 3);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 2);

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 3);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 1);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertActivePositionEqual(editor, 0, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertActivePositionEqual(editor, 0, 0);
    });

    test("Should correctly redo", async () => {
        const editor = getEditor();
        await vscode.commands.executeCommand('type', {"text": "0"});

        await vscode.commands.executeCommand('cursorLeft');
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorRight');
        assertActivePositionEqual(editor, 0, 2);

        await vscode.commands.executeCommand('cursorDown');
        await vscode.commands.executeCommand('cursorMove', {"to": "down", "by": "line", "value": 3});
        assertActivePositionEqual(editor, 4, 2);

        await vscode.commands.executeCommand('cursorLeft');
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand("editor.action.insertCursorBelow");
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand("cursorDown");
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 5, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 1);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assertActivePositionEqual(editor, 0, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorRedo');
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorRedo');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorRedo');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 5, 1);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorUndo');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 1);

        await vscode.commands.executeCommand('cursorRight');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 2);

        await vscode.commands.executeCommand('extension.smartCursorUndo.cursorRedo');
        assert.equal(editor.selections.length, 2);
        assertActivePositionEqual(editor, 4, 2);
    });

    function getEditor(): vscode.TextEditor {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw assert.fail(`Expect to have an active editor, but got ${editor}.`);
        }
        return editor;
    }

    function assertActivePositionEqual(editor: vscode.TextEditor, line: number, character: number) {
        const expectedPosition = new vscode.Position(line, character);
        const position = editor.selection.active;
        assert.deepEqual(position, expectedPosition);
    }

    function assertSelectionEqual(
        editor: vscode.TextEditor,
        anchorLine: number, anchorCharacter: number,
        activeLine: number, activeCharacter: number,
    ) {
        const s = editor.selection;
        assert.equal(s.anchor.line, anchorLine);
        assert.equal(s.anchor.character, anchorCharacter);
        assert.equal(s.active.line, activeLine);
        assert.equal(s.active.character, activeCharacter);
    }
});
