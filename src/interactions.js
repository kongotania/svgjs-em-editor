/**
 * interactions.js
 *
 * Defines InteractionManager class to handle all user inputs:
 * drag/drop, mouse clicks, keyboard, context menu, zoom, inline editing.
 */
import { ELEMENT_TYPES } from './elements.js';
/**
 * InteractionManager - Handles user interactions with the canvas and elements.
 */
export class InteractionManager {
    constructor(canvas, elementManager, connectionManager) {
        this.canvas = canvas;
        this.elementManager = elementManager;
        this.connectionManager = connectionManager;

        // State tracking
        this.selectedElement = null;
        this.currentDraggingElement = null;
        this.currentEditingDiv = null;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.isPanningKeyPressed = false;
        this.zoom = 1;
        this.clickTimeout = null;
        this.lastClickTargetId = null; // Store the ID of the element from the first click
        this.MAX_DBL_CLICK_TIME = 300; // Milliseconds for double click threshold
        // --- CHANGE: Get references to BOTH context menus ---
        this.elementContextMenu = document.getElementById('element-context-menu');
        this.connectionContextMenu = document.getElementById('connection-context-menu');
        this.contextTargetConnection = null; // Store connection when its menu is shown

        // Bind 'this' context for event handlers that need it
        this.handleInlineEditorKeyDown = this.handleInlineEditorKeyDown.bind(this);
        this.handleInlineEditorBlur = this.handleInlineEditorBlur.bind(this);
        this.handleCanvasMouseDown = this.handleCanvasMouseDown.bind(this);
        this.handleCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
        this.handleCanvasMouseUp = this.handleCanvasMouseUp.bind(this);
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleDrop = this.handleDrop.bind(this);

        // Initialize all event listeners
        this.initEvents();
    }

    /**
     * Initialize all event listeners for canvas, document, UI controls.
     */
    initEvents() {
        console.log(">>>initEvents");
        // Canvas interaction listeners
        this.canvas.node.addEventListener('mousedown', this.handleCanvasMouseDown);
        this.canvas.node.addEventListener('mousemove', this.handleCanvasMouseMove);
        this.canvas.node.addEventListener('mouseup', this.handleCanvasMouseUp);
        this.canvas.node.addEventListener('click', this.handleCanvasClick);
        this.canvas.node.addEventListener('contextmenu', e => e.preventDefault());
        this.canvas.node.addEventListener('dblclick', this.handleDoubleClick);

        // Global keyboard listeners
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);

        // Refined context menu actions and controls/palette actions
        document.getElementById('ctx-el-delete')?.addEventListener('click', () => {
            console.log("Element context menu: Delete");
            if (this.currentEditingDiv && this.selectedElement) {
                this.cancelInlineEdit(false); // Cancel edit, no menu as element is being deleted
            }
            if (this.selectedElement) {
                const elementToRemove = this.selectedElement;
                this.selectElement(null); // Deselect BEFORE removing, ensures menus are hidden
                this.elementManager.removeElement(elementToRemove);
            }
            // this.hideAllContextMenus(); // selectElement(null) should handle this
        });

        document.getElementById('ctx-el-connect')?.addEventListener('click', () => {
            console.log("Element context menu: Connect");
            if (this.currentEditingDiv && this.selectedElement) {
                this.handleSaveName(false); // Save edit, no menu for this element
                // Element remains selected to start connection
            }
            if (this.selectedElement) {
                this.connectionManager.startConnection(this.selectedElement);
            }
            this.hideAllContextMenus(); // Hide menu after initiating connection
        });

        document.getElementById('ctx-el-edit')?.addEventListener('click', () => {
            console.log("Element context menu: Edit Properties");
            if (this.selectedElement) {
                // showNameEditor hides menus and handles existing edits
                this.showNameEditor(this.selectedElement);
            } else {
                this.hideAllContextMenus(); // Should not happen if element is selected for menu
            }
        });

        document.getElementById('ctx-conn-delete')?.addEventListener('click', () => {
            console.log("Connection context menu: Delete");
            if (this.contextTargetConnection) {
                this.connectionManager.removeConnection(this.contextTargetConnection);
                this.hideAllContextMenus();
            } else {
                this.hideAllContextMenus();
            }
        });

        // Helper for actions that should save edit, then deselect
        const globalUiActionHandler = () => {
            console.log(">>>globalUiActionHandler")
            if (this.currentEditingDiv && this.selectedElement) {
                this.handleSaveName(false); // Save, no menu
                this.selectElement(null);   // Deselect
            } else if (this.selectedElement) { // If just selected, not editing
                this.selectElement(null);   // Deselect
            }
        };

        document.getElementById('zoom-in')?.addEventListener('click', () => {
            globalUiActionHandler();
            this.setZoom(this.zoom * 1.2);
        });

        document.getElementById('zoom-out')?.addEventListener('click', () => {
            globalUiActionHandler();
            this.setZoom(this.zoom * 0.8);
        });

        document.getElementById('reset-view')?.addEventListener('click', () => {
            globalUiActionHandler();
            this.setZoom(1);
            const drawingArea = document.getElementById('drawing-area');
            if (drawingArea) {
                this.canvas.viewbox(0, 0, drawingArea.clientWidth, drawingArea.clientHeight);
            }
        });

