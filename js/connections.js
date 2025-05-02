/**
 * connections.js
 * 
 * This file contains functions for creating and managing connections
 * between elements in the event modeling application.
 */

/**
 * ConnectionManager - Handles the creation and management of connections
 */
class ConnectionManager {
    constructor(canvas, elementManager) {
        this.canvas = canvas;
        this.elementManager = elementManager;
        this.connections = [];
        this.connectionMode = false;
        this.sourceElement = null;
        this.tempConnection = null;
    }

    /**
     * Start creating a connection from a source element
     * @param {Element} element - The source element
     */
    startConnection(element) {
        console.log(">>> startConnection", { elementId: element?.id, currentMode: this.connectionMode });
        if (this.connectionMode) {
            console.warn("Already in connection mode, cancelling previous.");
            this.cancelConnection(); // Ensure cleanup if called unexpectedly
        }
        this.connectionMode = true;
        this.sourceElement = element;

        // Create a temporary connection line that follows the mouse
        this.tempConnection = this.canvas.path().attr({
            stroke: '#333',
            'stroke-width': 2,
            'stroke-dasharray': '5,5',
            fill: 'none'
        });

        // --- ADD THIS DIAGNOSTIC LINE ---
        console.log('Checking for marker def:', this.canvas.defs().findOne('#arrowhead-marker'));
        // --- END DIAGNOSTIC LINE ---

        this.tempConnection.attr('marker-end', 'url(#arrowhead-marker)');
        console.log("<<< startConnection finished", { newMode: this.connectionMode, source: this.sourceElement?.id });
    }

    /**
     * Update the temporary connection position during mouse move
     * @param {number} mouseX - Mouse X position
     * @param {number} mouseY - Mouse Y position
     */
    updateTempConnection(mouseX, mouseY) {
        if (!this.connectionMode || !this.tempConnection) return;

        // Find the best connection point from the source element
        const sourcePoints = this.sourceElement.getConnectionPoints();

        // Calculate distances from each point to mouse and pick the closest
        let minDistance = Infinity;
        let bestPoint = null;

        for (const [side, point] of Object.entries(sourcePoints)) {
            const distance = Math.sqrt(
                Math.pow(point.x - mouseX, 2) +
                Math.pow(point.y - mouseY, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                bestPoint = { ...point, side };
            }
        }

        // Create curved path from source to mouse position
        const source = bestPoint;
        const target = { x: mouseX, y: mouseY };

        // Determine control points based on source side
        let sourceControlX = source.x;
        let sourceControlY = source.y;

        const controlDistance = 50;

        switch (source.side) {
            case 'top': sourceControlY -= controlDistance; break;
            case 'right': sourceControlX += controlDistance; break;
            case 'bottom': sourceControlY += controlDistance; break;
            case 'left': sourceControlX -= controlDistance; break;
        }

        // Create a cubic bezier curve
        const path = `M ${source.x} ${source.y} C ${sourceControlX} ${sourceControlY}, ${target.x} ${target.y}, ${target.x} ${target.y}`;

        this.tempConnection.plot(path);
    }

    /**
     * Complete or cancel the connection
     * @param {Element} targetElement - The target element (or null to cancel)
     * @returns {Connection} - The created connection (or null if invalid/cancelled)
     */
    completeConnection(targetElement) {
        if (!this.connectionMode) return null;

        // Remove temporary connection
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }

        // Reset connection mode
        this.connectionMode = false;

        // If no target or same as source, cancel connection
        if (!targetElement || targetElement === this.sourceElement) {
            this.sourceElement = null;
            return null;
        }

        // Create the connection
        const connection = new Connection(this.sourceElement, targetElement);

        // // Check if connection creates a loop
        // if (connection.createsLoop()) {
        //     console.log('Connection creates a loop and is not allowed');
        //     this.sourceElement = null;
        //     return null;
        // }

        // Add connection to both elements
        this.sourceElement.connections.push(connection);
        targetElement.connections.push(connection);

        // Add to connections list
        this.connections.push(connection);

        // Draw the connection
        connection.createSVG(this.canvas);

        // Reset source element
        this.sourceElement = null;

        return connection;
    }

    /**
     * Cancel the current connection (if any)
     */
    cancelConnection() {
        if (!this.connectionMode) return;

        // Remove temporary connection
        if (this.tempConnection) {
            this.tempConnection.remove();
            this.tempConnection = null;
        }

        // Reset connection mode and source
        this.connectionMode = false;
        this.sourceElement = null;
    }

