// The command table: the one map from every command of the manifest to its handler, or to NOT_AVAILABLE_YET while
// its feature is not built (its doors are drawn disabled with "not available yet"). CommandTable has a key for every
// CommandId (src/generated/ids.ts), so a missing or an extra entry, or a handler under another command's key, is a
// type error (src/app/commands.typecheck.ts proves it). The order is the manifest's.
import { NOT_AVAILABLE_YET, always, type CommandTable, type PredicateTable } from '../core/commands/registry.ts';
import { setLinkCommand } from '../core/elements/link.ts';
import { removeCustomAttributeCommand, setAttributeCommand, setClassesCommand, setCustomAttributeCommand, setIdCommand } from '../core/elements/attributes.ts';
import { copyCommand, pasteCommand } from '../core/clipboard/clipboard.ts';
import { setEmbedMarkupCommand } from '../core/elements/embed.ts';
import { setSvgMarkupCommand } from '../core/elements/svg.ts';
import { removeSwatchCommand, saveSwatchCommand } from '../core/design/colors.ts';
import { createToken, deleteToken, renameToken, updateToken } from '../core/design/tokens.ts';
import { applyClassCommand, createClassCommand, deleteClassCommand, detachClassCommand, renameClassCommand } from '../core/design/classes.ts';
import { createComponentCommand, detachInstanceCommand, insertInstanceCommand, instanceSelected } from '../core/design/components.ts';
import { setStyleTarget } from '../editor/inspector/style-target.ts';
import { setInputTypeCommand, setLabelTargetCommand } from '../core/elements/inputs.ts';
import { addPartCommand, movePartCommand, removePartCommand, togglePartCommand } from '../core/elements/parts.ts';
import { addColumnAfterCommand, addColumnEndCommand, addRowAfterCommand, cellSelected, inTable, removeColumnCommand, removeRowCommand } from '../core/elements/table.ts';
import { setTagCommand } from '../core/elements/tag.ts';
import { canRedo, canUndo, redoCommand, undoCommand } from '../core/history/history.ts';
import { toggleHiddenCommand, toggleLockCommand } from '../core/nodes/flags.ts';
import { renameCommand } from '../core/nodes/names.ts';
import { setPageSettingCommand } from '../core/page/settings.ts';
import { openProject, saveProject } from '../core/project/archive.ts';
import {
  addCommand,
  clearSelectionCommand,
  hasSelection,
  marqueeCommand,
  selectAllInContainerCommand,
  selectCommand,
  singleSelection,
  toggleCommand,
  walkFirstChildCommand,
  walkNextSiblingCommand,
  walkParentCommand,
  walkPreviousSiblingCommand,
} from '../core/selection/selection.ts';
import { duplicateCommand } from '../core/structure/duplicate.ts';
import { handCommands } from '../core/structure/hand.ts';
import { createNaturalChildCommand, hasNaturalChild, insertCommand } from '../core/structure/insert.ts';
import { canNestIntoPrevious, moveDownCommand, moveToCommand, moveUpCommand, nestIntoPreviousCommand, promoteCommand } from '../core/structure/move.ts';
import { deleteCommand } from '../core/structure/remove.ts';
import { canUnwrap, unwrapCommand, wrapBesideCommand, wrapColumnCommand, wrapRowCommand } from '../core/structure/wrap.ts';
import { setCustomDeclarationsCommand } from '../core/style/custom.ts';
import { setStyleCommand } from '../core/style/set.ts';
import { setSpacingCommand } from '../core/style/spacing.ts';
import { exportProject } from '../core/export/export.ts';
import { setBackgroundImageCommand } from '../core/style/background-image.ts';
import { flexOrGridContainer, setAlignmentCommand } from '../core/style/alignment.ts';
import { setBorderCommand, setRadiusCommand } from '../core/style/border.ts';
import { movePositionedCommand, positionedSelection, setPositionModeCommand } from '../core/geometry/position.ts';
import { setAnchorsCommand } from '../core/geometry/anchors.ts';
import { alignCommand, distributeCommand } from '../core/geometry/align.ts';
import { createGuideCommand, deleteGuideCommand, moveGuideCommand, toggleGuideLockCommand } from '../core/page/guides.ts';
import { setFilterCommand } from '../core/style/filter.ts';
import { setTransformCommand } from '../core/style/transform.ts';
import { setShadowsCommand } from '../core/style/shadows.ts';
import { resetAllCommand, resetValueCommand } from '../core/style/reset.ts';
import { applyColorPicker, cancelColorPicker, openColorPicker, setColorChannel, setColorFormat } from '../editor/inspector/color-picker.ts';
import { toggleSpacingLink } from '../editor/inspector/spacing.ts';
import { setTextCommand } from '../core/text/text.ts';
import { cancelEdit, editLink, insertLineBreak, pasteText, selectAllText, singleTextSelection, startEdit, toggleBold, toggleItalic } from '../editor/canvas/text-edit.ts';
import { cancelDrag, levelDown, levelUp } from '../editor/drag/drag-session.ts';
import { focusActivate, focusFirst, focusLast, focusNext, focusPrevious } from '../editor/focus/focus.ts';
import { startRename } from '../editor/layers/rename.ts';
import { collapseAll, collapseOrFocusParent, expandAll, expandOrFocusChild, search, setExpanded, setRowDetails } from '../editor/layers/tree.ts';
import { pan, zoomAt, zoomFit, zoomIn, zoomOut, zoomReset, zoomToLevel } from '../editor/view/camera.ts';
import { resizeCommand } from '../core/geometry/resize.ts';
import { toggleEqualSpacing, toggleGuidesVisible, toggleOutlines, toggleRulers, toggleSmartGuides, toggleZones } from '../editor/view/overlays.ts';
import { openDialog } from '../editor/workspace/dialogs.ts';
import { setBreakpoint } from '../editor/view/breakpoints.ts';
import { setStyleState } from '../editor/view/style-state.ts';
import { enterPreview, exitPreview } from '../editor/view/preview.ts';
import { newBlankPage } from '../core/project/project.ts';
import { restoreVersion } from '../core/project/recovery.ts';
import { takeOverEditing } from '../core/project/tab-guard.ts';
import { setSnapEnabled, setSnapSettings } from '../editor/view/snap.ts';
import { setGridSettings, toggleColumns, toggleDots, toggleRows } from '../core/page/grid.ts';
import { contextMenuOpen } from '../editor/menus/context-menu.ts';
import { dismiss } from '../editor/menus/overlays.ts';
import { setDensity, toggleGroup } from '../editor/palette/palette.ts';
import { setLanguage, setTheme } from '../editor/preferences/preferences.ts';
import type { EditorUi } from '../editor/state.ts';
import { openPageProperties } from '../editor/inspector/page-properties.ts';
import { cancelField, scrubField, setFieldUnit, stepField } from '../editor/inspector/number-field.ts';
import { revealField, searchInspector, toggleSection, setMode } from '../editor/inspector/sections.ts';
import { setOffset } from '../editor/quick-panel/quick-panel.ts';
import { setEditMode } from '../editor/canvas/edit-mode.ts';
import { stepHandle } from '../editor/canvas/handles.ts';
import { openCommandBar } from '../editor/command-bar/command-bar.ts';
import { setActiveTab, setWorkbenchState } from '../editor/workspace/layout.ts';
import { collapseDocks, setPanelOpen, toggleDeveloperTools, toggleInspector, toggleLeftDock } from '../editor/workspace/panels.ts';

