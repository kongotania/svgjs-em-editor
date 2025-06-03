export class ErrorHandler {
    static handle(error, context, userMessage = null) {
        console.error(`[${context}] ${error.message}`, error);
        if (userMessage) {
            alert(userMessage); // Or use a toast notification library
        }
    }
}