    /**
     * Remove a connection
     * @param {Connection} connection - The connection to remove
     */
    removeConnection(connection) {
        // Remove from the elements' connections lists
        const sourceIndex = connection.sourceElement.connections.findIndex(c => c.id === connection.id);
        if (sourceIndex !== -1) {
            connection.sourceElement.connections.splice(sourceIndex, 1);
        }

        const targetIndex = connection.targetElement.connections.findIndex(c => c.id === connection.id);
        if (targetIndex !== -1) {
            connection.targetElement.connections.splice(targetIndex, 1);
        }

        // Remove from connections list
        const index = this.connections.findIndex(c => c.id === connection.id);
        if (index !== -1) {
            this.connections.splice(index, 1);
        }

        // Remove SVG element
        const svgConnection = this.canvas.findOne(`#${connection.id}`);
        if (svgConnection) {
            svgConnection.remove();
        }

    }

    // PASTE THIS ENTIRE METHOD DEFINITION INSIDE THE ConnectionManager CLASS

    /**
     * Update only the connections attached to a specific element.
     * This is more efficient than redrawing all connections.
     * @param {Element} element - The element whose connections need updating.
     */
    updateConnectionsForElement(element) {
        console.log(">>> updateConnectionsforElement called");
        // Find connections linked to this element from the main list
        const connectionsToUpdate = this.connections.filter(conn =>
            conn.sourceElement.id === element.id || conn.targetElement.id === element.id
        );

        connectionsToUpdate.forEach(connection => {
            // Find the existing SVG path element for the connection
            const svgConnection = this.canvas.findOne(`#${connection.id}`);

            if (svgConnection) {
                // 1. Recalculate the best connection points based on current element positions
                const { source, target } = connection.sourceElement.findBestConnectionPoint(connection.targetElement);
                connection.sourcePoint = source; // Update internal state if needed
                connection.targetPoint = target; // Update internal state if needed

                // 2. Recalculate the SVG path data (the 'd' attribute)
                const newPath = connection.createCurvedPath(source, target);

                // 3. Update the 'd' attribute of the existing SVG path element
                //    This moves the line without removing/re-adding it to the DOM.
                svgConnection.plot(newPath);

                // Note: Arrowhead marker position/orientation should update automatically
                // because we used 'orient: auto' and it's attached to the path end.

            } else {
                // Fallback: If the SVG element wasn't found for some reason,
                // log a warning and recreate it (less efficient).
                console.warn(`Could not find SVG for connection ${connection.id} during update. Recreating.`);
                // Ensure createSVG exists on the connection object
                if (typeof connection.createSVG === 'function') {
                    connection.createSVG(this.canvas);
                } else {
                    console.error(`Connection object ${connection.id} missing createSVG method.`);
                }
            }
        })
        console.log("<<< updateConnectionsForElement finished");
    }

    /**
     * Update all connections (e.g., when elements move)
     */
    // Inside ConnectionManager class
    updateConnections() {
        console.log(">>> updateConnections (Global) called"); // Add log to see if/when it's used
        this.connections.forEach(connection => {
            const svgConnection = this.canvas.findOne(`#${connection.id}`);
            if (svgConnection) {
                // Recalculate points and path
                const { source, target } = connection.sourceElement.findBestConnectionPoint(connection.targetElement);
                // Update connection object state if needed (optional but good practice)
                connection.sourcePoint = source;
                connection.targetPoint = target;
                const newPath = connection.createCurvedPath(source, target);
                // Update existing SVG path using plot() - EFFICIENT
                svgConnection.plot(newPath);
            } else {
                // Fallback: Recreate if SVG not found
                console.warn(`Could not find SVG for connection ${connection.id} during global update. Recreating.`);
                connection.createSVG(this.canvas);
            }
        });
        console.log("<<< updateConnections (Global) finished");
    }

    /**
     * Get connections for a specific element
     * @param {Element} element - The element to get connections for
     * @returns {Array} - Array of connections
     */
    getConnectionsForElement(element) {
        return this.connections.filter(c =>
            c.sourceElement.id === element.id || c.targetElement.id === element.id
        );
    }
}

// // Export ConnectionManager
// if (typeof module !== 'undefined') {
//     module.exports = {
//         ConnectionManager
//     };
// }
