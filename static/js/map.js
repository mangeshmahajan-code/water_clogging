// Initialize Leaflet map globally
let map;
const mapElement = document.getElementById('map');

if (mapElement) {
    map = L.map('map').setView([18.5834558086179, 73.7371718873923], 13);

    L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }
    ).addTo(map);
    console.log("Leaflet map initialized successfully.");
} else {
    console.log("Map container not found on this page. Skipping map initialization.");
}
