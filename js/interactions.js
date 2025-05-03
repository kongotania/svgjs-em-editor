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
        this.selectedElement = null;         // Element currently selected
        this.currentDraggingElement = null;  // Element currently being dragged by svg.draggable
        this.currentEditingInput = null;   // Reference to the active inline input DOM node
        this.isPanning = false;            // Is the canvas being panned?
        this.panStartX = 0;                // Mouse X position at pan start
        this.panStartY = 0;                // Mouse Y position at pan start
        this.isPanningKeyPressed = false;  // Is the spacebar held down for panning?
        this.zoom = 1;                     // Current zoom level

        // DOM Elements
        this.contextMenu = document.getElementById('context-menu');

        // Bind 'this' context for event handlers
        this.handleInlineEditorKeyDown = this.handleInlineEditorKeyDown.bind(this);
        this.handleCanvasMouseDown = this.handleCanvasMouseDown.bind(this);
        this.handleCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
        this.handleCanvasMouseUp = this.handleCanvasMouseUp.bind(this);
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
        this.handleDeleteElement = this.handleDeleteElement.bind(this);
        this.handleConnectElement = this.handleConnectElement.bind(this);
        this.handleEditProperties = this.handleEditProperties.bind(this);

        // Initialize all event listeners
        this.initEvents();
    }

    /**
     * Initialize all event listeners for canvas, document, UI controls.
     */
    initEvents() {
        // console.log("Initializing Interaction Events");
        // Canvas interaction listeners
        this.canvas.node.addEventListener('mousedown', this.handleCanvasMouseDown);
        this.canvas.node.addEventListener('mousemove', this.handleCanvasMouseMove);
        this.canvas.node.addEventListener('mouseup', this.handleCanvasMouseUp);
        this.canvas.node.addEventListener('click', this.handleCanvasClick);
        this.canvas.node.addEventListener('contextmenu', e => e.preventDefault()); // Prevent default right-click menu
        this.canvas.node.addEventListener('dblclick', this.handleDoubleClick); // For editing name

        // Global keyboard listeners
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);

        // Context menu button listeners
        document.getElementById('delete-element')?.addEventListener('click', this.handleDeleteElement); // Added safety check
        document.getElementById('connect-element')?.addEventListener('click', this.handleConnectElement);
        document.getElementById('edit-properties')?.addEventListener('click', this.handleEditProperties);

        // Zoom control listeners (with cancel edit check)
        document.getElementById('zoom-in')?.addEventListener('click', () => {
            if (this.currentEditingInput) { this.cancelInlineEdit(); }
            this.setZoom(this.zoom * 1.2);
        });
        document.getElementById('zoom-out')?.addEventListener('click', () => {
            if (this.currentEditingInput) { this.cancelInlineEdit(); }
            this.setZoom(this.zoom * 0.8);
        });
        document.getElementById('reset-view')?.addEventListener('click', () => {
            if (this.currentEditingInput) { this.cancelInlineEdit(); }
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
                if (this.currentEditingInput) this.cancelInlineEdit();
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
    handleCanvasMouseDown(e) {
        const target = e.target;
        const elementId = this.findElementId(target);

        if (elementId) {
            // If clicking on an element while editing *another* element, cancel the edit.
            if (this.currentEditingInput && this.selectedElement && this.selectedElement.id !== elementId) {
                this.cancelInlineEdit();
            }
            // Actual drag initiation is handled by svg.draggable plugin on the element itself.
        } else {
            // Clicked on empty canvas background
            if (this.currentEditingInput) { // Cancel edit if clicking background
                this.cancelInlineEdit();
            }
            // Check for panning initiation (middle mouse or spacebar+click)
            if (e.button === 1 || e.buttons === 4 || this.isPanningKeyPressed) {
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                this.canvas.node.style.cursor = 'grabbing';
                e.preventDefault(); // Prevent default middle-click scroll/pan
            }
            // Other empty canvas clicks are handled in handleCanvasClick
        }
    }

    /** Mousemove on canvas: Handle panning or update temporary connection line. */
    handleCanvasMouseMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.panStartX;
            const dy = e.clientY - this.panStartY;
            const viewbox = this.canvas.viewbox();
            // Prevent errors if zoom is somehow zero
            const currentZoom = this.zoom || 1;
            const newX = viewbox.x - dx / currentZoom;
            const newY = viewbox.y - dy / currentZoom;
            this.canvas.viewbox(newX, newY, viewbox.width, viewbox.height);
            // Update start position for next move calculation
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
        } else if (this.connectionManager.connectionMode) {
            // Update temporary line position if connection mode is active
            const point = this.getCanvasPoint(e.clientX, e.clientY);
            this.connectionManager.updateTempConnection(point.x, point.y);
        }
        // Element dragging updates are handled by the plugin's 'dragmove' listener
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
        // Prevent click actions if a drag operation likely just ended on this target
        // Note: This requires coordination with dragend, difficult to do reliably here.
        // Let's assume simple clicks are distinct from drag releases for now.
        console.log(">>>handleCavasClick");
        const target = e.target;
        const elementId = this.findElementId(target);

        // --- Click on an Element ---
        if (elementId) {
            const element = this.elementManager.getElementById(elementId);
            if (!element) return; // Should not happen

            // If connecting, complete the connection
            if (this.connectionManager.connectionMode) {
                console.log("===handleCanvasClick:Click on element to complete connection:", element.id);
                this.connectionManager.completeConnection(element);
                e.stopPropagation(); // Prevent further actions like selection
                return;
            }

            // If editing this element, do nothing on simple click inside
            if (this.currentEditingInput && this.selectedElement?.id === elementId) {
                console.log("===handleCanvasClick:Clicked element being edited, ignoring click.");
                return;
            }

            // Otherwise, select the element and show context menu
            console.log("===handleCanvasClick:Click selecting element:", element.id);
            this.selectElement(element);
            //  this.showContextMenu(e.clientX, e.clientY);
            e.stopPropagation(); // Prevent canvas background click
            return;
        }

        // --- Click on a Connection ---
        const connectionId = this.findConnectionId(target);
        if (connectionId) {
            const connection = this.connectionManager.connections.find(c => c.id === connectionId);
            if (connection) {
                console.log("===handleCanvasClick:Clicked on connection:", connection.id);
                if (this.currentEditingInput) this.cancelInlineEdit(); // Cancel edit if open
                this.selectElement(null); // Deselect any element
                this.showContextMenu(e.clientX, e.clientY, connection); // Show connection context menu
                e.stopPropagation();
            }
            return;
        }

        // --- Click on Empty Canvas Background ---
        console.log("===handleCanvasClick:Clicked on empty canvas space.");
        // *** Bug 2 Fix: cancelInlineEdit is called here if editing ***
        if (this.currentEditingInput) this.cancelInlineEdit(); // Cancel edit
        this.selectElement(null); // Deselect any element
        // this.hideContextMenu(); // Hide context menu
        if (this.connectionManager.connectionMode) {
            console.log("===handleCanvasClick:Cancelling connection mode via empty click.");
            this.connectionManager.cancelConnection(); // Cancel connection mode
        }
        console.log("<<<handleCanvasClick");
    }

    /** Double-click on element: Start inline editing. */
    handleDoubleClick(e) {
        const target = e.target;
        // Prevent triggering edit if double-clicking inside the input itself
        if (target.classList.contains('element-name-input-inline')) return;

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
    handleKeyDown(e) {
        // Allow standard input behavior if editing, except for Enter/Escape
        if (this.currentEditingInput && e.key !== 'Enter' && e.key !== 'Escape') {
            return;
        }

        // Delete selected element (if not editing)
        if (e.key === 'Delete' && this.selectedElement && !this.currentEditingInput) {
            // console.log("Delete key pressed for element:", this.selectedElement.id);
            this.elementManager.removeElement(this.selectedElement);
            this.selectedElement = null; // Clear selection state
            this.hideContextMenu(); // Hide context menu if open
        }

        // Escape key handling
        if (e.key === 'Escape') {
            // console.log("Escape key pressed.");
            // *** Bug 2 Fix: cancelInlineEdit is called via handleInlineEditorKeyDown if editing ***
            // ConnectionManager handles Escape for inline editor via handleInlineEditorKeyDown
            if (this.connectionManager.connectionMode) {
                // console.log("--- Cancelling connection mode via Escape");
                this.connectionManager.cancelConnection();
            } else if (!this.currentEditingInput) { // Only deselect/hide menu if not editing
                this.hideContextMenu();
                this.selectElement(null);
            }
            // If editing, Escape is handled by handleInlineEditorKeyDown called by input listener
        }

        // Spacebar for panning (if not editing)
        if (e.key === ' ' && !e.repeat && !this.currentEditingInput) {
            this.isPanningKeyPressed = true;
            this.canvas.node.style.cursor = 'grab';
            e.preventDefault(); // Prevent page scroll on space
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
        if (this.currentEditingInput) this.cancelInlineEdit(); // Cancel any active edit

        const type = e.dataTransfer.getData('text/plain'); // Use text/plain
        if (!type || !ELEMENT_TYPES[type.toUpperCase().replace('-', '_')]) { // Basic validation
            console.warn("Invalid type dropped:", type);
            return;
        }
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        const element = this.elementManager.createElement(type, point.x, point.y);

        if (element) {
            // console.log("--- Element created via drop, showing name editor");
            this.showNameEditor(element); // Start editing the new element
        } else {
            console.error("Failed to create element from drop.");
        }
    }

    /** Context Menu: Delete Element handler. */
    handleDeleteElement() {
        // console.log("Context menu: Delete Element");
        if (this.currentEditingInput) this.cancelInlineEdit(); // Cancel edit first

        if (this.selectedElement) {
            this.elementManager.removeElement(this.selectedElement);
            this.selectedElement = null; // Clear selection
        }
        this.hideContextMenu();
    }

    /** Context Menu: Connect Element handler. */
    handleConnectElement() {
        // console.log("Context menu: Connect Element");
        if (this.currentEditingInput) this.cancelInlineEdit(); // Cancel edit first

        if (this.selectedElement) {
            this.connectionManager.startConnection(this.selectedElement);
        }
        this.hideContextMenu();
    }

    /** Context Menu: Edit Properties handler (currently just opens name editor). */
    handleEditProperties() {
        // console.log("Context menu: Edit Properties");
        if (this.selectedElement) {
            // If not already editing this element, start editing
            if (!this.currentEditingInput || this.currentEditingInput.closest('.element')?.id !== this.selectedElement.id) {
                this.showNameEditor(this.selectedElement);
            }
        }
        this.hideContextMenu();
    }

    /** Show context menu UI. */
    showContextMenu(x, y, connection = null) {
        console.log(`>>>showContextMenu:Showing context menu at (${x}, ${y})`, connection ? `for connection ${connection.id}` : `for element ${this.selectedElement?.id}`);
        // if (this.currentEditingInput) this.cancelInlineEdit(); // Cancel edit when opening menu

        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;

        const deleteButton = document.getElementById('delete-element');
        const connectButton = document.getElementById('connect-element');
        const editButton = document.getElementById('edit-properties');

        // Safety check if buttons don't exist
        if (!deleteButton || !connectButton || !editButton) {
            console.error("Context menu buttons not found in DOM!");
            return;
        }

        if (connection) { // Context menu for a connection
            console.log(`Showing context menu for CONNECTION ${connection.id} at (${screenX}, ${screenY})`);
            deleteButton.style.display = 'block';
            connectButton.style.display = 'none';
            editButton.style.display = 'none';
            // Need temporary handler for deleting connection
            // --- Add Check for deleteButton ---
            if (!deleteButton) {
                console.error("!!! deleteButton is NULL or UNDEFINED right before addEventListener !!!");
           } else {
                console.log("deleteButton reference seems valid just before addEventListener:", deleteButton);
           }
           // --- End Check ---
           console.log("Assigning temporary console log onclick to deleteButton...");
            deleteButton.onclick = () => {
                console.log("Context menu: Delete Connection action", connection.id);
                if (!connection || !this.connectionManager) {
                    console.log(`Attempting to delete connection via context menu: ID=${connection?.id}`); // This should log
                    this.hideContextMenu();
                    return;
                }
                this.connectionManager.removeConnection(connection);
                this.hideContextMenu(); // Hide after action
            };
            console.log("Temporary onclick assigned.");
        } else if (this.selectedElement) { // Context menu for an element
            deleteButton.style.display = 'block';
            connectButton.style.display = 'block';
            editButton.style.display = 'block';
            // Restore default element delete handler (bound in constructor)
            deleteButton.onclick = this.handleDeleteElement;
            connectButton.onclick = this.handleConnectElement;
            editButton.onclick = this.handleEditProperties;
        } else {
            // Hide if called without a valid target
            this.hideContextMenu();
            return;
        }
        this.contextMenu.style.display = 'block';
        console.log("<<<shotContextMenu")
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

    /** Show the inline name editor for an element. */
    showNameEditor(element) {
        if (!element) return;
        // console.log(`>>> showNameEditor called for Element ID: ${element.id}`);

        // hide the context menu 
        this.hideContextMenu();

        // Cancel edit on any other element first
        if (this.currentEditingInput && this.selectedElement && this.selectedElement.id !== element.id) {
            // console.log("--- Cancelling edit on previous element:", this.selectedElement.id);
            this.cancelInlineEdit();
        }
        // Don't re-open if already editing this one
        if (this.currentEditingInput && this.selectedElement && this.selectedElement.id === element.id) {
            // console.log("--- Already editing this element. Aborting.");
            return;
        }

        this.selectElement(element); // Ensure element is selected

        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (!svgGroup) { console.error(`!!! FAILED to find SVG Group for #${element.id}`); return; }
        // console.log("   Found SVG Group:", svgGroup.node);

        const textElement = svgGroup.findOne('.element-display-text');
        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj'); // SVG.js wrapper

        if (!textElement) { console.error(`!!! FAILED to find .element-display-text inside #${element.id}`); }
        if (!foreignObjectWrapper || !foreignObjectWrapper.node) { console.error(`!!! FAILED to find .element-editor-fobj or node inside #${element.id}`); return; }
        // console.log("   Found ForeignObject Wrapper Node:", foreignObjectWrapper.node);

        const foreignObjectNode = foreignObjectWrapper.node; // Raw <foreignObject> DOM node
        const actualInputNode = foreignObjectNode.querySelector('input.element-name-input-inline'); // Find input inside

        if (!actualInputNode) { console.error(`!!! FAILED to find input using querySelector!`); return; }
        // console.log("   Found Actual Input Node via querySelector:", actualInputNode);

        if (textElement && foreignObjectWrapper && actualInputNode) {
            // Set visibility using 'visibility' attribute
            // console.log("   Setting text visibility: hidden");
            textElement.attr('visibility', 'hidden');
            // console.log("   Setting fObj visibility: visible");
            foreignObjectWrapper.attr('visibility', 'visible');

            // Set input value
            // console.log("   Setting input value.");
            actualInputNode.value = element.name || '';

            // Focus and Select using setTimeout for reliability
            // console.log("   Attempting focus/select on actual input node (async)...");
            try {
                setTimeout(() => {
                    if (actualInputNode && typeof actualInputNode.focus === 'function') {
                        actualInputNode.focus();
                        if (typeof actualInputNode.select === 'function') {
                            actualInputNode.select();
                            // console.log("   (async) Focus/Select successful.");
                        } else { console.error("   !!! (async) actualInputNode.select is NOT a function!"); }
                    } else { console.error("   !!! (async) actualInputNode or focus function missing!"); }
                }, 0); // Defer execution slightly
            } catch (err) { console.error("   Focus/Select outer try/catch FAILED:", err); }

            // Add KeyDown listener to the actual input node
            // console.log("   Adding keydown listener to actual input node.");
            actualInputNode.removeEventListener('keydown', this.handleInlineEditorKeyDown); // Prevent duplicates
            actualInputNode.addEventListener('keydown', this.handleInlineEditorKeyDown);
            this.currentEditingInput = actualInputNode; // Store reference to active input

            // console.log("<<< showNameEditor finished successfully.");
        } else {
            console.error("!!! Aborting showNameEditor (logic error - missing elements).");
        }
    }

    /** Hide the inline editor UI (visibility change). */
    hideNameEditor() {
        // Only needs to handle the UI visibility part.
        if (!this.selectedElement) return; // Only relevant if an element is selected

        const svgGroup = this.canvas.findOne(`#${this.selectedElement.id}`);
        if (!svgGroup) return;

        const textElement = svgGroup.findOne('.element-display-text');
        const foreignObjectElement = svgGroup.findOne('.element-editor-fobj');

        if (textElement && foreignObjectElement) {
            if (foreignObjectElement.attr('visibility') !== 'hidden') {
                // console.log("Hiding inline editor UI for:", this.selectedElement.id);
                foreignObjectElement.attr('visibility', 'hidden');
            }
            if (textElement.attr('visibility') !== 'visible') {
                textElement.attr('visibility', 'visible');
            }
        }
    }

    /** Cancel the current inline edit: cleanup state and restore UI. */
    // --- Bug 2 Fix: Added svgGroup/inputNode finding and checks ---
    cancelInlineEdit() {
        console.log(">>>cancelInlineEdit");
        if (!this.selectedElement || !this.currentEditingInput) {
            console.log("cancelInlineEdit: No element selected or no active input.");
            return;
        }
        console.log("cancelInlineEdit: Cancelling inline edit for element:", this.selectedElement.id);

        // --- FIX: Find svgGroup and inputNode *before* use ---
        const svgGroup = this.canvas.findOne(`#${this.selectedElement.id}`);
        const inputNode = this.currentEditingInput; // Get reference before clearing it
        const element = this.selectedElement;

        // --- FIX: Add checks ---
        if (!svgGroup) {
            console.error(`cancelInlineEdit: Could not find SVG group for element ${this.selectedElement.id}`);
            this.currentEditingInput = null; // Clear state anyway
            return;
        }
        if (!inputNode) {
            console.error(`cancelInlineEdit: currentEditingInput was null unexpectedly.`);
            this.currentEditingInput = null; // Clear state
            return;
        }
        // --- End FIX ---

        const textElement = svgGroup.findOne('.element-display-text');
        const foreignObjectElement = svgGroup.findOne('.element-editor-fobj');

        // Cleanup state FIRST
        // console.log("   Removing keydown listener.");
        inputNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        this.currentEditingInput = null; // Clear the state variable

        // Update UI
        if (textElement && foreignObjectElement) {
            // Hide fObj
            // console.log("   Setting fObj visibility: hidden");
            foreignObjectElement.attr('visibility', 'hidden');

            // Restore original text content
            textElement.text(this.selectedElement.name || this.selectedElement.type);

            // Make text visible
            // console.log("   Setting text visibility: visible");
            textElement.attr('visibility', 'visible');

            const groubBox = svgGroup.bbox();
            const textBbox = textElement.bbox();
            const textX = groubBox.x + (element.width - textBbox.width) / 2;
            const textY = groubBox.y + (element.height - textBbox.height) / 2;
            textElement.center(textX, textY);
        } else {
            console.error("cancelInlineEdit: Could not find textElement or foreignObjectElement for UI update.");
        }
        console.log("<<< cancelInlineEdit finished.");
    }


    /** Save the name from the current inline editor: update data, cleanup state, restore UI. */
    handleSaveName() {
        console.log('>>>handleSaveName');
        if (!this.selectedElement || !this.currentEditingInput) {
            console.warn("handleSaveName: No selected element or input.");
            return;
        }

        const newName = this.currentEditingInput.value;
        const element = this.selectedElement;
        const inputNode = this.currentEditingInput; // Get reference before clearing

        // --- Step 1: Find elements ---
        const svgGroup = this.canvas.findOne(`#${element.id}`);
        const textElement = svgGroup?.findOne('.element-display-text');
        const foreignObjectElement = svgGroup?.findOne('.element-editor-fobj');

        // --- Step 1a: Add Check ---
        if (!svgGroup || !textElement || !foreignObjectElement) {
            console.error("handleSaveName: Failed to find required SVG elements (group, text, fObj). Aborting save.");
            // Cleanup state even on error
            if (inputNode) inputNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
            this.currentEditingInput = null;
            return;
        }

        console.log(`handleSaveName ${textElement}`);
        // --- Step 2: Update text content ---
        textElement.text(newName || element.type);

        // --- Step 3: Make text visible BEFORE repositioning ---
        textElement.attr('visibility', 'visible');

        // --- Step 4: Reposition the (now visible) text ---
        const groubBox = svgGroup.bbox();
        const textBbox = textElement.bbox();
        const textX = groubBox.x + (element.width - textBbox.width) / 2;
        const textY = groubBox.y + (element.height - textBbox.height) / 2;
        textElement.center(textX, textY);

        // --- Check attributes AFTER setting ---
        let finalX = textElement.attr('x');
        let finalY = textElement.attr('y');
        console.log(`   Final relative attributes: x=${finalX}, y=${finalY}`);

        // --- Step 5: Hide the editor UI (foreignObject) ---
        foreignObjectElement.attr('visibility', 'hidden');

        // --- Step 6: Cleanup state (listener, currentEditingInput) ---
        inputNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        this.currentEditingInput = null;

        // --- Step 7: Update element data model LAST ---
        element.name = newName;

        console.log("<<< handleSaveName finished.");
    }

    /** Handle Enter/Escape keys within the inline editor input. */
    handleInlineEditorKeyDown(e) {
        // console.log(`Inline editor keydown: ${e.key}`);
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default form submission behavior
            this.handleSaveName(); // Save the name
        } else if (e.key === 'Escape') {
            this.cancelInlineEdit(); // Cancel the edit
        }
        // Allow other keys (letters, numbers, arrows, backspace, etc.)
    }

    /** Select an element, updating visual state and handling deselection/edit cancellation. */
    selectElement(element) {
        // If trying to select the same element again, do nothing
        if (this.selectedElement === element) return;

        // Deselect the previously selected element
        if (this.selectedElement) {
            const oldSvgElement = this.canvas.findOne(`#${this.selectedElement.id}`);
            if (oldSvgElement) {
                oldSvgElement.removeClass('element-selected');
            }
            // hide context menu 
            this.hideContextMenu();
            // If deselecting an element that was being edited, cancel the edit
            // *** Bug 2 Fix: cancelInlineEdit needs to be called correctly ***
            if (this.currentEditingInput && this.currentEditingInput.closest('.element')?.id === this.selectedElement.id) {
                this.cancelInlineEdit();
            }
        }

        // Set new selected element
        this.selectedElement = element;

        // Add selected class to the new element
        if (element) {
            const newSvgElement = this.canvas.findOne(`#${element.id}`);
            if (newSvgElement) {
                newSvgElement.addClass('element-selected');
                // console.log("Selected element:", element.id);
                this.showContextMenuForElement(element);
            }
        } else {
            // console.log("Deselected element");
            // Ensure edit is cancelled if deselecting completely (clicking background)
            // *** Bug 2 Fix: cancelInlineEdit needs to be called correctly ***
            if (this.currentEditingInput) {
                this.cancelInlineEdit();
            }
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

    // --- NEW HELPER FUNCTION for positioning element context menu ---
    /** Calculates position and shows context menu relative to the element */
    showContextMenuForElement(element) {
        if (!element) return;

        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (!svgGroup) return;

        try {
            // Get bounding box in SVG coordinate space
            const bbox = svgGroup.bbox();

            // Define the target point in SVG space (e.g., top-right corner + offset)
            const svgPoint = this.canvas.node.createSVGPoint();
            svgPoint.x = bbox.x + bbox.width + 5; // 5px offset to the right
            svgPoint.y = bbox.y;                   // Align with top

            // Get the transformation matrix from SVG space to screen space
            const ctm = this.canvas.node.getScreenCTM();
            if (!ctm) {
                console.error("Cannot get CTM for context menu positioning.");
                // Fallback: Show at element's stored coords (less accurate)
                this.showContextMenu(element.x + element.width, element.y, null);
                return;
            }

            // Transform the SVG point to screen coordinates
            const screenPoint = svgPoint.matrixTransform(ctm);

            // TODO: Add boundary checks if menu might go off-screen

            // Show the menu using the calculated screen coordinates
            this.showContextMenu(screenPoint.x, screenPoint.y, null); // Pass null for connection

        } catch (err) {
            console.error("Error calculating context menu position:", err);
            // Fallback in case of error during bbox or transform
            this.showContextMenu(element.x + element.width, element.y, null);
        }
    }


} // End class InteractionManager