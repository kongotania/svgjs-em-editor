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
    constructor(canvas, elements) {
        this.canvas = canvas;
        this.elements = elements;
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
        this.connectionMode = true;
        this.sourceElement = element;
        
        // Create a temporary connection line that follows the mouse
        this.tempConnection = this.canvas.path().attr({
            stroke: '#333',
            'stroke-width': 2,
            'stroke-dasharray': '5,5',
            fill: 'none'
        });
        
        // Add arrow marker
        this.canvas.defs().marker(10, 10, function(add) {
            add.polygon('0,0 10,5 0,10').fill('#333');
        }).attr({
            id: 'temp-marker',
            orient: 'auto',
            markerWidth: 10,
            markerHeight: 10,
            refX: 9,
            refY: 5
        });
        
        this.tempConnection.marker('end', '#temp-marker');
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
        
        // Check if connection creates a loop
        if (connection.createsLoop()) {
            console.log('Connection creates a loop and is not allowed');
            this.sourceElement = null;
            return null;
        }
        
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
        
        // Remove marker
        const marker = this.canvas.findOne(`#${connection.id}-marker`);
        if (marker) {
            marker.remove();
        }
    }

    /**
     * Update all connections (e.g., when elements move)
     */
    updateConnections() {
        this.connections.forEach(connection => {
            const svgConnection = this.canvas.findOne(`#${connection.id}`);
            if (svgConnection) {
                svgConnection.remove();
            }
            connection.createSVG(this.canvas);
        });
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
