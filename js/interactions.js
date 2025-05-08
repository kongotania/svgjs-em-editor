/**
 * interactions.js
 *
 * Defines InteractionManager class to handle all user inputs:
 * drag/drop, mouse clicks, keyboard, context menu, zoom, inline editing.
 */

/**
 * InteractionManager - Handles user interactions with the canvas and elements.
 */
class InteractionManager {
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

        // --- CHANGE: No longer need to bind context menu handlers here ---
        // They will be added directly or use arrow functions in initEvents

        // Initialize all event listeners
        this.initEvents();
    }

    /**
     * Initialize all event listeners for canvas, document, UI controls.
     */
    initEvents() {
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

        // --- CHANGE: Attach listeners to specific buttons in each menu ---
        // Element Context Menu Actions
        document.getElementById('ctx-el-delete')?.addEventListener('click', () => {
            console.log("Element context menu: Delete");
            if (this.currentEditingDiv) this.cancelInlineEdit();
            if (this.selectedElement) {
                this.elementManager.removeElement(this.selectedElement);
                // removeElement should trigger deselection via interactions eventually,
                // but explicit hide is safer
                this.selectedElement = null; // Clear selection state immediately
                this.hideAllContextMenus();
            }
        });
        document.getElementById('ctx-el-connect')?.addEventListener('click', () => {
            console.log("Element context menu: Connect");
            if (this.currentEditingDiv) this.cancelInlineEdit();
            if (this.selectedElement) {
                this.connectionManager.startConnection(this.selectedElement);
            }
            this.hideAllContextMenus(); // Hide menu after action
        });
        document.getElementById('ctx-el-edit')?.addEventListener('click', () => {
            console.log("Element context menu: Edit Properties");
            if (this.selectedElement) {
                if (!this.currentEditingDiv || this.currentEditingDiv.closest('.element')?.id !== this.selectedElement.id) {
                    this.showNameEditor(this.selectedElement); // showNameEditor hides menus
                } else {
                    this.hideAllContextMenus(); // Hide if already editing
                }
            } else {
                this.hideAllContextMenus();
            }
        });

        // Connection Context Menu Actions
        document.getElementById('ctx-conn-delete')?.addEventListener('click', () => {
            console.log("Connection context menu: Delete");
            if (this.contextTargetConnection) {
                console.log(`Deleting connection ${this.contextTargetConnection.id} via menu`);
                this.connectionManager.removeConnection(this.contextTargetConnection);
                this.hideAllContextMenus(); // Hide after action
            } else {
                console.error("Delete connection clicked, but no target connection stored!");
                this.hideAllContextMenus();
            }
        });
        // Zoom control listeners (with cancel edit check)
        document.getElementById('zoom-in')?.addEventListener('click', () => {
            if (this.currentEditingDiv) { this.cancelInlineEdit(); }
            this.setZoom(this.zoom * 1.2);
        });
        document.getElementById('zoom-out')?.addEventListener('click', () => {
            if (this.currentEditingDiv) { this.cancelInlineEdit(); }
            this.setZoom(this.zoom * 0.8);
        });
        document.getElementById('reset-view')?.addEventListener('click', () => {
            if (this.currentEditingDiv) { this.cancelInlineEdit(); }
            const drawingArea = document.getElementById('drawing-area');
            this.setZoom(1); // Reset internal zoom state
            if (drawingArea) { // Recalculate viewbox based on current size
                this.canvas.viewbox(0, 0, drawingArea.clientWidth, drawingArea.clientHeight);
            }
        });

        // Palette drag setup
        const paletteItems = document.querySelectorAll('.palette-item');
        paletteItems.forEach(item => {
            item.addEventListener('dragstart', e => {
                // console.log('Drag start from palette:', item.dataset.type);
                // Cancel edit if starting palette drag while editing
                if (this.currentEditingDiv) this.cancelInlineEdit();
                e.dataTransfer.setData('text/plain', item.dataset.type); // Use text/plain
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Canvas drop zone setup
        this.canvas.node.addEventListener('dragover', e => {
            e.preventDefault(); // Necessary to allow drop
            e.dataTransfer.dropEffect = 'copy';
        });
        this.canvas.node.addEventListener('drop', this.handleDrop);
    }

    /** Mousedown on canvas: Initiate panning or cancel edits. */
    handleCanvasMouseDown(e) { // (Keep as is)
        const target = e.target;
        const elementId = this.findElementId(target);
        if (elementId) {
            if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== elementId) {
                this.cancelInlineEdit();
            }
        } else {
            if (this.currentEditingDiv) {
                this.cancelInlineEdit();
            }
            if (e.button === 1 || e.buttons === 4 || this.isPanningKeyPressed) {
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                this.canvas.node.style.cursor = 'grabbing';
                e.preventDefault();
            }
        }
    }

    /** Mousemove on canvas: Handle panning or update temporary connection line. */
    handleCanvasMouseMove(e) { // (Keep as is)
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

    /** Click on canvas: Handle selection, context menus, connection completion, cancellations. */
    handleCanvasClick(e) {
        console.log(">>> handleCanvasClick - Target:", e.target); // Keep log

        const target = e.target;
        const elementId = this.findElementId(target);

        // --- Click on an Element ---
        if (elementId) {
            const element = this.elementManager.getElementById(elementId);
            if (!element) return;

            if (this.connectionManager.connectionMode) {
                this.connectionManager.completeConnection(element);
                e.stopPropagation(); return;
            }
            // If we clicked on an element, and we are editing *that* element, do nothing.
            // The click might be for text selection inside the contenteditable div.
            if (this.currentEditingDiv && this.selectedElement?.id === elementId) {
                // Check if the click was on the contenteditable div itself
                if (target.classList.contains('element-content-div')) {
                    return; // Allow click for text manipulation
                }
                // If it was on the rect but we are editing this element, still do nothing.
                return;
            }

            // Select the element (this will show the element context menu)
            this.selectElement(element);
            e.stopPropagation(); // Prevent background click deselecting immediately
            return;
        }

        // --- Click on a Connection ---
        const connectionId = this.findConnectionId(target);
        if (connectionId) {
            const connection = this.connectionManager.connections.find(c => c.id === connectionId);
            if (connection) {
                if (this.currentEditingDiv) this.cancelInlineEdit();
                this.selectElement(null); // Deselect any element
                // --- CHANGE: Show connection context menu ---
                this.showContextMenuForConnection(connection, e.clientX, e.clientY);
                e.stopPropagation();
            }
            return;
        }

        // Click on Empty Canvas Background
        // The blur event on the contenteditable div will handle saving/cancelling edit.
        // So, we don't need to explicitly call cancelInlineEdit() here if currentEditingDiv exists.
        // If we are NOT editing, then proceed to deselect.
        if (!this.currentEditingDiv) {
            this.selectElement(null);
        }

        if (this.connectionManager.connectionMode) {
            this.connectionManager.cancelConnection();
        }
    }
    /** Double-click on element: Start inline editing. */
    handleDoubleClick(e) {
        const target = e.target;
        // Prevent triggering edit if double-clicking inside the input itself
        if (target.classList.contains('element-content-div') && target.contentEditable === 'true') {
            return;
        }

        const elementId = this.findElementId(target);
        if (elementId) {
            const element = this.elementManager.getElementById(elementId);
            if (element) {
                // console.log("Double-click to edit element:", element.id);
                this.showNameEditor(element);
                e.stopPropagation(); // Prevent canvas click/other actions
            }
        }
    }

    /** Global KeyDown handler. */
    handleKeyDown(e) { // (Modify slightly for hiding menus)
        // If editing, let the contenteditable div's keydown handler take precedence for most keys.
        // Only handle global keys like Delete (for selected element, not text) and Escape (global cancel).
        if (this.currentEditingDiv) {
            if (e.key === 'Escape') { // Global escape always cancels connection mode first
                if (this.connectionManager.connectionMode) {
                    this.connectionManager.cancelConnection();
                    e.preventDefault(); // Prevent further action like cancelling edit
                    return;
                }
                // The contenteditable's own Escape handler will call cancelInlineEdit.
            }
            // Allow other keys to be processed by the contenteditable div.
            // Do not interfere with text input.
            return;
        }

        // if not editing
        if (e.key === 'Delete' && this.selectedElement) {
            this.elementManager.removeElement(this.selectedElement);
            this.selectedElement = null; // Clear selection
            this.hideAllContextMenus();  // Hide menu
        }
        if (e.key === 'Escape') {
            if (this.connectionManager.connectionMode) {
                this.connectionManager.cancelConnection();
            } else {
                this.hideAllContextMenus(); // Hide menus
                this.selectElement(null);  // Deselect
            }
            // Escape during edit is handled by handleInlineEditorKeyDown -> cancelInlineEdit
        }
        if (e.key === ' ' && !e.repeat) {
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
        console.log(">>>hideAllContextMenus");
        if (this.elementContextMenu) {
            this.elementContextMenu.style.display = 'none';
        }
        if (this.connectionContextMenu) {
            this.connectionContextMenu.style.display = 'none';
        }
        // Clear target connection reference
        this.contextTargetConnection = null;
        console.log("<<<hideAllContextMenus");
    }

    /** Hide context menu UI. */
    hideContextMenu() {
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
    }

    // --- NEW: showContextMenuForConnection ---
    /** Shows the CONNECTION context menu at specific screen coordinates */
    showContextMenuForConnection(connection, screenX, screenY) {
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
        
        contentDivNode.setAttribute('tabindex','-1');
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

        contentDivNode.removeEventListener('blur', this.handleInlineEditorBlur);
        contentDivNode.addEventListener('blur', this.handleInlineEditorBlur);
        console.log("    showNameEditor: Added keydown and blur listeners to contentDivNode.");


        this.currentEditingDiv = contentDivNode;
        console.log("<<< showNameEditor finished for:", element.id, "currentEditingDiv set.");
    }

    // // ** Hide the inline editor UI (visibility change). */
    // hideNameEditor() { // (Keep as is)
    //     if (!this.selectedElement) return;
    //     const svgGroup = this.canvas.findOne(`#${this.selectedElement.id}`);
    //     if (!svgGroup) return;
    //     const textElement = svgGroup.findOne('.element-display-text');
    //     const foreignObjectElement = svgGroup.findOne('.element-editor-fobj');
    //     if (textElement && foreignObjectElement) {
    //         foreignObjectElement.attr('visibility', 'hidden');
    //         textElement.attr('visibility', 'visible');
    //     }
    // }

    /** Cancel the current inline edit: cleanup state and restore UI. */
    cancelInlineEdit() { // (Modify to hide menus, ensure element is selected for menu to reappear)
        if (!this.selectedElement || !this.currentEditingDiv) {
            console.log("CancelInlineEdit: No selected element or no current editing div.");
            return;
        }
        console.log("Cancelling inline edit for element:", this.selectedElement.id);

        const divNode = this.currentEditingDiv;
        const element = this.selectedElement; // Keep ref
        const svgGroup = this.canvas.findOne(`#${element.id}`);

        if (!svgGroup || !divNode) {
            this.currentEditingDiv = null;
            // Reset pointer-events on foreignObject if it exists
            const fObj = svgGroup?.findOne('.element-editor-fobj');
            fObj?.attr('pointer-events', 'none');
            console.log("CancelInlineEdit: svgGroup or divNode missing. currentEditingDiv nulled.");
            return;
        }

        divNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        divNode.removeEventListener('blur', this.handleInlineEditorBlur);

        divNode.textContent = element.name || element.type; // Restore original name
        divNode.contentEditable = 'false';
        divNode.classList.remove('editing');

        // Reset pointer-events on the foreignObject so clicks go to SVG element
        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj');
        foreignObjectWrapper?.attr('pointer-events', 'none');

        this.currentEditingDiv = null;
        console.log("CancelInlineEdit: Edit cancelled, currentEditingDiv nulled.");

        // Since the element is still logically selected, show its menu.
        this.showElementContextMenu(element);
    }

    /** Save the name from the current inline editor: update data, cleanup state, restore UI. */
    handleSaveName() { // (Modify to show menu after save)
        if (!this.selectedElement || !this.currentEditingDiv) {
            console.log("HandleSaveName: No selected element or current editing div.");
            return;
        }
        console.log('>>>handleSaveName for element:', this.selectedElement.id);

        const newName = this.currentEditingDiv.textContent.trim(); // Get text from div
        const element = this.selectedElement;
        const divNode = this.currentEditingDiv;
        const svgGroup = this.canvas.findOne(`#${element.id}`);

        if (!svgGroup || !divNode) {
            if (divNode) {
                divNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
                divNode.removeEventListener('blur', this.handleInlineEditorBlur);
            }
            this.currentEditingDiv = null;
            console.log("HandleSaveName: svgGroup or divNode missing. currentEditingDiv nulled.");
            return;
        }

        divNode.contentEditable = 'false';
        divNode.classList.remove('editing');

        // Reset pointer-events on the foreignObject
        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj');
        foreignObjectWrapper?.attr('pointer-events', 'none');

        divNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        divNode.removeEventListener('blur', this.handleInlineEditorBlur);
        this.currentEditingDiv = null;

        element.name = newName || element.type; // Save new name, fallback to type if empty
        divNode.textContent = element.name; // Update div text to reflect saved (or fallback) name

        console.log("HandleSaveName: Name saved, currentEditingDiv nulled. New name:", element.name);

        this.showElementContextMenu(element);

        console.log("<<< handleSaveName finished.");
    }

    /** Handle Enter/Escape keys within the inline editor input. */
    handleInlineEditorKeyDown(e) {
        console.log(`Inline editor keydown: ${e.key}`);
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default form submission behavior
            this.handleSaveName(); // Save the name
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelInlineEdit(); // Cancel the edit
        }
        // Allow other keys (letters, numbers, arrows, backspace, etc.)
    }
    /** Handle blur event from the contenteditable div (usually means saving). */
    handleInlineEditorBlur(e) {
        // setTimeout is a common trick to allow other click events (like context menu buttons)
        // to fire before the blur fully processes and potentially hides the target.
        // However, for simple save-on-blur, it might not be strictly needed if other interactions
        // already call cancel/save. Let's try without it first.
        // If we are still in editing mode (i.e., Esc/Enter hasn't already cleared it)
        console.log(">>> handleInlineEditorBlur. currentEditingDiv:", this.currentEditingDiv ? "exists" : "null");
        if (this.currentEditingDiv) {
            // Check if the new focused element is part of a context menu or control
            // to prevent unwanted saves when interacting with UI.
            // For now, let's assume blur means save.
            // This can be refined if it causes issues with context menus appearing/disappearing.
            if (e.relatedTarget && (e.relatedTarget.closest('.context-menu') || e.relatedTarget.closest('.controls button'))) {
                console.log("Blur event: relatedTarget is context menu or control. Not saving yet.");
                // Potentially, the context menu click will handle cancel/save if needed.
                // Or, the div might re-gain focus if the context menu action doesn't lead to closing edit.
                return;
            }
            console.log("Blur event: Saving name.");
            this.handleSaveName();
        }
    }
    /** Select an element, updating visual state and handling context menu. */
    selectElement(element) {
        // If we are trying to select the element that is currently being edited,
        // and the edit div still has focus, don't mess with the selection or context menu yet.
        // The blur handler or Enter/Esc will take care of exiting edit mode.
        if (this.currentEditingDiv && element && this.selectedElement === element && document.activeElement === this.currentEditingDiv) {
            console.log("selectElement: Attempting to select currently edited element, edit div has focus. No change.");
            return;
        }
        //** End change **

        if (this.selectedElement === element) return;

        if (this.selectedElement) {
            const oldSvgElement = this.canvas.findOne(`#${this.selectedElement.id}`);
            if (oldSvgElement) {
                oldSvgElement.removeClass('element-selected');
            }
            //** Start change **
            if (this.currentEditingDiv && this.currentEditingDiv.closest('.element')?.id === this.selectedElement.id) {
                // If deselecting the element being edited, attempt to save the edit.
                // The blur handler should ideally catch this, but as a fallback:
                console.log("selectElement: Deselecting currently edited element. Attempting to save.");
                this.handleSaveName(); // This will hide menus, clear edit state.
                // If element becomes null after this, menus will be hidden by subsequent logic.
            } else {
                this.hideAllContextMenus();
            }
            //** End change **
        }

        // Set new selected element
        this.selectedElement = element;

        // Select new (if not null)
        if (element) {
            const newSvgElement = this.canvas.findOne(`#${element.id}`);
            if (newSvgElement) {
                newSvgElement.addClass('element-selected');
                // Don't show context menu if an edit is *just starting* on this element
                // or if we are currently editing this element.
                if (!this.currentEditingDiv || this.currentEditingDiv.closest('.element')?.id !== element.id) {
                    this.showElementContextMenu(element);
                }
            }
        } else {
            // If element is null (deselected), ensure menus are hidden
            this.hideAllContextMenus();
        }
    }

    /** Set canvas zoom level and update viewbox. */
    setZoom(zoom) {
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