        const paletteItems = document.querySelectorAll('.palette-item');
        paletteItems.forEach(item => {
            item.addEventListener('dragstart', e => {
                globalUiActionHandler(); // Save and deselect if starting a drag from palette
                e.dataTransfer.setData('text/plain', item.dataset.type);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Canvas drop zone setup
        this.canvas.node.addEventListener('dragover', e => {
            console.log(">>>canvas dragover");
            e.preventDefault(); // Necessary to allow drop
            e.dataTransfer.dropEffect = 'copy';
        });
        this.canvas.node.addEventListener('drop', this.handleDrop);
        console.log("<<<initEvents");
    }

    handleCanvasMouseDown(e) {
        // ** Keep your prominent log if you still want it, or use this one: **
        console.log(`%c>>> handleCanvasMouseDown - Target: ${e.target?.id || e.target?.tagName}, currentEditingDiv: ${!!this.currentEditingDiv}`, "color: #FF8C00; font-weight: bold;");

        const target = e.target;
        const elementId = this.findElementId(target);

        if (elementId) { // Mousedown on an element
            // If currentEditingDiv is set AND it's for a DIFFERENT element than the one clicked
            if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== elementId) {
                // The blur event on the div being edited should ideally handle saving.
                // A mousedown on another element will cause the current editor to lose focus.
                // So, we don't need to aggressively cancel/save here.
                // Let blur + the subsequent click handler for the new element manage state.
                console.log("    handleCanvasMouseDown: Mousedown on a different element while editing. Letting blur handle the active edit.");
                // ** Start delete **
                // this.cancelInlineEdit(); // Let blur handle this.
                // ** End delete **
            }
            // If mousedown is on the element *being* edited, do nothing here.
            // Let click/dblclick/blur handlers manage it.
        } else { // Mousedown on canvas background or connection (not an element)
            // ** Start change - Remove premature edit cancellation **
            // If an edit is active, a mousedown on the background will cause the editor div to blur.
            // The blur handler (handleInlineEditorBlur) is responsible for saving the edit.
            // We should NOT cancel or save the edit here in mousedown.
            if (this.currentEditingDiv) {
                console.log("    handleCanvasMouseDown: Mousedown on canvas BG while editing. Letting blur handle the edit.");
                // ** Start delete **
                // this.cancelInlineEdit(); // DO NOT CANCEL EDIT HERE
                // ** End delete **
            }
            // ** End change **

            // Panning logic (middle mouse or spacebar+left click)
            if (e.button === 1 || e.buttons === 4 || (e.button === 0 && this.isPanningKeyPressed)) {
                // If an edit was active, it will blur and save/cancel via its own handlers.
                // Then panning can start.
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                this.canvas.node.style.cursor = 'grabbing';
                e.preventDefault(); // Prevent text selection during pan, etc.
            }
        }
    }
    /** Mousemove on canvas: Handle panning or update temporary connection line. */
    handleCanvasMouseMove(e) { // (Keep as is)
        console.log(">>>handleCanvasMouseMove");
        if (this.isPanning) {
            const dx = e.clientX - this.panStartX;
            const dy = e.clientY - this.panStartY;
            const viewbox = this.canvas.viewbox();
            const currentZoom = this.zoom || 1;
            const newX = viewbox.x - dx / currentZoom;
            const newY = viewbox.y - dy / currentZoom;
            this.canvas.viewbox(newX, newY, viewbox.width, viewbox.height);
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
        } else if (this.connectionManager.connectionMode) {
            const point = this.getCanvasPoint(e.clientX, e.clientY);
            this.connectionManager.updateTempConnection(point.x, point.y);
        }
    }

    /** Mouseup on canvas: End panning. */
    handleCanvasMouseUp(e) {
        console.log(">>>handleCanvasMouseUp");
        if (this.isPanning) {
            this.isPanning = false;
            // Reset cursor only if space isn't still held down
            if (!this.isPanningKeyPressed) {
                this.canvas.node.style.cursor = '';
            }
        }
        // Element drag ending is handled by the plugin's 'dragend' listener
        // Click actions (selection, connection end) are handled by 'click'
    }

    handleCanvasClick(e) {
        console.log(">>> handleCanvasClick - Target:", e.target?.id || e.target?.tagName, "Selected:", this.selectedElement?.id, "Editing:", this.currentEditingDiv ? this.currentEditingDiv.closest('.element')?.id : "null");

        // ** Start Delete - old justDoubleClicked flag logic (if any) **
        // if (this.justDoubleClicked) {
        //     console.log("    handleCanvasClick: Ignoring click, assuming it was part of a handled double-click.");
        //     this.justDoubleClicked = false; 
        //     return;
        // }
        // ** End Delete **

        const target = e.target;
        const elementId = this.findElementId(target);

        // --- Click on an Element ---
        if (elementId) {
            const clickedElement = this.elementManager.getElementById(elementId);
            if (!clickedElement) return;

            // Clear any pending single click action because a new click has occurred
            if (this.clickTimeout) {
                clearTimeout(this.clickTimeout);
                this.clickTimeout = null;
                console.log("    handleCanvasClick: Cleared pending single click due to new click on element.");
            }
            this.lastClickTargetId = elementId; // Store ID for dblclick check

            this.clickTimeout = setTimeout(() => {
                console.log(`    handleCanvasClick (TIMEOUT EXPIRED for ${elementId}): Executing single click logic.`);
                this.clickTimeout = null; // Clear the timeout ID
                this.lastClickTargetId = null; // Clear the target

                // Proceed with single click logic only if a double click didn't cancel this
                if (this.connectionManager.connectionMode) {
                    if (this.currentEditingDiv && this.selectedElement) {
                        this.handleSaveName(false);
                    }
                    if (this.selectedElement !== clickedElement && this.selectedElement === this.connectionManager.sourceElement) {
                        const oldSelectedSvg = this.canvas.findOne(`#${this.selectedElement.id}`);
                        oldSelectedSvg?.removeClass('element-selected');
                    }
                    this.connectionManager.completeConnection(clickedElement);
                    // e.stopPropagation(); // Not available in setTimeout, but action is done.
                    return;
                }

                if (this.currentEditingDiv && this.selectedElement?.id === clickedElement.id) {
                    if (target.classList.contains('element-content-div')) { // target might be stale here, better to re-check class on currentEditingDiv
                        console.log("    handleCanvasClick (TIMEOUT): Click inside contentEditable div. Allowing text interaction (already happened).");
                        return;
                    }
                    console.log("    handleCanvasClick (TIMEOUT): Clicked on rect/border of currently edited element. Saving and showing menu.");
                    this.handleSaveName(true);
                    return;
                }

                if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== clickedElement.id) {
                    console.log(`    handleCanvasClick (TIMEOUT): Was editing ${this.selectedElement.id}, now clicking ${clickedElement.id}. Saving previous.`);
                    this.handleSaveName(false);
                }

                if (this.selectedElement === clickedElement) {
                    console.log(`    handleCanvasClick (TIMEOUT): Clicked on already selected element ${clickedElement.id}. Deselecting (toggle off).`);
                    this.selectElement(null);
                } else {
                    console.log(`    handleCanvasClick (TIMEOUT): Clicked on new/unselected element ${clickedElement.id}. Selecting.`);
                    this.selectElement(clickedElement);
                }
            }, this.MAX_DBL_CLICK_TIME); // Wait for a potential double click

            e.stopPropagation(); // Stop propagation for the immediate click event
            return; // IMPORTANT: Return here, logic is now in setTimeout
        }

        // --- Click on a Connection or Empty Canvas (if not an element click) ---
        // Clear any pending single click on an element if we click elsewhere
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
            this.lastClickTargetId = null;
            console.log("    handleCanvasClick: Clicked elsewhere, cleared pending single click on element.");
        }

        const connectionId = this.findConnectionId(target);
        if (connectionId) {
            // ... (connection click logic as before) ...
            const connection = this.connectionManager.connections.find(c => c.id === connectionId);
            if (connection) {
                if (this.currentEditingDiv && this.selectedElement) {
                    this.handleSaveName(false);
                }
                this.selectElement(null);
                this.showContextMenuForConnection(connection, e.clientX, e.clientY);
                e.stopPropagation();
            }
            return;
        }

        // Click on Empty Canvas Background
        console.log("    handleCanvasClick: Clicked on canvas background.");
        if (this.currentEditingDiv && this.selectedElement) {
            console.log("        handleCanvasClick: An edit was active. Blur should have saved. Forcing save & deselecting.");
            this.handleSaveName(false);
        }
        this.selectElement(null);

        if (this.connectionManager.connectionMode) {
            this.connectionManager.cancelConnection();
        }
    }