// the hand's commands, for the editor state that holds the hand
const HAND = handCommands<EditorUi>();

export const COMMANDS = {
  'animation.create': NOT_AVAILABLE_YET,
  'animation.rename': NOT_AVAILABLE_YET,
  'animation.delete': NOT_AVAILABLE_YET,
  'animation.addKeyframe': NOT_AVAILABLE_YET,
  'animation.moveKeyframe': NOT_AVAILABLE_YET,
  'animation.setKeyframeEasing': NOT_AVAILABLE_YET,
  'animation.deleteKeyframe': NOT_AVAILABLE_YET,
  'animation.setSettings': NOT_AVAILABLE_YET,
  'timeline.setPlayhead': NOT_AVAILABLE_YET,
  'timeline.play': NOT_AVAILABLE_YET,
  'timeline.pause': NOT_AVAILABLE_YET,
  'timeline.stop': NOT_AVAILABLE_YET,
  'timeline.toggleLoop': NOT_AVAILABLE_YET,
  'clipboard.copy': copyCommand,
  'clipboard.paste': pasteCommand,
  'clipboard.cut': NOT_AVAILABLE_YET,
  'clipboard.copyStyle': NOT_AVAILABLE_YET,
  'clipboard.pasteStyle': NOT_AVAILABLE_YET,
  'colors.saveSwatch': saveSwatchCommand,
  'colors.removeSwatch': removeSwatchCommand,
  'tokens.create': createToken,
  'tokens.update': updateToken,
  'tokens.rename': renameToken,
  'tokens.delete': deleteToken,
  'classes.create': createClassCommand,
  'classes.apply': applyClassCommand,
  'classes.detach': detachClassCommand,
  'classes.rename': renameClassCommand,
  'classes.delete': deleteClassCommand,
  'inspector.setStyleTarget': setStyleTarget,
  'components.create': createComponentCommand,
  'components.insertInstance': insertInstanceCommand,
  'components.detach': detachInstanceCommand,
  'element.setTag': setTagCommand,
  'element.setAttribute': setAttributeCommand,
  'element.setId': setIdCommand,
  'element.setClasses': setClassesCommand,
  'element.setLink': setLinkCommand,
  'element.setInputType': setInputTypeCommand,
  'element.setLabelTarget': setLabelTargetCommand,
  'element.setCustomAttribute': setCustomAttributeCommand,
  'element.removeCustomAttribute': removeCustomAttributeCommand,
  'element.setSvgMarkup': setSvgMarkupCommand,
  'element.setEmbedMarkup': setEmbedMarkupCommand,
  'element.applyHtml': NOT_AVAILABLE_YET,
  'parts.toggle': togglePartCommand,
  'parts.add': addPartCommand,
  'parts.move': movePartCommand,
  'parts.remove': removePartCommand,
  'table.addColumnAfter': addColumnAfterCommand,
  'table.addColumnEnd': addColumnEndCommand,
  'table.removeColumn': removeColumnCommand,
  'table.addRowAfter': addRowAfterCommand,
  'table.removeRow': removeRowCommand,
  'interactions.add': NOT_AVAILABLE_YET,
  'interactions.update': NOT_AVAILABLE_YET,
  'interactions.remove': NOT_AVAILABLE_YET,
  'pages.add': NOT_AVAILABLE_YET,
  'pages.rename': NOT_AVAILABLE_YET,
  'pages.duplicate': NOT_AVAILABLE_YET,
  'pages.delete': NOT_AVAILABLE_YET,
  'pages.switch': NOT_AVAILABLE_YET,
  'files.createFolder': NOT_AVAILABLE_YET,
  'files.createFile': NOT_AVAILABLE_YET,
  'files.rename': NOT_AVAILABLE_YET,
  'files.move': NOT_AVAILABLE_YET,
  'files.delete': NOT_AVAILABLE_YET,
  'files.open': NOT_AVAILABLE_YET,
  'files.closeTab': NOT_AVAILABLE_YET,
  'files.upload': NOT_AVAILABLE_YET,
  'files.saveContent': NOT_AVAILABLE_YET,
  'assets.insertImageFile': NOT_AVAILABLE_YET,
  'focus.next': focusNext,
  'focus.previous': focusPrevious,
  'focus.first': focusFirst,
  'focus.last': focusLast,
  'focus.activate': focusActivate,
  'focus.nextRegion': NOT_AVAILABLE_YET,
  'focus.previousRegion': NOT_AVAILABLE_YET,
  'focus.canvas': NOT_AVAILABLE_YET,
  'ui.dismiss': dismiss,
  'position.setMode': setPositionModeCommand,
  'geometry.resize': resizeCommand,
  'position.move': movePositionedCommand,
  'position.setAnchors': setAnchorsCommand,
  'position.align': alignCommand,
  'position.distribute': distributeCommand,
  'handle.step': stepHandle,
  'canvas.setEditMode': setEditMode,
  'history.undo': undoCommand,
  'history.redo': redoCommand,
  'layers.startRename': startRename,
  'element.rename': renameCommand,
  'element.toggleLock': toggleLockCommand,
  'element.toggleHidden': toggleHiddenCommand,
  'element.setLayerColor': NOT_AVAILABLE_YET,
  'page.openProperties': openPageProperties,
  'page.setSetting': setPageSettingCommand,
  'project.newBlankPage': newBlankPage,
  'project.restoreVersion': restoreVersion,
  'project.takeOverEditing': takeOverEditing,
  'project.save': saveProject,
  'project.open': openProject,
  'project.openFolder': NOT_AVAILABLE_YET,
  'project.importHtml': NOT_AVAILABLE_YET,
  'project.export': exportProject,
  'selection.select': selectCommand,
  'selection.clear': clearSelectionCommand,
  'selection.add': addCommand,
  'selection.toggle': toggleCommand,
  'selection.walkNextSibling': walkNextSiblingCommand,
  'selection.walkPreviousSibling': walkPreviousSiblingCommand,
  'selection.walkParent': walkParentCommand,
  'selection.walkFirstChild': walkFirstChildCommand,
  'selection.selectAllInContainer': selectAllInContainerCommand,
  'selection.marquee': marqueeCommand,
  'contextMenu.open': contextMenuOpen,
  'element.insert': insertCommand,
  'element.moveTo': moveToCommand,
  'drag.levelUp': levelUp,
  'drag.levelDown': levelDown,
  'drag.cancel': cancelDrag,
  'element.moveUp': moveUpCommand,
  'element.moveDown': moveDownCommand,
  'element.wrapRow': wrapRowCommand,
  'element.wrapColumn': wrapColumnCommand,
  'element.wrapBeside': wrapBesideCommand,
  'element.nestIntoPrevious': nestIntoPreviousCommand,
  'element.promote': promoteCommand,
  'element.duplicate': duplicateCommand,
  'element.delete': deleteCommand,
  'element.unwrap': unwrapCommand,
  'element.createNaturalChild': createNaturalChildCommand,
  'hand.take': HAND.take,
  'hand.aimNext': HAND.aimNext,
  'hand.aimPrevious': HAND.aimPrevious,
  'hand.climb': HAND.climb,
  'hand.descend': HAND.descend,
  'hand.drop': HAND.drop,
  'style.set': setStyleCommand,
  'style.setSpacing': setSpacingCommand,
  'inspector.toggleSpacingLink': toggleSpacingLink,
  'colorPicker.open': openColorPicker,
  'colorPicker.setFormat': setColorFormat,
  'colorPicker.setChannel': setColorChannel,
  'colorPicker.apply': applyColorPicker,
  'colorPicker.cancel': cancelColorPicker,
  'style.setBorder': setBorderCommand,
  'style.setRadius': setRadiusCommand,
  'style.setBackgroundImage': setBackgroundImageCommand,
  'style.setShadows': setShadowsCommand,
  'style.setFilter': setFilterCommand,
  'style.setTransform': setTransformCommand,
  'style.setAlignment': setAlignmentCommand,
  'style.setCustomDeclarations': setCustomDeclarationsCommand,
  'style.applyCssRule': NOT_AVAILABLE_YET,
  'style.reset': resetValueCommand,
  'style.resetAll': resetAllCommand,
  'field.step': stepField,
  'field.scrub': scrubField,
  'field.setUnit': setFieldUnit,
  'field.cancel': cancelField,
  'text.startEdit': startEdit,
  'text.set': setTextCommand,
  'text.cancelEdit': cancelEdit,
  'text.insertLineBreak': insertLineBreak,
  'text.toggleBold': toggleBold,
  'text.toggleItalic': toggleItalic,
  'text.editLink': editLink,
  'text.paste': pasteText,
  'text.selectAll': selectAllText,
  'view.zoomIn': zoomIn,
  'view.zoomOut': zoomOut,
  'view.zoomReset': zoomReset,
  'view.zoomTo': zoomToLevel,
  'view.zoomFit': zoomFit,
  'view.zoomAt': zoomAt,
  'view.pan': pan,
  'view.setBreakpoint': setBreakpoint,
  'view.setEditorView': NOT_AVAILABLE_YET,
  'view.setStyleState': setStyleState,
  'view.enterPreview': enterPreview,
  'view.exitPreview': exitPreview,
  'view.toggleOutlines': toggleOutlines,
  'view.toggleZones': toggleZones,
  'view.toggleRulers': toggleRulers,
  'view.toggleSmartGuides': toggleSmartGuides,
  'view.toggleEqualSpacing': toggleEqualSpacing,
  'grid.toggleColumns': toggleColumns,
  'grid.toggleRows': toggleRows,
  'grid.toggleDots': toggleDots,
  'grid.setSettings': setGridSettings,
  'guides.create': createGuideCommand,
  'guides.move': moveGuideCommand,
  'guides.delete': deleteGuideCommand,
  'guides.toggleLock': toggleGuideLockCommand,
  'guides.toggleVisible': toggleGuidesVisible,
  'snap.setEnabled': setSnapEnabled,
  'snap.setSettings': setSnapSettings,
  'workspace.openDialog': openDialog,
  'workspace.setPanelOpen': setPanelOpen,
  'workspace.toggleLeftDock': toggleLeftDock,
  'workspace.toggleInspector': toggleInspector,
  'workspace.collapseDocks': collapseDocks,
  'workspace.toggleDeveloperTools': toggleDeveloperTools,
  'workspace.reset': NOT_AVAILABLE_YET,
  'workspace.setWorkbenchState': setWorkbenchState,
  'workspace.setActiveTab': setActiveTab,
  'workspace.resizeSplitter': NOT_AVAILABLE_YET,
  'workspace.movePanel': NOT_AVAILABLE_YET,
  'quickPanel.setOffset': setOffset,
  'preferences.setLanguage': setLanguage,
  'preferences.setTheme': setTheme,
  'commandBar.open': openCommandBar,
  'palette.toggleGroup': toggleGroup,
  'palette.setDensity': setDensity,
  'layers.setExpanded': setExpanded,
  'layers.collapseAll': collapseAll,
  'layers.expandAll': expandAll,
  'layers.expandOrFocusChild': expandOrFocusChild,
  'layers.collapseOrFocusParent': collapseOrFocusParent,
  'layers.setRowDetails': setRowDetails,
  'layers.search': search,
  'inspector.toggleSection': toggleSection,
  'inspector.setMode': setMode,
  'inspector.reveal': revealField,
  'inspector.search': searchInspector,
  'codePanel.copyPane': NOT_AVAILABLE_YET,
  'codePanel.downloadPane': NOT_AVAILABLE_YET,
} as const satisfies CommandTable<EditorUi>;

// The availability predicates code has registered; a built command's predicate must be here (createStore checks it).
export const PREDICATES = { always, canUndo, canRedo, hasSelection, singleSelection, singleTextSelection, canUnwrap, canNestIntoPrevious, cellSelected, inTable, hasNaturalChild, flexOrGridContainer, instanceSelected, positionedSelection } as const satisfies PredicateTable<EditorUi>;
