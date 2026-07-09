// test-booking.js

// Simulate a Hostfully webhook POST request to http://localhost:3001/webhook with this fake booking data:
const webhookData = {
    "guest_name": "John Smith",
    "phone": "821026226935",
    "nationality": "US",
    "check_in": "2026-04-25",
    "check_out": "2026-04-28",
    "property": "Gangnam Studio A",
    "platform": "Airbnb"
};

console.log("--- Simulating Hostfully Webhook POST Request ---");
console.log("Target URL: http://localhost:3001/webhook");
console.log("Payload:", JSON.stringify(webhookData, null, 2));

// In a real scenario, you would use 'node-fetch' or similar library to send this POST request.
// Example conceptual code (requires an external HTTP client):
/*
fetch('http://localhost:3001/webhook', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        // Add any required API keys or authentication headers here
    },
    body: JSON.stringify(webhookData)
})
.then(response => response.text())
.then(data => console.log("Webhook response:", data))
.catch(error => console.error("Error simulating webhook:", error));
*/

console.log("\n--- Simulation complete ---");