/**
 * interactions.js
 *
 * Defines InteractionManager class to handle all user inputs:
 * drag/drop, mouse clicks, keyboard, context menu, zoom, inline editing.
 */

import { ELEMENT_TYPES } from './Element.js';

/**
 * InteractionManager - Handles user interactions with the canvas and elements.
 * Manages selection, editing, context menus, panning, zoom, and drag/drop.
 */
export class InteractionManager {
    /**
     * Construct a new InteractionManager.
     * @param {SVG.Container} canvas - The SVG canvas.
     * @param {ElementManager} elementManager - The element manager.
     * @param {ConnectionManager} connectionManager - The connection manager.
     */
    constructor(canvas, elementManager, connectionManager) {
        this.canvas = canvas;
        this.elementManager = elementManager;
        this.connectionManager = connectionManager;

        // State tracking for selection, editing, and panning
        this.selectedElement = null;
        this.currentDraggingElement = null;
        this.currentEditingDiv = null;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.isPanningKeyPressed = false;
        // this.zoom = 1;
        this.clickTimeout = null;
        this.lastClickTargetId = null; // Store the ID of the element from the first click
        this.MAX_DBL_CLICK_TIME = 150; // Milliseconds for double click threshold

        // References to context menus and context state
        this.elementContextMenu = document.getElementById('element-context-menu');
        if (!this.elementContextMenu) {
            console.warn("Warning: 'element-context-menu' not found in the DOM.");
        }
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
     * Initialize all event listeners for canvas, document, and UI controls.
     */
    initEvents() {
        // Canvas interaction listeners
        if (this.canvas?.node) {
            this.canvas.node.addEventListener('mousedown', this.handleCanvasMouseDown);
            this.canvas.node.addEventListener('mousemove', this.handleCanvasMouseMove);
            this.canvas.node.addEventListener('mouseup', this.handleCanvasMouseUp);
            this.canvas.node.addEventListener('click', this.handleCanvasClick);
            this.canvas.node.addEventListener('contextmenu', e => e.preventDefault());
            this.canvas.node.addEventListener('dblclick', this.handleDoubleClick);
            // Add wheel event for plugin-based zooming
            this.canvas.node.addEventListener('wheel', (e) => {
                // Only process wheel events if not editing or drawing connections
                if (!this.currentEditingDiv && !this.connectionManager.connectionMode) {
                    e.preventDefault(); // Prevent browser scroll
                    const delta = e.deltaY > 0 ? 0.8 : 1.2; // Zoom out or in
                    const point = this.getCanvasPoint(e.clientX, e.clientY);
                    this.canvas.zoom(this.canvas.zoom() * delta, point);
                }
            });
        } else {
            console.error("Canvas node is not initialized.");
        }

        // Global keyboard listeners
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);

        // Context menu actions for elements
        document.getElementById('ctx-el-delete')?.addEventListener('click', () => {
            // Cancel edit if active before deleting
            if (this.currentEditingDiv && this.selectedElement) {
                this.cancelInlineEdit(false);
            }
            if (this.selectedElement) {
                const elementToRemove = this.selectedElement;
                this.selectElement(null); // Deselect BEFORE removing, ensures menus are hidden
                this.elementManager.removeElement(elementToRemove);
            }
        });

        document.getElementById('ctx-el-connect')?.addEventListener('click', () => {
            // Save edit if active before starting connection
            if (this.currentEditingDiv && this.selectedElement) {
                this.handleSaveName(false);
            }
            if (this.selectedElement) {
                this.connectionManager.startConnection(this.selectedElement);
            }
            this.hideAllContextMenus();
        });

        document.getElementById('ctx-el-edit')?.addEventListener('click', () => {
            if (this.selectedElement) {
                this.showNameEditor(this.selectedElement);
            } else {
                this.hideAllContextMenus();
            }
        });

        // Context menu action for deleting a connection
        document.getElementById('ctx-conn-delete')?.addEventListener('click', () => {
            if (this.contextTargetConnection) {
                this.connectionManager.removeConnection(this.contextTargetConnection);
                this.hideAllContextMenus();
            } else {
                this.hideAllContextMenus();
            }
        });

        // Helper for actions that should save edit, then deselect
        const globalUiActionHandler = () => {
            if (this.currentEditingDiv && this.selectedElement) {
                this.handleSaveName(false);
                this.selectElement(null);
            } else if (this.selectedElement) {
                this.selectElement(null);
            }
        };

        // Zoom controls using plugin
        document.getElementById('zoom-in')?.addEventListener('click', () => {
            globalUiActionHandler();
            const currentZoom = this.canvas.zoom();
            this.canvas.zoom(currentZoom * 1.2);
        });

        document.getElementById('zoom-out')?.addEventListener('click', () => {
            globalUiActionHandler();
            const currentZoom = this.canvas.zoom();
            this.canvas.zoom(currentZoom * 0.8);
        });

        document.getElementById('reset-view')?.addEventListener('click', () => {
            globalUiActionHandler();
            const drawingArea = document.getElementById('drawing-area');
            if (drawingArea) {
                this.canvas.zoom(1); // Reset zoom to 1
                this.canvas.viewbox(0, 0, drawingArea.clientWidth, drawingArea.clientHeight);
            }
        });

        // Palette drag-and-drop setup
        const paletteItems = document.querySelectorAll('.palette-item');
        paletteItems.forEach(item => {
            item.addEventListener('dragstart', e => {
                globalUiActionHandler();
                e.dataTransfer.setData('text/plain', item.dataset.type);
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

    /**
     * Handle mousedown on the canvas.
     * @param {MouseEvent} e
     */
    handleCanvasMouseDown(e) {
        const target = e.target;
        const elementId = this.findElementId(target);

        if (elementId) {
            // Clicked on an element; handle edit/cancel logic elsewhere
        } else {
            // Not on an element: handle panning logic
            if (this.currentEditingDiv) {
                // If editing, let blur handler handle save/cancel
            }
            // Panning logic (middle mouse or spacebar+left click)
            if (e.button === 0 && this.isPanningKeyPressed) {
                this.isPanning = true;
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                this.canvas.node.style.cursor = 'grabbing';
                e.preventDefault(); // Prevent text selection during pan, etc.
            }
        }
    }

    /**
     * Mousemove on canvas: Handle panning or update temporary connection line.
     * @param {MouseEvent} e
     */
    handleCanvasMouseMove(e) {
        if (this.isPanning) {
            // Spacebar panning with manual viewbox update
            const dx = e.clientX - this.panStartX;
            const dy = e.clientY - this.panStartY;
            const viewbox = this.canvas.viewbox();
            const currentZoom = this.canvas.zoom();
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

    /**
     * Mouseup on canvas: End panning.
     * @param {MouseEvent} e
     */
    handleCanvasMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            // Reset cursor only if space isn't still held down
            if (!this.isPanningKeyPressed) {
                this.canvas.node.style.cursor = '';
            }
        }
    }

    /**
     * Handle click on the canvas or elements.
     * Handles selection, connection completion, and context menu logic.
     * @param {MouseEvent} e
     */
    handleCanvasClick(e) {
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
            }
            this.lastClickTargetId = elementId;
            this.clickTimeout = setTimeout(() => {
                this.clickTimeout = null;
                this.lastClickTargetId = null;

                // Single click logic (unless double click cancels this)
                if (this.connectionManager.connectionMode) {
                    if (this.currentEditingDiv && this.selectedElement) {
                        this.handleSaveName(false);
                    }
                    if (this.selectedElement !== clickedElement && this.selectedElement === this.connectionManager.sourceElement) {
                        const oldSelectedSvg = this.canvas.findOne(`#${this.selectedElement.id}`);
                        oldSelectedSvg?.removeClass('element-selected');
                    }
                    this.connectionManager.completeConnection(clickedElement);
                    return;
                }

                // If editing this element, save and show menu
                if (this.currentEditingDiv && this.selectedElement?.id === clickedElement.id) {
                    if (target.classList.contains('element-content-div')) {
                        return;
                    }
                    this.handleSaveName(true);
                    return;
                }

                // If editing another element, save without menu
                if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== clickedElement.id) {
                    this.handleSaveName(false);
                }

                // Toggle selection
                if (this.selectedElement === clickedElement) {
                    this.selectElement(null);
                } else {
                    this.selectElement(clickedElement);
                }
            }, this.MAX_DBL_CLICK_TIME);

            e.stopPropagation();
            return;
        }

        // --- Click on a Connection or Empty Canvas ---
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
            this.lastClickTargetId = null;
        }
        const connectionId = this.findConnectionId(target);
        if (connectionId) {
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
        if (this.currentEditingDiv && this.selectedElement) {
            this.handleSaveName(false);
        }
        this.selectElement(null);
        if (this.connectionManager.connectionMode) {
            this.connectionManager.cancelConnection();
        }
    }

    /**
     * Handle double click on the canvas or elements.
     * Used to trigger inline editing of element names.
     * @param {MouseEvent} e
     */
    handleDoubleClick(e) {
        const target = e.target;
        if (target.classList.contains('element-content-div') && target.contentEditable === 'true') {
            return;
        }
        const elementId = this.findElementId(target);
        if (elementId) {
            if (this.clickTimeout && this.lastClickTargetId === elementId) {
                clearTimeout(this.clickTimeout);
                this.clickTimeout = null;
                this.lastClickTargetId = null;
            }
            const element = this.elementManager.getElementById(elementId);
            if (element) {
                this.hideAllContextMenus();
                if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== element.id) {
                    this.handleSaveName(false);
                }
                this.showNameEditor(element);
                e.stopPropagation();
            }
        }
    }

    /**
     * Global KeyDown handler for keyboard shortcuts and editing.
     * @param {KeyboardEvent} e
     */
    handleKeyDown(e) {
        if (this.currentEditingDiv) {
            if (e.key === 'Escape') {
                if (this.connectionManager.connectionMode) {
                    this.connectionManager.cancelConnection();
                    e.preventDefault();
                    return;
                }
                // Let the div's specific keydown handler process Escape.
                return;
            }
            // For other keys, defer to the div's handler.
            return;
        }
        if (e.key === 'Delete' && this.selectedElement) {
            this.elementManager.removeElement(this.selectedElement);
            this.selectElement(null);
        } else if (e.key === 'Escape') {
            if (this.connectionManager.connectionMode) {
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

    /**
     * Global KeyUp handler for keyboard shortcuts.
     * @param {KeyboardEvent} e
     */
    handleKeyUp(e) {
        if (e.key === ' ') {
            if (this.isPanningKeyPressed) {
                this.isPanningKeyPressed = false;
                if (!this.isPanning) {
                    this.canvas.node.style.cursor = '';
                }
            }
        }
    }

    /**
     * Handle drop from palette onto canvas.
     * @param {DragEvent} e
     */
    handleDrop(e) {
        e.preventDefault();
        if (this.currentEditingDiv) this.cancelInlineEdit();

        const type = e.dataTransfer.getData('text/plain');
        // Validate dropped type
        if (!type || !ELEMENT_TYPES[type.toUpperCase().replace('-', '_')]) {
            console.warn("Invalid type dropped:", type);
            return;
        }
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        const element = this.elementManager.createElement(type, point.x, point.y);

        if (element) {
            this.selectElement(element);
            this.showNameEditor(element);
        } else {
            console.error("Failed to create element from drop.");
        }
    }

    /**
     * Hide both element and connection context menus.
     */
    hideAllContextMenus() {
        if (this.elementContextMenu && this.elementContextMenu.style.display !== 'none') {
            this.elementContextMenu.style.display = 'none';
        }
        if (this.connectionContextMenu && this.connectionContextMenu.style.display !== 'none') {
            this.connectionContextMenu.style.display = 'none';
        }
        this.contextTargetConnection = null;
    }

    /**
     * Hide the generic context menu UI (legacy, not used for new menus).
     */
    hideContextMenu() {
        if (this.contextMenu && this.contextMenu.style.display !== 'none') {
            this.contextMenu.style.display = 'none';
            // Restore default delete handler to prevent potential memory leaks from temp handlers
            const deleteButton = document.getElementById('delete-element');
            if (deleteButton) deleteButton.onclick = this.handleDeleteElement;
        }
    }

    /**
     * Show the context menu for an element at its position.
     * @param {Element} element
     */
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

        } catch (err) {
            console.error("Error calculating element context menu position:", err);
            // Fallback: Show near element origin (less accurate)
            this.elementContextMenu.style.left = `${element.x + element.width}px`;
            this.elementContextMenu.style.top = `${element.y}px`;
            this.elementContextMenu.style.display = 'block';
        }
    }

    /**
     * Show the context menu for a connection at a specific screen position.
     * @param {Connection} connection
     * @param {number} screenX
     * @param {number} screenY
     */
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
    }

    /**
     * Show the inline name editor for an element.
     * @param {Element} element
     */
    showNameEditor(element) {
        if (!element) return;
        // Hide menus when starting edit
        this.hideAllContextMenus();

        // Cancel edit on any other element first
        if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id !== element.id) {
            this.cancelInlineEdit();
        }
        // Don't re-open if already editing this one
        if (this.currentEditingDiv && this.selectedElement && this.selectedElement.id === element.id) {
            return;
        }

        // Ensure element is selected 
        const shouldSelect = this.selectedElement !== element;
        if (shouldSelect) {
            this.selectedElement = element;
            const svgElem = this.canvas.findOne(`#${element.id}`);
            if (svgElem) {
                svgElem.addClass('element-selected');
            } else {
                console.warn("showNameEditor: SVG element not found for selection:", element.id);
            }
        }

        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (!svgGroup) {
            console.error(`FAILED to find SVG Group for #${element.id}`);
            return;
        }

        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj');
        if (!foreignObjectWrapper || !foreignObjectWrapper.node) {
            console.error(`FAILED to find .element-editor-fobj or node inside #${element.id}`);
            return;
        }

        const contentDivNode = foreignObjectWrapper.node.querySelector('div.element-content-div');
        if (!contentDivNode) {
            console.error(`FAILED to find div.element-content-div using querySelector!`);
            return;
        }

        // Make the foreignObject interactive for editing
        foreignObjectWrapper.attr('pointer-events', 'auto');
        contentDivNode.setAttribute('tabindex', '-1');
        contentDivNode.contentEditable = 'true';
        contentDivNode.classList.add('editing');

        // Focus and select all text for editing
        try {
            setTimeout(() => {
                if (contentDivNode && typeof contentDivNode.focus === 'function') {
                    contentDivNode.focus();
                    const range = document.createRange();
                    range.selectNodeContents(contentDivNode);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                } else {
                    console.error("contentDivNode or focus function missing!");
                }
            }, 0);
        } catch (err) {
            console.error("Focus/Select outer try/catch FAILED:", err);
        }

        // Attach event listeners for editing
        contentDivNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        contentDivNode.addEventListener('keydown', this.handleInlineEditorKeyDown);

        contentDivNode.removeEventListener('blur', this.handleInlineEditorBlur);
        contentDivNode.addEventListener('blur', this.handleInlineEditorBlur);

        // Focus again to ensure selection (sometimes needed)
        try {
            setTimeout(() => {
                if (contentDivNode && typeof contentDivNode.focus === 'function') {
                    contentDivNode.focus({ preventScroll: true });
                    if (document.activeElement === contentDivNode) {
                        const range = document.createRange();
                        range.selectNodeContents(contentDivNode);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        console.warn("showNameEditor: Focus call did NOT result in contentDivNode being activeElement.");
                    }
                }
            }, 0);
        } catch (err) { console.error("Focus/Select outer try/catch FAILED:", err); }

        this.currentEditingDiv = contentDivNode;
    }