    handleDoubleClick(e) {
        console.log(">>>handleDoubleClick");
        const target = e.target;
        if (target.classList.contains('element-content-div') && target.contentEditable === 'true') {
            return;
        }

        const elementId = this.findElementId(target);
        if (elementId) {
            // ** Start Change: Double click cancels pending single click **
            if (this.clickTimeout && this.lastClickTargetId === elementId) {
                clearTimeout(this.clickTimeout);
                this.clickTimeout = null;
                this.lastClickTargetId = null;
                console.log(`    handleDoubleClick: Double-click on ${elementId}, cleared pending single click action.`);
            }
            // ** End Change **

            const element = this.elementManager.getElementById(elementId);
            if (element) {
                console.log("    handleDoubleClick: Hiding menus before starting editor for", element.id);
                this.hideAllContextMenus();
                if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== element.id) {
                    this.handleSaveName(false);
                }

                // ** Start Delete - old justDoubleClicked flag logic **
                // this.justDoubleClicked = true; 
                // ** End Delete **

                this.showNameEditor(element);
                e.stopPropagation();
            }
        }
    }

    /** Global KeyDown handler. */
    handleKeyDown(e) {
        console.log(`>>> handleKeyDown: Key='${e.key}', currentEditingDiv=${!!this.currentEditingDiv}, selectedElement=${this.selectedElement?.id}`);

        if (this.currentEditingDiv) { // If an edit is active
            if (e.key === 'Escape') {
                if (this.connectionManager.connectionMode) {
                    console.log("    Global handleKeyDown: Escape while editing & connectionMode - cancelling connection.");
                    this.connectionManager.cancelConnection();
                    e.preventDefault(); // Prevent Escape from also cancelling edit immediately
                    return;
                }
                // Let the div's specific keydown handler (handleInlineEditorKeyDown) process Escape.
                // It will call cancelInlineEdit(true).
                console.log("    Global handleKeyDown: Escape while editing - DEFERRING to inline editor's Escape handler.");
                // Do not stop propagation or prevent default here, let it reach the div.
                return;
            }
            // For other keys (like Enter, text input), also defer to the div's handler.
            console.log("    Global handleKeyDown: Key while editing (not Esc) - DEFERRING to inline editor.");
            return;
        }

        // If NOT editing:
        if (e.key === 'Delete' && this.selectedElement) {
            console.log("    Global handleKeyDown: Delete on selected element (not editing).");
            this.elementManager.removeElement(this.selectedElement);
            // removeElement should trigger deselection through interactions.selectedElement = null,
            // but let's be explicit:
            this.selectElement(null); // This will hide menus.
        } else if (e.key === 'Escape') {
            console.log("    Global handleKeyDown: Escape (not editing and no connection mode to cancel here).");
            if (this.connectionManager.connectionMode) { // Should be caught by earlier check if editing
                this.connectionManager.cancelConnection();
            } else {
                this.hideAllContextMenus();
                this.selectElement(null);
            }
        } else if (e.key === ' ' && !e.repeat) {
            this.isPanningKeyPressed = true;
            this.canvas.node.style.cursor = 'grab';
            e.preventDefault();
        }
    }

    /** Global KeyUp handler. */
    handleKeyUp(e) {
        if (e.key === ' ') {
            if (this.isPanningKeyPressed) {
                this.isPanningKeyPressed = false;
                // Only reset cursor if panning wasn't also initiated by mouse button
                if (!this.isPanning) {
                    this.canvas.node.style.cursor = '';
                }
            }
        }
    }

    /** Handle drop from palette onto canvas. */
    handleDrop(e) {
        console.log(">>> handledrop");
        e.preventDefault();
        // console.log(">>> handleDrop");
        if (this.currentEditingDiv) this.cancelInlineEdit(); // Cancel any active edit

        const type = e.dataTransfer.getData('text/plain'); // Use text/plain
        if (!type || !ELEMENT_TYPES[type.toUpperCase().replace('-', '_')]) { // Basic validation
            console.warn("Invalid type dropped:", type);
            return;
        }
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        const element = this.elementManager.createElement(type, point.x, point.y);

        if (element) {
            // console.log("--- Element created via drop, showing name editor");
            this.selectElement(element);
            this.showNameEditor(element); // Start editing the new element
        } else {
            console.error("Failed to create element from drop.");
        }
    }

    hideAllContextMenus() {
        console.log("%c>>> hideAllContextMenus", "background: #fff0f0; color: red;");
        if (this.elementContextMenu && this.elementContextMenu.style.display !== 'none') {
            this.elementContextMenu.style.display = 'none';
            console.log("    hideAllContextMenus: Element context menu hidden.");
        }
        if (this.connectionContextMenu && this.connectionContextMenu.style.display !== 'none') {
            this.connectionContextMenu.style.display = 'none';
            console.log("    hideAllContextMenus: Connection context menu hidden.");
        }
        this.contextTargetConnection = null;
        console.log("%c<<< hideAllContextMenus", "background: #fff0f0; color: red;");
    }
    
    /** Hide context menu UI. */
    hideContextMenu() {
        console.log(">>>hideContexMenu");
        if (this.contextMenu && this.contextMenu.style.display !== 'none') {
            // console.log("Hiding context menu");
            this.contextMenu.style.display = 'none';
            // Restore default delete handler to prevent potential memory leaks from temp handlers
            const deleteButton = document.getElementById('delete-element');
            if (deleteButton) deleteButton.onclick = this.handleDeleteElement;
        }
    }

    // --- CHANGE: Renamed showContextMenuForElement (logic remains similar) ---
    /** Calculates position and shows the ELEMENT context menu relative to the element */
    showElementContextMenu(element) {
        if (!element || !this.elementContextMenu) return;
        console.log(`%c>>> showElementContextMenu for ${element.id}. Current display: ${this.elementContextMenu.style.display}`, "background: #f0ffff; color: blue;");
        // Hide the other menu first
        if (this.connectionContextMenu) this.connectionContextMenu.style.display = 'none';
        this.contextTargetConnection = null;

        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (!svgGroup) return;

        try {
            const bbox = svgGroup.bbox();
            const svgPoint = this.canvas.node.createSVGPoint();
            svgPoint.x = bbox.x + bbox.width + 5; // Position top-right + offset
            svgPoint.y = bbox.y;

            const ctm = this.canvas.node.getScreenCTM();
            if (!ctm) { throw new Error("Cannot get CTM"); }

            const screenPoint = svgPoint.matrixTransform(ctm);

            this.elementContextMenu.style.left = `${screenPoint.x}px`;
            this.elementContextMenu.style.top = `${screenPoint.y}px`;
            this.elementContextMenu.style.display = 'block';
            console.log(`Showing element context menu for ${element.id}`);

        } catch (err) {
            console.error("Error calculating element context menu position:", err);
            // Fallback: Show near element origin (less accurate)
            this.elementContextMenu.style.left = `${element.x + element.width}px`;
            this.elementContextMenu.style.top = `${element.y}px`;
            this.elementContextMenu.style.display = 'block';
        }
        console.log(`%c<<< showElementContextMenu for ${element.id} SET TO BLOCK. New display: ${this.elementContextMenu.style.display}`, "background: #f0ffff; color: blue; font-weight:bold;");

    }

    // --- NEW: showContextMenuForConnection ---
    /** Shows the CONNECTION context menu at specific screen coordinates */
    showContextMenuForConnection(connection, screenX, screenY) {
        console.log(">>>showContextMenuForConnection");
        if (!connection || !this.connectionContextMenu) return;

        // Hide the other menu first
        if (this.elementContextMenu) this.elementContextMenu.style.display = 'none';
        this.selectedElement = null; // Ensure no element seems selected

        // Store the target connection for the delete handler
        this.contextTargetConnection = connection;

        // Position and show
        this.connectionContextMenu.style.left = `${screenX}px`;
        this.connectionContextMenu.style.top = `${screenY}px`;
        this.connectionContextMenu.style.display = 'block';
        console.log(`Showing connection context menu for ${connection.id}`);
    }

    /** Show the inline name editor for an element. */
    showNameEditor(element) {
        console.log(">>> showNameEditor ", element.id);
        if (!element)
            return;
        console.log(`%c>>> showNameEditor for element: ${element.id} (name: '${element.name}', type: '${element.type}')`, "color: red; font-weight: bold;")
        // --- Ensure menus are hidden when starting edit ---
        this.hideAllContextMenus();

        //** Start change **
        // Cancel edit on any other element first
        if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== element.id) {
            console.log("    showNameEditor: Cancelling edit on different element:", this.selectedElement.id);
            this.cancelInlineEdit();
        }
        // Don't re-open if already editing this one
        if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id === element.id) {
            console.log("    showNameEditor: Already editing this element:", element.id);
            return;
        }

        // Ensure element is selected 
        const shouldSelect = this.selectedElement !== element;
        if (shouldSelect) {
            console.log("    showNameEditor: Selecting element:", element.id);
            this.selectedElement = element;
            const svgElem = this.canvas.findOne(`#${element.id}`);
            if (svgElem) {
                svgElem.addClass('element-selected');
                console.log("        showNameEditor: Added 'element-selected' class to SVG for:", element.id);
            } else {
                console.warn("        showNameEditor: SVG element not found for selection:", element.id);
            }

        }

        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (!svgGroup) {
            console.error(`   !!! FAILED to find SVG Group for #${element.id}`);
            return;
        }
        console.log("    showNameEditor: Found SVG Group:", svgGroup.node);

        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj'); // We kept this class for the foreignObject
        if (!foreignObjectWrapper || !foreignObjectWrapper.node) {
            console.error(`   !!! FAILED to find .element-editor-fobj or node inside #${element.id}`);
            return;
        }

        const contentDivNode = foreignObjectWrapper.node.querySelector('div.element-content-div');
        if (!contentDivNode) {
            console.error(`   !!! FAILED to find div.element-content-div using querySelector!`);
            return;
        }

        console.log("    showNameEditor: Found contentDivNode:", contentDivNode);
        console.log("        contentDivNode initial textContent:", contentDivNode.textContent);
        console.log("        contentDivNode initial contentEditable:", contentDivNode.contentEditable);
        console.log("        foreignObjectWrapper initial pointer-events:", foreignObjectWrapper.attr('pointer-events'));
        // Make the foreignObject interactive (important for the div within it to receive events)
        foreignObjectWrapper.attr('pointer-events', 'auto');
        console.log("    showNameEditor: Set foreignObjectWrapper pointer-events to 'auto'. Now:", foreignObjectWrapper.attr('pointer-events'));

        contentDivNode.setAttribute('tabindex', '-1');
        console.log("    showNameEditor: Set contentDivNode tabindex to '-1'. Now:", contentDivNode.getAttribute('tabindex'));

        contentDivNode.contentEditable = 'true';
        contentDivNode.classList.add('editing');
        console.log("    showNameEditor: Set contentDivNode.contentEditable to 'true'. Now:", contentDivNode.contentEditable);
        console.log("    showNameEditor: Added 'editing' class to contentDivNode. Classes:", contentDivNode.className);
        // Text is already set from element.createSVG or previous edits.
        // contentDivNode.textContent = element.name || element.type; // Set current name

        try {
            setTimeout(() => {
                console.log("    showNameEditor (setTimeout): Attempting to focus and select text on:", contentDivNode);

                if (contentDivNode && typeof contentDivNode.focus === 'function') {
                    contentDivNode.focus();
                    console.log("        showNameEditor (setTimeout): contentDivNode focused. document.activeElement:", document.activeElement);

                    // Select all text for easier editing
                    const range = document.createRange();
                    range.selectNodeContents(contentDivNode);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    console.log("        showNameEditor (setTimeout): Text selected.");

                } else {
                    console.error("   !!! (async) contentDivNode or focus function missing!");
                }
            }, 0);
        } catch (err) {
            console.error("   Focus/Select outer try/catch FAILED:", err);
        }

        contentDivNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        contentDivNode.addEventListener('keydown', this.handleInlineEditorKeyDown);

        console.log("    showNameEditor: About to add BLUR listener. contentDivNode exists:", !!contentDivNode);
        console.log("        showNameEditor: this.handleInlineEditorBlur is function:", typeof this.handleInlineEditorBlur === 'function');
        contentDivNode.removeEventListener('blur', this.handleInlineEditorBlur);
        contentDivNode.addEventListener('blur', this.handleInlineEditorBlur);
        console.log("    showNameEditor: Added keydown and blur listeners to contentDivNode.");

        try {
            setTimeout(() => {
                // ** Start Add: Log before focus **
                console.log("    showNameEditor (setTimeout): Attempting to focus contentDivNode. Current activeElement:", document.activeElement?.id || document.activeElement?.tagName);
                // ** End Add **
                if (contentDivNode && typeof contentDivNode.focus === 'function') {
                    contentDivNode.focus({ preventScroll: true });
                    // ** Start Add: Log after focus **
                    console.log("    showNameEditor (setTimeout): Called focus(). New activeElement:", document.activeElement?.id || document.activeElement?.tagName);
                    // ** End Add **
                    if (document.activeElement === contentDivNode) {
                        const range = document.createRange();
                        range.selectNodeContents(contentDivNode);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                        console.log("        showNameEditor (setTimeout): Text selected.");
                    } else {
                        console.warn("        showNameEditor (setTimeout): Focus call did NOT result in contentDivNode being activeElement.");
                    }
                }
            }, 0);
        } catch (err) { console.error("   Focus/Select outer try/catch FAILED:", err); }

        this.currentEditingDiv = contentDivNode;
        console.log("<<< showNameEditor finished for:", element.id, "currentEditingDiv set.");
    }

    cancelInlineEdit(showMenuAfter = true) {
        if (!this.selectedElement || !this.currentEditingDiv) {
            console.log("CancelInlineEdit: No selected element or no current editing div. Aborting.");
            return;
        }
        const element = this.selectedElement; // Capture before state changes
        const divNode = this.currentEditingDiv;
        console.log(`%c>>> cancelInlineEdit for ${element.id}. showMenuAfter=${showMenuAfter}`, "background: #ffe4b5; color: #8b4513;");

        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (!svgGroup) {
            console.error("    cancelInlineEdit: SVG group not found for", element.id);
            this.currentEditingDiv = null; // Still clear this
            return;
        }

        divNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        divNode.removeEventListener('blur', this.handleInlineEditorBlur);

        divNode.textContent = element.name || element.type;
        divNode.contentEditable = 'false';
        divNode.classList.remove('editing');
        divNode.removeAttribute('tabindex'); // Clean up tabindex

        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj');
        foreignObjectWrapper?.attr('pointer-events', 'none');

        this.currentEditingDiv = null;

        if (showMenuAfter) {
            console.log(`    cancelInlineEdit: Attempting to show menu for ${element.id}.`);
            this.showElementContextMenu(element); // Element is still selected
        } else {
            console.log(`    cancelInlineEdit: Not showing menu for ${element.id}, hiding all.`);
            this.hideAllContextMenus();
        }
        console.log(`%c<<< cancelInlineEdit for ${element.id} finished.`, "background: #ffe4b5; color: #8b4513;");
    }

    handleSaveName(showMenuAfter = true) {
        console.log(`%c>>> handleSaveName ENTRY. Parameter showMenuAfter = ${showMenuAfter}. For element: ${this.selectedElement?.id}, currentEditingDiv exists: ${!!this.currentEditingDiv}`, "background: #d0f0d0; color: darkgreen;");

        const elementToSave = this.selectedElement;
        const divToSaveFrom = this.currentEditingDiv;

        if (!elementToSave || !divToSaveFrom) {
            console.log("HandleSaveName: No selected element or current editing div. Aborting. showMenuAfter hint:", showMenuAfter);
            return;
        }
        console.log(`%c>>> handleSaveName for ${elementToSave.id}. showMenuAfter=${showMenuAfter}`, "background: #e0ffe0; color: green;");

        const newNameRaw = divToSaveFrom.innerText; // Use innerText to get visually rendered text including newlines
        const newName = newNameRaw.trim(); // Still trim leading/trailing whitespace from the whole block
        console.log("    handleSaveName: Raw innerText from div:", JSON.stringify(newNameRaw));
        console.log("    handleSaveName: Trimmed newName from div:", JSON.stringify(newName));

        const svgGroup = this.canvas.findOne(`#${elementToSave.id}`);

        if (!svgGroup) {
            console.error("    handleSaveName: SVG group not found for", elementToSave.id);
            // Clean up div listeners even if group is gone for some reason
            divToSaveFrom.removeEventListener('keydown', this.handleInlineEditorKeyDown);
            divToSaveFrom.removeEventListener('blur', this.handleInlineEditorBlur);
            this.currentEditingDiv = null;
            return;
        }

        divToSaveFrom.contentEditable = 'false';
        divToSaveFrom.classList.remove('editing');
        divToSaveFrom.removeAttribute('tabindex'); // Clean up tabindex

        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj');
        foreignObjectWrapper?.attr('pointer-events', 'none');

        divToSaveFrom.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        divToSaveFrom.removeEventListener('blur', this.handleInlineEditorBlur);

        elementToSave.name = newName || elementToSave.type;
        divToSaveFrom.innerText = elementToSave.name;

        this.currentEditingDiv = null;

        if (showMenuAfter) {
            console.log(`    handleSaveName: Attempting to show menu for ${elementToSave.id}.`);
            this.showElementContextMenu(elementToSave); // Element is still selected
        } else {
            console.log(`    handleSaveName: Not showing menu for ${elementToSave.id}, hiding all.`);
            this.hideAllContextMenus();
        }
        console.log(`%c<<< handleSaveName for ${elementToSave.id} finished. New name: ${elementToSave.name}`, "background: #e0ffe0; color: green;");
    }

    /** Handle Enter/Escape keys within the inline editor input. */
    handleInlineEditorKeyDown(e) {
        console.log(`>>>InlineEditorKeyDown: Key='${e.key}' on div for ${this.selectedElement?.id}`);
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSaveName(true); // Enter from editor saves and shows menu
            e.stopPropagation();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelInlineEdit(true); // Escape from editor cancels and shows menu
            e.stopPropagation();
        }
    }

    // interactions.js
    // class InteractionManager

    handleInlineEditorBlur(e) {
        console.log(">>> handleInlineEditorBlur. currentEditingDiv:", this.currentEditingDiv ? `for ${this.currentEditingDiv.closest('.element')?.id}` : "null", "relatedTarget:", e.relatedTarget?.id || e.relatedTarget?.tagName || e.relatedTarget);

        const divBeingEdited = this.currentEditingDiv;
        const elementBeingEdited = this.selectedElement;

        if (!divBeingEdited || !elementBeingEdited) {
            console.log("    handleInlineEditorBlur: No currentEditingDiv or selectedElement, exiting early.");
            return;
        }

        const relatedTarget = e.relatedTarget;

        setTimeout(() => {
            console.log("    handleInlineEditorBlur (setTimeout): Checking state. CurrentEditingDiv still for:", this.currentEditingDiv ? this.currentEditingDiv.closest('.element')?.id : "null", "Active document element:", document.activeElement?.id || document.activeElement?.tagName);

            // Only proceed if the edit wasn't already finalized by another action (e.g. Enter/Esc in the div)
            if (this.currentEditingDiv === divBeingEdited) {
                let shouldAttemptToFinalize = true;
                let showMenuForThisElementAfterSave = false; // Default: blur does not show menu for the item losing focus
                // ** Start Add: Detailed logging for relatedTarget conditions **
                console.log(`        handleInlineEditorBlur (setTimeout ${currentTimestamp}): Initial decision: shouldAttemptToFinalize=${shouldAttemptToFinalize}, showMenuForThisElementAfterSave=${showMenuForThisElementAfterSave}`);
                const relatedTargetElement = relatedTarget ? relatedTarget.closest('.element') : null;
                console.log(`        handleInlineEditorBlur (setTimeout ${currentTimestamp}): relatedTargetElement found: ${relatedTargetElement?.id}`);
                // ** End Add **
                if (relatedTarget) {
                    if (relatedTarget.closest('.context-menu') ||
                        relatedTarget === document.body || // Focus might go to body before a menu item click is processed
                        relatedTarget.closest('.controls button') ||
                        relatedTarget.closest('.palette-item')) {
                        console.log("        handleInlineEditorBlur (setTimeout): Focus likely moved to UI control/menu/palette. Deferring action to that control's click handler.");
                        shouldAttemptToFinalize = false; // Let the specific click handler for these items decide to save/cancel.
                    } else if (relatedTarget.closest('.element')) { // Clicked on an SVG element
                        if (relatedTarget.closest('.element').id !== elementBeingEdited.id) {
                            // Blurred to a DIFFERENT element
                            console.log("        handleInlineEditorBlur (setTimeout): Focus moved to ANOTHER element. Will save this one (no menu).");
                            showMenuForThisElementAfterSave = false;
                        } else {
                            // Blurred to the SAME element's non-editable area (e.g., its rect)
                            console.log("        handleInlineEditorBlur (setTimeout): Focus moved within the SAME element's non-editable area. Will save (and show menu).");
                            showMenuForThisElementAfterSave = true;
                        }
                    } else {
                        // Blurred to something else within the document that's not an element, control, or menu (e.g., SVG canvas itself)
                        console.log("        handleInlineEditorBlur (setTimeout): Focus moved away to general document area (e.g. canvas bg). Will save (no menu).");
                        showMenuForThisElementAfterSave = false;
                    }
                } else if (document.activeElement !== divBeingEdited && document.activeElement !== window) {
                    // No relatedTarget (e.g., blurred to browser chrome, another window, or just lost focus)
                    // AND the active element is no longer the div (and not the window itself which can sometimes be activeElement)
                    console.log("        handleInlineEditorBlur (setTimeout): Focus moved outside document or to body, and not to the div. Will save (no menu).");
                    showMenuForThisElementAfterSave = false;
                } else {
                    // Div might still have focus, or relatedTarget is null but focus didn't clearly move from div.
                    // Or activeElement is window.
                    console.log("        handleInlineEditorBlur (setTimeout): Div may still have focus or no clear focus change indication. No save action from this blur.");
                    shouldAttemptToFinalize = false;
                }
                // ** Start Add: Log final decision values **
                console.log(`        handleInlineEditorBlur (setTimeout ${currentTimestamp}): Before calling save: shouldAttemptToFinalize=${shouldAttemptToFinalize}, showMenuForThisElementAfterSave=${showMenuForThisElementAfterSave} for ${elementBeingEdited.id}`);
                // ** End Add **
                if (shouldAttemptToFinalize) {
                    console.log(`        handleInlineEditorBlur (setTimeout): FINAL DECISION - Calling handleSaveName(${showMenuForThisElementAfterSave}) for ${elementBeingEdited.id}`);
                    this.handleSaveName(showMenuForThisElementAfterSave);
                }
            } else {
                console.log("        handleInlineEditorBlur (setTimeout): Edit on original div was already finalized or switched (e.g. by Enter/Esc). No action from this blur.");
            }
        }, 0); // A short delay is good practice for blur handlers
    }

    selectElement(element) {
        console.log(`%c>>> selectElement called with: ${element?.id || 'null'}. Current selected: ${this.selectedElement?.id}, Current editing: ${this.currentEditingDiv?.closest('.element')?.id || 'null'}`, "color: purple;");

        // If trying to select the element that is currently being edited, and the edit div has focus, do nothing.
        if (this.currentEditingDiv && element && this.selectedElement === element && document.activeElement === this.currentEditingDiv) {
            console.log("    selectElement: Attempting to select currently edited element while its div has focus. No change.");
            return;
        }

        // If the selection is not actually changing (e.g. called with current this.selectedElement)
        // and we are not deselecting (element is not null).
        // This is to prevent redundant operations if selectElement is called unnecessarily.
        // However, the new toggle logic in handleCanvasClick means this might be less needed.
        // For now, if `element === this.selectedElement`, we assume the caller (like handleCanvasClick)
        // has a reason (e.g. to ensure menu for already selected element is shown if it was hidden).
        // The core logic is: if an element is passed, it becomes selected. If null, deselect.

        const previousSelectedElement = this.selectedElement;

        // If an edit is active on the PREVIOUSLY selected element, and we are now selecting a DIFFERENT element or NULL,
        // the edit should be finalized (saved without menu). Blur handler should ideally catch this, but this is a safeguard.
        if (this.currentEditingDiv && previousSelectedElement && previousSelectedElement !== element) {
            if (this.currentEditingDiv.closest('.element')?.id === previousSelectedElement.id) {
                console.log(`    selectElement: Finalizing edit on previous element ${previousSelectedElement.id} (no menu) because selection is changing.`);
                this.handleSaveName(false);
            }
        }

        // Visually deselect the previously selected element if it's different from the new one
        if (previousSelectedElement && previousSelectedElement !== element) {
            console.log(`    selectElement: Removing 'element-selected' class from ${previousSelectedElement.id}`);
            const oldSvgElement = this.canvas.findOne(`#${previousSelectedElement.id}`);
            if (oldSvgElement) {
                oldSvgElement.removeClass('element-selected');
            }
        }

        // Hide all menus if:
        // 1. We are deselecting (element is null).
        // 2. We are selecting a DIFFERENT element than what was previously selected.
        // (If element === previousSelectedElement, menu state is managed by click/edit logic directly)
        if (element !== previousSelectedElement) {
            this.hideAllContextMenus();
        }

        this.selectedElement = element; // Update the selected element

        if (element) { // If selecting a new element
            console.log(`    selectElement: Selecting new element ${element.id}.`);
            const newSvgElement = this.canvas.findOne(`#${element.id}`);
            if (newSvgElement) {
                newSvgElement.addClass('element-selected');
                // Show context menu if:
                // - We are not currently editing *this* element.
                // - AND the selection actually changed (element !== previousSelectedElement)
                //   OR if we are re-affirming selection of the same element and its menu should be shown.
                //   The new toggle logic in handleCanvasClick means if element === previousSelectedElement,
                //   it's a deselect, so element here would be null.
                //   So, this condition simplifies to: if we are selecting a new element, show its menu,
                //   unless we are about to edit it.
                if (!this.currentEditingDiv || this.currentEditingDiv.closest('.element')?.id !== element.id) {
                    console.log(`        selectElement: Showing menu for ${element.id} (not editing it).`);
                    this.showElementContextMenu(element);
                } else {
                    console.log(`        selectElement: Not showing menu for ${element.id} (because it's being/about to be edited).`);
                }
            }
        } else { // If deselecting (element is null)
            console.log("    selectElement: Deselected all. Menus should have been hidden.");
            // hideAllContextMenus was called if previousSelectedElement was not null
        }
        console.log(`%c<<< selectElement finished. Now selected: ${this.selectedElement?.id}`, "color: purple;");
    }

    /** Set canvas zoom level and update viewbox. */
    setZoom(zoom) {
        console.log(">>>setZoom");
        zoom = Math.max(0.2, Math.min(3, zoom)); // Clamp zoom level
        if (this.zoom === zoom) return; // No change

        // console.log(`Setting zoom to: ${zoom}`);
        this.zoom = zoom;
        const viewbox = this.canvas.viewbox();
        const clientWidth = this.canvas.node.clientWidth;
        const clientHeight = this.canvas.node.clientHeight;

        if (!clientWidth || !clientHeight) {
            console.warn("Canvas client dimensions are zero, cannot calculate zoom viewbox.");
            return;
        }

        // Calculate new viewbox dimensions centered around the current center
        const newWidth = clientWidth / zoom;
        const newHeight = clientHeight / zoom;
        const centerX = viewbox.x + viewbox.width / 2;
        const centerY = viewbox.y + viewbox.height / 2;
        const newX = centerX - newWidth / 2;
        const newY = centerY - newHeight / 2;

        this.canvas.viewbox(newX, newY, newWidth, newHeight);
    }

    /** Convert screen coordinates (clientX/Y) to SVG canvas coordinates. */
    getCanvasPoint(clientX, clientY) {
        // Ensure canvas node exists and has the necessary methods
        if (!this.canvas?.node?.createSVGPoint || !this.canvas?.node?.getScreenCTM) {
            console.error("SVG canvas node or required methods not available for coordinate conversion.");
            return { x: 0, y: 0 }; // Fallback
        }
        const screenPoint = this.canvas.node.createSVGPoint();
        screenPoint.x = clientX;
        screenPoint.y = clientY;
        try {
            const CTM = this.canvas.node.getScreenCTM();
            if (!CTM) {
                console.error("Canvas screen CTM is null.");
                return { x: 0, y: 0 };
            }
            // Use matrixTransform with the inverse CTM
            const svgPoint = screenPoint.matrixTransform(CTM.inverse());
            return { x: svgPoint.x, y: svgPoint.y };
        } catch (error) {
            // Catch potential errors during matrix inversion or transformation
            console.error("Error transforming screen point to SVG point:", error);
            return { x: 0, y: 0 };
        }
    }

    /** Find the parent element's ID from a clicked DOM target. */
    findElementId(target) {
        if (!target || !target.closest) return null; // Basic check
        const elementNode = target.closest('.element'); // Find nearest ancestor with class 'element'
        return elementNode ? elementNode.id : null; // Return its ID if found
    }

    /** Find the connection path's ID from a clicked DOM target. */
    findConnectionId(target) {
        if (!target || !target.classList) return null; // Basic check
        // Check if the clicked element itself is the connection path
        if (target.classList.contains('connection-path')) {
            return target.id;
        }
        // Could potentially check parent if click was on marker, but less common
        return null;
    }

    // // --- NEW HELPER FUNCTION for positioning element context menu ---
    // /** Calculates position and shows context menu relative to the element */
    // showContextMenuForElement(element) {
    //     if (!element) return;

    //     const svgGroup = this.canvas.findOne(`#${element.id}`);
    //     if (!svgGroup) return;

    //     try {
    //         // Get bounding box in SVG coordinate space
    //         const bbox = svgGroup.bbox();

    //         // Define the target point in SVG space (e.g., top-right corner + offset)
    //         const svgPoint = this.canvas.node.createSVGPoint();
    //         svgPoint.x = bbox.x + bbox.width + 5; // 5px offset to the right
    //         svgPoint.y = bbox.y;                   // Align with top

    //         // Get the transformation matrix from SVG space to screen space
    //         const ctm = this.canvas.node.getScreenCTM();
    //         if (!ctm) {
    //             console.error("Cannot get CTM for context menu positioning.");
    //             // Fallback: Show at element's stored coords (less accurate)
    //             this.showContextMenu(element.x + element.width, element.y, null);
    //             return;
    //         }

    //         // Transform the SVG point to screen coordinates
    //         const screenPoint = svgPoint.matrixTransform(ctm);

    //         // TODO: Add boundary checks if menu might go off-screen

    //         // Show the menu using the calculated screen coordinates
    //         this.showContextMenu(screenPoint.x, screenPoint.y, null); // Pass null for connection

    //     } catch (err) {
    //         console.error("Error calculating context menu position:", err);
    //         // Fallback in case of error during bbox or transform
    //         this.showContextMenu(element.x + element.width, element.y, null);
    //     }
    // }


} // End class InteractionManager