    /**
     * Cancel inline editing for the current element.
     * @param {boolean} showMenuAfter - Whether to show the context menu after cancel.
     */
    cancelInlineEdit(showMenuAfter = true) {
        if (!this.selectedElement || !this.currentEditingDiv) {
            return;
        }
        const element = this.selectedElement;
        const divNode = this.currentEditingDiv;

        const svgGroup = this.canvas.findOne(`#${element.id}`);
        if (!svgGroup) {
            console.error("cancelInlineEdit: SVG group not found for", element.id);
            this.currentEditingDiv = null;
            return;
        }

        // Remove event listeners and reset content
        divNode.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        divNode.removeEventListener('blur', this.handleInlineEditorBlur);

        divNode.textContent = element.name || element.type;
        divNode.contentEditable = 'false';
        divNode.classList.remove('editing');
        divNode.removeAttribute('tabindex');

        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj');
        foreignObjectWrapper?.attr('pointer-events', 'none');

        this.currentEditingDiv = null;

        if (showMenuAfter) {
            this.showElementContextMenu(element);
        } else {
            this.hideAllContextMenus();
        }
    }

    /**
     * Save the name from the inline editor to the element.
     * @param {boolean} showMenuAfter - Whether to show the context menu after save.
     */
    handleSaveName(showMenuAfter = true) {
        const elementToSave = this.selectedElement;
        const divToSaveFrom = this.currentEditingDiv;

        if (!elementToSave || !divToSaveFrom) {
            return;
        }

        const newNameRaw = divToSaveFrom.innerText;
        const newName = newNameRaw.trim();

        const svgGroup = this.canvas.findOne(`#${elementToSave.id}`);

        if (!svgGroup) {
            divToSaveFrom.removeEventListener('keydown', this.handleInlineEditorKeyDown);
            divToSaveFrom.removeEventListener('blur', this.handleInlineEditorBlur);
            this.currentEditingDiv = null;
            return;
        }

        divToSaveFrom.contentEditable = 'false';
        divToSaveFrom.classList.remove('editing');
        divToSaveFrom.removeAttribute('tabindex');

        const foreignObjectWrapper = svgGroup.findOne('.element-editor-fobj');
        foreignObjectWrapper?.attr('pointer-events', 'none');

        divToSaveFrom.removeEventListener('keydown', this.handleInlineEditorKeyDown);
        divToSaveFrom.removeEventListener('blur', this.handleInlineEditorBlur);

        elementToSave.name = newName || elementToSave.type;
        divToSaveFrom.innerText = elementToSave.name;

        this.currentEditingDiv = null;

        if (showMenuAfter) {
            this.showElementContextMenu(elementToSave);
        } else {
            this.hideAllContextMenus();
        }
    }

    /**
     * Handle Enter/Escape keys within the inline editor input.
     * @param {KeyboardEvent} e
     */
    handleInlineEditorKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSaveName(true);
            e.stopPropagation();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelInlineEdit(true);
            e.stopPropagation();
        }
    }

    /**
     * Handle blur event on the inline editor input.
     * @param {FocusEvent} e
     */
    handleInlineEditorBlur(e) {
        const divBeingEdited = this.currentEditingDiv;
        const elementBeingEdited = this.selectedElement;

        if (!divBeingEdited || !elementBeingEdited) {
            return;
        }

        const relatedTarget = e.relatedTarget;

        setTimeout(() => {
            // Only proceed if the edit wasn't already finalized by another action
            if (this.currentEditingDiv === divBeingEdited) {
                let shouldAttemptToFinalize = true;
                let showMenuForThisElementAfterSave = false;
                const relatedTargetElement = relatedTarget ? relatedTarget.closest('.element') : null;
                if (relatedTarget) {
                    if (relatedTarget.closest('.context-menu') ||
                        relatedTarget === document.body ||
                        relatedTarget.closest('.controls button') ||
                        relatedTarget.closest('.palette-item')) {
                        shouldAttemptToFinalize = false;
                    } else if (relatedTarget.closest('.element')) {
                        if (relatedTarget.closest('.element').id !== elementBeingEdited.id) {
                            showMenuForThisElementAfterSave = false;
                        } else {
                            showMenuForThisElementAfterSave = true;
                        }
                    } else {
                        showMenuForThisElementAfterSave = false;
                    }
                } else if (document.activeElement !== divBeingEdited && document.activeElement !== window) {
                    showMenuForThisElementAfterSave = false;
                } else {
                    shouldAttemptToFinalize = false;
                }
                if (shouldAttemptToFinalize) {
                    this.handleSaveName(showMenuForThisElementAfterSave);
                }
            }
        }, 0);
    }

    /**
     * Select or deselect an element, updating UI and menus.
     * @param {Element|null} element - The element to select, or null to deselect.
     */
    selectElement(element) {
        // If trying to select the element that is currently being edited, and the edit div has focus, do nothing.
        if (this.currentEditingDiv && element && this.selectedElement === element && document.activeElement === this.currentEditingDiv) {
            return;
        }

        const previousSelectedElement = this.selectedElement;

        // If an edit is active on the previous element, and we are now selecting a different element or null, finalize edit
        if (this.currentEditingDiv && previousSelectedElement && previousSelectedElement !== element) {
            if (this.currentEditingDiv.closest('.element')?.id === previousSelectedElement.id) {
                this.handleSaveName(false);
            }
        }

        // Visually deselect the previously selected element if it's different from the new one
        if (previousSelectedElement && previousSelectedElement !== element) {
            const oldSvgElement = this.canvas.findOne(`#${previousSelectedElement.id}`);
            if (oldSvgElement) {
                oldSvgElement.removeClass('element-selected');
            }
        }

        // Hide all menus if selection is changing or being cleared
        if (element !== previousSelectedElement) {
            this.hideAllContextMenus();
        }

        this.selectedElement = element;

        if (element) {
            const newSvgElement = this.canvas.findOne(`#${element.id}`);
            if (newSvgElement) {
                newSvgElement.addClass('element-selected');
                // Show context menu if not currently editing this element
                if (!this.currentEditingDiv || this.currentEditingDiv.closest('.element')?.id !== element.id) {
                    this.showElementContextMenu(element);
                }
            }
        }
    }

    /**
     * Set canvas zoom level and update viewbox.
     * @param {number} zoom - The zoom factor (clamped between 0.2 and 3).
     */
    // setZoom(zoom) {
    //     zoom = Math.max(0.2, Math.min(3, zoom)); // Clamp zoom level
    //     if (this.zoom === zoom) return;

    //     this.zoom = zoom;
    //     const viewbox = this.canvas.viewbox();
    //     const clientWidth = this.canvas.node.clientWidth;
    //     const clientHeight = this.canvas.node.clientHeight;

    //     if (!clientWidth || !clientHeight) {
    //         console.warn("Canvas client dimensions are zero, cannot calculate zoom viewbox.");
    //         return;
    //     }

    //     const newWidth = clientWidth / zoom;
    //     const newHeight = clientHeight / zoom;
    //     const centerX = viewbox.x + viewbox.width / 2;
    //     const centerY = viewbox.y + viewbox.height / 2;
    //     const newX = centerX - newWidth / 2;
    //     const newY = centerY - newHeight / 2;

    //     this.canvas.viewbox(newX, newY, newWidth, newHeight);
    // }

    /**
     * Convert screen coordinates (clientX/Y) to SVG canvas coordinates.
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{x: number, y: number}}
     */
    getCanvasPoint(clientX, clientY) {
        try {
            const point = this.canvas.point(clientX, clientY);
            return { x: point.x, y: point.y };
        } catch (error) {
            console.error("Error transforming screen point to SVG point:", error);
            return { x: 0, y: 0 };
        }
    }

    /**
     * Find the parent element's ID from a clicked DOM target.
     * @param {EventTarget} target
     * @returns {string|null}
     */
    findElementId(target) {
        if (!target || !target.closest) return null;
        const elementNode = target.closest('.element');
        return elementNode ? elementNode.id : null;
    }

    /**
     * Find the connection path's ID from a clicked DOM target.
     * @param {EventTarget} target
     * @returns {string|null}
     */
    findConnectionId(target) {
        if (!target || !target.classList) return null;
        if (target.classList.contains('connection-path')) {
            return target.id;
        }
        return null;
    }
} // End class InteractionManager